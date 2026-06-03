// 메인 메뉴 DOM 오버레이. Phaser 캔버스 위에 띄우고, 버튼 콜백으로 씬을 전환한다.
// mountMainMenu(...) 는 { destroy } 를 반환한다.

const CONTROLS = [
  ['↑ / ↓', '파도 면을 타고 위(안전)·아래(거친 바다 ×1.5)로 이동'],
  ['← / →', '보드 균형 잡기 — 무너지면 와이프아웃!'],
  ['Space', '점프로 솟구친 장애물을 뛰어넘기 (공중=균형 안정)'],
  ['P / ESC', '일시정지 메뉴 열기·닫기'],
];

export function mountMainMenu({ save, storage, stages, onStart, onContinue, onWorldMap }) {
  const hasPlayed = !!save?.lastPlayedTime;

  const overlay = document.createElement('div');
  overlay.className = 'menu-overlay';
  overlay.innerHTML = `
    <div class="menu-bg" aria-hidden="true">
      <span class="menu-sun"></span>
      <span class="menu-wave menu-wave--1"></span>
      <span class="menu-wave menu-wave--2"></span>
      <span class="menu-wave menu-wave--3"></span>
    </div>

    <main class="menu">
      <header class="menu-head">
        <h1 class="menu-title">서프라이드</h1>
        <p class="menu-subtitle">파도를 넘어, 세계를 건너라</p>
      </header>

      <div class="menu-banner">
        <img src="/menu-hero-surf-dog.jpg" alt="선글라스와 꽃목걸이를 한 하와이안 강아지가 파도 위에서 서핑하는 모습" draggable="false" />
      </div>

      <nav class="menu-actions">
        <button class="btn btn--primary" data-act="start">시작하기</button>
        <button class="btn btn--secondary" data-act="continue" ${hasPlayed ? '' : 'disabled'}>이어하기</button>
        <div class="btn-row">
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
    switch (btn.dataset.act) {
      case 'start':    onStart(); break;
      case 'continue': onContinue(); break;
      case 'map':      onWorldMap(); break;
      case 'controls': openControls(overlay); break;
      case 'settings': /* 설정 화면은 추후 */ break;
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
    <div class="modal__panel" role="dialog" aria-modal="true" aria-label="조작법">
      <h2 class="modal__title">조작법</h2>
      <ul class="modal__rows">
        ${CONTROLS.map(
          ([key, desc]) => `
          <li class="modal__row">
            <kbd class="modal__key">${escapeHtml(key)}</kbd>
            <span class="modal__desc">${escapeHtml(desc)}</span>
          </li>`,
        ).join('')}
      </ul>
      <button class="btn btn--primary modal__close" data-close>닫기 (ESC)</button>
    </div>`;
  modal.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) closeControls(overlay);
  });
  overlay.appendChild(modal);
}

function closeControls(overlay) {
  overlay.querySelector('.modal')?.remove();
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}
