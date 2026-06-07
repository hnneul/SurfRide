// 세계지도 DOM 오버레이. Phaser 캔버스 위에 띄우고, 버튼 콜백으로 씬을 전환한다.
// mountWorldMap(...) 는 { destroy } 를 반환한다.

// 좌표(%)는 배경(world-map-pacific-route.png)의 판타지 지형 위치에 맞춰 배치한다.
// 실제 지명보다 이미지에 보이는 산호초, 관문, 난파선, 화산, 폭풍, 신전 오브젝트를 우선한다.
// 목적지 원이 섬을 가리지 않도록 각 노드는 해당 섬 주변의 빈 해상에 둔다.
const MAP_NODES = [
  { id: 1,  x: 18.8, y: 27.4 }, // 제주 앞바다: 출발 해안
  { id: 2,  x: 25.0, y: 37.6 }, // 산호초 물길: 작은 산호섬
  { id: 3,  x: 31.5, y: 47.1 }, // 고대 관문 해역: 유적 관문
  { id: 4,  x: 28.4, y: 64.8, label: 'top' }, // 버섯 산호섬: 버섯 산호 군락
  { id: 5,  x: 33.0, y: 77.5, label: 'top' }, // 난파선 암초: 난파선과 암초
  { id: 6,  x: 48.6, y: 60.1 }, // 심해 수정 동굴: 푸른 수정 동굴
  { id: 7,  x: 65.2, y: 48.5 }, // 마리아나 심연: 어두운 심연과 수정 구체
  { id: 8,  x: 67.0, y: 27.0 }, // 화산섬 해역: 분화하는 화산섬
  { id: 9,  x: 79.2, y: 36.4 }, // 폭풍 소용돌이: 번개 폭풍과 소용돌이
  { id: 10, x: 88.2, y: 25.5 }, // 태평양 신전: 거대한 파도의 신전
];

const MAP_TEXTS = {
  1: '출발 해안에서 첫 파도와 항로 감각을 익힙니다.',
  2: '작은 산호초 물길을 지나며 처음 나타나는 바다 생물들의 신호를 읽습니다.',
  3: '고대 관문이 솟은 해역에서 첫 큰 파도를 타 넘습니다.',
  4: '버섯처럼 자란 산호섬 주변의 좁은 통로를 헤쳐 나갑니다.',
  5: '난파선이 걸린 암초 지대의 거센 조류를 통과합니다.',
  6: '푸른 수정 동굴이 빛나는 심해에서 태풍 전야의 빠른 리듬을 버팁니다.',
  7: '어두운 심연 위에서 희미한 수정 구체의 신호를 따라갑니다.',
  8: '분화하는 화산섬 주변의 낯선 상승기류와 뜨거운 수증기를 넘습니다.',
  9: '번개가 내리치는 폭풍 소용돌이의 거친 파도를 피합니다.',
  10: '거대한 파도가 감싼 신전에서 마지막 항해를 마칩니다.',
};

export function mountWorldMap({ save, stages, onBack, onChallenge }) {
  const state = {
    unlocked: normalizeUnlocked(save?.unlockedStages),
    selectedId: null,
  };

  const overlay = document.createElement('div');
  overlay.className = 'world-map-overlay';
  overlay.innerHTML = shellTemplate({ save, stages, state });
  document.body.appendChild(overlay);

  const render = () => {
    overlay.querySelector('[data-map-nodes]').innerHTML = nodesTemplate({ stages, state });
    overlay.querySelector('[data-map-card]').innerHTML = mapCardTemplate({ stages, state });
  };

  const closeCard = () => {
    if (state.selectedId === null) return;
    state.selectedId = null;
    render();
  };

  const onClick = (e) => {
    const target = e.target.closest('[data-act]');

    // 노드·카드 버튼이 아닌 지도 빈 곳을 클릭하면 열린 카드를 닫는다.
    if (!target) {
      if (!e.target.closest('[data-map-card]')) closeCard();
      return;
    }
    if (target.disabled) return;

    switch (target.dataset.act) {
      case 'select': {
        const id = Number(target.dataset.stageId);
        state.selectedId = id;
        render();
        break;
      }
      case 'challenge':
        if (isPlayable(state.unlocked, stages, state.selectedId)) onChallenge(state.selectedId - 1);
        break;
    }
  };

  const onKey = (e) => {
    // ESC: 카드가 열려 있으면 먼저 닫고, 없으면 월드맵에서 나간다.
    if (e.key === 'Escape') {
      if (state.selectedId !== null) closeCard();
      else onBack();
      return;
    }
    if (e.key === 'Enter' && state.selectedId !== null && isPlayable(state.unlocked, stages, state.selectedId)) {
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
          <h1 class="world-map__title">
            <span class="sr-only">World Map</span>
            <img class="world-map__title-logo" src="/world-map-title.png" alt="" draggable="false" />
          </h1>
          <p class="world-map__subtitle">제주 앞바다에서 산호초와 심해를 지나 태평양 신전으로 향하는 탐험 항로</p>
        </div>
        <dl class="world-map__stats" aria-label="진행 상황">
          ${statTemplate('별', `${stars} / ${stages.length * 3}`)}
          ${statTemplate('클리어', `${cleared} / ${stages.length}`)}
          ${statTemplate('최고', high > 0 ? high.toLocaleString() : '-')}
        </dl>
      </header>

      <section class="world-map__body" aria-label="해역 선택">
        <div class="world-map__chart">
          <div class="world-map__nodes" data-map-nodes></div>
          <aside class="world-map-card" data-map-card aria-live="polite"></aside>
        </div>
      </section>
    </main>`;
}

function statTemplate(label, value) {
  return `
    <div class="world-map-stat">
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value)}</dd>
    </div>`;
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
    const glyph = cleared ? '✓' : String(node.id);

    // 지도 위 텍스트는 최소화 — 이름표는 선택/현재 목적지에서만 CSS 로 노출한다.
    const labelClass = node.label ? ` world-node--label-${node.label}` : '';

    return `
      <button
        class="world-node world-node--${status}${labelClass}${selected ? ' is-selected' : ''}"
        style="--x:${node.x}%; --y:${node.y}%;"
        data-act="select"
        data-stage-id="${node.id}"
        aria-pressed="${selected ? 'true' : 'false'}"
        aria-disabled="${playable ? 'false' : 'true'}"
        aria-label="${escapeHtml(`${node.id}구역 ${stage.name}`)}"
      >
        <span class="world-node__marker">${escapeHtml(glyph)}</span>
        <span class="world-node__name">${escapeHtml(stage.name)}</span>
      </button>`;
  }).join('');
}

function mapCardTemplate({ stages, state }) {
  if (state.selectedId === null) return '';

  const stage = stages[state.selectedId - 1];
  const entry = entryFor(state.unlocked, state.selectedId);
  const cleared = !!entry?.cleared;
  const next = nextStageId(state.unlocked, stages) === state.selectedId;
  const playable = isPlayable(state.unlocked, stages, state.selectedId);
  const stars = entry?.stars ?? 0;
  const statusKey = cleared ? 'cleared' : next ? 'next' : playable ? 'open' : 'locked';
  const status = cleared ? '클리어' : next ? '다음 목적지' : playable ? '입장 가능' : '잠김';
  const challengeLabel = playable ? `${stage.id}구역 도전하기` : '이전 해역을 먼저 클리어하세요';

  return `
    <div class="world-card__meta">
      <span class="world-card__badge world-card__badge--${statusKey}">${stage.id}구역</span>
      <span class="world-card__status world-card__status--${statusKey}">${escapeHtml(status)}</span>
    </div>
    ${cleared ? starsTemplate(stars) : ''}
    <h2>${escapeHtml(stage.name)}</h2>
    <p>${escapeHtml(MAP_TEXTS[stage.id])}</p>
    <div class="world-card__actions">
      <button class="btn ${cleared ? 'btn--success' : 'btn--primary'} world-card__challenge" data-act="challenge" ${playable ? '' : 'disabled'}>
        ${escapeHtml(challengeLabel)}
      </button>
    </div>`;
}

// 획득한 별 개수만큼 3D 노란 별 아이콘을 그린다. 미클리어/미획득은 호출하지 않는다.
function starsTemplate(count) {
  const safe = clampInt(count, 0, 3, 0);
  if (safe <= 0) return '';
  const icons = Array.from({ length: safe }, (_, i) => starIcon(i)).join('');
  return `<span class="world-card__stars" role="img" aria-label="획득 별 ${safe}개">${icons}</span>`;
}

// 5각 별 path (viewBox 24×24). fill 그라데이션 + 흰 하이라이트 + 주황 외곽선으로 3D 입체감.
const STAR_PATH = 'M12 2 14.35 8.76 21.51 8.91 15.8 13.24 17.88 20.09 12 16 6.12 20.09 8.2 13.24 2.49 8.91 9.65 8.76Z';

function starIcon(i) {
  const id = `wc-star-${i}`;
  return `
    <svg class="world-card__star" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="${id}-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#fff7bd" />
          <stop offset="0.5" stop-color="#ffcb33" />
          <stop offset="1" stop-color="#f78f17" />
        </linearGradient>
        <clipPath id="${id}-clip"><path d="${STAR_PATH}" /></clipPath>
      </defs>
      <path d="${STAR_PATH}" fill="url(#${id}-fill)" stroke="#dd7a0b" stroke-width="0.7" stroke-linejoin="round" />
      <g clip-path="url(#${id}-clip)">
        <ellipse cx="9.6" cy="8" rx="5.2" ry="3" fill="#fffbe8" opacity="0.6" />
      </g>
    </svg>`;
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
