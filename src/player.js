import {
  LOGICAL_WIDTH, RIDE_TOP_Y, RIDE_BOTTOM_Y, isDangerY, zoneMultiplierForY, BALANCE,
} from './constants.js';

// 스폰 데이터 호환을 위한 재수출
export { Lane } from './constants.js';

const STEER_ACCEL = 2400;   // 수직 가속 (px/s²) — v3: 가동 폭 축소
const STEER_MAX   = 420;    // 최대 수직 속도 (px/s) — v3: 정밀 이동 강제
const JUMP_SPEED  = 1180;   // 점프 초기 상승 속도 (px/s)
const GRAVITY     = 2900;   // 점프 중력 (px/s²)

export class Player {
  constructor(scene) {
    this.scene = scene;

    this.hitboxW = 58;
    this.hitboxH = 88;

    this.shadow = scene.add.ellipse(0, 0, 82, 18, 0x06182c, 0.34).setDepth(1.7);

    // 라이딩 물보라 (아래쪽일수록 강해짐) — 서퍼 아래 깔리도록 visual보다 낮은 depth
    this.spray = scene.add.graphics().setDepth(1.85);

    this.visual = scene.add.container(0, 0).setDepth(2);
    this.board = scene.add.ellipse(0, 26, 86, 22, 0xfff2b2)
      .setStrokeStyle(3, 0x1e88e5);
    this.boardNose = scene.add.triangle(36, 26, 0, -11, 20, 0, 0, 11, 0xff7043);
    this.backLeg = scene.add.line(-12, 14, 0, 0, -24, 18, 0x242b3a).setLineWidth(8);
    this.frontLeg = scene.add.line(16, 13, 0, 0, 24, 16, 0x242b3a).setLineWidth(8);
    this.body = scene.add.ellipse(0, -8, 30, 42, 0xffb74d)
      .setStrokeStyle(2, 0x6d3c16);
    this.chest = scene.add.ellipse(2, -8, 18, 28, 0x26c6da, 0.92);
    this.backArm = scene.add.line(-12, -12, 0, 0, -32, -25, 0x8d5524).setLineWidth(7);
    this.frontArm = scene.add.line(14, -14, 0, 0, 35, -3, 0x8d5524).setLineWidth(7);
    this.head = scene.add.circle(0, -42, 14, 0xd08b5b)
      .setStrokeStyle(2, 0x5c3218);
    this.hair = scene.add.arc(-4, -49, 12, 200, 35, false, 0x2d1a12)
      .setStrokeStyle(2, 0x2d1a12);
    this.eye = scene.add.circle(5, -43, 2.2, 0x151515);

    this.visual.add([
      this.board, this.boardNose, this.backLeg, this.frontLeg,
      this.backArm, this.body, this.chest, this.frontArm,
      this.head, this.hair, this.eye,
    ]);

    this.reset();
  }

  reset() {
    this.x          = LOGICAL_WIDTH * 0.20;
    this.baseY      = RIDE_TOP_Y + (RIDE_BOTTOM_Y - RIDE_TOP_Y) * 0.30;
    this.y          = this.baseY;
    this.vSteer     = 0;
    this.jumpOffset = 0;   // 파도 면 위로 떠오른 높이 (>=0)
    this.jumpVel    = 0;
    this.isJumping  = false;
    this.isGrounded = true;

    // 균형(밸런스): tilt ∈ [-1,+1], 0이 안정. 한계 초과 시 와이프아웃.
    this.tilt       = 0;
    this.wiped      = false;
    this._driftSeed = Math.random() * Math.PI * 2;

    this.visual?.setPosition(this.x, this.y);
    this.visual?.setRotation(0);
    this.shadow?.setPosition(this.x, this.baseY + 34);
  }

  get inWarning() { return Math.abs(this.tilt) >= BALANCE.WARN_AT; }

  get hitbox() {
    return {
      x: this.x - this.hitboxW / 2,
      y: (this.y - 12) - this.hitboxH / 2,
      w: this.hitboxW,
      h: this.hitboxH,
    };
  }

  get inDanger()      { return isDangerY(this.baseY); }
  get zoneMultiplier(){ return zoneMultiplierForY(this.baseY); }

  update(deltaMs, cursors, spaceKey) {
    const dt = deltaMs / 1000;

    this._handleSteer(dt, cursors);
    this._handleBalance(dt, cursors);
    this._handleJump(spaceKey);
    this._applyPhysics(dt);
    this._render(deltaMs);
  }

  // ←/→ 카운터-스티어로 균형 유지. 무입력 시 드리프트만 누적 → 와이프아웃.
  _handleBalance(dt, cursors) {
    if (!this.isGrounded) {
      // 공중 = 균형 리셋 호흡: 드리프트 정지, tilt가 0쪽으로 완화
      this.tilt -= this.tilt * Math.min(1, 3.0 * dt);
      return;
    }

    const span  = RIDE_BOTTOM_Y - RIDE_TOP_Y;
    const depth = (this.baseY - RIDE_TOP_Y) / span;   // 0(마루)~1(거친 바다)
    const t     = (this.scene?.stageTimer ?? 0);

    // 깊을수록 강한 드리프트 + 파도 출렁임 외란
    const driftMag = BALANCE.BASE_DRIFT + BALANCE.DEPTH_K * depth;
    const wobble   = Math.sin(t * 0.004 + this._driftSeed) * BALANCE.WOBBLE_AMP;
    const driftDir = Math.sin(t * 0.0011 + this._driftSeed) >= 0 ? 1 : -1;

    this.tilt += (driftDir * driftMag + wobble) * dt;

    // 보정 입력
    if (cursors.left?.isDown)  this.tilt -= BALANCE.CORRECT_RATE * dt;
    if (cursors.right?.isDown) this.tilt += BALANCE.CORRECT_RATE * dt;

    this.tilt = Phaser_clamp(this.tilt, -1.25, 1.25);
    if (Math.abs(this.tilt) >= BALANCE.WIPEOUT_AT) this.wiped = true;
  }

  _handleSteer(dt, cursors) {
    if (cursors.up.isDown)        this.vSteer -= STEER_ACCEL * dt;
    else if (cursors.down.isDown) this.vSteer += STEER_ACCEL * dt;
    else                          this.vSteer -= this.vSteer * Math.min(1, 11 * dt);

    this.vSteer = Phaser_clamp(this.vSteer, -STEER_MAX, STEER_MAX);
    this.baseY += this.vSteer * dt;

    if (this.baseY < RIDE_TOP_Y)    { this.baseY = RIDE_TOP_Y;    if (this.vSteer < 0) this.vSteer = 0; }
    if (this.baseY > RIDE_BOTTOM_Y) { this.baseY = RIDE_BOTTOM_Y; if (this.vSteer > 0) this.vSteer = 0; }
  }

  _handleJump(spaceKey) {
    if (spaceKey.isDown && this.isGrounded) {
      this.jumpVel    = JUMP_SPEED;
      this.isJumping  = true;
      this.isGrounded = false;
    }
  }

  _applyPhysics(dt) {
    if (!this.isGrounded) {
      this.jumpVel    -= GRAVITY * dt;
      this.jumpOffset += this.jumpVel * dt;
      if (this.jumpOffset <= 0) {
        this.jumpOffset = 0;
        this.jumpVel    = 0;
        this.isJumping  = false;
        this.isGrounded = true;
      }
    }
    this.y = this.baseY - this.jumpOffset;
  }

  _render(deltaMs) {
    // 카빙 틸트: 수직 속도 + 균형(tilt) 합성, 점프 중엔 약간 들림
    const carve = Phaser_clamp(this.vSteer / STEER_MAX, -1, 1) * 0.30;
    const balance = this.tilt * 0.42;
    const air   = this.isGrounded ? 0 : -0.12;
    this.visual.setPosition(this.x, this.y);
    this.visual.setRotation(carve + balance + air);
    this.board.setFillStyle(this.isGrounded ? 0xfff2b2 : 0xffffff);

    this.shadow.setPosition(this.x, this.baseY + 34);
    this.shadow.setScale(this.isGrounded ? 1 : 0.72, this.isGrounded ? 1 : 0.8);
    this.shadow.setAlpha(this.isGrounded ? 0.34 : 0.18);

    // 물보라 — 아래쪽(위험 구간)일수록 강하게, 점프 중엔 약하게
    const g = this.spray;
    g.clear();
    if (this.isGrounded) {
      const intensity = 0.25 + 0.75 * ((this.baseY - RIDE_TOP_Y) / (RIDE_BOTTOM_Y - RIDE_TOP_Y));
      const n = Math.round(4 + intensity * 6);
      g.fillStyle(0xffffff, 0.5 * intensity + 0.2);
      for (let i = 0; i < n; i++) {
        const px = this.x - 40 - Math.random() * (50 + intensity * 80);
        const py = this.y + 16 + (Math.random() - 0.5) * 18;
        g.fillCircle(px, py, 2 + Math.random() * (2 + intensity * 3));
      }
    }
  }

  destroy() {
    this.shadow.destroy();
    this.visual.destroy();
    this.spray.destroy();
  }
}

function Phaser_clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
