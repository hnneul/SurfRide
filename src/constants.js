/** @typedef {import('./types.js').SpawnEvent} SpawnEvent */

export const LOGICAL_WIDTH  = 1920;
export const LOGICAL_HEIGHT = 1080;

// ─── 제자리 분출(Eruption) ────────────────────────────────────────────────────
// 장애물은 서퍼 열(列)에서 그대로 솟구친다(순수 반응형). 서퍼는 x 이동을 하지
// 않으므로 충돌이 성립하려면 분출 열이 서퍼 x와 겹쳐야 한다 → 순수 수직 회피.
export const ERUPT_X = LOGICAL_WIDTH * 0.20;

// 일부 장애물은 '신호가 뜨는 순간 서퍼의 높이'를 찍어 그 자리로 분출(타겟 분출).
// 나머지는 대본에 정해진 높이로 분출 → 리듬 변주. 아래는 타겟 비율.
export const TARGET_RATIO = 0.35;

// 분출 단계 타이밍(ms)
// ACTIVE: 분출이 제자리에 떠 있는 시간. 점프로 넘으려면 점프 안전 체공(~0.74s)보다
// 짧아야 한다 → collidable 위협 = RISE*0.45 + ACTIVE + SINK*0.55 ≈ 0.61s가 되도록 520→380.
export const ERUPT_RISE_MS   = 220;
export const ERUPT_ACTIVE_MS = 380;
export const ERUPT_SINK_MS   = 240;

// Near-miss(아슬아슬 회피) 판정 여유 — 히트박스 둘레 그레이즈 반경
export const GRAZE_MARGIN = 46;

// ─── 체력 (긴장형: 즉사 대신 다회 피격) ───────────────────────────────────────
// 충돌해도 즉시 끝나지 않고 하트가 줄어든다. 피격 후 짧은 무적으로 연속 피격 방지.
// (균형 와이프아웃은 별개 — 충분히 예고되므로 즉시 종료 유지)
export const MAX_HEALTH    = 3;
export const HIT_IFRAME_MS = 1100;

// ─── 균형 & 와이프아웃 (긴장형) ───────────────────────────────────────────────
export const BALANCE = Object.freeze({
  BASE_DRIFT:   0.18,   // 기본 드리프트 속도 (/s)
  DEPTH_K:      0.55,   // 깊이(거친 바다)일수록 드리프트 가중
  WOBBLE_AMP:   0.12,   // 파도 출렁임에 의한 외란
  CORRECT_RATE: 1.70,   // ←/→ 보정 속도 (/s)
  AIR_EASE:     0.8,    // 공중 균형 완화율 (/s) — 점프 중 tilt가 천천히만 0으로(완전 리셋 X, 동결도 X)
  WARN_AT:      0.70,   // 경고(빨강 점멸) 임계
  WIPEOUT_AT:   1.00,   // 와이프아웃(즉시 종료) 임계
});

// ─── 에어 트릭 (점프 중 ←/→ 로 스핀 → 착지 정렬 시 점수) ─────────────────────
// 공중에서만 좌우가 '회전 입력'으로 전환된다(지상에선 균형 보정). 착지 순간 회전이
// 180°(=π)의 배수에 CLEAN_TOL 이내로 맞아야 '클린 랜딩' → 점수+콤보. 어중간하면
// 휘청(BOTCH_TILT 만큼 균형 충격) — 즉사는 아니고 위험만. 점프를 회피→표현으로 전환.
export const TRICK = Object.freeze({
  SPIN_RATE:  11.0,        // 공중 좌우 입력 회전 속도 (rad/s). 체공 ~0.87s에 약 1.5바퀴
  MIN_SPIN:   Math.PI,     // 점수 인정 최소 회전(반바퀴=180°)
  CLEAN_TOL:  0.55,        // 착지 정렬 허용 오차(rad ≈ 31°). 이내면 클린 랜딩
  BOTCH_TILT: 0.62,        // 착지 실패(어중간) 시 가해지는 균형 충격(tilt)
  STAGGER_MS: 420,         // botch 후 비틀거림 — 점프·상하이동 봉인(점프로 회복 못 하게)
});

// ─── 덕다이브(잠수) — 점프(위)의 짝(아래) ────────────────────────────────────
// 지상에서 Shift로 짧게 잠수해 '위에 뜬'(dive) 장애물을 통과한다. 점프로 못 넘는 대신
// 잠수가 정답인 장애물(해파리)을 위한 능동 회피. 안 쓰면 ↑↓로 비켜도 되므로 억울한 죽음 없음.
export const DIVE = Object.freeze({
  MAX_MS:      1200,       // 홀드 최대 지속(무한 잠수 방지). 위협(~611ms)을 충분히 덮음
  DEPTH:       90,         // 가라앉는 깊이(px, 아래로)
  COOLDOWN_MS: 220,        // 잠수 해제 후 재잠수까지 쿨다운(연타 방지)
});

// ─── 파도 면 라이딩 (연속 수직 위치) ──────────────────────────────────────────
// 서퍼는 파도 면(아래 RIDE 구간) 위를 가속/관성으로 오르내린다(좁은 가동 폭).
// 위쪽(마루)은 안전·저점수, 아래쪽(파도 골·거친 바다)은 위험·고배율.
export const RIDE_TOP_Y    = LOGICAL_HEIGHT * 0.40;
export const RIDE_BOTTOM_Y = LOGICAL_HEIGHT * 0.82;
export const RIDE_SPAN     = RIDE_BOTTOM_Y - RIDE_TOP_Y;

// RIDE_FIXED_Y: 서퍼 시작 깊이(중앙) + 신호(텔레그래프) 표시 깊이. 라이딩으로 baseY는 위아래로 움직인다.
export const RIDE_FIXED_Y  = RIDE_TOP_Y + RIDE_SPAN * 0.50;
export const LATERAL_RANGE = 330;                             // 좌우 이동 폭(px, ERUPT_X 중심 ±)

// 파도 면 세로 라이딩(↑/↓) — 관성 + 파도가 면 아래로 끌어내리는 약한 중력으로 '면을 타는' 감각.
// 위(마루·장애물이 솟는 곳)로 갈수록 빠르고(speed) 위험·고배율(×1.5), 아래(어깨)는 안전·저점수.
// 가만히 두면 중력이 안전한 아래로 흘려보내므로, 점수를 노리면 ↑로 위험 구간에 올라타 버텨야 한다.
export const RIDE = Object.freeze({
  ACCEL:   2000,   // ↑/↓ 입력 가속(px/s²)
  MAX:     430,    // 최대 세로 속도(px/s)
  DAMP:    7,      // 무입력 감쇠(/s)
  GRAVITY: 340,    // 파도가 면 아래로 끌어내리는 약한 중력(px/s²)
});

// [실험] 밸런스(↑↓) 토글 — 라이딩 체계로 대체되어 기본 false. 되살리려면 true.
export const BALANCE_ON = false;

// 위험 구간 — 라이딩 면 '위쪽'(마루·수평선). 장애물이 솟는 곳이라 만나기까지 반응시간이 짧다.
// frac이 이 값보다 '작으면'(위) 위험: 진입 시 ×1.5 + DANGER 보너스 + 연출.
export const DANGER_FRAC_START = 0.36;            // frac ≤ 0.36(위쪽)이면 위험 구간
export const DANGER_TOP_Y      = RIDE_TOP_Y + RIDE_SPAN * DANGER_FRAC_START;

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

export function fracToRideY(frac) {
  return RIDE_TOP_Y + clamp01(frac) * RIDE_SPAN;
}

export function rideYToFrac(y) {
  return clamp01((y - RIDE_TOP_Y) / RIDE_SPAN);
}

// 수직 위치별 점수 배율 — 위(마루·장애물이 솟는 곳)일수록 위험·고배율, 아래(어깨)일수록 안전·저배율.
export function zoneMultiplierForY(y) {
  const f = rideYToFrac(y);
  if (f <= DANGER_FRAC_START) return 1.5;   // 위험(위 — 마루)
  if (f <= 0.62)              return 1.2;   // 중간
  return 1.0;                                // 안전(아래 — 어깨)
}

export function isDangerY(y) {
  return rideYToFrac(y) <= DANGER_FRAC_START;
}

// ─── 스폰 데이터 호환 ─────────────────────────────────────────────────────────
// spawnPatterns.js 의 lane(T/M/B)을 버리지 않고 수직 앵커로 재해석한다.
export const Lane = Object.freeze({ TOP: 0, MID: 1, BOT: 2 });

const LANE_ANCHOR_FRAC = Object.freeze({ 0: 0.14, 1: 0.50, 2: 0.84 });

// event.yFrac(0~1)가 있으면 우선, 없으면 lane 앵커 사용
/** @param {SpawnEvent} event @returns {number} */
export function eventRideY(event) {
  const frac = Number.isFinite(event.yFrac)
    ? event.yFrac
    : (LANE_ANCHOR_FRAC[event.lane] ?? 0.5);
  return fracToRideY(frac);
}

// 좌우 이동 체계 — 스폰 데이터의 위치 필드(xFrac > yFrac > lane)를 좌우 띠(ERUPT_X ± LATERAL_RANGE) x로 매핑.
// 기존 lane(T/M/B=0.14/0.5/0.84)이 그대로 좌/중/우 위치가 된다(스폰 리듬 재사용).
/** @param {SpawnEvent} event @returns {number} */
export function eventLaneX(event) {
  const frac = Number.isFinite(event.xFrac) ? event.xFrac
    : Number.isFinite(event.yFrac) ? event.yFrac
    : (LANE_ANCHOR_FRAC[event.lane] ?? 0.5);
  return ERUPT_X + (clamp01(frac) - 0.5) * 2 * LATERAL_RANGE;
}

// 서퍼 x → 좌우 프랙션(0~1). 타겟 장애물이 서퍼의 현재 x를 찍을 때 사용.
export function lateralFracFromX(x) {
  return clamp01((x - (ERUPT_X - LATERAL_RANGE)) / (2 * LATERAL_RANGE));
}
