import { LOGICAL_WIDTH, LOGICAL_HEIGHT } from './constants.js';

// ─── 레인 정의 ───────────────────────────────────────────────────────────────
export const Lane = Object.freeze({ TOP: 0, MID: 1, BOT: 2 });

// 논리 좌표 기준 각 레인의 Y 중심
export const LANE_Y = Object.freeze({
  [Lane.TOP]: LOGICAL_HEIGHT * 0.30,
  [Lane.MID]: LOGICAL_HEIGHT * 0.55,
  [Lane.BOT]: LOGICAL_HEIGHT * 0.78,
});

// 레인별 점수 배율 (score.js 에서도 참조)
export const LANE_MULTIPLIER = Object.freeze({
  [Lane.TOP]: 1.0,
  [Lane.MID]: 1.2,
  [Lane.BOT]: 1.5,
});

// ─── 물리 상수 ───────────────────────────────────────────────────────────────
const JUMP_VELOCITY       = -900;  // px/s (위 방향 음수)
const GRAVITY             = 2400;  // px/s²
const MOVE_SPEED          = 320;   // px/s (좌우)
const MOVE_RANGE_X        = LOGICAL_WIDTH * (1 / 3); // 화면 좌측 1/3 내
const LANE_SWITCH_COOLDOWN = 150;  // ms
const PERFECT_WINDOW_MS   = 120;   // 퍼펙트 점프 판정창 (앞뒤 각각)

// ─── 입력 상태 관리 ──────────────────────────────────────────────────────────
class InputHandler {
  constructor() {
    this.keys = {};
    this._onKeyDown = (e) => { this.keys[e.code] = true; };
    this._onKeyUp   = (e) => { this.keys[e.code] = false; };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup',   this._onKeyUp);
  }

  isDown(code) { return !!this.keys[code]; }

  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup',   this._onKeyUp);
  }
}

// ─── Player 클래스 ───────────────────────────────────────────────────────────
export class Player {
  constructor() {
    this.input = new InputHandler();
    this.reset();
  }

  reset() {
    this.lane     = Lane.MID;
    this.x        = LOGICAL_WIDTH * 0.18;
    this.y        = LANE_Y[Lane.MID];
    this.baseY    = LANE_Y[Lane.MID]; // 착지 기준 Y

    this.velX     = 0;
    this.velY     = 0;

    this.isJumping       = false;
    this.isGrounded      = true;
    this._laneCooldown   = 0;   // ms

    // 충돌 박스 (AABB)
    this.hitboxW = 60;
    this.hitboxH = 80;
  }

  get hitbox() {
    return {
      x: this.x - this.hitboxW / 2,
      y: this.y - this.hitboxH / 2,
      w: this.hitboxW,
      h: this.hitboxH,
    };
  }

  // 퍼펙트 점프 판정 여부 반환용 (obstacle.js에서 호출)
  isPerfectJumpWindow(obstaclePassTimeMs, currentTimeMs) {
    return Math.abs(currentTimeMs - obstaclePassTimeMs) <= PERFECT_WINDOW_MS;
  }

  update(deltaMs) {
    const dt = deltaMs / 1000; // 초 단위

    this._handleLaneInput(deltaMs);
    this._handleJump();
    this._applyPhysics(dt);
    this._clampX();
  }

  _handleLaneInput(deltaMs) {
    this._laneCooldown = Math.max(0, this._laneCooldown - deltaMs);
    if (this._laneCooldown > 0) return;

    if (this.input.isDown('ArrowUp') && this.lane > Lane.TOP) {
      this.lane--;
      this.baseY = LANE_Y[this.lane];
      this._laneCooldown = LANE_SWITCH_COOLDOWN;
    } else if (this.input.isDown('ArrowDown') && this.lane < Lane.BOT) {
      this.lane++;
      this.baseY = LANE_Y[this.lane];
      this._laneCooldown = LANE_SWITCH_COOLDOWN;
    }
  }

  _handleJump() {
    if (this.input.isDown('Space') && this.isGrounded) {
      this.velY      = JUMP_VELOCITY;
      this.isJumping = true;
      this.isGrounded = false;
    }
  }

  _applyPhysics(dt) {
    if (!this.isGrounded) {
      this.velY += GRAVITY * dt;
      this.y    += this.velY * dt;

      // 공중 좌우 이동
      if (this.input.isDown('ArrowLeft'))  this.velX = -MOVE_SPEED;
      else if (this.input.isDown('ArrowRight')) this.velX =  MOVE_SPEED;
      else this.velX = 0;

      this.x += this.velX * dt;

      // 착지 판정
      if (this.y >= this.baseY) {
        this.y          = this.baseY;
        this.velY       = 0;
        this.velX       = 0;
        this.isJumping  = false;
        this.isGrounded = true;
      }
    } else {
      // 레인 전환 시 Y 보간 이동
      this.y += (this.baseY - this.y) * Math.min(1, 12 * dt);
      // 지면 좌우 이동
      if (this.input.isDown('ArrowLeft'))  this.x -= MOVE_SPEED * dt;
      if (this.input.isDown('ArrowRight')) this.x += MOVE_SPEED * dt;
    }
  }

  _clampX() {
    const minX = this.hitboxW / 2;
    const maxX = minX + MOVE_RANGE_X;
    this.x = Math.max(minX, Math.min(maxX, this.x));
  }

  // 임시 렌더링 (placeholder): 파란 보드 모양 사각형
  render(ctx) {
    const { x, y, w, h } = this.hitbox;
    ctx.fillStyle = this.isGrounded ? '#42a5f5' : '#90caf9';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);

    // 현재 레인 인디케이터 (디버그)
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(['TOP', 'MID', 'BOT'][this.lane], x + w / 2, y - 8);
  }
}
