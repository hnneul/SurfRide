// 세계지도 DOM 오버레이. Phaser 캔버스 위에 띄우고, 버튼 콜백으로 씬을 전환한다.
// mountWorldMap(...) 는 { destroy } 를 반환한다.

const MAP_NODES = [
  { id: 1, x: 7, y: 64 },
  { id: 2, x: 18, y: 52 },
  { id: 3, x: 29, y: 42 },
  { id: 4, x: 41, y: 33 },
  { id: 5, x: 53, y: 27 },
  { id: 6, x: 64, y: 24 },
  { id: 7, x: 74, y: 28 },
  { id: 8, x: 83, y: 39 },
  { id: 9, x: 90, y: 53 },
  { id: 10, x: 94, y: 70 },
];

const MAP_TEXTS = {
  1: '첫 파도에 올라타는 출발 해역입니다.',
  2: '연안의 생물 신호를 읽는 구간입니다.',
  3: '큰 파도가 항로를 흔드는 남쪽 바다입니다.',
  4: '바람과 가짜 신호가 시작되는 해역입니다.',
  5: '암초 지대를 빠르게 통과해야 합니다.',
  6: '태풍 전야의 리듬이 빨라지는 바다입니다.',
  7: '밤바다에서 번개 신호를 구분해야 합니다.',
  8: '화산 해역의 낯선 흐름이 밀려옵니다.',
  9: '폭풍과 번개가 동시에 몰아칩니다.',
  10: '모든 파도가 마지막 시험이 됩니다.',
};

const TYPE_LABEL = Object.freeze({
  FLYING_FISH: '날치',
  JELLYFISH: '해파리',
  SHARK: '상어',
  WHALE: '고래',
  OCTOPUS: '문어',
  LIGHTNING: '번개',
});

export function mountWorldMap({ save, stages, onBack, onChallenge }) {
  const state = {
    unlocked: normalizeUnlocked(save?.unlockedStages),
    selectedId: 1,
  };
  state.selectedId = defaultSelectedId(state.unlocked, stages);

  const overlay = document.createElement('div');
  overlay.className = 'world-map-overlay';
  overlay.innerHTML = shellTemplate({ save, stages, state });
  document.body.appendChild(overlay);

  const render = () => {
    overlay.querySelector('[data-map-nodes]').innerHTML = nodesTemplate({ stages, state });
    overlay.querySelector('[data-map-panel]').innerHTML = panelTemplate({ stages, state });
    overlay.querySelector('[data-summary]').innerHTML = summaryTemplate({ stages, state });
  };

  const onClick = (e) => {
    const target = e.target.closest('[data-act]');
    if (!target || target.disabled) return;

    switch (target.dataset.act) {
      case 'select': {
        const id = Number(target.dataset.stageId);
        if (!isPlayable(state.unlocked, stages, id)) return;
        state.selectedId = id;
        render();
        break;
      }
      case 'challenge':
        if (isPlayable(state.unlocked, stages, state.selectedId)) onChallenge(state.selectedId - 1);
        break;
      case 'back':
        onBack();
        break;
    }
  };

  const onKey = (e) => {
    if (e.key === 'Escape') onBack();
    if (e.key === 'Enter' && isPlayable(state.unlocked, stages, state.selectedId)) {
      onChallenge(state.selectedId - 1);
    }
  };

  overlay.addEventListener('click', onClick);
  document.addEventListener('keydown', onKey);
  render();

  return {
    destroy() {
      overlay.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
      overlay.remove();
    },
  };
}

function shellTemplate({ save, stages, state }) {
  const cleared = state.unlocked.filter(s => s.cleared).length;
  const stars = state.unlocked.reduce((acc, s) => acc + (s.stars ?? 0), 0);
  const high = Math.max(save?.globalHighScore ?? 0, ...state.unlocked.map(s => s.highScore ?? 0));

  return `
    <div class="world-map-bg" aria-hidden="true">
      <span class="world-map-sun"></span>
      <span class="world-map-cloud world-map-cloud--1"></span>
      <span class="world-map-cloud world-map-cloud--2"></span>
      <span class="world-map-wave world-map-wave--1"></span>
      <span class="world-map-wave world-map-wave--2"></span>
    </div>

    <main class="world-map">
      <header class="world-map__head">
        <div>
          <h1 class="world-map__title">세계지도</h1>
          <p class="world-map__subtitle">제주에서 태평양 끝까지 이어지는 서프 항로</p>
        </div>
        <dl class="world-map__stats" aria-label="진행 상황">
          ${statTemplate('별', `${stars} / ${stages.length * 3}`)}
          ${statTemplate('클리어', `${cleared} / ${stages.length}`)}
          ${statTemplate('최고', high > 0 ? high.toLocaleString() : '-')}
        </dl>
      </header>

      <section class="world-map__body" aria-label="해역 선택">
        <div class="world-map__chart">
          ${routeTemplate()}
          <div class="world-map__nodes" data-map-nodes></div>
        </div>
      </section>

      <div class="world-map__summary" data-summary></div>
      <section class="world-map__panel" data-map-panel aria-live="polite"></section>
    </main>`;
}

function statTemplate(label, value) {
  return `
    <div class="world-map-stat">
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value)}</dd>
    </div>`;
}

function routeTemplate() {
  const routePath = `M ${MAP_NODES
    .map(node => `${node.x * 10} ${node.y * 3.6}`)
    .join(' L ')}`;

  return `
    <svg class="world-map-route" viewBox="0 0 1000 360" preserveAspectRatio="none" aria-hidden="true">
      <path class="world-map-route__shadow" d="${routePath}" />
      <path class="world-map-route__line" d="${routePath}" />
      <path class="world-map-route__dash" d="${routePath}" />
    </svg>`;
}

function nodesTemplate({ stages, state }) {
  const nextId = nextStageId(state.unlocked, stages);

  return MAP_NODES.map((node) => {
    const stage = stages[node.id - 1];
    const entry = entryFor(state.unlocked, node.id);
    const cleared = !!entry?.cleared;
    const playable = isPlayable(state.unlocked, stages, node.id);
    const selected = state.selectedId === node.id;
    const status = cleared ? 'cleared' : nextId === node.id ? 'next' : playable ? 'open' : 'locked';
    const label = playable ? `${node.id}` : '잠김';
    const stars = cleared ? `${'★'.repeat(entry.stars ?? 0)}${'☆'.repeat(3 - (entry.stars ?? 0))}` : '';

    return `
      <button
        class="world-node world-node--${status}${selected ? ' is-selected' : ''}"
        style="--x:${node.x}%; --y:${node.y}%;"
        data-act="select"
        data-stage-id="${node.id}"
        ${playable ? '' : 'disabled'}
        aria-pressed="${selected ? 'true' : 'false'}"
      >
        <span class="world-node__island" aria-hidden="true"></span>
        <span class="world-node__marker">${escapeHtml(label)}</span>
        <span class="world-node__name">${escapeHtml(stage.name)}</span>
        <span class="world-node__stars">${escapeHtml(stars || (status === 'next' ? '다음 목적지' : ''))}</span>
      </button>`;
  }).join('');
}

function summaryTemplate({ stages, state }) {
  const nextId = nextStageId(state.unlocked, stages);
  const message = nextId === null
    ? '모든 항로를 정복했습니다. 원하는 해역에서 기록을 갱신할 수 있습니다.'
    : `${nextId}구역 ${stages[nextId - 1].name}이 다음 목적지입니다.`;

  return `<p>${escapeHtml(message)}</p>`;
}

function panelTemplate({ stages, state }) {
  const stage = stages[state.selectedId - 1];
  const entry = entryFor(state.unlocked, state.selectedId);
  const cleared = !!entry?.cleared;
  const next = nextStageId(state.unlocked, stages) === state.selectedId;
  const playable = isPlayable(state.unlocked, stages, state.selectedId);
  const stars = entry?.stars ?? 0;
  const highScore = entry?.highScore ?? 0;
  const status = cleared ? `클리어 ★ ${stars}/3` : next ? '다음 목적지' : playable ? '입장 가능' : '잠김';
  const types = obstacleTypes(stage);

  return `
    <div class="world-panel__badge world-panel__badge--${cleared ? 'cleared' : next ? 'next' : 'open'}">
      <span>${stage.id}</span>
      <small>구역</small>
    </div>

    <div class="world-panel__brief">
      <span class="world-panel__status">${escapeHtml(status)}</span>
      <h2>${escapeHtml(stage.name)}</h2>
      <p>${escapeHtml(MAP_TEXTS[stage.id])}</p>
    </div>

    <dl class="world-panel__facts">
      ${factTemplate('최고 기록', highScore > 0 ? `${highScore.toLocaleString()}점` : '-')}
      ${factTemplate('장애물', types)}
      ${factTemplate('목표', `${Math.round(stage.duration / 1000)}초 생존`)}
    </dl>

    <nav class="world-panel__actions">
      <button class="btn btn--ghost world-panel__back" data-act="back">메인으로</button>
      <button class="btn btn--primary world-panel__challenge" data-act="challenge" ${playable ? '' : 'disabled'}>
        ${stage.id}구역 도전하기
      </button>
    </nav>`;
}

function factTemplate(label, value) {
  return `
    <div>
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value)}</dd>
    </div>`;
}

function obstacleTypes(stage) {
  const labels = [...new Set((stage.events ?? [])
    .map(event => event?.obstacleType)
    .filter(Boolean))]
    .map(type => TYPE_LABEL[type] ?? type);
  return labels.length > 0 ? labels.join(', ') : '-';
}

function defaultSelectedId(unlocked, stages) {
  const next = nextStageId(unlocked, stages);
  if (next !== null) return next;
  const cleared = unlocked.filter(s => s.cleared).map(s => s.id);
  return cleared.length > 0 ? Math.max(...cleared) : 1;
}

function nextStageId(unlocked, stages) {
  const clearedIds = unlocked.filter(s => s.cleared).map(s => s.id);
  const maxCleared = clearedIds.length > 0 ? Math.max(...clearedIds) : 0;
  return maxCleared < stages.length ? maxCleared + 1 : null;
}

function isPlayable(unlocked, stages, id) {
  const next = nextStageId(unlocked, stages);
  return !!entryFor(unlocked, id)?.cleared || next === id || !!entryFor(unlocked, id);
}

function entryFor(unlocked, id) {
  return unlocked.find(s => s.id === id);
}

function normalizeUnlocked(unlockedStages) {
  const byId = new Map([[1, { id: 1, stars: 0, highScore: 0, cleared: false }]]);

  if (Array.isArray(unlockedStages)) {
    for (const item of unlockedStages) {
      if (!item || typeof item !== 'object') continue;
      const id = clampInt(item.id, 1, 10, 1);
      const prev = byId.get(id) ?? { id, stars: 0, highScore: 0, cleared: false };
      byId.set(id, {
        id,
        stars: Math.max(prev.stars, clampInt(item.stars, 0, 3, 0)),
        highScore: Math.max(prev.highScore, nonNegativeInt(item.highScore)),
        cleared: prev.cleared || Boolean(item.cleared),
      });
    }
  }

  return [...byId.values()].sort((a, b) => a.id - b.id);
}

function clampInt(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function nonNegativeInt(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}
