// 세계지도 DOM 오버레이. Phaser 캔버스 위에 띄우고, 버튼 콜백으로 씬을 전환한다.
// mountWorldMap(...) 는 { destroy } 를 반환한다.

// 노드 좌표는 실제 해역 위치를 따른다 (동아시아 → 서태평양).
// %값은 SVG 1000×360 지형과 같은 좌표계를 공유한다 (x%·10 = svgX, y%·3.6 = svgY).
// 1~4 한반도·제주·황해·동중국해 / 5 류큐(오키나와) / 6 필리핀해 / 7~10 태평양.
const MAP_NODES = [
  { id: 1,  x: 25.5, y: 41.1 }, // 제주 앞바다 (부산~제주 사이)
  { id: 2,  x: 15.0, y: 50.0 }, // 제주 연안 (황해 쪽)
  { id: 3,  x: 30.0, y: 45.8 }, // 제주 남쪽 해역
  { id: 4,  x: 19.5, y: 56.9 }, // 동중국해
  { id: 5,  x: 33.5, y: 63.3 }, // 오키나와 (류큐 열도)
  { id: 6,  x: 45.5, y: 80.6 }, // 필리핀해
  { id: 7,  x: 60.0, y: 70.8 }, // 태평양 밤바다
  { id: 8,  x: 71.0, y: 62.5 }, // 태평양 화산 해역
  { id: 9,  x: 81.5, y: 30.6 }, // 북태평양 폭풍
  { id: 10, x: 91.5, y: 48.6 }, // 괴물 파도 해역
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

// 실제 지형을 로우폴리로 단순화한 SVG 패스 (viewBox 1000×360).
// 왼쪽 대륙(중국) → 한반도+제주 → 일본 호상열도 → 류큐 → 타이완 → 필리핀,
// 오른쪽은 화산 섬 몇 개만 떠 있는 열린 태평양.
const TERRAIN_SHAPES = Object.freeze({
  china: 'M -40 -40 L 96 -40 C 110 26 82 60 90 94 C 96 120 72 138 54 156 C 34 176 28 196 14 214 C -6 240 -40 244 -40 244 Z',
  korea: 'M 186 32 C 162 50 170 86 178 118 C 184 140 196 154 197 154 C 210 138 214 106 211 78 C 208 54 202 36 186 32 Z',
  jeju: 'M 172 170 C 174 160 208 160 212 171 C 214 182 174 183 172 170 Z',
  japan: 'M 290 150 C 328 132 386 120 430 106 C 458 97 478 74 490 46 C 504 54 502 84 488 104 C 468 126 414 144 364 156 C 332 163 308 164 290 150 Z',
  ryukyu: 'M 314 176 C 320 172 327 178 322 185 C 317 191 309 186 314 176 Z M 326 204 C 332 200 339 206 334 213 C 329 219 321 214 326 204 Z M 330 248 C 336 244 343 250 338 257 C 333 263 325 258 330 248 Z',
  taiwan: 'M 100 244 C 112 242 118 256 113 272 C 108 282 98 279 98 264 C 98 254 94 247 100 244 Z',
  philippines: 'M 132 300 C 146 297 152 316 145 332 C 140 344 128 341 127 325 C 126 312 122 304 132 300 Z M 150 336 C 160 333 165 347 159 356 C 154 360 146 358 147 346 C 148 339 144 338 150 336 Z M 166 352 C 174 350 178 360 178 360 L 160 360 C 158 356 160 354 166 352 Z',
  pacific: 'M 690 234 C 698 229 706 236 701 244 C 696 251 686 245 690 234 Z M 728 206 C 735 202 742 209 737 216 C 732 222 723 217 728 206 Z',
});

// 면 분할(저폴리 음영) — 큰 지형에만 밝은 삼각면을 얹어 입체감을 준다.
const TERRAIN_FACETS = Object.freeze({
  china: [
    '-40,-30 96,-40 90,94 30,72',
    '30,74 90,96 54,156 8,140',
    '8,142 54,158 14,214 -20,230',
  ],
  korea: [
    '186,36 210,84 194,148',
    '170,90 194,148 178,118',
  ],
  japan: [
    '290,150 430,108 386,134',
    '430,108 490,46 488,102',
    '386,136 468,128 364,156',
  ],
  taiwan: [
    '100,246 116,258 102,270',
  ],
  philippines: [
    '132,302 152,316 134,330',
  ],
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

function smoothCurvePath(pts, tension = 0.18) {
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const cp1x = (p1.x + tension * (p2.x - p0.x)).toFixed(1);
    const cp1y = (p1.y + tension * (p2.y - p0.y)).toFixed(1);
    const cp2x = (p2.x - tension * (p3.x - p1.x)).toFixed(1);
    const cp2y = (p2.y - tension * (p3.y - p1.y)).toFixed(1);
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function routeTemplate() {
  const pts = MAP_NODES.map(node => ({ x: node.x * 10, y: node.y * 3.6 }));
  const routePath = smoothCurvePath(pts);

  return `
    ${realWorldTerrainTemplate()}
    <svg class="world-map-route" viewBox="0 0 1000 360" preserveAspectRatio="none" aria-hidden="true">
      <path class="world-map-route__shadow" d="${routePath}" />
      <path class="world-map-route__line" d="${routePath}" />
      <path class="world-map-route__dash" d="${routePath}" />
    </svg>`;
}

function realWorldTerrainTemplate() {
  return `
    <svg class="lowpoly-world world-map-terrain" viewBox="0 0 1000 360" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="worldLandTop" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#b8e27b" />
          <stop offset="0.48" stop-color="#55bf7e" />
          <stop offset="1" stop-color="#25906f" />
        </linearGradient>
      </defs>
      <g class="world-map-ocean-tiles">
        <polygon points="0,282 120,243 216,360 0,360" />
        <polygon points="118,244 286,230 360,360 216,360" />
        <polygon points="287,230 450,203 550,360 360,360" />
        <polygon points="452,204 621,180 734,360 550,360" />
        <polygon points="622,181 805,153 1000,315 1000,360 734,360" />
        <polygon points="250,0 458,0 376,129 214,112" />
        <polygon points="459,0 707,0 625,134 376,129" />
        <polygon points="708,0 1000,0 1000,135 624,134" />
      </g>
      <g class="world-map-shallows">
        ${Object.values(TERRAIN_SHAPES).map(d => `<path d="${d}" />`).join('')}
      </g>
      <g class="world-map-land-sides">
        ${Object.entries(TERRAIN_SHAPES).map(([key, d]) => `<path class="land-${key}" d="${d}" />`).join('')}
      </g>
      <g class="world-map-land">
        ${Object.entries(TERRAIN_SHAPES).map(([key, d]) => `<path class="land-${key}" d="${d}" />`).join('')}
      </g>
      <g class="world-map-land-facets">
        ${Object.values(TERRAIN_FACETS).flat().map(points => `<polygon points="${points}" />`).join('')}
      </g>
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
        class="world-node world-node--${status} world-node--theme-${themeClass(stage.theme)}${selected ? ' is-selected' : ''}"
        style="--x:${node.x}%; --y:${node.y}%;"
        data-act="select"
        data-stage-id="${node.id}"
        ${playable ? '' : 'disabled'}
        aria-pressed="${selected ? 'true' : 'false'}"
      >
        <span class="world-node__island" aria-hidden="true">
          <span class="world-node__tile"></span>
          <span class="world-node__prop"></span>
        </span>
        <span class="world-node__marker">${escapeHtml(label)}</span>
        <span class="world-node__name">${escapeHtml(stage.name)}</span>
        <span class="world-node__stars">${escapeHtml(stars || (status === 'next' ? '다음 목적지' : ''))}</span>
      </button>`;
  }).join('');
}

function themeClass(theme) {
  return String(theme ?? 'default').replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
}

function summaryTemplate({ stages, state }) {
  const nextId = nextStageId(state.unlocked, stages);
  const message = nextId === null
    ? '모든 항로를 정복했습니다. 원하는 해역에서 기록을 갱신할 수 있습니다.'
    : `${nextId}구역 ${stages[nextId - 1].name}${josa(stages[nextId - 1].name, '이', '가')} 다음 목적지입니다.`;

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
