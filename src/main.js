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

    this._lastTime    = 0;
    this._rafId       = null;
    this._worldOffset = 0;

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
    this._worldOffset = 0;
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

    this.stageTimer   += deltaMs;
    this._worldOffset += this.obstacles.scrollSpeed * (deltaMs / 1000);

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

    if (this.state === GameState.PLAYING ||
        this.state === GameState.PAUSED  ||
        this.state === GameState.RESULT) {
      this._renderWorld();
    }

    this.ui.render(this.state);
  }

  _renderWorld() {
    const ctx = this.worldCtx;
    const W   = LOGICAL_WIDTH;
    const H   = LOGICAL_HEIGHT;
    const ox  = this._worldOffset;

    // ── 하늘 그라디언트 ──────────────────────────────────────
    const skyGrad = ctx.createLinearGradient(0, 0, 0, H * 0.48);
    skyGrad.addColorStop(0,   '#87ceeb');
    skyGrad.addColorStop(0.6, '#4a9fd4');
    skyGrad.addColorStop(1,   '#2575b5');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, H * 0.48);

    // ── 바다 그라디언트 ──────────────────────────────────────
    const seaGrad = ctx.createLinearGradient(0, H * 0.44, 0, H);
    seaGrad.addColorStop(0,   '#1e6db5');
    seaGrad.addColorStop(0.4, '#0e3d72');
    seaGrad.addColorStop(1,   '#071e38');
    ctx.fillStyle = seaGrad;
    ctx.fillRect(0, H * 0.44, W, H);

    // ── 구름 (0.08x 패럴랙스) ────────────────────────────────
    this._drawClouds(ctx, ox * 0.08);

    // ── 파도 레이어 3개 (패럴랙스) ──────────────────────────
    this._drawWaveLayer(ctx, ox * 0.18, H * 0.40, 16, 'rgba(100,170,235,0.35)');
    this._drawWaveLayer(ctx, ox * 0.45, H * 0.53, 26, 'rgba(160,215,255,0.20)');
    this._drawWaveLayer(ctx, ox * 0.75, H * 0.66, 38, 'rgba(255,255,255,0.13)');

    // ── 수면 반짝임 ─────────────────────────────────────────
    this._drawSparkles(ctx, ox);

    // ── 레인 가이드 (스크롤 점선) ────────────────────────────
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.setLineDash([20, 24]);
    ctx.lineDashOffset = -(ox % 44);
    ctx.lineWidth = 2;
    for (const lane of [Lane.TOP, Lane.MID, Lane.BOT]) {
      ctx.beginPath();
      ctx.moveTo(0, LANE_Y[lane]);
      ctx.lineTo(W, LANE_Y[lane]);
      ctx.stroke();
    }
    ctx.restore();

    this.obstacles.render(ctx);
    this.player.render(ctx);
  }

  _drawWaveLayer(ctx, offset, baseY, amp, color) {
    const W = LOGICAL_WIDTH;
    const H = LOGICAL_HEIGHT;
    ctx.fillStyle = color;
    ctx.beginPath();
    const y0 = baseY
      + Math.sin(offset * 0.0055) * amp
      + Math.sin(offset * 0.011 + 1.3) * amp * 0.4
      + Math.sin(offset * 0.003 + 2.7) * amp * 0.6;
    ctx.moveTo(0, y0);
    for (let x = 4; x <= W; x += 4) {
      const y = baseY
        + Math.sin((x + offset) * 0.0055) * amp
        + Math.sin((x + offset) * 0.011  + 1.3) * amp * 0.4
        + Math.sin((x + offset) * 0.003  + 2.7) * amp * 0.6;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fill();
  }

  _drawClouds(ctx, offset) {
    const W    = LOGICAL_WIDTH;
    const TILE = 2400;
    const defs = [
      { rx: 200,  y: 72,  rw: 130, rh: 46 },
      { rx: 580,  y: 48,  rw: 96,  rh: 36 },
      { rx: 950,  y: 98,  rw: 152, rh: 52 },
      { rx: 1380, y: 62,  rw: 115, rh: 42 },
      { rx: 1820, y: 85,  rw: 140, rh: 50 },
      { rx: 2180, y: 55,  rw: 105, rh: 38 },
    ];
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    const scrolled = offset % TILE;
    for (const d of defs) {
      for (let tile = -1; tile <= 2; tile++) {
        const cx = d.rx - scrolled + tile * TILE;
        if (cx + d.rw * 1.6 < 0 || cx - d.rw * 1.6 > W) continue;
        ctx.beginPath();
        ctx.ellipse(cx, d.y, d.rw, d.rh, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(cx - d.rw * 0.55, d.y + d.rh * 0.15, d.rw * 0.65, d.rh * 0.8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(cx + d.rw * 0.52, d.y + d.rh * 0.12, d.rw * 0.60, d.rh * 0.75, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  _drawSparkles(ctx, offset) {
    const W = LOGICAL_WIDTH;
    for (let i = 0; i < 22; i++) {
      const x     = ((i * 97 + offset * 0.85) % W + W) % W;
      const y     = LANE_Y[Lane.TOP] + Math.sin(i * 2.1) * 200;
      const alpha = (Math.sin(offset * 0.04 + i * 1.7) + 1) / 2 * 0.55;
      const r     = 1.5 + Math.sin(i * 0.9) * 1;
      ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ─── 진입점 ──────────────────────────────────────────────────────────────────
const game = new Game();
game.start();
