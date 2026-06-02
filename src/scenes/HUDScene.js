import { LOGICAL_WIDTH, LOGICAL_HEIGHT, Lane, LANE_MULTIPLIER } from '../constants.js';
import { STAGES } from '../stages.js';

const W = LOGICAL_WIDTH;

export default class HUDScene extends Phaser.Scene {
  constructor() { super({ key: 'HUDScene' }); }

  init(data) {
    this.gameScene = data.gameScene;
  }

  create() {
    // Dark HUD bar
    this.hudBar = this.add.graphics();
    this.hudBar.fillStyle(0x000000, 0.45);
    this.hudBar.fillRect(0, 0, W, 72);

    const txtStyle = (size, bold = false) => ({
      fontSize: `${size}px`, fontFamily: 'sans-serif', color: '#ffffff',
      fontStyle: bold ? 'bold' : 'normal',
    });

    // Score (top-left)
    this.scoreText = this.add.text(24, 12, 'SCORE  0', txtStyle(36, true));

    // Combo (beside score)
    this.comboText = this.add.text(340, 12, '', { ...txtStyle(30, true), color: '#ffd700' });

    // Stage name (center top)
    this.stageTitleText = this.add.text(W / 2, 8, '', txtStyle(28, true)).setOrigin(0.5, 0);
    this.stageNameText  = this.add.text(W / 2, 40, '', { ...txtStyle(22), color: '#c8e0f8' }).setOrigin(0.5, 0);

    // Timer (top-right)
    this.timerText = this.add.text(W - 24, 12, '60s', txtStyle(36, true)).setOrigin(1, 0);

    // Lane multipliers (right side)
    this.laneMulTexts = [];
    for (let i = 0; i < 3; i++) {
      this.laneMulTexts.push(
        this.add.text(W - 16, 100 + i * 36, '', txtStyle(22)).setOrigin(1, 0)
      );
    }

    // Mini progress bar
    this.progressBg  = this.add.graphics();
    this.progressFill = this.add.graphics();
    this.progressBg.fillStyle(0x000000, 0.6);
    this.progressBg.fillRect(24, 80, 220, 50);
    this.progressBg.lineStyle(1, 0xffffff, 0.3);
    this.progressBg.strokeRect(24, 80, 220, 50);
  }

  update() {
    const gs = this.gameScene;
    if (!gs || !gs._active) return;

    const score   = gs.scoreManager;
    const elapsed = gs.stageTimer / 1000;
    const dur     = gs.obstacleManager._stageDuration / 1000;
    const remain  = Math.max(0, dur - elapsed);
    const stage   = STAGES[gs.stageIndex];

    this.scoreText.setText(`SCORE  ${score.total.toLocaleString()}`);
    this.comboText.setText(score.combo > 0 ? `COMBO ×${score.combo}` : '');

    this.stageTitleText.setText(`STAGE ${stage.id}`);
    this.stageNameText.setText(stage.name);

    this.timerText.setColor(remain < 10 ? '#ff4444' : '#ffffff');
    this.timerText.setText(`${Math.ceil(remain)}s`);

    const laneLabels = ['위 ×1.0', '중 ×1.2', '아래 ×1.5'];
    for (let i = 0; i < 3; i++) {
      const active = i === gs.player.lane;
      this.laneMulTexts[i]
        .setText(laneLabels[i])
        .setStyle({ fontStyle: active ? 'bold' : 'normal', fontSize: active ? '26px' : '22px' })
        .setColor(active ? '#ffd700' : 'rgba(255,255,255,0.5)');
    }

    // Progress bar fill
    const progress = Math.min(elapsed / dur, 1);
    this.progressFill.clear();
    this.progressFill.fillStyle(0x4fc3f7, 1);
    this.progressFill.fillRect(28, 112, (212) * progress, 8);
  }
}
