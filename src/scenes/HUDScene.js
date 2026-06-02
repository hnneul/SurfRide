import Phaser from 'phaser';
import { LOGICAL_WIDTH, LOGICAL_HEIGHT, BALANCE } from '../constants.js';
import { STAGES } from '../stages.js';

const W = LOGICAL_WIDTH;
const H = LOGICAL_HEIGHT;

export default class HUDScene extends Phaser.Scene {
  constructor() { super({ key: 'HUDScene' }); }

  init(data) {
    this.gameScene = data.gameScene;
  }

  create() {
    this.hudBar = this.add.graphics();
    this.hudBar.fillStyle(0x000000, 0.45);
    this.hudBar.fillRect(0, 0, W, 96);

    const txt = (size, bold = false, color = '#ffffff') => ({
      fontSize: `${size}px`, fontFamily: 'sans-serif', color,
      fontStyle: bold ? 'bold' : 'normal',
    });

    // ── 좌: 미니맵 (출발항 → 목적지 항해) ──
    this.minimapX = 36;
    this.minimapW = 420;
    this.minimapY = 54;
    this.add.text(this.minimapX, 14, '항해 진척', txt(20, false, '#c8e0f8'));
    this.add.text(this.minimapX, 70, '제주', txt(18, false, '#9fb8d4'));
    this.add.text(this.minimapX + this.minimapW, 70, '태평양', txt(18, false, '#9fb8d4')).setOrigin(1, 0);
    this.minimapGfx = this.add.graphics();
    this.surferMark = this.add.text(0, this.minimapY, '🏄', { fontSize: '26px' }).setOrigin(0.5);

    // ── 중앙: 남은 시간 + 스테이지명 ──
    this.timerText = this.add.text(W / 2, 18, '60s', txt(44, true)).setOrigin(0.5, 0);
    this.stageNameText = this.add.text(W / 2, 66, '', txt(20, false, '#c8e0f8')).setOrigin(0.5, 0);

    // ── 우: 점수 · 콤보 · 현재 배율 ──
    this.scoreText = this.add.text(W - 36, 10, 'SCORE 0', txt(38, true)).setOrigin(1, 0);
    this.comboText = this.add.text(W - 150, 58, '', { ...txt(28, true), color: '#ffd700' }).setOrigin(1, 0);
    this.mulBadge  = this.add.graphics();
    this.mulText   = this.add.text(0, 0, '', txt(24, true)).setOrigin(0.5);

    // ── 하단 중앙: 밸런스 바 (균형/와이프아웃 경고) ──
    this.balanceW = 520;
    this.balanceX = W / 2;
    this.balanceY = H - 54;
    this.balanceGfx = this.add.graphics();
    this.add.text(this.balanceX, this.balanceY - 40, 'BALANCE', txt(18, false, '#9fb8d4')).setOrigin(0.5);
  }

  update() {
    const gs = this.gameScene;
    if (!gs || !gs._active) return;

    const score   = gs.scoreManager;
    const elapsed = gs.stageTimer / 1000;
    const dur     = gs.obstacleManager._stageDuration / 1000;
    const remain  = Math.max(0, dur - elapsed);
    const stage   = STAGES[gs.stageIndex];
    const progress = Math.min(elapsed / dur, 1);

    // 미니맵
    const g = this.minimapGfx;
    g.clear();
    g.lineStyle(4, 0x9fb8d4, 0.4);
    this._dashedLine(g, this.minimapX, this.minimapY, this.minimapX + this.minimapW, this.minimapY);
    g.fillStyle(0x4fc3f7, 1);
    g.fillRect(this.minimapX, this.minimapY - 2, this.minimapW * progress, 4);
    g.fillStyle(0x9fb8d4, 1);
    g.fillCircle(this.minimapX, this.minimapY, 6);
    g.fillStyle(0xffd700, 1);
    g.fillCircle(this.minimapX + this.minimapW, this.minimapY, 7);
    this.surferMark.setX(this.minimapX + this.minimapW * progress);

    // 시간
    this.timerText.setColor(remain < 10 ? '#ff4444' : '#ffffff');
    this.timerText.setText(`${Math.ceil(remain)}s`);
    this.stageNameText.setText(`STAGE ${stage.id} · ${stage.name}`);

    // 점수 / 콤보
    this.scoreText.setText(`SCORE ${score.total.toLocaleString()}`);
    this.comboText.setText(score.combo > 0 ? `COMBO ×${score.combo}` : '');

    // 현재 배율 배지
    const mul     = gs.player.zoneMultiplier;
    const danger  = gs.player.inDanger;
    const bx = W - 80, by = 70;
    this.mulBadge.clear();
    this.mulBadge.fillStyle(danger ? 0xff3b30 : 0x1565c0, danger ? 0.9 : 0.6);
    this.mulBadge.fillRoundedRect(bx - 50, by - 18, 100, 36, 8);
    this.mulText.setText(`×${mul.toFixed(1)}`).setPosition(bx, by);

    this._drawBalanceBar(gs.player.tilt);
  }

  _drawBalanceBar(tilt) {
    const g = this.balanceGfx;
    const x = this.balanceX, y = this.balanceY, hw = this.balanceW / 2;
    const warn  = Math.abs(tilt) >= BALANCE.WARN_AT;
    const blink = (Math.sin(this.time.now * 0.02) + 1) / 2;

    g.clear();
    // 트랙
    g.fillStyle(0x000000, 0.45);
    g.fillRoundedRect(x - hw - 10, y - 16, this.balanceW + 20, 32, 10);
    // 안전 구역(중앙) 표시
    g.fillStyle(0x2ecc71, 0.18);
    g.fillRect(x - hw * BALANCE.WARN_AT, y - 12, this.balanceW * BALANCE.WARN_AT, 24);
    // 중앙 기준선
    g.fillStyle(0xffffff, 0.6);
    g.fillRect(x - 1.5, y - 14, 3, 28);

    // 마커
    const t  = Math.max(-1, Math.min(1, tilt / BALANCE.WIPEOUT_AT));
    const mx = x + t * hw;
    const col = warn ? 0xff3b30 : 0x4fc3f7;
    const a   = warn ? 0.5 + blink * 0.5 : 1;
    g.fillStyle(col, a);
    g.fillRoundedRect(mx - 10, y - 18, 20, 36, 6);
  }

  _dashedLine(g, x1, y, x2) {
    const dash = 14, gap = 10;
    for (let x = x1; x < x2; x += dash + gap) {
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(Math.min(x + dash, x2), y);
      g.strokePath();
    }
  }
}
