import {
  ERUPT_X, RIDE_TOP_Y, RIDE_BOTTOM_Y, RIDE_FIXED_Y, LATERAL_RANGE, BALANCE_ON, RIDE,
  isDangerY, zoneMultiplierForY, BALANCE, TRICK, DIVE, MAX_HEALTH, HIT_IFRAME_MS,
} from './constants.js';

// 스폰 데이터 호환을 위한 재수출
export { Lane } from './constants.js';

const STEER_MAX   = 420;    // 보드 카빙 시각 정규화용 (레인 조작 제거됨 — _render에서만 사용)
const JUMP_SPEED  = 1180;   // 점프 초기 상승 속도 (px/s)
// v5: 점프로 분출(ERUPT_X 제자리)을 넘으려면 안전 체공 > 분출 collidable 시간이어야 한다.
// 체공을 원래 수준(~0.87s, 안 붕 뜨게)으로 되돌리고, 대신 분출 ACTIVE를 줄여
// 위협을 ~0.61s로 낮춰 양쪽을 만나게 함(ERUPT_ACTIVE_MS와 함께 튜닝).
const GRAVITY     = 2700;   // 점프 중력 (px/s²)
const JUMP_BUFFER_MS = 120; // 착지 직전 이 시간(ms) 내 누른 점프를 기억했다가 착지 순간 발동

// ── 좌우 이동 — ←/→ 로 좌우 이동(깊이 고정). 밸런스는 ↑/↓로 별도(상시 긴장 유지). ──
// CENTER_X·LATERAL_RANGE는 constants에서 장애물 좌우 띠와 공유(같은 좌표계로 충돌).
const CENTER_X      = ERUPT_X;   // 서퍼 기준 열(좌우 이동 중심)
const LATERAL_ACCEL = 2600;      // 가로 가속(px/s²)
const LATERAL_MAX   = 540;       // 최대 가로 속도(px/s)
const LATERAL_DAMP  = 10;        // 무입력 시 가로 감쇠율(/s)

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
    this.x          = CENTER_X;
    this.baseY      = RIDE_FIXED_Y;   // 깊이 고정 — 좌우 이동 체계
    this.y          = this.baseY;
    this.vSteer     = 0;
    this.vLateral   = 0;   // 좌우 카빙 속도(프로토)
    this.vRide      = 0;   // 파도 면 세로 라이딩 속도(px/s, +아래로)
    this.speed      = 0;   // 라이딩 속도감 0(아래·안전)~1(위·위험·빠름) — 연출/카메라용
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

    // 덕다이브(잠수): 점프의 반대 — 지상에서 Shift로 짧게 잠수해 '위' 장애물 통과
    this.diving      = false;
    this.diveMs      = 0;        // 남은 잠수 시간
    this.diveCdMs    = 0;        // 쿨다운
    this.diveOffset  = 0;        // 시각적 가라앉음 깊이(px, 아래로)
    this._shiftPrev  = false;    // 잠수 엣지 감지

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

    this._handleMove(dt, cursors);
    this._handleRide(dt, cursors);                                   // ↑/↓ 파도 면 세로 라이딩(핵심 동사)
    if (BALANCE_ON) this._handleBalance(dt, cursors, environment);   // [실험] 끄면 균형/와이프아웃 없음(tilt 0 유지)
    this._handleTrick(dt, cursors);
    this._handleDive(dt, cursors);
    this._handleJump(dt, spaceKey, environment);
    this._applyPhysics(dt, environment);
    this._render(deltaMs);
  }

  // ←/→ = 좌우 이동(순수, 관성). 깊이(레인)는 고정 — 밸런스는 ↑/↓로 별도 관리한다.
  _handleMove(dt, cursors) {
    let dir = 0;
    if (this.isGrounded) {                        // 공중 ←/→ 는 _handleTrick(스핀)이 가져감
      if (cursors.left?.isDown)  dir -= 1;
      if (cursors.right?.isDown) dir += 1;
    }
    if (dir !== 0) this.vLateral += dir * LATERAL_ACCEL * dt;
    else           this.vLateral -= this.vLateral * Math.min(1, LATERAL_DAMP * dt);
    this.vLateral = Phaser_clamp(this.vLateral, -LATERAL_MAX, LATERAL_MAX);
    this.x += this.vLateral * dt;
    this.x = Phaser_clamp(this.x, CENTER_X - LATERAL_RANGE, CENTER_X + LATERAL_RANGE);
  }

  // ↑/↓ = 파도 면 세로 라이딩. 위(마루·장애물이 솟는 곳)로 오를수록 빠르고 위험·고배율, 아래(어깨)는 안전·저점수.
  // 약한 중력이 늘 안전한 아래로 흘려보내므로, 점수를 노리면 ↑로 위험 구간에 올라타 버텨야 한다(능동적 커밋).
  // 공중(점프)·휘청 중엔 면을 떠나므로 baseY를 고정 — 착지·회복 후 그 자리에서 라이딩 재개.
  _handleRide(dt, cursors) {
    if (!this.isGrounded || this.staggerMs > 0) return;
    let dir = 0;
    if (cursors.up?.isDown)   dir -= 1;   // 마루(위)로 climb — 위험·고배율
    if (cursors.down?.isDown) dir += 1;   // 어깨(아래)로 — 안전·저배율
    this.vRide += RIDE.GRAVITY * dt;                      // 파도가 면 아래(안전)로 흘려보냄
    if (dir !== 0) this.vRide += dir * RIDE.ACCEL * dt;
    else           this.vRide -= this.vRide * Math.min(1, RIDE.DAMP * dt);
    this.vRide = Phaser_clamp(this.vRide, -RIDE.MAX, RIDE.MAX);
    this.baseY += this.vRide * dt;
    if (this.baseY <= RIDE_TOP_Y)    { this.baseY = RIDE_TOP_Y;    if (this.vRide < 0) this.vRide = 0; }
    if (this.baseY >= RIDE_BOTTOM_Y) { this.baseY = RIDE_BOTTOM_Y; if (this.vRide > 0) this.vRide = 0; }

    const frac = (this.baseY - RIDE_TOP_Y) / (RIDE_BOTTOM_Y - RIDE_TOP_Y);
    this.speed += ((1 - frac) - this.speed) * Math.min(1, 6 * dt);   // 위로 갈수록 빠름(속도감)
  }

  // ↑/↓ = 밸런스 보정. 드리프트가 계속 tilt를 밀고(상시 긴장), ↑/↓로 되민다. 한계 넘으면 와이프아웃.
  // ↑=마커 위로(tilt-) / ↓=마커 아래로(tilt+) — 세로 밸런스바와 방향 일치.
  _handleBalance(dt, cursors, environment) {
    if (!this.isGrounded) {
      this.tilt -= this.tilt * Math.min(1, BALANCE.AIR_EASE * dt);   // 공중: 천천히만 완화
      return;
    }
    const span  = RIDE_BOTTOM_Y - RIDE_TOP_Y;
    const depth = (this.baseY - RIDE_TOP_Y) / span;
    const t     = (this.scene?.stageTimer ?? 0);

    const driftMag = BALANCE.BASE_DRIFT + BALANCE.DEPTH_K * depth;
    const wobble   = Math.sin(t * 0.004 + this._driftSeed) * BALANCE.WOBBLE_AMP;
    const driftDir = Math.sin(t * 0.0011 + this._driftSeed) >= 0 ? 1 : -1;
    this.tilt += (driftDir * driftMag + wobble + (environment?.balanceDrift ?? 0)) * dt;

    if (cursors.up?.isDown)   this.tilt -= BALANCE.CORRECT_RATE * dt;
    if (cursors.down?.isDown) this.tilt += BALANCE.CORRECT_RATE * dt;

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

  // 덕다이브(홀드) — Shift를 누르고 있는 동안 잠수 유지. 위협이 지날 때까지 누르고 있다 떼면 된다.
  // 점프(위)의 짝(아래). 무한 잠수 방지로 MAX_MS 상한, 해제 후 짧은 쿨다운. 잠수 중엔 점프 불가.
  _handleDive(dt, cursors) {
    if (this.diveCdMs > 0) this.diveCdMs = Math.max(0, this.diveCdMs - dt * 1000);
    const pressed = !!cursors.shift?.isDown;

    if (this.diving) {
      this.diveMs += dt * 1000;                       // 잠수 누적 시간
      if (!pressed || this.diveMs >= DIVE.MAX_MS) {   // 떼거나 상한 도달 → 해제
        this.diving = false;
        this.diveCdMs = DIVE.COOLDOWN_MS;
      }
    } else if (pressed && !this._shiftPrev &&
               this.isGrounded && this.diveCdMs <= 0 && this.staggerMs <= 0) {
      this.diving = true;                             // 누른 순간 잠수 시작(홀드 시작점)
      this.diveMs = 0;
    }
    this._shiftPrev = pressed;
  }

  // 누른 '순간'에만 버퍼 충전(엣지) → 홀드 연사 방지 유지.
  // 버퍼는 착지 직전에 누른 입력을 잠깐 보존했다가 착지 순간 점프를 발동시킨다.
  _handleJump(dt, spaceKey, environment) {
    const pressed = !!spaceKey?.isDown;
    if (pressed && !this._spacePrev) this._jumpBufferMs = JUMP_BUFFER_MS;
    this._spacePrev = pressed;

    if (this.staggerMs > 0) { this._jumpBufferMs = 0; return; }   // 비틀거림 중 점프 봉인
    if (this.diving)        { this._jumpBufferMs = 0; return; }   // 잠수 중 점프 봉인
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
    // 잠수 깊이 — 홀드 중 DEPTH로 부드럽게 가라앉고, 떼면 0으로 복귀
    const diveTarget = this.diving ? DIVE.DEPTH : 0;
    this.diveOffset += (diveTarget - this.diveOffset) * Math.min(1, 12 * dt);
    this.y = this.baseY - this.jumpOffset + this.diveOffset;
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
