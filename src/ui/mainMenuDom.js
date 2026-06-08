// 메인 메뉴 DOM 오버레이. Phaser 캔버스 위에 띄우고, 버튼 콜백으로 씬을 전환한다.
// mountMainMenu(...) 는 { destroy } 를 반환한다.

import menuLogo from '../../img/surfride-logo-v3-cutout.png';
import menuBackground from '../../img/main-menu-surf-dog.png';
import { openRankingModal } from './rankingModal.js';
import { audio } from '../audio.js';

const CONTROLS = [
  ['← / →', '좌우로 카빙하며 신호가 뜬 줄에서 벗어나요'],
  ['↑ / ↓', '파도 마루와 어깨를 오가며 속도와 안전을 조절해요'],
  ['Space', '낮게 튀는 장애물을 점프로 넘고 보너스를 노려요'],
  ['Shift', '위에 뜬 장애물 아래로 잠수해서 통과해요'],
  ['P / ESC', '잠깐 멈추거나 다시 서핑을 이어가요'],
];

export function mountMainMenu({ save, storage, stages, onStart, onContinue, onTutorial, onWorldMap }) {
  const hasPlayed = !!save?.lastPlayedTime;

  const overlay = document.createElement('div');
  overlay.className = 'menu-overlay';
  overlay.style.setProperty('--menu-bg-image', `url("${menuBackground}")`);
  overlay.innerHTML = `
    <main class="menu">
      <header class="menu-head">
        <h1 class="menu-title">
          <img class="menu-logo" src="${menuLogo}" alt="SurfRide" draggable="false" />
        </h1>
        <p class="menu-subtitle">파도를 넘어, 세계를 건너라</p>
      </header>

      <nav class="menu-actions">
        <button class="btn btn--primary" data-act="start">시작하기</button>
        <button class="btn btn--secondary" data-act="continue" ${hasPlayed ? '' : 'disabled'}>이어하기</button>
        <button class="btn btn--secondary" data-act="tutorial">튜토리얼 보기</button>
        <div class="btn-row">
          <button class="btn btn--ghost" data-act="ranking">랭킹</button>
          <button class="btn btn--ghost" data-act="map">세계지도 보기</button>
          <button class="btn btn--ghost" data-act="controls">조작법 보기</button>
        </div>
      </nav>

      ${progressCard({ save, storage, stages, hasPlayed })}

      <button class="menu-settings" data-act="settings">설정</button>
    </main>
  `;

  document.body.appendChild(overlay);

  // ── 콜백 연결 ──
  const onClick = (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn || btn.disabled) return;
    audio.playSfx('click');
    switch (btn.dataset.act) {
      case 'start':    onStart(); break;
      case 'continue': onContinue(); break;
      case 'tutorial': onTutorial(); break;
      case 'map':      onWorldMap(); break;
      case 'ranking':  openRankingModal({ stageIndex: save?.currentStage ?? 0 }); break;
      case 'controls': openControls(overlay); break;
      case 'settings': openSettings(overlay); break;
    }
  };
  overlay.addEventListener('click', onClick);

  const onKey = (e) => {
    if (e.key === 'Escape') closeControls(overlay);
  };
  document.addEventListener('keydown', onKey);

  return {
    destroy() {
      overlay.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
      overlay.remove();
    },
  };
}

function progressCard({ save, storage, stages, hasPlayed }) {
  if (!hasPlayed) {
    return `
      <section class="progress-card progress-card--empty">
        <span class="progress-card__label">최근 진행 상황</span>
        <p class="progress-card__empty">아직 플레이 기록이 없습니다</p>
      </section>`;
  }

  const stageIdx = save?.currentStage ?? 0;
  const stageData = stages[stageIdx];
  const list = save?.unlockedStages ?? [];
  const cleared = list.filter((s) => s.cleared).length;
  const totalStars = list.reduce((acc, s) => acc + (s.stars ?? 0), 0);
  const hi = storage.getHighScore(stageData.id);

  const stats = [
    ['클리어 스테이지', `${cleared} / ${stages.length}`],
    ['획득 별', `★ ${totalStars}개`],
    ['최고 기록', hi > 0 ? `${hi.toLocaleString()}점` : '—'],
  ];

  return `
    <section class="progress-card">
      <span class="progress-card__label">최근 진행 상황</span>
      <h2 class="progress-card__stage">${stageData.id}구역 · ${escapeHtml(stageData.name)}</h2>
      <div class="progress-card__stats">
        ${stats
          .map(
            ([label, value]) => `
          <div class="stat">
            <span class="stat__label">${label}</span>
            <span class="stat__value">${value}</span>
          </div>`,
          )
          .join('')}
      </div>
    </section>`;
}

function openControls(overlay) {
  if (overlay.querySelector('.modal')) return;
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal__backdrop" data-close></div>
    <div class="modal__panel modal__panel--controls" role="dialog" aria-modal="true" aria-label="조작법">
      <button class="modal__x" type="button" data-close aria-label="닫기">×</button>
      <div class="modal__header">
        <span class="modal__eyebrow">SURF GUIDE</span>
        <h2 class="modal__title">파도 타는 법</h2>
        <p class="modal__lead">균형을 지키면서 장애물을 피하고, 좋은 타이밍에 점수를 쌓아보세요.</p>
      </div>
      <ul class="modal__rows">
        ${CONTROLS.map(
          ([key, desc], index) => `
          <li class="modal__row" style="--row:${index}">
            <kbd class="modal__key">${escapeHtml(key)}</kbd>
            <span class="modal__desc">${escapeHtml(desc)}</span>
          </li>`,
        ).join('')}
      </ul>
      <div class="modal__tip">
        <strong>TIP</strong>
        <span>아래쪽 거친 바다는 위험하지만 점수 배율이 더 높아요.</span>
      </div>
      <button class="btn btn--primary modal__close" data-close>출발 준비 완료</button>
    </div>`;
  modal.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) closeControls(overlay);
  });
  overlay.appendChild(modal);
}

function closeControls(overlay) {
  overlay.querySelector('.modal')?.remove();
}

// 설정 모달 — BGM/효과음 볼륨 슬라이더. audio 매니저에 즉시 반영 + localStorage 자동 저장.
function openSettings(overlay) {
  if (overlay.querySelector('.modal')) return;
  const pct = (v) => Math.round(v * 100);
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal__backdrop" data-close></div>
    <div class="modal__panel modal__panel--settings" role="dialog" aria-modal="true" aria-label="설정">
      <button class="modal__x" type="button" data-close aria-label="닫기">×</button>
      <div class="modal__header">
        <span class="modal__eyebrow">SETTINGS</span>
        <h2 class="modal__title">설정</h2>
        <p class="modal__lead">사운드 볼륨을 조절하세요. 변경 즉시 저장돼요.</p>
      </div>
      <div class="set-rows">
        <label class="set-row">
          <span class="set-row__label">🎵 배경음</span>
          <input class="set-slider" type="range" min="0" max="100" value="${pct(audio.bgmVolume)}" data-kind="bgm" />
          <span class="set-row__val" data-val="bgm">${pct(audio.bgmVolume)}%</span>
        </label>
        <label class="set-row">
          <span class="set-row__label">🔊 효과음</span>
          <input class="set-slider" type="range" min="0" max="100" value="${pct(audio.sfxVolume)}" data-kind="sfx" />
          <span class="set-row__val" data-val="sfx">${pct(audio.sfxVolume)}%</span>
        </label>
      </div>
      <button class="btn btn--primary modal__close" data-close>닫기</button>
    </div>`;

  modal.addEventListener('input', (e) => {
    const slider = e.target.closest('.set-slider');
    if (!slider) return;
    const v = Number(slider.value) / 100;
    if (slider.dataset.kind === 'bgm') audio.setBgmVolume(v);
    else                               audio.setSfxVolume(v);
    modal.querySelector(`[data-val="${slider.dataset.kind}"]`).textContent = `${Math.round(v * 100)}%`;
  });
  // 효과음 슬라이더를 놓는 순간 현재 레벨로 미리듣기
  modal.addEventListener('change', (e) => {
    if (e.target.closest('.set-slider')?.dataset.kind === 'sfx') audio.playSfx('click');
  });
  modal.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) closeControls(overlay);
  });
  overlay.appendChild(modal);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}
