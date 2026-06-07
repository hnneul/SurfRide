import {
  LOGICAL_WIDTH, RIDE_TOP_Y, RIDE_BOTTOM_Y, isDangerY, zoneMultiplierForY, BALANCE, TRICK,
  MAX_HEALTH, HIT_IFRAME_MS,
} from './constants.js';

// 스폰 데이터 호환을 위한 재수출
export { Lane } from './constants.js';

const STEER_ACCEL = 2400;   // 수직 가속 (px/s²) — v3: 가동 폭 축소
const STEER_MAX   = 420;    // 최대 수직 속도 (px/s) — v3: 정밀 이동 강제
const JUMP_SPEED  = 1180;   // 점프 초기 상승 속도 (px/s)
// v5: 점프로 분출(ERUPT_X 제자리)을 넘으려면 안전 체공 > 분출 collidable 시간이어야 한다.
// 체공을 원래 수준(~0.87s, 안 붕 뜨게)으로 되돌리고, 대신 분출 ACTIVE를 줄여
// 위협을 ~0.61s로 낮춰 양쪽을 만나게 함(ERUPT_ACTIVE_MS와 함께 튜닝).
const GRAVITY     = 2700;   // 점프 중력 (px/s²)
const JUMP_BUFFER_MS = 120; // 착지 직전 이 시간(ms) 내 누른 점프를 기억했다가 착지 순간 발동

export class Player {
  constructor(scene) {
    this.scene = scene;

    this.maxHealth = MAX_HEALTH;
    this.hitboxW = 58;
    this.hitboxH = 46;   // [HIT] 데이터 기준 — 서퍼 보드 깊이에 맞춰 세로 판정=시각 정렬

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
    this._spacePrev = false;   // 점프 엣지 감지(홀드 연사 방지)
    this._jumpBufferMs = 0;    // 점프 버퍼(착지 직전 입력 보존)

    // 균형(밸런스): tilt ∈ [-1,+1], 0이 안정. 한계 초과 시 와이프아웃.
    this.tilt       = 0;
    this.wiped      = false;
    this._driftSeed = Math.random() * Math.PI * 2;

    // 에어 트릭: 점프 중 누적 회전(rad, 부호=방향). 착지 때 정렬 판정 후 0으로.
    this.trickRotation  = 0;
    this.trickHalfSpins = 0;     // 마지막 착지에서 확정한 반바퀴(180°) 수 — GameScene이 소비
    this.trickLanded    = false; // 이번 프레임 클린 랜딩 발생(점수)
    this.trickBotched   = false; // 이번 프레임 착지 실패(휘청)
    this.staggerMs      = 0;     // botch 비틀거림(>0이면 점프·상하이동 봉인)

    // 체력 & 피격 무적
    this.health     = this.maxHealth;
    this.invulnMs   = 0;

    this.visual?.setPosition(this.x, this.y);
    this.visual?.setRotation(0);
    this.shadow?.setPosition(this.x, this.baseY + 34);
  }

  get inWarning() { return Math.abs(this.tilt) >= BALANCE.WARN_AT; }
  get invulnerable() { return this.invulnMs > 0; }

  // 실제 히트박스 — 점프 높이(jumpOffset) 반영. 점프로 피할 수 있는 장애물용.
  get hitbox() {
    return {
      x: this.x - this.hitboxW / 2,
      y: (this.y - 6) - this.hitboxH / 2,
      w: this.hitboxW,
      h: this.hitboxH,
    };
  }

  // 파도 면 기준 히트박스 — 점프를 무시(baseY). 점프로 못 피하는(위치이동) 장애물용.
  get groundHitbox() {
    return {
      x: this.x - this.hitboxW / 2,
      y: (this.baseY - 6) - this.hitboxH / 2,
      w: this.hitboxW,
      h: this.hitboxH,
    };
  }

  // 피격: 무적 중이면 무시. 하트 차감 후 사망 여부 반환.
  takeHit() {
    if (this.invulnMs > 0) return false;
    this.health   = Math.max(0, this.health - 1);
    this.invulnMs = HIT_IFRAME_MS;
    return this.health <= 0;
  }

  get inDanger()      { return isDangerY(this.baseY); }
  get zoneMultiplier(){ return zoneMultiplierForY(this.baseY); }

  update(deltaMs, cursors, spaceKey, environment = null) {
    const dt = deltaMs / 1000;

    if (this.invulnMs > 0)  this.invulnMs  = Math.max(0, this.invulnMs - deltaMs);
    if (this.staggerMs > 0) this.staggerMs = Math.max(0, this.staggerMs - deltaMs);

    this._handleSteer(dt, cursors, environment);
    this._handleBalance(dt, cursors, environment);
    this._handleTrick(dt, cursors);
    this._handleJump(dt, spaceKey, environment);
    this._applyPhysics(dt, environment);
    this._render(deltaMs);
  }

  // ←/→ 카운터-스티어로 균형 유지. 무입력 시 드리프트만 누적 → 와이프아웃.
  _handleBalance(dt, cursors, environment) {
    if (!this.isGrounded) {
      // 공중 = 드리프트 정지 + 균형은 천천히만 완화(지상보다 훨씬 느리게). 점프로 '완전'
      // 리셋은 안 되되(탈출구 차단), 마커가 얼지 않고 슬슬 움직이도록.
      this.tilt -= this.tilt * Math.min(1, BALANCE.AIR_EASE * dt);
      return;
    }

    const span  = RIDE_BOTTOM_Y - RIDE_TOP_Y;
    const depth = (this.baseY - RIDE_TOP_Y) / span;   // 0(마루)~1(거친 바다)
    const t     = (this.scene?.stageTimer ?? 0);

    // 깊을수록 강한 드리프트 + 파도 출렁임 외란
    const driftMag = BALANCE.BASE_DRIFT + BALANCE.DEPTH_K * depth;
    const wobble   = Math.sin(t * 0.004 + this._driftSeed) * BALANCE.WOBBLE_AMP;
    const driftDir = Math.sin(t * 0.0011 + this._driftSeed) >= 0 ? 1 : -1;

    this.tilt += (driftDir * driftMag + wobble + (environment?.balanceDrift ?? 0)) * dt;

    // 보정 입력
    if (cursors.left?.isDown)  this.tilt -= BALANCE.CORRECT_RATE * dt;
    if (cursors.right?.isDown) this.tilt += BALANCE.CORRECT_RATE * dt;

    const wipeoutAt = environment?.balanceWipeoutAt ?? BALANCE.WIPEOUT_AT;
    this.tilt = Phaser_clamp(this.tilt, -1.25, 1.25);
    if (Math.abs(this.tilt) >= wipeoutAt) this.wiped = true;
  }

  // 공중에서만 ←/→ 를 '스핀 입력'으로 전환(지상에선 _handleBalance가 균형 보정에 사용).
  // 누르는 동안만 회전하므로, 손을 떼서 각도를 맞춰 착지 정렬을 노릴 수 있다.
  _handleTrick(dt, cursors) {
    this.trickLanded  = false;
    this.trickBotched = false;
    if (this.isGrounded) return;
    let dir = 0;
    if (cursors.left?.isDown)  dir -= 1;
    if (cursors.right?.isDown) dir += 1;
    this.trickRotation += dir * TRICK.SPIN_RATE * dt;
  }

  _handleSteer(dt, cursors, environment) {
    const locked = this.staggerMs > 0;   // 비틀거림 중 상하 이동 봉인
    if (!locked && cursors.up.isDown)        this.vSteer -= STEER_ACCEL * dt;
    else if (!locked && cursors.down.isDown) this.vSteer += STEER_ACCEL * dt;
    else                                     this.vSteer -= this.vSteer * Math.min(1, 11 * dt);

    this.vSteer += (environment?.windForce ?? 0) * dt;
    this.vSteer = Phaser_clamp(this.vSteer, -STEER_MAX, STEER_MAX);
    this.baseY += this.vSteer * dt;

    // 가동 폭 — 기본은 RIDE 전체. 암초 지대(narrowLane)에선 environment가 좁은 통로 경계를 준다.
    const laneTop = environment?.laneTopY ?? RIDE_TOP_Y;
    const laneBot = environment?.laneBottomY ?? RIDE_BOTTOM_Y;
    if (this.baseY < laneTop) { this.baseY = laneTop; if (this.vSteer < 0) this.vSteer = 0; }
    if (this.baseY > laneBot) { this.baseY = laneBot; if (this.vSteer > 0) this.vSteer = 0; }
  }

  // 누른 '순간'에만 버퍼 충전(엣지) → 홀드 연사 방지 유지.
  // 버퍼는 착지 직전에 누른 입력을 잠깐 보존했다가 착지 순간 점프를 발동시킨다.
  _handleJump(dt, spaceKey, environment) {
    const pressed = !!spaceKey?.isDown;
    if (pressed && !this._spacePrev) this._jumpBufferMs = JUMP_BUFFER_MS;
    this._spacePrev = pressed;

    if (this.staggerMs > 0) { this._jumpBufferMs = 0; return; }   // 비틀거림 중 점프 봉인
    if (this._jumpBufferMs <= 0) return;

    if (this.isGrounded) {
      this.jumpVel    = JUMP_SPEED * (environment?.jumpBoost ?? 1);
      this.isJumping  = true;
      this.isGrounded = false;
      this._jumpBufferMs = 0;
    } else {
      this._jumpBufferMs = Math.max(0, this._jumpBufferMs - dt * 1000);
    }
  }

  _applyPhysics(dt, environment) {
    if (!this.isGrounded) {
      this.jumpVel    += (environment?.updraftLift ?? 0) * dt;
      this.jumpVel    -= GRAVITY * dt;
      this.jumpOffset += this.jumpVel * dt;
      if (this.jumpOffset <= 0) {
        this.jumpOffset = 0;
        this.jumpVel    = 0;
        this.isJumping  = false;
        this.isGrounded = true;
        this._resolveTrickLanding();
        const jitter = environment?.landingJitter ?? 0;
        if (jitter > 0) {
          this.baseY += (Math.random() * 2 - 1) * jitter;
          this.baseY = Phaser_clamp(this.baseY, RIDE_TOP_Y, RIDE_BOTTOM_Y);
        }
      }
    }
    this.y = this.baseY - this.jumpOffset;
  }

  // 착지 정렬 판정 — 회전이 180°(π)의 배수에 CLEAN_TOL 이내면 클린 랜딩(점수),
  // 어중간하면 휘청(BOTCH_TILT 균형 충격). 살짝(< 반바퀴-여유)만 돈 건 시도로 안 봄.
  _resolveTrickLanding() {
    const rot = this.trickRotation;
    this.trickRotation = 0;
    if (Math.abs(rot) < TRICK.MIN_SPIN - TRICK.CLEAN_TOL) return;   // 트릭 시도 아님

    const halfSpins = Math.round(rot / Math.PI);                    // 가장 가까운 180° 배수
    const err       = Math.abs(rot - halfSpins * Math.PI);
    if (Math.abs(halfSpins) >= 1 && err <= TRICK.CLEAN_TOL) {
      this.trickHalfSpins = Math.abs(halfSpins);
      this.trickLanded    = true;
    } else {
      this.trickBotched = true;
      this.staggerMs = TRICK.STAGGER_MS;                            // 비틀거림(점프로 회복 불가)
      this.tilt += Math.sign(rot || 1) * TRICK.BOTCH_TILT;          // 어중간 → 휘청
      this.tilt  = Phaser_clamp(this.tilt, -1.25, 1.25);
    }
  }

  _render(deltaMs) {
    // 카빙 틸트: 수직 속도 + 균형(tilt) 합성, 점프 중엔 약간 들림
    const carve = Phaser_clamp(this.vSteer / STEER_MAX, -1, 1) * 0.30;
    const balance = this.tilt * 0.42;
    const air   = this.isGrounded ? 0 : -0.12;
    const trick = this.isGrounded ? 0 : this.trickRotation;
    this.visual.setPosition(this.x, this.y);
    this.visual.setRotation(carve + balance + air + trick);
    this.board.setFillStyle(this.isGrounded ? 0xfff2b2 : 0xffffff);

    // 피격 무적 중 깜빡임
    this.visual.setAlpha(this.invulnMs > 0 && Math.floor(this.invulnMs / 90) % 2 === 0 ? 0.35 : 1);

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
