import Phaser from 'phaser';
import {
  LOGICAL_WIDTH, LOGICAL_HEIGHT, RIDE_TOP_Y, RIDE_BOTTOM_Y, DANGER_TOP_Y,
} from '../constants.js';
import { Player } from '../player.js';
import { ObstacleManager } from '../obstacle.js';
import { ScoreManager } from '../score.js';
import { StorageManager } from '../storage.js';
import { STAGES } from '../stages.js';

const BACKGROUND_THEMES = Object.freeze({
  jeju: {
    sky:    [0x89d9ff, 0x46a9d6, 0x1e78b8],
    sea:    [0x1e75bb, 0x0d4d86, 0x062945],
    clouds: 0.85,
    island: { color: 0x2f735e, alpha: 0.34, y: 0.37 },
    waveTint: 0xa0d7ff,
    sparkle: 0.55,
  },
  jeju_coast: {
    sky:    [0xb6f0ff, 0x58c7dc, 0x1596b5],
    sea:    [0x19a6b5, 0x05768c, 0x03475d],
    clouds: 0.78,
    island: { color: 0x2f8065, alpha: 0.42, y: 0.39 },
    reef:   { color: 0x83d9c7, alpha: 0.16 },
    waveTint: 0xd5fff8,
    sparkle: 0.7,
  },
  south_jeju: {
    sky:    [0x8fcdf8, 0x3e91d0, 0x1d5c9a],
    sea:    [0x1669ae, 0x0a3c78, 0x041c3a],
    clouds: 0.65,
    island: { color: 0x214e69, alpha: 0.28, y: 0.35 },
    swell:  1.25,
    waveTint: 0xc6e7ff,
    sparkle: 0.42,
  },
  east_china_sea: {
    sky:    [0xc7e9f5, 0x80bfd1, 0x4f8cab],
    sea:    [0x276f9f, 0x15527b, 0x092d4f],
    clouds: 0.9,
    mist:   { color: 0xffffff, alpha: 0.16 },
    waveTint: 0xd7eef7,
    sparkle: 0.36,
  },
  okinawa: {
    sky:    [0x9beaff, 0x3fc9d3, 0x1395b0],
    sea:    [0x12b9bb, 0x087b98, 0x043f63],
    clouds: 0.72,
    reef:   { color: 0xffdd8a, alpha: 0.18 },
    waveTint: 0xe3fff4,
    sparkle: 0.78,
  },
  philippines: {
    sky:    [0xb7d3e8, 0x6d94b3, 0x3e5d83],
    sea:    [0x245f8f, 0x123d68, 0x071f3b],
    clouds: 0.5,
    mist:   { color: 0xdde8f0, alpha: 0.22 },
    swell:  1.35,
    waveTint: 0xc4d8ea,
    sparkle: 0.24,
  },
  pacific_night: {
    sky:    [0x182c5c, 0x0c1d42, 0x030b20],
    sea:    [0x0d2f62, 0x071d3f, 0x020814],
    clouds: 0.28,
    stars:  true,
    swell:  1.15,
    waveTint: 0x81b7ff,
    sparkle: 0.8,
  },
  volcanic: {
    sky:    [0x5f6f86, 0x354b62, 0x231f2b],
    sea:    [0x234f6e, 0x183246, 0x0b1724],
    clouds: 0.35,
    volcanicGlow: true,
    swell:  1.28,
    waveTint: 0xffa866,
    sparkle: 0.28,
  },
  storm: {
    sky:    [0x657689, 0x39485d, 0x151d2e],
    sea:    [0x1c4966, 0x102b43, 0x06111f],
    clouds: 0.32,
    storm:  true,
    swell:  1.55,
    waveTint: 0xb7c7d8,
    sparkle: 0.12,
  },
  final: {
    sky:    [0x3b4258, 0x191f33, 0x070914],
    sea:    [0x132d52, 0x081a32, 0x020611],
    clouds: 0.22,
    storm:  true,
    stars:  true,
    swell:  1.75,
    waveTint: 0xd4e5ff,
    sparkle: 0.38,
  },
});

const TUTORIAL_STEPS = [
  { until:  3400, text: '↑ ↓ 방향키로 파도를 타고 오르내려요' },
  { until:  7000, text: '← → 로 균형을 잡으세요 — 무너지면 와이프아웃!' },
  { until: 10400, text: '신호가 뜬 자리에서 장애물이 솟구쳐요. 미리 피하세요' },
  { until: 13600, text: 'Space 로 점프 — 공중에선 균형이 잠시 안정돼요' },
  { until: 16800, text: '아슬아슬하게 스치며 피하면 니어미스 보너스!' },
];

export default class GameScene extends Phaser.Scene {
  constructor() { super({ key: 'GameScene' }); }

  init(data) {
    this.stageIndex = this._normalizeStageIndex(data.stageIndex);
  }

  create() {
    this.stage = STAGES[this.stageIndex] ?? STAGES[0];
    this.bgTheme = BACKGROUND_THEMES[this.stage.theme] ?? BACKGROUND_THEMES.jeju;
    this.stageTimer  = 0;
    this.worldOffset = 0;
    this._active     = true;
    this._wasInDanger = false;
    this._slowmoMs   = 0;

    this.bgGfx     = this.add.graphics().setDepth(0);
    this.dangerGfx = this.add.graphics().setDepth(4);

    this.storage         = new StorageManager();
    this.scoreManager    = new ScoreManager();
    this.player          = new Player(this);
    this.obstacleManager = new ObstacleManager(this);
    this.storage.setCurrentStage(this.stageIndex);
    this.obstacleManager.loadStage(this.stage);

    this.cursors  = this.input.keyboard.createCursorKeys();
    this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.pKey     = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.P);
    this.escKey   = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    this._setupTutorial();
    this._setupDangerText();

    this.scene.launch('HUDScene', { gameScene: this });
  }

  update(_time, delta) {
    if (!this._active) return;

    // Near-miss 슬로우모션: 실제 시간은 그대로, 게임 dt만 감속
    let dt = Math.min(delta, 50);
    if (this._slowmoMs > 0) {
      this._slowmoMs = Math.max(0, this._slowmoMs - delta);
      dt *= 0.45;
    }

    this.stageTimer  += dt;
    this.worldOffset += this.obstacleManager.scrollSpeed * (dt / 1000);

    this.player.update(dt, this.cursors, this.spaceKey);
    this.obstacleManager.update(dt, this.stageTimer, this.player);
    this.scoreManager.update(dt, this.player);
    this._resolveScoring();
    this._updateTutorial();

    if (this.player.wiped) { this._gameOver(null, 'wipeout'); return; }

    const hit = this.obstacleManager.checkCollision(this.player.hitbox);
    if (hit) { this._gameOver(hit, 'collision'); return; }

    if (this.stageTimer >= this.obstacleManager._stageDuration) {
      this._stageClear();
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.pKey) ||
        Phaser.Input.Keyboard.JustDown(this.escKey)) {
      this._pause();
    }

    this._renderBackground();
    this._renderDanger();
  }

  // 안전 통과한 분출들에 회피·니어미스·퍼펙트 점수 부여
  _resolveScoring() {
    const y = this.player.baseY;
    for (const obs of this.obstacleManager.collectResolved()) {
      this.scoreManager.onDodge(y);
      if (obs.jumpedOver) this.scoreManager.onPerfectJump(y);
      if (obs.grazed && !obs.jumpedOver) {
        this.scoreManager.onNearMiss(y);
        this._triggerSlowmo();
      }
    }
  }

  _triggerSlowmo() {
    this._slowmoMs = 200;
    this.cameras.main.flash(120, 180, 230, 255, false);
  }

  // ─── Background ─────────────────────────────────────────────────────────────
  _renderBackground() {
    const gfx = this.bgGfx;
    const W   = LOGICAL_WIDTH;
    const H   = LOGICAL_HEIGHT;
    const ox  = this.worldOffset;
    const t   = this.bgTheme;
    const swell = t.swell ?? 1;

    gfx.clear();

    // 스테이지 테마 색상으로 하늘·바다 그라데이션
    gfx.fillGradientStyle(t.sky[0], t.sky[0], t.sky[1], t.sky[1], 1);
    gfx.fillRect(0, 0, W, H * 0.24);
    gfx.fillGradientStyle(t.sky[1], t.sky[1], t.sky[2], t.sky[2], 1);
    gfx.fillRect(0, H * 0.24, W, H * 0.24);

    gfx.fillGradientStyle(t.sea[0], t.sea[0], t.sea[1], t.sea[1], 1);
    gfx.fillRect(0, H * 0.44, W, H * 0.28);
    gfx.fillGradientStyle(t.sea[1], t.sea[1], t.sea[2], t.sea[2], 1);
    gfx.fillRect(0, H * 0.72, W, H * 0.28);

    if (t.stars) this._drawStars(ox);
    this._drawClouds(ox * 0.08, t.clouds ?? 0.85);
    if (t.island) this._drawDistantIslands(ox * 0.05, t.island);
    if (t.mist) this._drawSeaMist(ox * 0.12, t.mist);
    if (t.reef) this._drawReefGlints(ox * 0.5, t.reef);
    if (t.volcanicGlow) this._drawVolcanicGlow(ox);
    if (t.storm) this._drawStormStreaks(ox);

    this._drawWaveLayer(ox * 0.18, H * 0.40, 16 * swell, t.waveTint, 0.26);
    this._drawWaveLayer(ox * 0.45, H * 0.53, 26 * swell, t.waveTint, 0.18);
    this._drawWaveLayer(ox * 0.75, H * 0.66, 38 * swell, 0xffffff, 0.12);
    this._drawDangerBand(ox);
    this._drawRideFace(ox);
    this._drawSparkles(ox, t.sparkle ?? 0.55);
  }

  // 라이딩 파도 면 — 서퍼가 타는 표면 곡선
  _drawRideFace(offset) {
    const gfx = this.bgGfx;
    const W   = LOGICAL_WIDTH;
    const H   = LOGICAL_HEIGHT;
    const baseY = RIDE_BOTTOM_Y + 26;

    gfx.fillStyle(0x0a3b6e, 0.55);
    gfx.beginPath();
    gfx.moveTo(0, baseY);
    for (let x = 0; x <= W; x += 6) {
      const y = baseY + Math.sin((x + offset) * 0.006) * 14 + Math.sin((x + offset) * 0.013 + 1) * 6;
      gfx.lineTo(x, y);
    }
    gfx.lineTo(W, H); gfx.lineTo(0, H); gfx.closePath(); gfx.fillPath();

    // 흰 포말 라인
    gfx.lineStyle(4, 0xffffff, 0.35);
    gfx.beginPath();
    gfx.moveTo(0, baseY);
    for (let x = 0; x <= W; x += 6) {
      const y = baseY + Math.sin((x + offset) * 0.006) * 14 + Math.sin((x + offset) * 0.013 + 1) * 6;
      x === 0 ? gfx.moveTo(x, y) : gfx.lineTo(x, y);
    }
    gfx.strokePath();
  }

  // 위험 구간(거친 바다) 띠 — 화면 하단
  _drawDangerBand(offset) {
    const gfx = this.bgGfx;
    const W   = LOGICAL_WIDTH;
    const top = DANGER_TOP_Y;

    gfx.fillStyle(0x05284a, 0.45);
    gfx.fillRect(0, top, W, LOGICAL_HEIGHT - top);

    // 거친 포말(whitecaps)
    gfx.fillStyle(0xffffff, 0.16);
    for (let i = 0; i < 26; i++) {
      const x = ((i * 121 + offset * 1.1) % (W + 120)) - 60;
      const y = top + 20 + ((i * 53) % (LOGICAL_HEIGHT - top - 40));
      gfx.fillCircle(x, y, 6 + (i % 3) * 4);
    }
  }

  _drawWaveLayer(offset, baseY, amp, color, alpha) {
    const gfx = this.bgGfx;
    const W   = LOGICAL_WIDTH;
    const H   = LOGICAL_HEIGHT;

    gfx.fillStyle(color, alpha);
    gfx.beginPath();
    const startY = baseY + Math.sin(offset * 0.0055) * amp + Math.sin(offset * 0.011 + 1.3) * amp * 0.4;
    gfx.moveTo(0, startY);
    for (let x = 4; x <= W; x += 4) {
      const y = baseY
        + Math.sin((x + offset) * 0.0055) * amp
        + Math.sin((x + offset) * 0.011 + 1.3) * amp * 0.4
        + Math.sin((x + offset) * 0.003 + 2.7) * amp * 0.6;
      gfx.lineTo(x, y);
    }
    gfx.lineTo(W, H); gfx.lineTo(0, H); gfx.closePath(); gfx.fillPath();
  }

  _drawClouds(offset, alpha) {
    const gfx  = this.bgGfx;
    const W    = LOGICAL_WIDTH;
    const TILE = 2400;
    const defs = [
      { rx: 200,  y: 72,  rw: 130, rh: 46 }, { rx: 580,  y: 48,  rw:  96, rh: 36 },
      { rx: 950,  y: 98,  rw: 152, rh: 52 }, { rx: 1380, y: 62,  rw: 115, rh: 42 },
      { rx: 1820, y: 85,  rw: 140, rh: 50 }, { rx: 2180, y: 55,  rw: 105, rh: 38 },
    ];
    gfx.fillStyle(0xffffff, alpha ?? 0.85);
    const scrolled = offset % TILE;
    for (const d of defs) {
      for (let tile = -1; tile <= 2; tile++) {
        const cx = d.rx - scrolled + tile * TILE;
        if (cx + d.rw * 1.6 < 0 || cx - d.rw * 1.6 > W) continue;
        gfx.fillEllipse(cx,                d.y,                d.rw * 2,   d.rh * 2);
        gfx.fillEllipse(cx - d.rw * 0.55, d.y + d.rh * 0.15, d.rw * 1.3, d.rh * 1.6);
        gfx.fillEllipse(cx + d.rw * 0.52, d.y + d.rh * 0.12, d.rw * 1.2, d.rh * 1.5);
      }
    }
  }

  _drawStars(offset) {
    const gfx = this.bgGfx;
    const W   = LOGICAL_WIDTH;
    const H   = LOGICAL_HEIGHT;

    for (let i = 0; i < 70; i++) {
      const x = (i * 173 + Math.sin(i) * 41) % W;
      const y = 24 + ((i * 67) % Math.round(H * 0.36));
      const alpha = 0.25 + (Math.sin(offset * 0.01 + i * 1.9) + 1) * 0.25;
      gfx.fillStyle(0xffffff, alpha);
      gfx.fillCircle(x, y, i % 8 === 0 ? 2.4 : 1.4);
    }
  }

  _drawDistantIslands(offset, island) {
    const gfx = this.bgGfx;
    const W   = LOGICAL_WIDTH;
    const H   = LOGICAL_HEIGHT;
    const y   = H * island.y;
    const scrolled = offset % W;

    gfx.fillStyle(island.color, island.alpha);
    for (let tile = -1; tile <= 1; tile++) {
      const x = tile * W - scrolled;
      gfx.beginPath();
      gfx.moveTo(x + 40, y + 34);
      gfx.lineTo(x + 250, y - 36);
      gfx.lineTo(x + 470, y + 20);
      gfx.lineTo(x + 670, y - 18);
      gfx.lineTo(x + 900, y + 40);
      gfx.lineTo(x + 40, y + 40);
      gfx.closePath();
      gfx.fillPath();
    }
  }

  _drawSeaMist(offset, mist) {
    const gfx = this.bgGfx;
    const W   = LOGICAL_WIDTH;
    const H   = LOGICAL_HEIGHT;

    gfx.fillStyle(mist.color, mist.alpha);
    for (let i = 0; i < 8; i++) {
      const x = ((i * 310 - offset) % (W + 260) + W + 260) % (W + 260) - 130;
      const y = H * 0.43 + Math.sin(offset * 0.01 + i) * 18;
      gfx.fillEllipse(x, y, 240, 28);
    }
  }

  _drawReefGlints(offset, reef) {
    const gfx = this.bgGfx;
    const W   = LOGICAL_WIDTH;
    const H   = LOGICAL_HEIGHT;

    gfx.fillStyle(reef.color, reef.alpha);
    for (let i = 0; i < 10; i++) {
      const x = ((i * 230 - offset) % W + W) % W;
      const y = H * 0.74 + Math.sin(i * 1.4) * 90;
      gfx.fillEllipse(x, y, 150, 18);
    }
  }

  _drawVolcanicGlow(offset) {
    const gfx = this.bgGfx;
    const W   = LOGICAL_WIDTH;
    const H   = LOGICAL_HEIGHT;
    const pulse = (Math.sin(offset * 0.012) + 1) * 0.5;

    gfx.fillStyle(0xff6b2f, 0.08 + pulse * 0.05);
    gfx.fillCircle(W * 0.72, H * 0.36, 210);
    gfx.fillStyle(0xffb15a, 0.08);
    gfx.fillCircle(W * 0.72, H * 0.36, 95);
  }

  _drawStormStreaks(offset) {
    const gfx = this.bgGfx;
    const W   = LOGICAL_WIDTH;
    const H   = LOGICAL_HEIGHT;

    gfx.lineStyle(2, 0xd9e8f4, 0.16);
    for (let i = 0; i < 28; i++) {
      const x = ((i * 91 - offset * 1.15) % (W + 140) + W + 140) % (W + 140) - 70;
      const y = (i * 53 + offset * 0.08) % H;
      gfx.beginPath();
      gfx.moveTo(x, y);
      gfx.lineTo(x - 34, y + 74);
      gfx.strokePath();
    }
  }

  _drawSparkles(offset, alphaScale) {
    const gfx = this.bgGfx;
    const W   = LOGICAL_WIDTH;
    for (let i = 0; i < 22; i++) {
      const x     = ((i * 97 + offset * 0.85) % W + W) % W;
      const y     = RIDE_TOP_Y + ((i * 71) % (RIDE_BOTTOM_Y - RIDE_TOP_Y));
      const alpha = (Math.sin(offset * 0.04 + i * 1.7) + 1) / 2 * (alphaScale ?? 0.4);
      gfx.fillStyle(0xffffff, alpha);
      gfx.fillCircle(x, y, 1.5 + Math.sin(i * 0.9) * 1);
    }
  }

  // ─── 위험 구간 연출 ───────────────────────────────────────────────────────────
  _setupDangerText() {
    this.dangerText = this.add.text(LOGICAL_WIDTH - 40, LOGICAL_HEIGHT / 2, '위험구간 ×1.5', {
      fontSize: '40px', fontFamily: 'sans-serif', color: '#ff5252', fontStyle: 'bold',
    }).setOrigin(1, 0.5).setDepth(5).setAngle(90).setVisible(false);
  }

  _renderDanger() {
    const inDanger = this.player.inDanger;
    const gfx = this.dangerGfx;
    gfx.clear();

    if (inDanger && !this._wasInDanger) {
      this.cameras.main.shake(180, 0.004);
    }
    this._wasInDanger = inDanger;

    if (!inDanger) { this.dangerText.setVisible(false); return; }

    const W = LOGICAL_WIDTH, H = LOGICAL_HEIGHT;
    const pulse = (Math.sin(this.stageTimer * 0.012) + 1) / 2;
    const a = 0.18 + pulse * 0.18;

    // 가장자리 비네트
    const t = 90;
    gfx.fillStyle(0xff3b30, a);
    gfx.fillRect(0, 0, W, t);
    gfx.fillRect(0, H - t, W, t);
    gfx.fillRect(0, 0, t, H);
    gfx.fillRect(W - t, 0, t, H);

    // 속도선
    gfx.fillStyle(0xffffff, 0.25 + pulse * 0.2);
    for (let i = 0; i < 7; i++) {
      const ly = 120 + i * 130;
      const lx = ((this.worldOffset * 2.2 + i * 260) % (W + 300)) - 150;
      gfx.fillRect(W - lx, ly, 120, 4);
    }

    this.dangerText.setVisible(true).setAlpha(0.6 + pulse * 0.4);
  }

  // ─── 인게임 튜토리얼 (1스테이지 첫 플레이) ──────────────────────────────────
  _setupTutorial() {
    this._tutorialActive = this.stageIndex === 0 && !this.storage.tutorialCompleted;
    if (!this._tutorialActive) return;

    const cx = LOGICAL_WIDTH / 2;
    const y  = LOGICAL_HEIGHT - 120;
    this._tutBg = this.add.graphics().setDepth(5);
    this._tutText = this.add.text(cx, y, '', {
      fontSize: '34px', fontFamily: 'sans-serif', color: '#ffffff', fontStyle: 'bold',
      align: 'center',
    }).setOrigin(0.5).setDepth(6);
    this._tutStep = -1;
  }

  _updateTutorial() {
    if (!this._tutorialActive) return;

    const step = TUTORIAL_STEPS.findIndex(s => this.stageTimer < s.until);
    if (step === -1) {
      this._tutorialActive = false;
      this.storage.markTutorialComplete();
      this._tutBg.destroy();
      this._tutText.destroy();
      return;
    }
    if (step === this._tutStep) return;
    this._tutStep = step;

    const text = TUTORIAL_STEPS[step].text;
    this._tutText.setText(text);
    const w = this._tutText.width + 64;
    const h = 72;
    const cx = LOGICAL_WIDTH / 2;
    const y  = LOGICAL_HEIGHT - 120;
    this._tutBg.clear();
    this._tutBg.fillStyle(0x000000, 0.6);
    this._tutBg.fillRoundedRect(cx - w / 2, y - h / 2, w, h, 14);
    this._tutBg.lineStyle(2, 0x4fc3f7, 0.8);
    this._tutBg.strokeRoundedRect(cx - w / 2, y - h / 2, w, h, 14);
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

  _gameOver(hitObstacle, cause = 'collision') {
    this._active = false;
    const summary = this.scoreManager.getSummary();
    this.storage.recordStageAttempt(this.stageIndex + 1, summary.total);
    this.scene.stop('HUDScene');
    this.scene.start('ResultScene', {
      cleared:     false,
      stageIndex:  this.stageIndex,
      summary,
      hitObstacle,
      cause,
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

  _normalizeStageIndex(stageIndex) {
    const parsed = Number(stageIndex);
    if (!Number.isInteger(parsed)) return 0;
    return Phaser.Math.Clamp(parsed, 0, STAGES.length - 1);
  }
}
