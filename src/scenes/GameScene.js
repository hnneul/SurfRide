import { LOGICAL_WIDTH, LOGICAL_HEIGHT, Lane, LANE_Y } from '../constants.js';
import { Player } from '../player.js';
import { ObstacleManager } from '../obstacle.js';
import { ScoreManager } from '../score.js';
import { StorageManager } from '../storage.js';
import { STAGES } from '../stages.js';

export default class GameScene extends Phaser.Scene {
  constructor() { super({ key: 'GameScene' }); }

  init(data) {
    this.stageIndex = data.stageIndex ?? 0;
  }

  create() {
    this.stageTimer  = 0;
    this.worldOffset = 0;
    this._active     = true;

    this.bgGfx = this.add.graphics().setDepth(0);

    this.storage         = new StorageManager();
    this.scoreManager    = new ScoreManager();
    this.player          = new Player(this);
    this.obstacleManager = new ObstacleManager(this);
    this.obstacleManager.loadStage(STAGES[this.stageIndex]);

    this.cursors  = this.input.keyboard.createCursorKeys();
    this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.pKey     = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.P);
    this.escKey   = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    this.scene.launch('HUDScene', { gameScene: this });
  }

  update(_time, delta) {
    if (!this._active) return;

    const dt = Math.min(delta, 50);
    this.stageTimer  += dt;
    this.worldOffset += this.obstacleManager.scrollSpeed * (dt / 1000);

    this.player.update(dt, this.cursors, this.spaceKey);
    this.obstacleManager.update(dt, this.stageTimer);
    this.scoreManager.update(dt, this.player, this.obstacleManager);

    const hit = this.obstacleManager.checkCollision(this.player.hitbox);
    if (hit) { this._gameOver(hit); return; }

    if (this.stageTimer >= this.obstacleManager._stageDuration) {
      this._stageClear();
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.pKey) ||
        Phaser.Input.Keyboard.JustDown(this.escKey)) {
      this._pause();
    }

    this._renderBackground();
  }

  // ─── Background rendering ───────────────────────────────────────────────────
  _renderBackground() {
    const gfx = this.bgGfx;
    const W   = LOGICAL_WIDTH;
    const H   = LOGICAL_HEIGHT;
    const ox  = this.worldOffset;

    gfx.clear();

    // Sky — 3-stop gradient approximated with 2 rects
    gfx.fillGradientStyle(0x87ceeb, 0x87ceeb, 0x4a9fd4, 0x4a9fd4, 1);
    gfx.fillRect(0, 0, W, H * 0.24);
    gfx.fillGradientStyle(0x4a9fd4, 0x4a9fd4, 0x2575b5, 0x2575b5, 1);
    gfx.fillRect(0, H * 0.24, W, H * 0.24);

    // Sea — 3-stop gradient approximated with 2 rects
    gfx.fillGradientStyle(0x1e6db5, 0x1e6db5, 0x0e3d72, 0x0e3d72, 1);
    gfx.fillRect(0, H * 0.44, W, H * 0.28);
    gfx.fillGradientStyle(0x0e3d72, 0x0e3d72, 0x071e38, 0x071e38, 1);
    gfx.fillRect(0, H * 0.72, W, H * 0.28);

    this._drawClouds(ox * 0.08);
    this._drawWaveLayer(ox * 0.18, H * 0.40, 16, 0x64aaeb, 0.35);
    this._drawWaveLayer(ox * 0.45, H * 0.53, 26, 0xa0d7ff, 0.20);
    this._drawWaveLayer(ox * 0.75, H * 0.66, 38, 0xffffff, 0.13);
    this._drawSparkles(ox);
    this._drawLaneGuides(ox);
  }

  _drawWaveLayer(offset, baseY, amp, color, alpha) {
    const gfx = this.bgGfx;
    const W   = LOGICAL_WIDTH;
    const H   = LOGICAL_HEIGHT;

    gfx.fillStyle(color, alpha);
    gfx.beginPath();

    const startY = baseY
      + Math.sin(offset * 0.0055) * amp
      + Math.sin(offset * 0.011 + 1.3) * amp * 0.4
      + Math.sin(offset * 0.003 + 2.7) * amp * 0.6;
    gfx.moveTo(0, startY);

    for (let x = 4; x <= W; x += 4) {
      const y = baseY
        + Math.sin((x + offset) * 0.0055) * amp
        + Math.sin((x + offset) * 0.011 + 1.3) * amp * 0.4
        + Math.sin((x + offset) * 0.003 + 2.7) * amp * 0.6;
      gfx.lineTo(x, y);
    }
    gfx.lineTo(W, H);
    gfx.lineTo(0, H);
    gfx.closePath();
    gfx.fillPath();
  }

  _drawClouds(offset) {
    const gfx  = this.bgGfx;
    const W    = LOGICAL_WIDTH;
    const TILE = 2400;
    const defs = [
      { rx: 200,  y: 72,  rw: 130, rh: 46 },
      { rx: 580,  y: 48,  rw:  96, rh: 36 },
      { rx: 950,  y: 98,  rw: 152, rh: 52 },
      { rx: 1380, y: 62,  rw: 115, rh: 42 },
      { rx: 1820, y: 85,  rw: 140, rh: 50 },
      { rx: 2180, y: 55,  rw: 105, rh: 38 },
    ];

    gfx.fillStyle(0xffffff, 0.85);
    const scrolled = offset % TILE;

    for (const d of defs) {
      for (let tile = -1; tile <= 2; tile++) {
        const cx = d.rx - scrolled + tile * TILE;
        if (cx + d.rw * 1.6 < 0 || cx - d.rw * 1.6 > W) continue;
        gfx.fillEllipse(cx,                  d.y,                  d.rw * 2,   d.rh * 2);
        gfx.fillEllipse(cx - d.rw * 0.55,   d.y + d.rh * 0.15,   d.rw * 1.3, d.rh * 1.6);
        gfx.fillEllipse(cx + d.rw * 0.52,   d.y + d.rh * 0.12,   d.rw * 1.2, d.rh * 1.5);
      }
    }
  }

  _drawSparkles(offset) {
    const gfx = this.bgGfx;
    const W   = LOGICAL_WIDTH;

    for (let i = 0; i < 22; i++) {
      const x     = ((i * 97 + offset * 0.85) % W + W) % W;
      const y     = LANE_Y[Lane.TOP] + Math.sin(i * 2.1) * 200;
      const alpha = (Math.sin(offset * 0.04 + i * 1.7) + 1) / 2 * 0.55;
      const r     = 1.5 + Math.sin(i * 0.9) * 1;
      gfx.fillStyle(0xffffff, alpha);
      gfx.fillCircle(x, y, r);
    }
  }

  _drawLaneGuides(offset) {
    const gfx    = this.bgGfx;
    const W      = LOGICAL_WIDTH;
    const dash   = 20;
    const gap    = 24;
    const period = dash + gap;

    gfx.lineStyle(2, 0xffffff, 0.28);

    for (const lane of [Lane.TOP, Lane.MID, Lane.BOT]) {
      const y    = LANE_Y[lane];
      const base = offset % period;
      for (let x = -base; x < W; x += period) {
        const x1 = Math.max(0, x);
        const x2 = Math.min(W, x + dash);
        if (x2 <= x1) continue;
        gfx.beginPath();
        gfx.moveTo(x1, y);
        gfx.lineTo(x2, y);
        gfx.strokePath();
      }
    }
  }

  // ─── State transitions ──────────────────────────────────────────────────────
  _pause() {
    this._active = false;
    this.scene.launch('PauseScene', { gameScene: this });
  }

  resumeGame() {
    this._active = true;
    this.scene.stop('PauseScene');
  }

  _gameOver(hitObstacle) {
    this._active = false;
    this.scene.stop('HUDScene');
    this.scene.start('ResultScene', {
      cleared:     false,
      stageIndex:  this.stageIndex,
      summary:     this.scoreManager.getSummary(),
      hitObstacle,
      timeRemain:  Math.max(0, this.obstacleManager._stageDuration - this.stageTimer),
      storage:     this.storage,
    });
  }

  _stageClear() {
    this._active = false;
    this.scoreManager.onStageClear();
    const stageId = this.stageIndex + 1;
    const summary = this.scoreManager.getSummary();
    const stars   = this._calcStars(stageId, summary);
    this.storage.updateStageResult(stageId, summary.total, stars);

    this.scene.stop('HUDScene');
    this.scene.start('ResultScene', {
      cleared:    true,
      stageIndex: this.stageIndex,
      summary,
      stars,
      storage:    this.storage,
    });
  }

  _calcStars(stageId, summary) {
    const pt = ({ 1:2, 2:3, 3:4, 4:5, 5:6, 6:7, 7:8, 8:9, 9:10, 10:11 })[stageId] ?? 2;
    const ct = ({ 1:1.4, 2:1.5, 3:1.6, 4:1.7, 5:1.8, 6:1.8, 7:1.9, 8:1.9, 9:2.0, 10:2.0 })[stageId] ?? 1.4;
    if (summary.perfectJumps >= pt || summary.maxComboMultiplier >= ct) return 3;
    if (summary.perfectJumps >= 1  || summary.maxCombo >= 3)            return 2;
    return 1;
  }
}
