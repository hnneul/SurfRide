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

// 노드 사이를 부드러운 곡선 세그먼트(각각 독립된 path)로 끊어 그린다.
// 완료/현재/잠금 구간을 서로 다른 스타일로 구분하기 위함.
function smoothCurveSegments(pts, tension = 0.18) {
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const cp1x = (p1.x + tension * (p2.x - p0.x)).toFixed(1);
    const cp1y = (p1.y + tension * (p2.y - p0.y)).toFixed(1);
    const cp2x = (p2.x - tension * (p3.x - p1.x)).toFixed(1);
    const cp2y = (p2.y - tension * (p3.y - p1.y)).toFixed(1);
    segs.push(`M ${p1.x} ${p1.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`);
  }
  return segs;
}

function routeTemplate({ unlocked, stages }) {
  const pts = MAP_NODES.map(node => ({ x: node.x, y: node.y }));
  const segs = smoothCurveSegments(pts);
  const nextId = nextStageId(unlocked, stages);

  const paths = segs.map((d, i) => {
    const toId = MAP_NODES[i + 1].id; // 세그먼트 i 는 노드 i → i+1 을 잇는다
    const toCleared = !!entryFor(unlocked, toId)?.cleared;
    const segState = toCleared ? 'done' : toId === nextId ? 'active' : 'locked';
    return `<path class="world-map-route__seg world-map-route__seg--${segState}" d="${d}" />`;
  }).join('');

  return `
    <svg class="world-map-route" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      ${paths}
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
    const glyph = cleared ? '✓' : String(node.id);

    // 지도 위 텍스트는 최소화 — 이름표는 선택/현재 목적지에서만 CSS 로 노출한다.
    const labelClass = node.label ? ` world-node--label-${node.label}` : '';

    return `
      <button
        class="world-node world-node--${status}${labelClass}${selected ? ' is-selected' : ''}"
        style="--x:${node.x}%; --y:${node.y}%;"
        data-act="select"
        data-stage-id="${node.id}"
        ${playable ? '' : 'disabled'}
        aria-pressed="${selected ? 'true' : 'false'}"
        aria-label="${escapeHtml(`${node.id}구역 ${stage.name}`)}"
      >
        <span class="world-node__marker">${escapeHtml(glyph)}</span>
        <span class="world-node__name">${escapeHtml(stage.name)}</span>
      </button>`;
  }).join('');
}

function summaryTemplate({ stages, state }) {
  const nextId = nextStageId(state.unlocked, stages);
  const message = nextId === null
    ? '모든 항로를 정복했습니다. 원하는 해역에서 기록을 갱신할 수 있습니다.'
    : `${nextId}구역 ${stages[nextId - 1].name}${josa(stages[nextId - 1].name, '이', '가')} 다음 목적지입니다. 제주에서 태평양으로 이어지는 항로를 하나씩 열어가세요.`;

  return `<p>${escapeHtml(message)}</p>`;
}

function josa(word, consonant, vowel) {
  const last = word.charCodeAt(word.length - 1) - 0xAC00;
  return last >= 0 && last % 28 !== 0 ? consonant : vowel;
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
      <button class="btn ${cleared ? 'btn--success' : 'btn--primary'} world-panel__challenge" data-act="challenge" ${playable ? '' : 'disabled'}>
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
