import { BALANCE } from './constants.js';

// ─── 큰 파도 이벤트 (예고 → 통과 → 마루 타기 보상) ──────────────────────────────
// 배경 장식이 아니라 게임 이벤트: 예고 후 거대 너울이 원경에서 밀려와 서퍼·장애물·수면을 함께
// 들어올린다. 통과하는 동안 마루(crest) 가까이서 균형을 지키며 '타면' 초당 보상 + 마무리 보너스.
// 실패(거의 못 탐)하면 보너스 없음 + 흔들림. 큰 파도 동안 보드가 흔들려(balanceDrift) 위험이 커진다.
//
// 렌더(너울 메시·crest 위치)는 ThreeLayer.world가 담당하고, 여기서는 판정·점수·연출만 맡는다.
// GameScene이 소유하며 매 프레임 update(dt)를 호출하고, HUD 표시는 hud()로 읽어간다.
// scene 참조로 player·three·scoreManager·hud·stageGimmicks(공유 fx)에 접근한다.

const BIG_WAVE_WARN_MS = 1_800;  // 예고(다가오는 큰 파도) 길이
const BIG_WAVE_DUR_MS  = 5_200;  // 큰 파도가 지나가는 길이(world.triggerBigWave durMs와 일치)
const BIG_WAVE_RIDE_TOL_Z = 2.6; // 마루를 '타는' 것으로 보는 z 허용 오차
const BIG_WAVE_GOOD_MS = 1_600;  // 이 시간만큼 마루를 타면 품질 1.0(만점 보너스)

export class BigWaveManager {
  constructor(scene) {
    this.scene = scene;
    const dur = scene.obstacleManager._stageDuration;
    // 현재는 1스테이지 프로토타입에만 활성(스폰 패턴이 큰 파도 창을 비워 둠). 추후 테마별
    // 파라미터(횟수·진폭·타이밍)로 확장 가능 — 다른 스테이지의 빽빽한 패턴과 겹치면 과해지므로 보류.
    this.times = scene.stageIndex === 0 ? [dur * 0.34, dur * 0.7] : [];
    this.idx = 0;
    this.state = { phase: 'idle', warnMs: 0, goodMs: 0, totalMs: 0, riding: false };
    this.rideAcc = 0;
  }

  hud() {
    const bw = this.state;
    return {
      warn:     bw.phase === 'warn',
      active:   bw.phase === 'active',
      riding:   bw.phase === 'active' && bw.riding,
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
        s.three.shake(150, 0.0026);
      }
      return;
    }

    if (bw.phase === 'warn') {
      bw.warnMs += dt;
      if (bw.warnMs >= BIG_WAVE_WARN_MS) {
        bw.phase = 'active'; bw.goodMs = 0; bw.totalMs = 0; bw.riding = false;
        s.three.triggerBigWave({ durMs: BIG_WAVE_DUR_MS });
        s.three.shake(240, 0.005);
        s.hud?.flash(150, 210, 255, 200);
      }
      return;
    }

    // active — 마루를 타는지 판정 + 흔들림 외란 + 초당 보상, world 파도가 끝나면 정산
    bw.totalMs += dt;
    s.stageGimmicks.balanceDrift += Math.sin(t * 0.013 + 1.3) * 0.34;   // 보드 흔들림(위험)

    const crestZ  = s.three.world?.bigWaveCrestZ;
    const surferZ = s.three.surfer?.pos?.z;
    const inRange = crestZ != null && crestZ >= 1.5 && crestZ <= 11.5;     // 마루가 플레이 영역에
    const riding  = inRange && surferZ != null &&
      Math.abs(crestZ - surferZ) <= BIG_WAVE_RIDE_TOL_Z &&
      s.player.isGrounded && Math.abs(s.player.tilt) < BALANCE.WARN_AT;
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
