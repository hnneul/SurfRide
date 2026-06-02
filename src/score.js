import { Lane, LANE_MULTIPLIER } from './player.js';

// ─── 점수 상수 ────────────────────────────────────────────────────────────────
export const SCORE = Object.freeze({
  SURVIVAL_PER_SEC:   10,
  DODGE:             100,
  PERFECT_JUMP:      200,
  STAGE_CLEAR:      1000,
  GOLDEN_FISH:       500,
  WEATHER_EVENT_MUL:   2,  // 구간 보너스 ×2
});

// 콤보 단계별 배율 (콤보 횟수 → 배율)
const COMBO_MULTIPLIERS = [
  { minCombo:  0, mul: 1.0 },
  { minCombo:  3, mul: 1.2 },
  { minCombo:  6, mul: 1.5 },
  { minCombo: 10, mul: 2.0 },
];

// ─── 점수 로그 항목 타입 ──────────────────────────────────────────────────────
export const ScoreEvent = Object.freeze({
  SURVIVAL:      'SURVIVAL',
  DODGE:         'DODGE',
  PERFECT_JUMP:  'PERFECT_JUMP',
  COMBO_BONUS:   'COMBO_BONUS',
  DANGER_LANE:   'DANGER_LANE',
  STAGE_CLEAR:   'STAGE_CLEAR',
  GOLDEN_FISH:   'GOLDEN_FISH',
  WEATHER_EVENT: 'WEATHER_EVENT',
});

// ─── ScoreManager ────────────────────────────────────────────────────────────
export class ScoreManager {
  constructor() {
    this.reset();
  }

  reset() {
    this.total          = 0;
    this.combo          = 0;
    this.maxCombo       = 0;
    this.perfectJumps        = 0;
    this.maxComboMultiplier  = 1.0;

    // 항목별 누적 (결과 화면용)
    this.breakdown = {
      [ScoreEvent.SURVIVAL]:      0,
      [ScoreEvent.DODGE]:         0,
      [ScoreEvent.PERFECT_JUMP]:  0,
      [ScoreEvent.COMBO_BONUS]:   0,
      [ScoreEvent.DANGER_LANE]:   0,
      [ScoreEvent.STAGE_CLEAR]:   0,
      [ScoreEvent.GOLDEN_FISH]:   0,
      [ScoreEvent.WEATHER_EVENT]: 0,
    };

    this._log         = [];   // 시간순 이벤트 로그 (실패 원인 분석용)
    this._survivalAcc = 0;    // 생존 점수 누적 타이머(ms)
  }

  // 매 프레임 호출 — 생존 점수 + 위험 구간 배율 적용
  update(deltaMs, player, obstacleManager) {
    this._survivalAcc += deltaMs;

    while (this._survivalAcc >= 1000) {
      this._survivalAcc -= 1000;
      const base = SCORE.SURVIVAL_PER_SEC;
      const pts  = this._applyMultipliers(base, player.lane);
      this._add(ScoreEvent.SURVIVAL, pts);
    }

    // 방금 지나친 장애물 → 회피 점수
    const passed = obstacleManager.getJustPassed(player.x);
    for (const obs of passed) {
      this._onDodge(player.lane, obs);
    }
  }

  _onDodge(lane, obs) {
    const base = SCORE.DODGE;
    const pts  = this._applyMultipliers(base, lane);
    this._add(ScoreEvent.DODGE, pts);
    this.combo++;
    this.maxCombo          = Math.max(this.maxCombo, this.combo);
    this.maxComboMultiplier = Math.max(this.maxComboMultiplier, this._comboMultiplier());
  }

  onPerfectJump(lane) {
    const base = SCORE.PERFECT_JUMP;
    const pts  = this._applyMultipliers(base, lane);
    this._add(ScoreEvent.PERFECT_JUMP, pts);
    this.perfectJumps++;
  }

  onStageClear() {
    this._add(ScoreEvent.STAGE_CLEAR, SCORE.STAGE_CLEAR);
  }

  onGoldenFish() {
    this._add(ScoreEvent.GOLDEN_FISH, SCORE.GOLDEN_FISH);
  }

  onComboBreak() {
    this.combo = 0;
  }

  // 배율 = 레인 배율 × 콤보 배율
  _applyMultipliers(base, lane) {
    const laneMul  = LANE_MULTIPLIER[lane];
    const comboMul = this._comboMultiplier();
    return Math.round(base * laneMul * comboMul);
  }

  _comboMultiplier() {
    let mul = 1.0;
    for (const step of COMBO_MULTIPLIERS) {
      if (this.combo >= step.minCombo) mul = step.mul;
    }
    return mul;
  }

  _add(type, pts) {
    this.total          += pts;
    this.breakdown[type] = (this.breakdown[type] ?? 0) + pts;
    this._log.push({ type, pts, combo: this.combo, time: Date.now() });
  }

  // 결과 화면에 넘길 요약 객체
  getSummary() {
    return {
      total:               this.total,
      maxCombo:            this.maxCombo,
      maxComboMultiplier:  this.maxComboMultiplier,
      perfectJumps:        this.perfectJumps,
      breakdown:           { ...this.breakdown },
    };
  }
}
