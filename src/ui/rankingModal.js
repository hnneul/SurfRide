// 랭킹 DOM UI — 메인 메뉴/결과 화면에서 공용으로 쓰는 오버레이.
//  · openRankingModal(): 스테이지별 상위 10명 리스트 + 닉네임 변경.
//  · ensureNickname():   결과 화면에서 점수 등록 직전 호출. 닉네임 있으면 즉시 반환, 없으면 최초 1회 입력.
//  · promptNickname():   닉네임 입력/변경 작은 다이얼로그(Promise<string|null>).
// document.body 에 직접 mount(position:fixed) — 메뉴 오버레이/Phaser 캔버스 어디서 열어도 동일하게 동작.

import { STAGES } from '../stages.js';
import {
  fetchTopScores, getNickname, setNickname, isAvailable,
  sanitizeNickname, NICKNAME_MAX,
} from '../ranking.js';
import { audio } from '../audio.js';

const MEDALS = ['🥇', '🥈', '🥉'];

// ─── 랭킹 모달 ────────────────────────────────────────────────────────────────
export function openRankingModal({ parent = document.body, stageIndex = 0 } = {}) {
  if (parent.querySelector('.rank-modal')) return;   // 중복 오픈 방지

  const startIndex = Math.max(0, Math.min(STAGES.length - 1, stageIndex | 0));

  const modal = document.createElement('div');
  modal.className = 'modal rank-modal';
  modal.innerHTML = `
    <div class="modal__backdrop" data-close></div>
    <div class="modal__panel modal__panel--ranking" role="dialog" aria-modal="true" aria-label="랭킹">
      <button class="modal__x" type="button" data-close aria-label="닫기">×</button>
      <div class="modal__header">
        <span class="modal__eyebrow">LEADERBOARD</span>
        <h2 class="modal__title">🏆 랭킹</h2>
        <p class="modal__lead">해역별 상위 10명의 기록이에요.</p>
      </div>
      <div class="rank-toolbar">
        <label class="rank-toolbar__label" for="rank-stage">해역</label>
        <select class="rank-stage" id="rank-stage">
          ${STAGES.map((s, i) => `
            <option value="${s.id}" ${i === startIndex ? 'selected' : ''}>${s.id}구역 · ${escapeHtml(s.name)}</option>`).join('')}
        </select>
      </div>
      <ol class="rank-list" aria-live="polite">${stateRow('불러오는 중…')}</ol>
      <div class="nick-bar">
        <span class="nick-bar__label">내 닉네임</span>
        <span class="nick-bar__name"></span>
        <button class="nick-bar__edit" type="button">변경</button>
      </div>
    </div>`;

  parent.appendChild(modal);

  const listEl   = modal.querySelector('.rank-list');
  const selectEl = modal.querySelector('.rank-stage');
  const nameEl   = modal.querySelector('.nick-bar__name');

  const renderNick = () => {
    const n = getNickname();
    nameEl.textContent = n || '미설정';
    nameEl.classList.toggle('nick-bar__name--unset', !n);
  };

  // 조회 토큰 — 스테이지를 빠르게 바꿔도 늦게 도착한 응답이 최신 화면을 덮지 않도록.
  let loadToken = 0;
  const load = async () => {
    const token = ++loadToken;
    const stage = Number(selectEl.value);
    if (!isAvailable()) { listEl.innerHTML = stateRow('온라인 랭킹에 연결할 수 없어요.\n잠시 후 다시 시도해주세요.'); return; }
    listEl.innerHTML = stateRow('불러오는 중…');
    const rows = await fetchTopScores(stage, 10);
    if (token !== loadToken) return;   // 더 최신 요청이 있으면 폐기
    listEl.innerHTML = rows.length
      ? rowsHtml(rows, getNickname())
      : stateRow('아직 등록된 기록이 없어요.\n첫 주인공이 되어보세요!');
  };

  const close = () => {
    modal.removeEventListener('click', onClick);
    selectEl.removeEventListener('change', load);
    document.removeEventListener('keydown', onKey);
    modal.remove();
  };

  const onClick = (e) => {
    if (e.target.closest('[data-close]')) { audio.playSfx('back'); close(); return; }
    if (e.target.closest('.nick-bar__edit')) {
      audio.playSfx('click');
      promptNickname({ current: getNickname() }).then((name) => {
        if (name) { renderNick(); load(); }   // 새 닉네임 기준으로 본인 하이라이트 갱신
      });
    }
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };

  modal.addEventListener('click', onClick);
  selectEl.addEventListener('change', load);
  document.addEventListener('keydown', onKey);

  renderNick();
  load();

  return { close };
}

function rowsHtml(rows, myNick) {
  return rows.map((r, i) => {
    const pos       = i + 1;
    const badge     = MEDALS[i] ?? String(pos);
    const topClass  = i < 3 ? ` rank-row--top${pos}` : '';
    const meClass   = myNick && r.nickname === myNick ? ' rank-row--me' : '';
    return `
      <li class="rank-row${topClass}${meClass}">
        <span class="rank-row__pos">${badge}</span>
        <span class="rank-row__name">${escapeHtml(r.nickname)}</span>
        <span class="rank-row__score">${Number(r.score).toLocaleString()}</span>
      </li>`;
  }).join('');
}

function stateRow(msg) {
  return `<li class="rank-state">${escapeHtml(msg)}</li>`;
}

// ─── 닉네임 입력/변경 다이얼로그 ──────────────────────────────────────────────
// 저장 성공 시 정리된 닉네임을, 취소 시 null 을 resolve.
export function promptNickname({ current = '', cancelable = true } = {}) {
  return new Promise((resolve) => {
    const firstTime = !current;
    const dlg = document.createElement('div');
    dlg.className = 'modal nick-modal';
    dlg.innerHTML = `
      <div class="modal__backdrop"${cancelable ? ' data-cancel' : ''}></div>
      <div class="nick-modal__panel" role="dialog" aria-modal="true" aria-label="닉네임 입력">
        <h3 class="nick-modal__title">${firstTime ? '닉네임을 정해주세요' : '닉네임 변경'}</h3>
        <p class="nick-modal__lead">랭킹에 표시될 이름이에요. (최대 ${NICKNAME_MAX}자)</p>
        <input class="nick-modal__input" type="text" maxlength="${NICKNAME_MAX}"
               value="${escapeHtml(current)}" placeholder="예: 파도사냥꾼"
               autocomplete="off" spellcheck="false" />
        <p class="nick-modal__hint" aria-live="polite"></p>
        <div class="nick-modal__actions">
          ${cancelable ? '<button class="nick-modal__cancel" type="button" data-cancel>취소</button>' : ''}
          <button class="btn btn--primary nick-modal__save" type="button">저장</button>
        </div>
      </div>`;

    document.body.appendChild(dlg);
    const input = dlg.querySelector('.nick-modal__input');
    const hint  = dlg.querySelector('.nick-modal__hint');
    input.focus();
    input.select();

    let done = false;
    const finish = (val) => {
      if (done) return;
      done = true;
      dlg.removeEventListener('click', onClick);
      dlg.removeEventListener('keydown', onKey);
      dlg.remove();
      resolve(val);
    };

    const save = () => {
      const clean = sanitizeNickname(input.value);
      if (!clean) { hint.textContent = '한 글자 이상 입력해주세요.'; input.focus(); return; }
      setNickname(clean);
      finish(clean);
    };

    const onClick = (e) => {
      if (e.target.closest('.nick-modal__save')) { save(); return; }
      if (cancelable && e.target.closest('[data-cancel]')) finish(null);
    };
    // Phaser 결과 화면의 SPACE/ENTER(스킵) 전역 핸들러와 충돌하지 않도록 키 이벤트를 가둔다.
    const onKey = (e) => {
      e.stopPropagation();
      if (e.key === 'Enter')           { e.preventDefault(); save(); }
      else if (e.key === 'Escape' && cancelable) { e.preventDefault(); finish(null); }
    };

    dlg.addEventListener('click', onClick);
    dlg.addEventListener('keydown', onKey);
  });
}

// 결과 화면 진입 시: 저장된 닉네임이 있으면 즉시 반환, 없으면(최초 1회) 입력 다이얼로그.
export async function ensureNickname() {
  return getNickname() ?? promptNickname({ current: '', cancelable: true });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}
