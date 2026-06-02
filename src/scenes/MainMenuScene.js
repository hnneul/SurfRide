import Phaser from 'phaser';
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

    this._drawBackground();

    // ── Title ──
    this.add.text(cx + 3, 133, '서프라이드', {
      fontSize: '116px', fontFamily: 'sans-serif', color: '#04284a', fontStyle: 'bold',
    }).setOrigin(0.5).setAlpha(0.35);
    this.add.text(cx, 130, '서프라이드', {
      fontSize: '116px', fontFamily: 'sans-serif', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(cx, 212, '파도를 넘어, 세계를 건너라', {
      fontSize: '34px', fontFamily: 'sans-serif', color: '#cfe6ff',
    }).setOrigin(0.5);

    // ── Hero illustration ──
    this._drawHero(cx - 460, 256, 920, 250);

    // ── Buttons ──
    const save      = this._storage.load();
    const hasPlayed = !!(save?.lastPlayedTime);
    const btnW = 520, btnH = 80, btnX = cx - btnW / 2;

    this._btn(btnX, 548, btnW, btnH, '시작하기', 'primary', () => {
      this.scene.start('GameScene', { stageIndex: 0 });
    });

    this._btn(btnX, 548 + btnH + 18, btnW, btnH, '이어하기', hasPlayed ? 'secondary' : 'disabled', () => {
      if (!hasPlayed) return;
      this.scene.start('GameScene', { stageIndex: save?.currentStage ?? 0 });
    });

    const subW = 290, subH = 66;
    this._btn(cx - subW - 12, 742, subW, subH, '세계지도 보기', 'secondary', () => this.scene.start('WorldMapScene'));
    this._btn(cx + 12,        742, subW, subH, '조작법 보기',   'secondary', () => this._showControls());

    // ── Progress card ──
    this._drawProgressCard(cx - 390, 828, 780, 186, save);

    // ── Settings link ──
    this.add.text(cx, 1052, '설정', {
      fontSize: '26px', fontFamily: 'sans-serif', color: '#9fb8d4',
    }).setOrigin(0.5);
  }

  _drawBackground() {
    const gfx = this.add.graphics();
    // 하늘 → 바다 그라데이션 (게임 톤과 일치)
    gfx.fillGradientStyle(0x9fd6f5, 0x9fd6f5, 0x3a93cf, 0x3a93cf, 1);
    gfx.fillRect(0, 0, W, H * 0.5);
    gfx.fillGradientStyle(0x2f7fb8, 0x2f7fb8, 0x0e3d72, 0x0e3d72, 1);
    gfx.fillRect(0, H * 0.5, W, H * 0.5);

    // 부드러운 물결 띠
    gfx.fillStyle(0xffffff, 0.06);
    for (let i = 0; i < 5; i++) {
      const baseY = H * 0.58 + i * 70;
      gfx.beginPath();
      gfx.moveTo(0, baseY);
      for (let x = 0; x <= W; x += 12) {
        gfx.lineTo(x, baseY + Math.sin(x * 0.006 + i) * 10);
      }
      gfx.lineTo(W, H); gfx.lineTo(0, H); gfx.closePath(); gfx.fillPath();
    }
  }

  _btn(x, y, w, h, label, variant, cb) {
    const gfx = this.add.graphics();
    const draw = (hover) => {
      gfx.clear();
      if (variant === 'primary') {
        gfx.fillStyle(0x000000, 0.18).fillRoundedRect(x + 2, y + 4, w, h, 12);
        gfx.fillStyle(hover ? 0x1f8fe0 : 0x1565c0, 1).fillRoundedRect(x, y, w, h, 12);
        gfx.lineStyle(2, 0x6cc4ff, 1).strokeRoundedRect(x, y, w, h, 12);
      } else if (variant === 'secondary') {
        gfx.fillStyle(0xffffff, hover ? 0.18 : 0.10).fillRoundedRect(x, y, w, h, 12);
        gfx.lineStyle(2, 0xbfe0ff, hover ? 1 : 0.7).strokeRoundedRect(x, y, w, h, 12);
      } else {
        gfx.fillStyle(0xffffff, 0.04).fillRoundedRect(x, y, w, h, 12);
        gfx.lineStyle(2, 0xffffff, 0.18).strokeRoundedRect(x, y, w, h, 12);
      }
    };
    draw(false);

    const color = variant === 'disabled' ? '#7f94aa' : '#ffffff';
    this.add.text(x + w / 2, y + h / 2, label, {
      fontSize: '30px', fontFamily: 'sans-serif', color, fontStyle: 'bold',
    }).setOrigin(0.5);

    if (variant !== 'disabled') {
      this.add.zone(x + w / 2, y + h / 2, w, h)
        .setInteractive({ useHandCursor: true })
        .on('pointerover', () => draw(true))
        .on('pointerout',  () => draw(false))
        .on('pointerdown', cb);
    }
  }

  _drawHero(x, y, w, h) {
    const gfx = this.add.graphics();

    // Sky
    gfx.fillGradientStyle(0xb2ebf2, 0xb2ebf2, 0x29b6f6, 0x29b6f6, 1);
    gfx.fillRoundedRect(x, y, w, h, 18);

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
    gfx.lineStyle(2, 0xffffff, 0.5).strokeRoundedRect(x, y, w, h, 18);

    // Surfer emoji
    this.add.text(x + w * 0.54, y + h * 0.74, '🏄', {
      fontSize: `${Math.round(h * 0.38)}px`,
    }).setOrigin(0.5);
  }

  _drawProgressCard(x, y, w, h, save) {
    const gfx = this.add.graphics();
    gfx.fillStyle(0x000000, 0.18).fillRoundedRect(x + 3, y + 5, w, h, 18);
    gfx.fillStyle(0xffffff, 0.96).lineStyle(1.5, 0xe2e6ea, 1);
    gfx.fillRoundedRect(x, y, w, h, 18).strokeRoundedRect(x, y, w, h, 18);

    this.add.text(x + 36, y + 30, '최근 진행 상황', {
      fontSize: '24px', fontFamily: 'sans-serif', color: '#8a96a3',
    });

    const hasPlayed = !!(save?.lastPlayedTime);
    if (!hasPlayed) {
      this.add.text(x + w / 2, y + h / 2 + 8, '아직 플레이 기록이 없습니다', {
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

    this.add.text(x + 36, y + 66, `${stageData.id}구역 — ${stageData.name}`, {
      fontSize: '32px', fontFamily: 'sans-serif', color: '#1a2744', fontStyle: 'bold',
    });

    this.add.graphics()
      .lineStyle(1, 0xeef0f3, 1)
      .beginPath().moveTo(x + 36, y + 112).lineTo(x + w - 36, y + 112).strokePath();

    const cols = [
      { label: '클리어 스테이지', value: `${cleared} / ${STAGES.length}` },
      { label: '획득 별',         value: `★ ${totalStars}개` },
      { label: '최고 기록',       value: hi > 0 ? `${hi.toLocaleString()}점` : '—' },
    ];
    const colW = w / cols.length;
    cols.forEach((col, i) => {
      const colX = x + colW * i + colW / 2;
      this.add.text(colX, y + 126, col.label, { fontSize: '22px', fontFamily: 'sans-serif', color: '#8a96a3' }).setOrigin(0.5, 0);
      this.add.text(colX, y + 154, col.value, { fontSize: '30px', fontFamily: 'sans-serif', color: '#1a2744', fontStyle: 'bold' }).setOrigin(0.5, 0);
    });
  }

  _showControls() {
    const cx = W / 2, cy = H / 2;
    const pw = 820, ph = 580, px = cx - pw / 2, py = cy - ph / 2;

    const overlay = this.add.graphics().fillStyle(0x000000, 0.6).fillRect(0, 0, W, H);

    const panel = this.add.graphics();
    panel.fillStyle(0x081838, 0.96).fillRoundedRect(px, py, pw, ph, 20);
    panel.lineStyle(2, 0x64b4ff, 0.4).strokeRoundedRect(px, py, pw, ph, 20);

    this.add.text(cx, py + 58, '조작법', {
      fontSize: '44px', fontFamily: 'sans-serif', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);

    const rows = [
      ['↑ / ↓', '파도 면을 타고 위(안전)·아래(거친 바다 ×1.5)로 이동'],
      ['← / →', '보드 균형 잡기 — 무너지면 와이프아웃!'],
      ['Space',  '점프로 솟구친 장애물을 뛰어넘기 (공중=균형 안정)'],
      ['P / ESC','일시정지 메뉴 열기·닫기'],
    ];
    rows.forEach(([key, desc], i) => {
      const ry = py + 116 + i * 70;
      if (i % 2 === 0) {
        this.add.graphics().fillStyle(0xffffff, 0.05).fillRect(px + 20, ry - 6, pw - 40, 62);
      }
      this.add.text(px + 56, ry + 28, key, { fontSize: '30px', fontFamily: 'sans-serif', color: '#4fc3f7' }).setOrigin(0, 0.5);
      this.add.text(px + 250, ry + 28, desc, { fontSize: '28px', fontFamily: 'sans-serif', color: '#e0e0e0' }).setOrigin(0, 0.5);
    });

    this.add.graphics().fillStyle(0x1565c0, 1).lineStyle(2, 0x42a5f5, 1)
      .fillRoundedRect(cx - 120, py + ph - 90, 240, 56, 10)
      .strokeRoundedRect(cx - 120, py + ph - 90, 240, 56, 10);
    this.add.text(cx, py + ph - 62, '닫기 (ESC)', {
      fontSize: '28px', fontFamily: 'sans-serif', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.zone(cx, py + ph - 62, 240, 56).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.scene.restart());
    this.input.keyboard.once('keydown-ESC', () => this.scene.restart());
  }
}
