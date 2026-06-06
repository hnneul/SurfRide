// @ts-check
import { PATTERNS } from './spawnPatterns.js';

/** @typedef {import('./types.js').StageData} StageData */

// ─── 스테이지별 난이도 설정 (JSON 분리 데이터) ────────────────────────────────
// allowedTypes: 해당 스테이지에서 등장 가능한 장애물 종류
// telegraphRange: [min, max] ms — ObstacleManager에서 min 500 이하 금지
// obstaclesPerMin: [min, max] 장애물 밀도 범위
export const STAGE_CONFIG = Object.freeze({
  1:  { allowedTypes: ['FLYING_FISH'],                                                        telegraphRange: [900,  1200], obstaclesPerMin: [18, 28] },
  2:  { allowedTypes: ['FLYING_FISH', 'JELLYFISH', 'SHARK'],                                  telegraphRange: [900,  1200], obstaclesPerMin: [18, 28] },
  3:  { allowedTypes: ['FLYING_FISH', 'JELLYFISH', 'SHARK', 'WHALE'],                         telegraphRange: [900,  1200], obstaclesPerMin: [18, 28] },
  4:  { allowedTypes: ['FLYING_FISH', 'JELLYFISH', 'SHARK', 'WHALE', 'OCTOPUS'],              telegraphRange: [700,  1000], obstaclesPerMin: [24, 34] },
  5:  { allowedTypes: ['FLYING_FISH', 'JELLYFISH', 'SHARK', 'WHALE', 'OCTOPUS'],              telegraphRange: [700,  1000], obstaclesPerMin: [24, 34] },
  6:  { allowedTypes: ['FLYING_FISH', 'JELLYFISH', 'SHARK', 'WHALE', 'OCTOPUS'],              telegraphRange: [700,  1000], obstaclesPerMin: [24, 34] },
  7:  { allowedTypes: ['FLYING_FISH', 'JELLYFISH', 'SHARK', 'WHALE', 'OCTOPUS', 'LIGHTNING'], telegraphRange: [500,   850], obstaclesPerMin: [30, 42] },
  8:  { allowedTypes: ['FLYING_FISH', 'JELLYFISH', 'SHARK', 'WHALE', 'OCTOPUS', 'LIGHTNING'], telegraphRange: [500,   850], obstaclesPerMin: [30, 42] },
  9:  { allowedTypes: ['FLYING_FISH', 'JELLYFISH', 'SHARK', 'WHALE', 'OCTOPUS', 'LIGHTNING'], telegraphRange: [500,   850], obstaclesPerMin: [30, 42] },
  10: { allowedTypes: ['FLYING_FISH', 'JELLYFISH', 'SHARK', 'WHALE', 'OCTOPUS', 'LIGHTNING'], telegraphRange: [500,   850], obstaclesPerMin: [30, 42] },
});

// ─── 스테이지 데이터 포맷 ─────────────────────────────────────────────────────
// {
//   id:           number,      // 1-indexed
//   name:         string,      // 해역 이름
//   theme:        string,      // 테마 키 (배경 렌더링에서 참조)
//   duration:     number,      // 스테이지 목표 시간(ms)
//   scrollSpeed:  number,      // px/s
//   difficulty: {
//     telegraphMs:     number, // 시작 telegraphMs (참고용 — 실제값은 events에 개별 지정)
//     obstaclesPerMin: number, // 실제 이벤트 밀도
//     fakeSignalRate:  number, // 가짜 신호 비율 (참고용)
//     compoundRate:    number, // 복합 신호 비율 (참고용)
//   },
//   events: EventSpec[],       // 스테이지 스크립트 — spawnPatterns.js 참조
// }

/** @type {StageData[]} */
export const STAGES = [
  // ── Stage 1: 제주 앞바다 / 출발 ─────────────────────────────────────────
  {
    id:          1,
    name:        '제주 앞바다',
    theme:       'jeju',
    duration:    60_000,
    scrollSpeed: 500,
    difficulty: {
      telegraphMs:     1200,
      obstaclesPerMin: 20,
      fakeSignalRate:  0,
      compoundRate:    0,
    },
    events: PATTERNS.STAGE_1,
  },

  // ── Stage 2: 제주 연안 / 생물 등장 ──────────────────────────────────────
  {
    id:          2,
    name:        '제주 연안',
    theme:       'jeju_coast',
    duration:    65_000,
    scrollSpeed: 540,
    difficulty: {
      telegraphMs:     1100,
      obstaclesPerMin: 20,
      fakeSignalRate:  0,
      compoundRate:    0,
    },
    events: PATTERNS.STAGE_2,
  },

  // ── Stage 3: 제주 남쪽 해역 / 첫 큰 파도 ────────────────────────────────
  {
    id:          3,
    name:        '제주 남쪽 해역',
    theme:       'south_jeju',
    duration:    65_000,
    scrollSpeed: 580,
    difficulty: {
      telegraphMs:     1100,
      obstaclesPerMin: 22,
      fakeSignalRate:  0,
      compoundRate:    0.1,
      chaseWave:       true,   // 추격 파도: 주기적으로 아래 위험구간을 잠식
    },
    events: PATTERNS.STAGE_3,
  },

  // ── Stage 4: 동중국해 / 바람의 바다 ─────────────────────────────────────
  {
    id:          4,
    name:        '동중국해',
    theme:       'east_china_sea',
    duration:    70_000,
    scrollSpeed: 620,
    difficulty: {
      telegraphMs:     1000,
      obstaclesPerMin: 26,
      fakeSignalRate:  0.07,
      compoundRate:    0.15,
    },
    events: PATTERNS.STAGE_4,
  },

  // ── Stage 5: 오키나와 인근 해역 / 암초 지대 ─────────────────────────────
  {
    id:          5,
    name:        '오키나와 인근 해역',
    theme:       'okinawa',
    duration:    70_000,
    scrollSpeed: 650,
    difficulty: {
      telegraphMs:     950,
      obstaclesPerMin: 27,
      fakeSignalRate:  0.09,
      compoundRate:    0.2,
      narrowLane:      true,   // 암초 지대: 가동 폭을 좁히고 통로가 위아래로 이동
    },
    events: PATTERNS.STAGE_5,
  },

  // ── Stage 6: 필리핀해 초입 / 태풍 전야 ──────────────────────────────────
  {
    id:          6,
    name:        '필리핀해 초입',
    theme:       'philippines',
    duration:    72_000,
    scrollSpeed: 700,
    difficulty: {
      telegraphMs:     950,
      obstaclesPerMin: 28,
      fakeSignalRate:  0.12,
      compoundRate:    0.25,
    },
    events: PATTERNS.STAGE_6,
  },

  // ── Stage 7: 태평양 밤바다 / 야간 항해 ──────────────────────────────────
  {
    id:          7,
    name:        '태평양 밤바다',
    theme:       'pacific_night',
    duration:    75_000,
    scrollSpeed: 730,
    difficulty: {
      telegraphMs:     850,
      obstaclesPerMin: 30,
      fakeSignalRate:  0.16,
      compoundRate:    0.3,
      nightMode:       true,
    },
    events: PATTERNS.STAGE_7,
  },

  // ── Stage 8: 태평양 화산 해역 / 이질적 바다 ─────────────────────────────
  {
    id:          8,
    name:        '태평양 화산 해역',
    theme:       'volcanic',
    duration:    75_000,
    scrollSpeed: 760,
    difficulty: {
      telegraphMs:     800,
      obstaclesPerMin: 32,
      fakeSignalRate:  0.15,
      compoundRate:    0.35,
    },
    events: PATTERNS.STAGE_8,
  },

  // ── Stage 9: 북태평양 폭풍 해역 / 극한 해역 ─────────────────────────────
  {
    id:          9,
    name:        '북태평양 폭풍 해역',
    theme:       'storm',
    duration:    78_000,
    scrollSpeed: 800,
    difficulty: {
      telegraphMs:     800,
      obstaclesPerMin: 32,
      fakeSignalRate:  0.17,
      compoundRate:    0.4,
      screenShake:     true,
    },
    events: PATTERNS.STAGE_9,
  },

  // ── Stage 10: 괴물 파도 해역 / 최종 도전 ────────────────────────────────
  {
    id:          10,
    name:        '괴물 파도 해역',
    theme:       'final',
    duration:    80_000,
    scrollSpeed: 850,
    difficulty: {
      telegraphMs:     750,
      obstaclesPerMin: 33,
      fakeSignalRate:  0.23,
      compoundRate:    0.5,
      nightMode:       true,
      screenShake:     true,
    },
    events: PATTERNS.STAGE_10,
  },
];
