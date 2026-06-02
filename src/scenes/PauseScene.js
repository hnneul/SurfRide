import { LOGICAL_WIDTH, LOGICAL_HEIGHT } from '../constants.js';

export default class PauseScene extends Phaser.Scene {
  constructor() { super({ key: 'PauseScene' }); }

  init(data) { this.gameScene = data.gameScene; }

  create() {
    const cx = LOGICAL_WIDTH / 2;
    const cy = LOGICAL_HEIGHT / 2;

    this.add.graphics().fillStyle(0x000000, 0.65).fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    this.add.text(cx, cy - 80, '일시정지', {
      fontSize: '72px', fontFamily: 'sans-serif', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(cx, cy - 20, 'ESC 키로 재개', {
      fontSize: '28px', fontFamily: 'sans-serif', color: 'rgba(255,255,255,0.5)',
    }).setOrigin(0.5);

    this._btn(cx - 125, cy + 52, 210, 64, '계속하기', true,  () => this.gameScene.resumeGame());
    this._btn(cx + 125, cy + 52, 210, 64, '메인으로', false, () => {
      this.scene.stop('HUDScene');
      this.scene.stop('GameScene');
      this.scene.stop('PauseScene');
      this.scene.start('MainMenuScene');
    });

    // ESC / P to resume
    this.input.keyboard.once('keydown-ESC', () => this.gameScene.resumeGame());
    this.input.keyboard.once('keydown-P',   () => this.gameScene.resumeGame());
  }

  _btn(cx, cy, w, h, label, primary, cb) {
    const gfx = this.add.graphics();
    gfx.fillStyle(primary ? 0x1565c0 : 0x000000, primary ? 1 : 0.12);
    gfx.lineStyle(2, primary ? 0x42a5f5 : 0xffffff, primary ? 1 : 0.3);
    gfx.fillRoundedRect(cx - w/2, cy - h/2, w, h, 10);
    gfx.strokeRoundedRect(cx - w/2, cy - h/2, w, h, 10);

    this.add.text(cx, cy, label, {
      fontSize: '28px', fontFamily: 'sans-serif', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.zone(cx, cy, w, h).setInteractive({ useHandCursor: true }).on('pointerdown', cb);
  }
}
