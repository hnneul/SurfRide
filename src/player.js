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

    this.shadow = scene.add.ellipse(0, 0, 82, 18, 0x06182c, 0.34).setDepth(1.7);

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

    this.laneLabel = scene.add.text(0, 0, 'MID', {
      fontSize: '16px', fontFamily: 'sans-serif', color: '#ffffff', fontStyle: 'bold',
      backgroundColor: 'rgba(0,0,0,0.35)', padding: { x: 7, y: 3 },
    }).setOrigin(0.5, 1).setDepth(2.2);

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
    this.shadow?.setPosition(this.x, this.baseY + 34);
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
    this.visual.rotation = Phaser.Math.Linear(
      this.visual.rotation,
      this.isGrounded ? this.velX * 0.00035 : this.velY * -0.00008,
      0.22,
    );
    this.board.setFillStyle(this.isGrounded ? 0xfff2b2 : 0xffffff);
    this.shadow.setPosition(this.x, this.baseY + 34);
    this.shadow.setScale(this.isGrounded ? 1 : 0.72, this.isGrounded ? 1 : 0.8);
    this.shadow.setAlpha(this.isGrounded ? 0.34 : 0.18);
    this.laneLabel.setText(['TOP', 'MID', 'BOT'][this.lane]);
    this.laneLabel.setPosition(this.x, this.y - this.hitboxH / 2 - 18);
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
    this.shadow.destroy();
    this.visual.destroy();
    this.laneLabel.destroy();
  }
}
