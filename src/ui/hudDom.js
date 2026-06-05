// 인게임 HUD DOM 오버레이 (Three 캔버스 위). 게임 로직·HUDScene은 안 건드리고
// GameScene 상태를 매 프레임 읽어 "표시만" 한다. mountHud() → { update(state), flash(), destroy() }.
import { BALANCE } from '../constants.js';

export function mountHud(parent = document.getElementById('game-container')) {
  const root = document.createElement('div');
  root.className = 'hud';
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = `
    <div class="hud__flash"></div>
    <div class="hud__visibility"></div>
    <div class="hud__wind"></div>
    <div class="hud__danger"></div>
    <div class="hud__top">
      <div class="hud__hearts"></div>
      <div class="hud__center">
        <div class="hud__timer">—</div>
        <div class="hud__stage"></div>
      </div>
      <div class="hud__right">
        <div class="hud__score">0</div>
        <div class="hud__combo"></div>
        <div class="hud__perfect"></div>
      </div>
    </div>
    <div class="hud__minimap">
      <span class="hud__minimap-label">항해 진척</span>
      <div class="hud__minimap-track">
        <div class="hud__minimap-fill"></div>
        <span class="hud__minimap-surfer">🏄</span>
      </div>
      <div class="hud__minimap-ends"><span>제주</span><span>태평양</span></div>
    </div>
    <div class="hud__weather" hidden>⚡ 기상 이변 · 점수 ×2</div>
    <div class="hud__stage-effect" hidden></div>
    <div class="hud__updraft" hidden>상승기류 안에서 점프 강화</div>
    <div class="hud__perfect-toast" hidden>
      <strong>PERFECT JUMP</strong>
      <span>+200</span>
    </div>
    <div class="hud__danger-label" hidden>⚠ 위험 구간 ×1.5</div>
    <div class="hud__tutorial" hidden></div>
    <div class="hud__balance">
      <span class="hud__balance-label">BALANCE</span>
      <div class="hud__balance-track">
        <div class="hud__balance-safe"></div>
        <div class="hud__balance-center"></div>
        <div class="hud__balance-marker"></div>
      </div>
    </div>
  `;
  parent.appendChild(root);

  const el = {
    flash:        root.querySelector('.hud__flash'),
    danger:       root.querySelector('.hud__danger'),
    wind:         root.querySelector('.hud__wind'),
    dangerLabel:  root.querySelector('.hud__danger-label'),
    hearts:       root.querySelector('.hud__hearts'),
    timer:        root.querySelector('.hud__timer'),
    stage:        root.querySelector('.hud__stage'),
    score:        root.querySelector('.hud__score'),
    combo:        root.querySelector('.hud__combo'),
    perfect:      root.querySelector('.hud__perfect'),
    minimapFill:   root.querySelector('.hud__minimap-fill'),
    minimapSurfer: root.querySelector('.hud__minimap-surfer'),
    weather:      root.querySelector('.hud__weather'),
    effect:       root.querySelector('.hud__stage-effect'),
    updraft:      root.querySelector('.hud__updraft'),
    perfectToast: root.querySelector('.hud__perfect-toast'),
    tutorial:     root.querySelector('.hud__tutorial'),
    safe:         root.querySelector('.hud__balance-safe'),
    marker:       root.querySelector('.hud__balance-marker'),
  };

  // 밸런스 안전구역(중앙 녹색대)은 1회만 배치 — 마커 범위[0,1] 중 |tilt|<WARN_AT 구간
  const safeFrac = BALANCE.WARN_AT / BALANCE.WIPEOUT_AT;
  el.safe.style.left  = `${50 - safeFrac * 50}%`;
  el.safe.style.width = `${safeFrac * 100}%`;

  let heartCount = -1;
  let prevPerfect = 0;
  let perfectToastTimer = null;

  function update(s) {
    // 체력 하트 (개수 바뀔 때만 재생성)
    if (s.maxHealth !== heartCount) {
      heartCount = s.maxHealth;
      el.hearts.innerHTML =
        Array.from({ length: heartCount }, () => '<span class="hud__heart">♥</span>').join('');
    }
    const hearts = el.hearts.children;
    for (let i = 0; i < hearts.length; i++) {
      hearts[i].classList.toggle('is-lost', i >= s.health);
      hearts[i].classList.toggle('is-blink', s.invulnerable && i === s.health - 1);
    }

    // 시간 · 스테이지
    el.timer.textContent = `${Math.ceil(s.remainSec)}s`;
    el.timer.classList.toggle('is-urgent', s.remainSec < 10);
    el.stage.textContent = `STAGE ${s.stageId} · ${s.stageName}`;

    // 점수 · 콤보
    el.score.textContent = s.score.toLocaleString();
    el.combo.textContent = s.combo > 0 ? `COMBO ×${s.combo}` : '';

    // 퍼펙트 점프 누적 — 늘어난 순간만 팝 강조
    const pj = s.perfectJumps ?? 0;
    el.perfect.textContent = `✨ 퍼펙트 ×${pj}`;
    el.perfect.classList.toggle('is-zero', pj === 0);
    if (pj > prevPerfect) {
      el.perfect.classList.remove('is-pop');
      void el.perfect.offsetWidth;   // reflow → 팝 애니메이션 재시작
      el.perfect.classList.add('is-pop');
    }
    prevPerfect = pj;

    // 미니맵 (항해 진척) — 출발(제주)→목적지(태평양)
    const prog = Math.max(0, Math.min(1, s.progress ?? 0));
    el.minimapFill.style.width = `${prog * 100}%`;
    el.minimapSurfer.style.left = `${prog * 100}%`;

    // 기상이변 배너 · 위험구간 비네트 · 튜토리얼 문구
    el.weather.hidden = !s.weatherActive;
    el.danger.classList.toggle('is-active', !!s.danger);
    el.dangerLabel.hidden = !s.danger;

    const effect = s.stageEffect ?? {};
    root.classList.toggle('is-night', !!effect.night);
    root.classList.toggle('is-storm', !!effect.storm);
    root.classList.toggle('is-windy', Math.abs(effect.windRatio ?? 0) > 0.25);
    root.style.setProperty('--wind-ratio', String(effect.windRatio ?? 0));
    root.style.setProperty('--wind-shift', `${(effect.windRatio ?? 0) * 26}px`);
    root.style.setProperty('--wind-opacity', String(0.18 + Math.min(1, Math.abs(effect.windRatio ?? 0)) * 0.18));
    el.effect.hidden = !effect.label;
    el.effect.textContent = effect.label ?? '';
    el.updraft.hidden = !effect.updraftActive;
    el.updraft.classList.toggle('is-ready', !!effect.playerInUpdraft);

    if (s.tutorialText) {
      el.tutorial.hidden = false;
      el.tutorial.textContent = s.tutorialText;
    } else {
      el.tutorial.hidden = true;
    }

    // 밸런스 마커 — tilt[-WIPEOUT..WIPEOUT] → 0~100%
    const t = Math.max(-1, Math.min(1, s.tilt / BALANCE.WIPEOUT_AT));
    el.marker.style.left = `${50 + t * 50}%`;
    el.marker.classList.toggle('is-warn', Math.abs(s.tilt) >= BALANCE.WARN_AT);
  }

  // 피격·이벤트 시 전체 화면 색 플래시 (CSS 트랜지션으로 페이드아웃)
  function flash(r, g, b, ms = 140) {
    el.flash.style.transition = 'none';
    el.flash.style.background = `rgb(${r}, ${g}, ${b})`;
    el.flash.style.opacity = '0.5';
    void el.flash.offsetWidth;   // 강제 reflow → 트랜지션 재시작
    el.flash.style.transition = `opacity ${ms}ms ease-out`;
    el.flash.style.opacity = '0';
  }

  function perfectJump() {
    if (perfectToastTimer) clearTimeout(perfectToastTimer);
    el.perfectToast.hidden = false;
    el.perfectToast.classList.remove('is-pop');
    void el.perfectToast.offsetWidth;
    el.perfectToast.classList.add('is-pop');
    perfectToastTimer = setTimeout(() => {
      el.perfectToast.hidden = true;
      perfectToastTimer = null;
    }, 760);
  }

  return {
    update,
    flash,
    perfectJump,
    destroy() {
      if (perfectToastTimer) clearTimeout(perfectToastTimer);
      root.remove();
    },
  };
}
