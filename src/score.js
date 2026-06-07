import { zoneMultiplierForY } from './constants.js';

/** @typedef {import('./types.js').ScoreSummary} ScoreSummary */

export const SCORE = Object.freeze({
  SURVIVAL_PER_SEC:  10,
  DODGE:            100,
  NEAR_MISS:        150,   // 아슬아슬 회피 보너스
  PERFECT_JUMP:     200,
  TRICK_PER_HALF:   140,   // 에어 트릭: 완성한 180°(반바퀴)당 점수
  DANGER_PER_SEC:    30,   // 위험 구간 체류 시 초당 보너스
  GOLDEN_FISH:      500,   // 황금 물고기 획득
  WAVE_RIDE_PER_SEC: 70,   // 큰 파도 마루를 잘 타는 동안 초당(파도 타기 보상)
  BIG_WAVE:         400,   // 큰 파도 성공 마무리 보너스(품질 비례)
  BALANCE_CLUTCH:   130,   // 균형이 무너지기 직전 회복(위험-보상)
  STAGE_CLEAR:     1000,
});

// 기상 이변 구간: 해당 구간에서 얻는 점수에 ×2 (보너스분은 WEATHER_BONUS로 적립)
export const WEATHER_MULTIPLIER = 2;

const COMBO_MULTIPLIERS = [
  { minCombo:  0, mul: 1.0 },
  { minCombo:  3, mul: 1.2 },
  { minCombo:  6, mul: 1.5 },
  { minCombo: 10, mul: 2.0 },
];

export const ScoreEvent = Object.freeze({
  SURVIVAL:       'SURVIVAL',
  DODGE:          'DODGE',
  NEAR_MISS:      'NEAR_MISS',
  PERFECT_JUMP:   'PERFECT_JUMP',
  TRICK:          'TRICK',
  COMBO_BONUS:    'COMBO_BONUS',
  DANGER_LANE:    'DANGER_LANE',
  GOLDEN_FISH:    'GOLDEN_FISH',
  WAVE_RIDE:      'WAVE_RIDE',
  BALANCE_CLUTCH: 'BALANCE_CLUTCH',
  WEATHER_BONUS:  'WEATHER_BONUS',
  STAGE_CLEAR:    'STAGE_CLEAR',
});

// 기상 이변 ×2가 적용되지 않는 항목: 보너스 자기참조 방지 + 고정 보상(클리어/아이템)은 제외
const WEATHER_EXEMPT = new Set([
  ScoreEvent.WEATHER_BONUS,
  ScoreEvent.GOLDEN_FISH,
  ScoreEvent.STAGE_CLEAR,
]);

export class ScoreManager {
  constructor() { this.reset(); }

  reset() {
    this.total               = 0;
    this.combo               = 0;
    this.maxCombo            = 0;
    this.perfectJumps        = 0;
    this.tricks              = 0;    // 성공(클린 랜딩)한 에어 트릭 수
    this.bestTrickSpins      = 0;    // 한 번에 완성한 최다 반바퀴(180°) 수
    this.nearMisses          = 0;
    this.maxComboMultiplier  = 1.0;
    this.dangerSeconds       = 0;    // 위험 구간 누적 체류 시간(초)
    this.goldenFish          = 0;    // 황금 물고기 획득 수
    this.bigWaves            = 0;    // 큰 파도 성공적으로 탄 수
    this.clutches            = 0;    // 균형 회복(클러치) 수
    this.breakdown = {
      [ScoreEvent.SURVIVAL]:      0,
      [ScoreEvent.DODGE]:         0,
      [ScoreEvent.NEAR_MISS]:     0,
      [ScoreEvent.PERFECT_JUMP]:  0,
      [ScoreEvent.TRICK]:         0,
      [ScoreEvent.COMBO_BONUS]:   0,
      [ScoreEvent.DANGER_LANE]:   0,
      [ScoreEvent.GOLDEN_FISH]:   0,
      [ScoreEvent.WAVE_RIDE]:     0,
      [ScoreEvent.BALANCE_CLUTCH]:0,
      [ScoreEvent.WEATHER_BONUS]: 0,
      [ScoreEvent.STAGE_CLEAR]:   0,
    };
    this._survivalAcc   = 0;
    this._weatherActive = false;
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

  // 에어 트릭 클린 랜딩: 완성한 반바퀴(halfSpins) 수만큼 점수 + 콤보 적립
  onTrick(y, halfSpins) {
    const pts = this._applyMultipliers(SCORE.TRICK_PER_HALF * halfSpins, y);
    this._add(ScoreEvent.TRICK, pts);
    this.tricks++;
    this.bestTrickSpins     = Math.max(this.bestTrickSpins, halfSpins);
    this.combo++;
    this.maxCombo           = Math.max(this.maxCombo, this.combo);
    this.maxComboMultiplier = Math.max(this.maxComboMultiplier, this._comboMultiplier());
    return pts;
  }

  // 큰 파도 마루를 타는 동안 초당 적립(연속 보상). combo 배율 적용.
  onWaveRideTick(y) {
    this._add(ScoreEvent.WAVE_RIDE, this._applyMultipliers(SCORE.WAVE_RIDE_PER_SEC, y));
  }

  // 큰 파도 성공 마무리 — 품질(0~1, 마루를 얼마나 잘 탔나)에 비례. 콤보 +2.
  onBigWave(quality, y) {
    const pts = this._applyMultipliers(Math.round(SCORE.BIG_WAVE * (0.5 + quality)), y);
    this._add(ScoreEvent.WAVE_RIDE, pts);
    this.bigWaves++;
    this.combo += 2;
    this.maxCombo           = Math.max(this.maxCombo, this.combo);
    this.maxComboMultiplier = Math.max(this.maxComboMultiplier, this._comboMultiplier());
    return pts;
  }

  // 균형 회복(클러치) — 무너지기 직전에서 살려냈을 때. 콤보 +1.
  onBalanceClutch(y) {
    const pts = this._applyMultipliers(SCORE.BALANCE_CLUTCH, y);
    this._add(ScoreEvent.BALANCE_CLUTCH, pts);
    this.clutches++;
    this.combo++;
    this.maxCombo           = Math.max(this.maxCombo, this.combo);
    this.maxComboMultiplier = Math.max(this.maxComboMultiplier, this._comboMultiplier());
    return pts;
  }

  onStageClear() { this._add(ScoreEvent.STAGE_CLEAR, SCORE.STAGE_CLEAR); }
  onComboBreak() { this.combo = 0; }

  onGoldenFish() {
    this.goldenFish++;
    this._add(ScoreEvent.GOLDEN_FISH, SCORE.GOLDEN_FISH);
  }

  // 기상 이변 구간 진입/이탈 — 활성 동안 구간 점수가 ×2 (보너스분은 WEATHER_BONUS로 적립)
  setWeather(active) { this._weatherActive = !!active; }
  get weatherActive() { return this._weatherActive; }

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
    if (!pts) return;
    this.total += pts;
    this.breakdown[type] = (this.breakdown[type] ?? 0) + pts;

    // 기상 이변 ×2: 동일 점수를 보너스로 추가 적립(고정 보상 제외)
    if (this._weatherActive && !WEATHER_EXEMPT.has(type)) {
      const bonus = pts * (WEATHER_MULTIPLIER - 1);
      this.total += bonus;
      this.breakdown[ScoreEvent.WEATHER_BONUS] += bonus;
    }
  }

  /** @returns {ScoreSummary} */
  getSummary() {
    return {
      total:              this.total,
      combo:              this.combo,
      maxCombo:           this.maxCombo,
      maxComboMultiplier: this.maxComboMultiplier,
      perfectJumps:       this.perfectJumps,
      tricks:             this.tricks,
      bestTrickSpins:     this.bestTrickSpins,
      nearMisses:         this.nearMisses,
      dangerSeconds:      this.dangerSeconds,
      goldenFish:         this.goldenFish,
      bigWaves:           this.bigWaves,
      clutches:           this.clutches,
      breakdown:          { ...this.breakdown },
    };
  }
}
