// 인게임 HUD DOM 오버레이 (Three 캔버스 위). 게임 로직·HUDScene은 안 건드리고
// GameScene 상태를 매 프레임 읽어 "표시만" 한다. mountHud() → { update(state), destroy() }.
import { BALANCE } from '../constants.js';

export function mountHud(parent = document.getElementById('game-container')) {
  const root = document.createElement('div');
  root.className = 'hud';
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = `
    <div class="hud__top">
      <div class="hud__hearts"></div>
      <div class="hud__center">
        <div class="hud__timer">—</div>
        <div class="hud__stage"></div>
      </div>
      <div class="hud__right">
        <div class="hud__score">0</div>
        <div class="hud__combo"></div>
      </div>
    </div>
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
    hearts: root.querySelector('.hud__hearts'),
    timer:  root.querySelector('.hud__timer'),
    stage:  root.querySelector('.hud__stage'),
    score:  root.querySelector('.hud__score'),
    combo:  root.querySelector('.hud__combo'),
    safe:   root.querySelector('.hud__balance-safe'),
    marker: root.querySelector('.hud__balance-marker'),
  };

  // 밸런스 안전구역(중앙 녹색대)은 1회만 배치 — 마커 범위[0,1] 중 |tilt|<WARN_AT 구간
  const safeFrac = BALANCE.WARN_AT / BALANCE.WIPEOUT_AT;
  el.safe.style.left  = `${50 - safeFrac * 50}%`;
  el.safe.style.width = `${safeFrac * 100}%`;

  let heartCount = -1;

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

    // 밸런스 마커 — tilt[-WIPEOUT..WIPEOUT] → 0~100%
    const t = Math.max(-1, Math.min(1, s.tilt / BALANCE.WIPEOUT_AT));
    el.marker.style.left = `${50 + t * 50}%`;
    el.marker.classList.toggle('is-warn', Math.abs(s.tilt) >= BALANCE.WARN_AT);
  }

  return {
    update,
    destroy() { root.remove(); },
  };
}
