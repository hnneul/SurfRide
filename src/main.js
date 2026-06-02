import { Player } from './player.js';
import { LANE_Y, Lane } from './player.js';
import { ObstacleManager } from './obstacle.js';
import { ScoreManager } from './score.js';
import { STAGES } from './stages.js';
import { UIManager } from './ui.js';
import { StorageManager } from './storage.js';
import { LOGICAL_WIDTH, LOGICAL_HEIGHT, GameState } from './constants.js';

export { LOGICAL_WIDTH, LOGICAL_HEIGHT, GameState };

// ─── Game 클래스 ─────────────────────────────────────────────────────────────
class Game {
  constructor() {
    this.worldCanvas = document.getElementById('canvas-world');
    this.uiCanvas    = document.getElementById('canvas-ui');
    this.worldCtx    = this.worldCanvas.getContext('2d');
    this.uiCtx       = this.uiCanvas.getContext('2d');

    this.state        = GameState.MAIN;
    this.currentStage = 0;   // 0-indexed
    this.stageTimer   = 0;   // 경과 시간(ms)

    this.storage  = new StorageManager();
    this.score    = new ScoreManager();
    this.player   = new Player();
    this.obstacles = new ObstacleManager();
    this.ui       = new UIManager(this.uiCtx, this);

    this._lastTime = 0;
    this._rafId    = null;

    this._setupViewport();
    this._setupInputListeners();
    window.addEventListener('resize', () => this._setupViewport());
  }

  // 브라우저 창 크기에 맞춰 캔버스 스케일 조정
  _setupViewport() {
    const scaleX = window.innerWidth  / LOGICAL_WIDTH;
    const scaleY = window.innerHeight / LOGICAL_HEIGHT;
    const scale  = Math.min(scaleX, scaleY);

    const w = Math.round(LOGICAL_WIDTH  * scale);
    const h = Math.round(LOGICAL_HEIGHT * scale);

    for (const canvas of [this.worldCanvas, this.uiCanvas]) {
      canvas.width  = LOGICAL_WIDTH;
      canvas.height = LOGICAL_HEIGHT;
      canvas.style.width  = `${w}px`;
      canvas.style.height = `${h}px`;
    }

    this._scale = scale;
  }

  _setupInputListeners() {
    this.uiCanvas.style.pointerEvents = 'auto';
    this.uiCanvas.addEventListener('click', (e) => {
      const rect = this.uiCanvas.getBoundingClientRect();
      const lx = (e.clientX - rect.left) / this._scale;
      const ly = (e.clientY - rect.top)  / this._scale;
      this.ui.handleClick(lx, ly);
    });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyR' && this.state === GameState.RESULT) {
        this.startStage(this.currentStage);
      }
      if (e.code === 'Escape') {
        if (this.state === GameState.PLAYING) {
          this.changeState(GameState.PAUSED);
        } else if (this.state === GameState.PAUSED) {
          this.changeState(GameState.PLAYING);
        } else if (this.ui._showingControls) {
          this.ui._showingControls = false;
        }
      }
    });
  }

  get stageCount() { return STAGES.length; }

  _calcStars(stageId, summary) {
    const perfectTargets = { 1:2, 2:3, 3:4, 4:5, 5:6, 6:7, 7:8, 8:9, 9:10, 10:11 };
    const comboTargets   = { 1:1.4, 2:1.5, 3:1.6, 4:1.7, 5:1.8, 6:1.8, 7:1.9, 8:1.9, 9:2.0, 10:2.0 };
    const pt = perfectTargets[stageId] ?? 2;
    const ct = comboTargets[stageId]   ?? 1.4;
    if (summary.perfectJumps >= pt || summary.maxComboMultiplier >= ct) return 3;
    if (summary.perfectJumps >= 1  || summary.maxCombo >= 3)            return 2;
    return 1;
  }

  // ─── 상태 전환 ─────────────────────────────────────────────────────────────
  changeState(next) {
    const prev = this.state;
    this.state = next;

    if (next === GameState.PLAYING && prev === GameState.PAUSED) {
      // 일시정지 재개 — 루프 타임스탬프 리셋해서 dt 튐 방지
      this._lastTime = performance.now();
    }
    if (next === GameState.MAIN) {
      this.ui._showingControls = false;
    }
  }

  startStage(stageIndex) {
    this.currentStage = stageIndex;
    this.stageTimer   = 0;
    this.score.reset();
    this.player.reset();
    this.obstacles.loadStage(STAGES[stageIndex]);
    this.changeState(GameState.PLAYING);
  }

  // ─── 게임 루프 ─────────────────────────────────────────────────────────────
  start() {
    this._lastTime = performance.now();
    this._loop(this._lastTime);
  }

  _loop(timestamp) {
    const deltaMs = Math.min(timestamp - this._lastTime, 50); // 최대 50ms 클램프
    this._lastTime = timestamp;

    this._update(deltaMs);
    this._render();

    this._rafId = requestAnimationFrame((t) => this._loop(t));
  }

  _update(deltaMs) {
    if (this.state !== GameState.PLAYING) return;

    this.stageTimer += deltaMs;

    this.player.update(deltaMs);
    this.obstacles.update(deltaMs, this.stageTimer);
    this.score.update(deltaMs, this.player, this.obstacles);

    // 충돌 판정 → GAME OVER
    const hit = this.obstacles.checkCollision(this.player.hitbox);
    if (hit) {
      this._lastResultCleared = false;
      this._lastHitObstacle   = hit;
      this._lastTimeRemain    = Math.max(0, this.obstacles._stageDuration - this.stageTimer);
      this.changeState(GameState.RESULT);
      return;
    }

    // 타이머 만료 → 클리어
    if (this.stageTimer >= this.obstacles._stageDuration) {
      this.score.onStageClear();
      const stageId = this.currentStage + 1;
      const summary = this.score.getSummary();
      const stars   = this._calcStars(stageId, summary);
      this.storage.updateStageResult(stageId, summary.total, stars);
      this._lastResultCleared = true;
      this._lastClearStars    = stars;
      this._lastHitObstacle   = null;
      this._lastTimeRemain    = 0;
      this.changeState(GameState.RESULT);
    }
  }

  _render() {
    this.worldCtx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    this.uiCtx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    if (this.state === GameState.PLAYING || this.state === GameState.RESULT) {
      this._renderWorld();
    }

    this.ui.render(this.state);
  }

  // 임시 월드 렌더링: 배경 그라디언트 + 레인 가이드 + 장애물/플레이어
  _renderWorld() {
    const ctx = this.worldCtx;

    // 배경: 하늘 → 바다
    const grad = ctx.createLinearGradient(0, 0, 0, LOGICAL_HEIGHT);
    grad.addColorStop(0,    '#8fd2ff');
    grad.addColorStop(0.45, '#1d6fb8');
    grad.addColorStop(1,    '#0b2a4a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    // 레인 가이드 (점선)
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.setLineDash([12, 18]);
    ctx.lineWidth = 2;
    for (const lane of [Lane.TOP, Lane.MID, Lane.BOT]) {
      const y = LANE_Y[lane];
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(LOGICAL_WIDTH, y);
      ctx.stroke();
    }
    ctx.restore();

    // 장애물 + 신호
    this.obstacles.render(ctx);

    // 플레이어
    this.player.render(ctx);
  }
}

// ─── 진입점 ──────────────────────────────────────────────────────────────────
const game = new Game();
game.start();
