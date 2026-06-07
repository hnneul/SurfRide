import { RIDE_TOP_Y, fracToRideY, rideYToFrac } from './constants.js';

// ─── 후반 해역 고유 기믹 (바람·상승기류·폭풍·암초·추격 파도·시야 흐림·야간) ───────────
// 스테이지 difficulty/theme를 읽어 매 프레임 환경 외란을 계산하는 blackboard(fx).
// player(바람·점프부스트·가동 레인)·ThreeLayer(암초/파도 시각)·HUD(라벨)가 이 fx를 함께 읽는다.
// GameScene이 소유하며 this.fx를 scene.stageGimmicks로 공유한다 — 매 프레임 update(dt)가 fx를
// 제자리에서 갱신하고, HUD 표시는 hud()로 읽어간다. scene 참조로 player·three·cameras에 접근.

const WIND_BY_STAGE = Object.freeze({
  4: 110,
  6: 145,
  9: 175,
  10: 205,
});

const LANDING_JITTER_BY_STAGE = Object.freeze({
  4: 8,
  6: 14,
  9: 18,
  10: 22,
});

const REEF_PERIOD_MS = 11_000;   // 암초 지대: 이벤트 주기(이 간격마다 한 번 발동)
const REEF_ACTIVE_MS = 4_000;    // 한 번 발동 길이(좁아짐 → 최협 → 풀림)

const CHASE_PERIOD_MS = 12_000;  // 추격 파도: 이벤트 주기
const CHASE_ACTIVE_MS = 4_500;   // 한 번 밀려옴 길이(차오름 → 최고 → 빠짐)

const HAZE_PERIOD_MS = 13_000;   // 시야 가림(물보라/수증기): 이벤트 주기
const HAZE_ACTIVE_MS = 4_500;    // 한 번 흐려짐 길이(짙어짐 → 최고 → 걷힘)

export class StageGimmickManager {
  constructor(scene) {
    this.scene = scene;
    const stage = scene.stage;
    const stageId = stage.id;
    const difficulty = stage.difficulty ?? {};
    this.fx = {
      seed: Math.random() * Math.PI * 2,
      windStrength: WIND_BY_STAGE[stageId] ?? 0,
      windForce: 0,
      windRatio: 0,
      balanceDrift: 0,
      balanceWipeoutAt: difficulty.balanceWipeoutAt ?? null,
      landingJitter: LANDING_JITTER_BY_STAGE[stageId] ?? 0,
      night: !!difficulty.nightMode,
      storm: !!difficulty.screenShake,
      // 상승기류(점프대) 기믹: 화산 테마이거나 difficulty.updraft 명시 시(예: Stage 10 결합)
      volcanic: stage.theme === 'volcanic' || !!difficulty.updraft,
      updraftActive: false,
      playerInUpdraft: false,
      updraftY: null,
      jumpBoost: 1,
      updraftLift: 0,
      narrowLane: !!difficulty.narrowLane,
      chaseWave: !!difficulty.chaseWave,
      laneTopY: null,
      laneBottomY: null,
      reefActive: false,
      reefStyle: 'reef',
      hideTop: false,
      hazeKind: difficulty.squall ? 'squall' : (difficulty.steam ? 'steam' : null),
      visibility: 0,
      label: null,
    };
    this._nextStormRumble = 4_800;
  }

  hud() {
    const fx = this.fx;
    return {
      label: fx.label,
      night: fx.night,
      storm: fx.storm,
      windRatio: fx.windRatio,
      updraftActive: fx.updraftActive,
      playerInUpdraft: fx.playerInUpdraft,
      visibility: fx.visibility,
      hazeKind: fx.hazeKind,
    };
  }

  update(dt) {
    const s = this.scene;
    const fx = this.fx;
    const t = s.stageTimer;
    const labels = [];

    fx.windForce = 0;
    fx.windRatio = 0;
    fx.balanceDrift = 0;
    fx.jumpBoost = 1;
    fx.updraftLift = 0;
    fx.updraftActive = false;
    fx.playerInUpdraft = false;
    fx.updraftY = null;
    fx.laneTopY = null;
    fx.laneBottomY = null;
    fx.reefActive = false;
    fx.reefStyle = 'reef';
    fx.hideTop = false;
    fx.visibility = 0;

    if (fx.windStrength > 0) {
      const base = Math.sin(t * 0.0011 + fx.seed) * 0.22;
      const gustCycle = (t + fx.seed * 1000) % 11_500;
      const gustWindow = gustCycle >= 3_500 && gustCycle <= 7_400;
      const gustEnvelope = gustWindow
        ? Math.sin(((gustCycle - 3_500) / 3_900) * Math.PI)
        : 0;
      const gustWave = Math.sin(t * 0.0019 + fx.seed * 2.7);
      const gust = Math.abs(gustWave) > 0.72
        ? Math.sign(gustWave) * ((Math.abs(gustWave) - 0.72) / 0.28) * gustEnvelope
        : 0;
      const force = fx.windStrength * (base + gust);
      fx.windForce = force;
      fx.windRatio = Math.max(-1, Math.min(1, force / fx.windStrength));
      fx.balanceDrift = fx.windRatio * 0.18;
      if (Math.abs(fx.windRatio) > 0.42) labels.push(`강풍 ${fx.windRatio < 0 ? '위쪽' : '아래쪽'}`);
    }

    if (fx.volcanic) {
      const cycle = t % 15_000;
      const active = cycle >= 5_200 && cycle <= 9_800;
      const cycleIndex = Math.floor(t / 15_000);
      const updraftFrac = cycleIndex % 2 === 0 ? 0.42 : 0.68;
      fx.updraftActive = active;
      fx.updraftY = active ? fracToRideY(updraftFrac) : null;

      if (active) {
        const playerFrac = rideYToFrac(s.player.baseY);
        fx.playerInUpdraft = Math.abs(playerFrac - updraftFrac) <= 0.13;
        if (fx.playerInUpdraft) {
          fx.jumpBoost = 1.24;
          fx.updraftLift = 360;
          labels.push('상승기류 점프 강화');
        } else {
          labels.push('수증기 상승기류');
        }
      }
    }

    if (fx.storm) {
      if (t >= this._nextStormRumble) {
        s.cameras.main.shake(220, 0.0045);
        s.three?.shake(220, 0.0045);
        this._nextStormRumble = t + 5_800 + Math.random() * 3_500;
      }
      labels.push('폭풍 흔들림');
    }

    if (fx.narrowLane) {
      // 암초는 상시가 아니라 '간헐적 이벤트' — 주기마다 잠깐 통로가 좁아졌다 풀린다.
      const cycle = (t + fx.seed * 800) % REEF_PERIOD_MS;
      if (cycle < REEF_ACTIVE_MS) {
        const ease   = Math.sin((cycle / REEF_ACTIVE_MS) * Math.PI);  // 0→1→0 (등장·최협·퇴장)
        const half   = 0.5 - ease * 0.30;                             // 0.5(자유) → 0.20(가장 좁음)
        const center = 0.5 + Math.sin(t * 0.0006 + fx.seed) * 0.12;
        fx.laneTopY    = fracToRideY(Math.max(0, center - half));
        fx.laneBottomY = fracToRideY(Math.min(1, center + half));
        fx.reefActive  = ease > 0.15;   // 충분히 좁아졌을 때만 암초 시각·라벨
        if (fx.reefActive) labels.push('좁은 수로 · 암초');
      }
    }

    if (fx.chaseWave) {
      // 추격 파도 — 주기마다 아래(위험구간)에서 파도가 차올라 가동 폭 하단을 잠식. 위로 피해야.
      const cycle = (t + fx.seed * 800) % CHASE_PERIOD_MS;
      if (cycle < CHASE_ACTIVE_MS) {
        const ease       = Math.sin((cycle / CHASE_ACTIVE_MS) * Math.PI);  // 0→1→0 (차오름·최고·빠짐)
        const bottomFrac = 1 - ease * 0.45;                                // 1(자유) → 0.55(많이 잠식)
        fx.laneTopY    = RIDE_TOP_Y;          // 위는 자유
        fx.laneBottomY = fracToRideY(bottomFrac);
        fx.reefActive  = ease > 0.12;
        fx.reefStyle   = 'wave';
        fx.hideTop     = true;
        if (fx.reefActive) labels.push('추격 파도 — 위로 피해!');
      }
    }

    if (fx.hazeKind) {
      // 물보라(6)·수증기(8) — 주기마다 화면이 잠깐 흐려져 신호 가독성이 떨어진다(예측 난이도).
      const cycle = (t + fx.seed * 500) % HAZE_PERIOD_MS;
      if (cycle < HAZE_ACTIVE_MS) {
        const ease = Math.sin((cycle / HAZE_ACTIVE_MS) * Math.PI);
        fx.visibility = ease * (fx.hazeKind === 'steam' ? 0.7 : 0.6);
        if (fx.visibility > 0.15) {
          labels.push(fx.hazeKind === 'steam' ? '수증기 · 시야 흐림' : '물보라 · 시야 흐림');
        }
      }
    }

    if (fx.night) labels.push('야간 시야 제한');
    fx.label = labels.slice(0, 2).join(' · ') || null;
  }
}
