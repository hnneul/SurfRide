import Phaser from 'phaser';
import { LOGICAL_WIDTH, LOGICAL_HEIGHT } from '../constants.js';
import { Player } from '../player.js';
import { ObstacleManager } from '../obstacle.js';
import { ScoreManager } from '../score.js';
import { StorageManager } from '../storage.js';
import { STAGES } from '../stages.js';
import { OceanBackground } from '../oceanBackground.js';
import { GoldenFishManager } from '../goldenFish.js';

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
    this.stageTimer  = 0;
    this.worldOffset = 0;
    this._active     = true;
    this._wasInDanger = false;
    this._wasGrounded = true;
    this._slowmoMs   = 0;

    this.ocean     = new OceanBackground(this, this.stage.theme);
    this.dangerGfx = this.add.graphics().setDepth(4);

    this.storage         = new StorageManager();
    this.scoreManager    = new ScoreManager();
    this.player          = new Player(this);
    this.obstacleManager = new ObstacleManager(this);
    this.goldenFish      = new GoldenFishManager(this);
    this.storage.setCurrentStage(this.stageIndex);
    this.obstacleManager.loadStage(this.stage);

    this._setupWeather();

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

    this._updateWeather();
    this.player.update(dt, this.cursors, this.spaceKey);
    this.obstacleManager.update(dt, this.stageTimer, this.player);
    const caught = this.goldenFish.update(dt, this.player);
    for (let i = 0; i < caught; i++) this.scoreManager.onGoldenFish();
    if (caught > 0) this._onGoldenFish();
    this.scoreManager.update(dt, this.player);
    this._resolveScoring();
    this._handleSpray();
    this._updateTutorial();

    if (this.player.wiped) { this._gameOver(null, 'wipeout'); return; }

    if (!this.player.invulnerable) {
      const hit = this.obstacleManager.checkCollision(this.player);
      if (hit && this._onHit(hit)) { this._gameOver(hit, 'collision'); return; }
    }

    if (this.stageTimer >= this.obstacleManager._stageDuration) {
      this._stageClear();
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.pKey) ||
        Phaser.Input.Keyboard.JustDown(this.escKey)) {
      this._pause();
    }

    this._renderBackground(dt);
    this._renderDanger();
  }

  // 피격: 하트 차감·콤보 리셋·연출. 사망(하트 0)이면 true 반환 → 게임오버.
  _onHit(obstacle) {
    const dead = this.player.takeHit();
    this.scoreManager.onComboBreak();
    this.ocean.pulse();
    this.ocean.splash(this.player.x, this.player.y + 6, 1.8);
    this.cameras.main.shake(dead ? 320 : 180, dead ? 0.012 : 0.008);
    this.cameras.main.flash(140, 255, 90, 90, false);
    return dead;
  }

  // 점프 이륙·착지 순간에 물보라 분출
  _handleSpray() {
    const grounded = this.player.isGrounded;
    if (this._wasGrounded && !grounded) {
      this.ocean.splash(this.player.x, this.player.baseY + 12, 1.0);   // 이륙
    } else if (!this._wasGrounded && grounded) {
      this.ocean.splash(this.player.x, this.player.baseY + 14, 1.6);   // 착지
    }
    this._wasGrounded = grounded;
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
    this.ocean.pulse();
    this.ocean.splash(this.player.x, this.player.baseY + 8, 1.2);
    this.cameras.main.flash(120, 180, 230, 255, false);
  }

  _onGoldenFish() {
    this.ocean.pulse();
    this.cameras.main.flash(120, 255, 224, 120, false);
  }

  // ─── 기상 이변 구간 (구간 점수 ×2) ────────────────────────────────────────────
  // 스테이지 중반에 한 차례 발생. 활성 동안 ScoreManager가 구간 점수를 ×2 적립.
  _setupWeather() {
    const dur   = this.obstacleManager._stageDuration;
    const start = dur * 0.42;
    const end   = start + Math.min(13_000, dur * 0.22);
    this._weatherWindow = { start, end };
    this._weatherActive = false;
  }

  _updateWeather() {
    const w      = this._weatherWindow;
    const active = this.stageTimer >= w.start && this.stageTimer < w.end;
    if (active === this._weatherActive) return;

    this._weatherActive = active;
    this.scoreManager.setWeather(active);
    if (active) {
      this.cameras.main.flash(220, 120, 150, 220, false);
      this.cameras.main.shake(260, 0.005);
      this.ocean.pulse();
    }
  }

  // ─── Background (OceanBackground 위임) ──────────────────────────────────────
  _renderBackground(dt) {
    const scrollSpeed = this.obstacleManager.scrollSpeed;
    this.ocean.update({
      dt,
      scroll:    this.worldOffset,
      speedNorm: scrollSpeed / 540,
      combo:     this.scoreManager.combo,
      danger:    this.player.inDanger || this._weatherActive,
      jumping:   !this.player.isGrounded,
      playerX:   this.player.x,
      playerY:   this.player.baseY,
    });
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
    const prevHigh = this.storage.getHighScore(this.stageIndex + 1);
    this.storage.recordStageAttempt(this.stageIndex + 1, summary.total);
    this.scene.stop('HUDScene');
    this.scene.start('ResultScene', {
      cleared:     false,
      stageIndex:  this.stageIndex,
      summary,
      prevHigh,
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
    const prevHigh = this.storage.getHighScore(stageId);
    this.storage.updateStageResult(stageId, summary.total, stars);

    this.scene.stop('HUDScene');
    this.scene.start('ResultScene', {
      cleared:    true,
      stageIndex: this.stageIndex,
      summary,
      prevHigh,
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
