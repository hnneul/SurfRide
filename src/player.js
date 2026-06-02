import { LOGICAL_WIDTH, Lane, LANE_Y, LANE_MULTIPLIER } from './constants.js';

// re-export for score.js / obstacle.js backwards compat
export { Lane, LANE_Y, LANE_MULTIPLIER };

const JUMP_VELOCITY        = -900;
const GRAVITY              = 2400;
const MOVE_SPEED           = 320;
const MOVE_RANGE_X         = LOGICAL_WIDTH * (1 / 3);
const LANE_SWITCH_COOLDOWN = 150;

export class Player {
  constructor(scene) {
    this.scene = scene;

    this.hitboxW = 60;
    this.hitboxH = 80;

    // Visual: blue rectangle placeholder
    this.visual = scene.add.rectangle(0, 0, this.hitboxW, this.hitboxH, 0x42a5f5)
      .setStrokeStyle(2, 0xffffff)
      .setDepth(2);

    this.laneLabel = scene.add.text(0, 0, 'MID', {
      fontSize: '18px', fontFamily: 'sans-serif', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5, 1).setDepth(2);

    this.reset();
  }

  reset() {
    this.lane      = Lane.MID;
    this.x         = LOGICAL_WIDTH * 0.18;
    this.y         = LANE_Y[Lane.MID];
    this.baseY     = LANE_Y[Lane.MID];
    this.velX      = 0;
    this.velY      = 0;
    this.isJumping  = false;
    this.isGrounded = true;
    this._laneCooldown = 0;

    this.visual?.setPosition(this.x, this.y);
  }

  get hitbox() {
    return {
      x: this.x - this.hitboxW / 2,
      y: this.y - this.hitboxH / 2,
      w: this.hitboxW,
      h: this.hitboxH,
    };
  }

  update(deltaMs, cursors, spaceKey) {
    const dt = deltaMs / 1000;

    this._handleLaneInput(deltaMs, cursors);
    this._handleJump(spaceKey);
    this._applyPhysics(dt, cursors);
    this._clampX();

    this.visual.setPosition(this.x, this.y);
    this.visual.setFillStyle(this.isGrounded ? 0x42a5f5 : 0x90caf9);
    this.laneLabel.setText(['TOP', 'MID', 'BOT'][this.lane]);
    this.laneLabel.setPosition(this.x, this.y - this.hitboxH / 2 - 6);
  }

  _handleLaneInput(deltaMs, cursors) {
    this._laneCooldown = Math.max(0, this._laneCooldown - deltaMs);
    if (this._laneCooldown > 0) return;

    if (cursors.up.isDown && this.lane > Lane.TOP) {
      this.lane--;
      this.baseY = LANE_Y[this.lane];
      this._laneCooldown = LANE_SWITCH_COOLDOWN;
    } else if (cursors.down.isDown && this.lane < Lane.BOT) {
      this.lane++;
      this.baseY = LANE_Y[this.lane];
      this._laneCooldown = LANE_SWITCH_COOLDOWN;
    }
  }

  _handleJump(spaceKey) {
    if (spaceKey.isDown && this.isGrounded) {
      this.velY       = JUMP_VELOCITY;
      this.isJumping  = true;
      this.isGrounded = false;
    }
  }

  _applyPhysics(dt, cursors) {
    if (!this.isGrounded) {
      this.velY += GRAVITY * dt;
      this.y    += this.velY * dt;

      if (cursors.left.isDown)        this.velX = -MOVE_SPEED;
      else if (cursors.right.isDown)  this.velX =  MOVE_SPEED;
      else                            this.velX = 0;

      this.x += this.velX * dt;

      if (this.y >= this.baseY) {
        this.y          = this.baseY;
        this.velY       = 0;
        this.velX       = 0;
        this.isJumping  = false;
        this.isGrounded = true;
      }
    } else {
      this.y += (this.baseY - this.y) * Math.min(1, 12 * dt);
      if (cursors.left.isDown)  this.x -= MOVE_SPEED * dt;
      if (cursors.right.isDown) this.x += MOVE_SPEED * dt;
    }
  }

  _clampX() {
    const minX = this.hitboxW / 2;
    const maxX = minX + MOVE_RANGE_X;
    this.x = Math.max(minX, Math.min(maxX, this.x));
  }

  destroy() {
    this.visual.destroy();
    this.laneLabel.destroy();
  }
}
