import { LANE_MULTIPLIER } from './constants.js';

export const SCORE = Object.freeze({
  SURVIVAL_PER_SEC:  10,
  DODGE:            100,
  PERFECT_JUMP:     200,
  STAGE_CLEAR:     1000,
  GOLDEN_FISH:      500,
  WEATHER_EVENT_MUL:  2,
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
  PERFECT_JUMP:  'PERFECT_JUMP',
  COMBO_BONUS:   'COMBO_BONUS',
  DANGER_LANE:   'DANGER_LANE',
  STAGE_CLEAR:   'STAGE_CLEAR',
  GOLDEN_FISH:   'GOLDEN_FISH',
  WEATHER_EVENT: 'WEATHER_EVENT',
});

export class ScoreManager {
  constructor() { this.reset(); }

  reset() {
    this.total               = 0;
    this.combo               = 0;
    this.maxCombo            = 0;
    this.perfectJumps        = 0;
    this.maxComboMultiplier  = 1.0;
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
    this._survivalAcc = 0;
  }

  update(deltaMs, player, obstacleManager) {
    this._survivalAcc += deltaMs;
    while (this._survivalAcc >= 1000) {
      this._survivalAcc -= 1000;
      this._add(ScoreEvent.SURVIVAL, this._applyMultipliers(SCORE.SURVIVAL_PER_SEC, player.lane));
    }

    for (const obs of obstacleManager.getJustPassed(player.x)) {
      this._onDodge(player.lane, obs);
    }
  }

  _onDodge(lane) {
    const pts = this._applyMultipliers(SCORE.DODGE, lane);
    this._add(ScoreEvent.DODGE, pts);
    this.combo++;
    this.maxCombo           = Math.max(this.maxCombo, this.combo);
    this.maxComboMultiplier = Math.max(this.maxComboMultiplier, this._comboMultiplier());
  }

  onPerfectJump(lane) {
    this._add(ScoreEvent.PERFECT_JUMP, this._applyMultipliers(SCORE.PERFECT_JUMP, lane));
    this.perfectJumps++;
  }

  onStageClear() { this._add(ScoreEvent.STAGE_CLEAR, SCORE.STAGE_CLEAR); }
  onGoldenFish() { this._add(ScoreEvent.GOLDEN_FISH, SCORE.GOLDEN_FISH); }
  onComboBreak() { this.combo = 0; }

  _applyMultipliers(base, lane) {
    return Math.round(base * (LANE_MULTIPLIER[lane] ?? 1) * this._comboMultiplier());
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
      maxCombo:           this.maxCombo,
      maxComboMultiplier: this.maxComboMultiplier,
      perfectJumps:       this.perfectJumps,
      breakdown:          { ...this.breakdown },
    };
  }
}
