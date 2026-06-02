import { LOGICAL_WIDTH, LOGICAL_HEIGHT } from '../constants.js';
import { StorageManager } from '../storage.js';
import { STAGES } from '../stages.js';

const W = LOGICAL_WIDTH;
const H = LOGICAL_HEIGHT;

export default class MainMenuScene extends Phaser.Scene {
  constructor() { super({ key: 'MainMenuScene' }); }

  create() {
    const cx = W / 2;
    this._storage = new StorageManager();

    // Background
    const bg = this.add.graphics();
    bg.fillStyle(0xf0f2f5, 1).fillRect(0, 0, W, H);
    bg.fillStyle(0xe2e6ea, 1).fillRect(0, 0, W, 6);

    // Title
    this.add.text(cx, 145, '서프라이드', {
      fontSize: '110px', fontFamily: 'sans-serif', color: '#1a2744', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(cx, 200, '파도를 넘어, 세계를 건너라', {
      fontSize: '34px', fontFamily: 'sans-serif', color: '#8a96a3',
    }).setOrigin(0.5);

    // Hero illustration
    this._drawHero(cx - 450, 225, 900, 255);

    // Divider
    this.add.graphics()
      .lineStyle(1.5, 0xdde2e8, 1)
      .beginPath().moveTo(cx - 300, 497).lineTo(cx + 300, 497).strokePath();

    // Buttons
    const save      = this._storage.load();
    const hasPlayed = !!(save?.lastPlayedTime);
    const btnW = 500, btnH = 76, btnX = cx - btnW / 2;

    this._btn(btnX, 517, btnW, btnH, '시작하기', 'primary', () => {
      this.scene.start('GameScene', { stageIndex: 0 });
    });

    this._btn(btnX, 517 + btnH + 16, btnW, btnH, '이어하기', hasPlayed ? 'secondary' : 'disabled', () => {
      if (!hasPlayed) return;
      this.scene.start('GameScene', { stageIndex: save?.currentStage ?? 0 });
    });

    const subW = 280, subH = 64;
    this._btn(cx - subW - 10, 701, subW, subH, '세계지도 보기', 'secondary', () => this.scene.start('WorldMapScene'));
    this._btn(cx + 10,        701, subW, subH, '조작법 보기',   'secondary', () => this._showControls());

    // Progress card
    this._drawProgressCard(cx - 380, 791, 760, 175, save);

    // Settings link
    this.add.text(cx, 1000, '설정', {
      fontSize: '28px', fontFamily: 'sans-serif', color: '#aab4be',
    }).setOrigin(0.5);
  }

  _btn(x, y, w, h, label, variant, cb) {
    const gfx = this.add.graphics();
    if (variant === 'primary') {
      gfx.fillStyle(0x1a2744, 1).fillRoundedRect(x, y, w, h, 10);
      gfx.lineStyle(2, 0x1a2744, 1).strokeRoundedRect(x, y, w, h, 10);
    } else {
      gfx.lineStyle(2, variant === 'secondary' ? 0x1a2744 : 0xc8cdd4, 1)
         .strokeRoundedRect(x, y, w, h, 10);
    }

    const color = variant === 'primary' ? '#ffffff'
                : variant === 'secondary' ? '#1a2744' : '#c8cdd4';
    this.add.text(x + w / 2, y + h / 2, label, {
      fontSize: '30px', fontFamily: 'sans-serif', color, fontStyle: 'bold',
    }).setOrigin(0.5);

    if (variant !== 'disabled') {
      this.add.zone(x + w/2, y + h/2, w, h)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', cb);
    }
  }

  _drawHero(x, y, w, h) {
    const gfx = this.add.graphics();

    // Sky
    gfx.fillGradientStyle(0xb2ebf2, 0xb2ebf2, 0x29b6f6, 0x29b6f6, 1);
    gfx.fillRoundedRect(x, y, w, h, 16);

    // Sea wave
    gfx.fillGradientStyle(0x0097a7, 0x0097a7, 0x004d56, 0x004d56, 1);
    gfx.beginPath();
    gfx.moveTo(x, y + h * 0.46);
    for (let wx = 0; wx <= w; wx += 5) {
      gfx.lineTo(x + wx, y + h * 0.46 + Math.sin(wx * 0.022) * 10);
    }
    gfx.lineTo(x + w, y + h); gfx.lineTo(x, y + h); gfx.closePath(); gfx.fillPath();

    // Wave highlight
    gfx.fillStyle(0xffffff, 0.22);
    gfx.beginPath();
    gfx.moveTo(x, y + h * 0.54);
    for (let wx = 0; wx <= w; wx += 5) {
      gfx.lineTo(x + wx, y + h * 0.54 + Math.sin(wx * 0.016 + 1.8) * 12);
    }
    gfx.lineTo(x + w, y + h); gfx.lineTo(x, y + h); gfx.closePath(); gfx.fillPath();

    // Sun
    const sx = x + w * 0.14, sy = y + h * 0.32;
    gfx.fillStyle(0xffb400, 0.10).fillCircle(sx, sy, 70);
    gfx.fillStyle(0xffc81e, 0.25).fillCircle(sx, sy, 50);
    gfx.fillStyle(0xffe040, 0.85).fillCircle(sx, sy, 24);

    // Border
    gfx.lineStyle(1.5, 0x0096c8, 0.4).strokeRoundedRect(x, y, w, h, 16);

    // Surfer emoji
    this.add.text(x + w * 0.54, y + h * 0.75, '🏄', {
      fontSize: `${Math.round(h * 0.38)}px`,
    }).setOrigin(0.5);
  }

  _drawProgressCard(x, y, w, h, save) {
    const gfx = this.add.graphics();
    gfx.fillStyle(0x000000, 0.06).fillRoundedRect(x + 3, y + 5, w, h, 16);
    gfx.fillStyle(0xffffff, 1).lineStyle(1.5, 0xe2e6ea, 1);
    gfx.fillRoundedRect(x, y, w, h, 16).strokeRoundedRect(x, y, w, h, 16);

    this.add.text(x + 36, y + 46, '최근 진행 상황', {
      fontSize: '26px', fontFamily: 'sans-serif', color: '#8a96a3',
    });

    const hasPlayed = !!(save?.lastPlayedTime);
    if (!hasPlayed) {
      this.add.text(x + w / 2, y + h / 2 + 14, '아직 플레이 기록이 없습니다', {
        fontSize: '30px', fontFamily: 'sans-serif', color: '#c0c8d0',
      }).setOrigin(0.5);
      return;
    }

    const stageIdx   = save?.currentStage ?? 0;
    const stageData  = STAGES[stageIdx];
    const stages     = save?.unlockedStages ?? [];
    const cleared    = stages.filter(s => s.cleared).length;
    const totalStars = stages.reduce((acc, s) => acc + (s.stars ?? 0), 0);
    const hi         = this._storage.getHighScore(stageData.id);

    this.add.text(x + 36, y + 100, `${stageData.id}구역 — ${stageData.name}`, {
      fontSize: '32px', fontFamily: 'sans-serif', color: '#1a2744', fontStyle: 'bold',
    });

    this.add.graphics()
      .lineStyle(1, 0xeef0f3, 1)
      .beginPath().moveTo(x + 36, y + 122).lineTo(x + w - 36, y + 122).strokePath();

    const cols = [
      { label: '클리어 스테이지', value: `${cleared} / ${STAGES.length}` },
      { label: '획득 별',         value: `★ ${totalStars}개` },
      { label: '최고 기록',       value: hi > 0 ? `${hi.toLocaleString()}점` : '—' },
    ];
    const colW = w / cols.length;
    cols.forEach((col, i) => {
      const colX = x + colW * i + colW / 2;
      this.add.text(colX, y + 160, col.label, { fontSize: '23px', fontFamily: 'sans-serif', color: '#8a96a3' }).setOrigin(0.5, 0);
      this.add.text(colX, y + 198, col.value,  { fontSize: '32px', fontFamily: 'sans-serif', color: '#1a2744', fontStyle: 'bold' }).setOrigin(0.5, 0);
    });
  }

  _showControls() {
    const cx = W / 2, cy = H / 2;
    const pw = 800, ph = 560, px = cx - pw / 2, py = cy - ph / 2;

    // Darken overlay
    const overlay = this.add.graphics().fillStyle(0x000000, 0.6).fillRect(0, 0, W, H);

    const panel = this.add.graphics();
    panel.fillStyle(0x081838, 0.96).fillRoundedRect(px, py, pw, ph, 20);
    panel.lineStyle(2, 0x64b4ff, 0.4).strokeRoundedRect(px, py, pw, ph, 20);

    this.add.text(cx, py + 60, '조작법', {
      fontSize: '44px', fontFamily: 'sans-serif', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);

    const rows = [
      ['← / →', '좌우 방향키로 서퍼를 이동합니다'],
      ['↑ / ↓', '레인을 전환합니다 (위/아래 파도)'],
      ['Space',  '점프하여 장애물을 피합니다'],
      ['P / ESC','일시정지 메뉴를 열거나 닫습니다'],
    ];
    rows.forEach(([key, desc], i) => {
      const ry = py + 120 + i * 72;
      if (i % 2 === 0) {
        this.add.graphics().fillStyle(0xffffff, 0.05).fillRect(px + 20, ry - 6, pw - 40, 64);
      }
      this.add.text(px + 60, ry + 30, key, { fontSize: '32px', fontFamily: 'sans-serif', color: '#4fc3f7' }).setOrigin(0, 0.5);
      this.add.text(px + 260, ry + 30, desc, { fontSize: '32px', fontFamily: 'sans-serif', color: '#e0e0e0' }).setOrigin(0, 0.5);
    });

    const closeZone = this.add.zone(cx, py + ph - 62, 240, 56).setInteractive({ useHandCursor: true });
    this.add.graphics().fillStyle(0x1565c0, 1).lineStyle(2, 0x42a5f5, 1)
      .fillRoundedRect(cx - 120, py + ph - 90, 240, 56, 10)
      .strokeRoundedRect(cx - 120, py + ph - 90, 240, 56, 10);
    this.add.text(cx, py + ph - 62, '닫기 (ESC)', {
      fontSize: '28px', fontFamily: 'sans-serif', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);

    const closeAll = () => { overlay.destroy(); panel.destroy(); this.children.list.slice(-10).forEach(c => c.destroy()); };
    closeZone.on('pointerdown', () => this.scene.restart());
    this.input.keyboard.once('keydown-ESC', () => this.scene.restart());
  }
}
