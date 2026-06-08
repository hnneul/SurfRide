import { ERUPT_X, LATERAL_RANGE } from './constants.js';
import { gameX2WorldX } from './three/bridge.js';
import { audio } from './audio.js';

// ─── 큰 파도 이벤트 (예고 → 좌우 포켓 라이딩 → 보상) ──────────────────────────
// 배경 장식이 아니라 게임 이벤트: 예고 후 거대 너울이 화면 '한쪽(포켓)'에만 솟는다(나머지는 평평).
// ←/→ 로 그 포켓 x-구역에 들어가 머물면 '탄다' → 초당 보상 + 마무리 보너스. 안 들어가면 놓침.
// 좌/우는 이벤트마다 번갈아 — 예고 때부터 어느 쪽인지 알려준다. 큰 파도 동안 보드가 흔들린다.
//
// 렌더(포켓 솟음)는 ThreeLayer.world가, 여기서는 판정·점수·연출만. GameScene이 소유하며
// 매 프레임 update(dt)를 호출하고, HUD 표시는 hud()로 읽어간다.

const BIG_WAVE_WARN_MS = 1_800;   // 예고(다가오는 큰 파도) 길이
const BIG_WAVE_DUR_MS  = 5_200;   // 큰 파도가 솟아 있는 길이(world.triggerBigWave durMs와 일치)
const BIG_WAVE_GOOD_MS = 2_000;   // 이 시간만큼 포켓을 타면 품질 1.0(만점 보너스)
const POCKET_FRAC  = 0.62;        // 포켓 중심 = ERUPT_X ± LATERAL_RANGE*POCKET_FRAC
const POCKET_TOL_X = 120;         // 포켓 안으로 인정하는 좌우 여유(game px)

export class BigWaveManager {
  constructor(scene) {
    this.scene = scene;
    const dur = scene.obstacleManager._stageDuration;
    // 현재는 1스테이지 프로토타입에만 활성(스폰 패턴이 큰 파도 창을 비워 둠). 추후 테마별 확장.
    this.times = scene.stageIndex === 0 ? [dur * 0.34, dur * 0.7] : [];
    this.idx = 0;
    this.state = { phase: 'idle', warnMs: 0, goodMs: 0, totalMs: 0, riding: false };
    this.rideAcc = 0;
    this._pocketSide  = 'right';
    this._pocketGameX = ERUPT_X + LATERAL_RANGE * POCKET_FRAC;
  }

  hud() {
    const bw = this.state;
    return {
      warn:     bw.phase === 'warn',
      active:   bw.phase === 'active',
      riding:   bw.phase === 'active' && bw.riding,
      side:     this._pocketSide,
      progress: bw.phase === 'active' ? (this.scene.three?.world?.bigWaveProgress ?? 0) : 0,
    };
  }

  update(dt) {
    const s = this.scene;
    if (!s.three) return;
    const bw = this.state;
    const t = s.stageTimer;

    if (bw.phase === 'idle') {
      if (this.idx < this.times.length &&
          t >= this.times[this.idx] - BIG_WAVE_WARN_MS) {
        bw.phase = 'warn'; bw.warnMs = 0;
        // 포켓 좌/우 번갈아 — 예고부터 어느 쪽으로 갈지 알 수 있게 미리 정한다.
        this._pocketSide  = (this.idx % 2 === 0) ? 'right' : 'left';
        this._pocketGameX = ERUPT_X + (this._pocketSide === 'right' ? 1 : -1) * LATERAL_RANGE * POCKET_FRAC;
        s.three.shake(150, 0.0026);
      }
      return;
    }

    if (bw.phase === 'warn') {
      bw.warnMs += dt;
      if (bw.warnMs >= BIG_WAVE_WARN_MS) {
        bw.phase = 'active'; bw.goodMs = 0; bw.totalMs = 0; bw.riding = false;
        s.three.triggerBigWave({
          durMs:   BIG_WAVE_DUR_MS,
          pocketX: gameX2WorldX(this._pocketGameX),   // 솟을 위치(월드 x)
          pocketW: 1.8,
        });
        s.three.shake(240, 0.005);
        s.hud?.flash(150, 210, 255, 200);
      }
      return;
    }

    // active — 포켓 x-구역에 머무는지 판정 + 흔들림 외란 + 초당 보상, world 파도가 끝나면 정산
    bw.totalMs += dt;
    s.stageGimmicks.balanceDrift += Math.sin(t * 0.013 + 1.3) * 0.34;   // 보드 흔들림(위험)

    const inPocket = Math.abs(s.player.x - this._pocketGameX) <= POCKET_TOL_X;
    const riding   = inPocket && s.player.isGrounded;
    bw.riding = riding;
    if (riding) {
      bw.goodMs += dt;
      this.rideAcc += dt;
      while (this.rideAcc >= 1000) {
        this.rideAcc -= 1000;
        s.scoreManager.onWaveRideTick(s.player.baseY);
        s.three?.surferSplash(0.7, 0xd6f4ff);
      }
    }

    if (!s.three.world?.bigWave) {   // 큰 파도 종료 → 정산
      const quality = Math.max(0, Math.min(1, bw.goodMs / BIG_WAVE_GOOD_MS));
      if (quality >= 0.25) this._onSuccess(quality);
      else                 this._onMiss();
      bw.phase = 'idle';
      bw.riding = false;
      this.idx++;
    }
  }

  _onSuccess(quality) {
    const s = this.scene;
    const pts = s.scoreManager.onBigWave(quality, s.player.baseY);
    audio.playSfx('wave');
    s._slowmoMs = Math.max(s._slowmoMs, 150);
    s.cameras.main.flash(160, 150, 220, 255, false);
    s.cameras.main.shake(200, 0.004);
    s.three?.shake(200, 0.004);
    s.three?.surferSplash(2.4, 0xcdefff);
    s.hud?.flash(150, 220, 255, 160);
    s.hud?.toast(quality > 0.8 ? 'BIG WAVE!!' : 'BIG WAVE!', `+${pts}`);
  }

  _onMiss() {
    const s = this.scene;
    s.three?.shake(220, 0.005);
    s.cameras.main.shake(220, 0.005);
    s.hud?.flash(120, 150, 200, 150);
  }
}
