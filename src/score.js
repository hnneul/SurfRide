import { zoneMultiplierForY } from './constants.js';

export const SCORE = Object.freeze({
  SURVIVAL_PER_SEC:  10,
  DODGE:            100,
  NEAR_MISS:        150,   // 아슬아슬 회피 보너스
  PERFECT_JUMP:     200,
  DANGER_PER_SEC:    30,   // 위험 구간 체류 시 초당 보너스
  STAGE_CLEAR:     1000,
});

const COMBO_MULTIPLIERS = [
  { minCombo:  0, mul: 1.0 },
  { minCombo:  3, mul: 1.2 },
  { minCombo:  6, mul: 1.5 },
  { minCombo: 10, mul: 2.0 },
];

export const ScoreEvent = Object.freeze({
  SURVIVAL:      'SURVIVAL',
  DODGE:         'DODGE',
  NEAR_MISS:     'NEAR_MISS',
  PERFECT_JUMP:  'PERFECT_JUMP',
  COMBO_BONUS:   'COMBO_BONUS',
  DANGER_LANE:   'DANGER_LANE',
  STAGE_CLEAR:   'STAGE_CLEAR',
});

export class ScoreManager {
  constructor() { this.reset(); }

  reset() {
    this.total               = 0;
    this.combo               = 0;
    this.maxCombo            = 0;
    this.perfectJumps        = 0;
    this.nearMisses          = 0;
    this.maxComboMultiplier  = 1.0;
    this.dangerSeconds       = 0;    // 위험 구간 누적 체류 시간(초)
    this.breakdown = {
      [ScoreEvent.SURVIVAL]:      0,
      [ScoreEvent.DODGE]:         0,
      [ScoreEvent.NEAR_MISS]:     0,
      [ScoreEvent.PERFECT_JUMP]:  0,
      [ScoreEvent.COMBO_BONUS]:   0,
      [ScoreEvent.DANGER_LANE]:   0,
      [ScoreEvent.STAGE_CLEAR]:   0,
    };
    this._survivalAcc = 0;
  }

  // 시간 기반 점수(생존·위험 구간)만 담당. 회피/니어미스/퍼펙트는 이벤트로 호출.
  update(deltaMs, player) {
    const y = player.baseY;
    this._survivalAcc += deltaMs;
    while (this._survivalAcc >= 1000) {
      this._survivalAcc -= 1000;
      this._add(ScoreEvent.SURVIVAL, this._applyMultipliers(SCORE.SURVIVAL_PER_SEC, y));
      if (player.inDanger) {
        this.dangerSeconds++;
        this._add(ScoreEvent.DANGER_LANE,
          Math.round(SCORE.DANGER_PER_SEC * this._comboMultiplier()));
      }
    }
  }

  onDodge(y) {
    this._add(ScoreEvent.DODGE, this._applyMultipliers(SCORE.DODGE, y));
    this.combo++;
    this.maxCombo           = Math.max(this.maxCombo, this.combo);
    this.maxComboMultiplier = Math.max(this.maxComboMultiplier, this._comboMultiplier());
  }

  onNearMiss(y) {
    this._add(ScoreEvent.NEAR_MISS, this._applyMultipliers(SCORE.NEAR_MISS, y));
    this.nearMisses++;
  }

  onPerfectJump(y) {
    this._add(ScoreEvent.PERFECT_JUMP, this._applyMultipliers(SCORE.PERFECT_JUMP, y));
    this.perfectJumps++;
  }

  onStageClear() { this._add(ScoreEvent.STAGE_CLEAR, SCORE.STAGE_CLEAR); }
  onComboBreak() { this.combo = 0; }

  _applyMultipliers(base, y) {
    return Math.round(base * zoneMultiplierForY(y) * this._comboMultiplier());
  }

  _comboMultiplier() {
    let mul = 1.0;
    for (const step of COMBO_MULTIPLIERS) {
      if (this.combo >= step.minCombo) mul = step.mul;
    }
    return mul;
  }

  _add(type, pts) {
    this.total += pts;
    this.breakdown[type] = (this.breakdown[type] ?? 0) + pts;
  }

  getSummary() {
    return {
      total:              this.total,
      combo:              this.combo,
      maxCombo:           this.maxCombo,
      maxComboMultiplier: this.maxComboMultiplier,
      perfectJumps:       this.perfectJumps,
      nearMisses:         this.nearMisses,
      dangerSeconds:      this.dangerSeconds,
      breakdown:          { ...this.breakdown },
    };
  }
}
