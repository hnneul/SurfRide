import { Lane, LANE_Y } from './constants.js';
import { LOGICAL_WIDTH } from './constants.js';

export const ObstacleType = Object.freeze({
  FLYING_FISH: 'FLYING_FISH',
  SHARK:       'SHARK',
  WHALE:       'WHALE',
  JELLYFISH:   'JELLYFISH',
  OCTOPUS:     'OCTOPUS',
  LIGHTNING:   'LIGHTNING',
});

export const SignalType = Object.freeze({
  SPLASH:   'SPLASH',
  FIN:      'FIN',
  SHADOW:   'SHADOW',
  GLOW:     'GLOW',
  TENTACLE: 'TENTACLE',
  FLASH:    'FLASH',
});

export const OBSTACLE_META = Object.freeze({
  [ObstacleType.FLYING_FISH]: { signalType: SignalType.SPLASH,   hitboxW:  80, hitboxH:  40 },
  [ObstacleType.SHARK]:       { signalType: SignalType.FIN,      hitboxW: 100, hitboxH:  60 },
  [ObstacleType.WHALE]:       { signalType: SignalType.SHADOW,   hitboxW: 200, hitboxH: 100 },
  [ObstacleType.JELLYFISH]:   { signalType: SignalType.GLOW,     hitboxW:  70, hitboxH:  70 },
  [ObstacleType.OCTOPUS]:     { signalType: SignalType.TENTACLE, hitboxW: 120, hitboxH:  80 },
  [ObstacleType.LIGHTNING]:   { signalType: SignalType.FLASH,    hitboxW:  40, hitboxH: 300 },
});

// ─── SignalInstance ───────────────────────────────────────────────────────────
class SignalInstance {
  constructor(event, spawnX, scene) {
    this.event    = event;
    this.type     = event.signalType ?? OBSTACLE_META[event.obstacleType].signalType;
    this.x        = spawnX;
    this.y        = LANE_Y[event.lane];
    this.duration = event.telegraphMs;
    this.elapsed  = 0;
    this.done     = false;
    this.gfx      = scene.add.graphics().setDepth(1);
  }

  get progress() { return Math.min(this.elapsed / this.duration, 1); }

  update(deltaMs) {
    this.elapsed += deltaMs;
    if (this.elapsed >= this.duration) this.done = true;
    this._redraw();
  }

  _redraw() {
    const p   = this.progress;
    const gfx = this.gfx;
    gfx.clear();

    if (this.type === SignalType.SPLASH) {
      const radius = 16 + p * 36;
      const alpha  = 1 - p * 0.6;
      gfx.lineStyle(4, 0xffffff, alpha);
      gfx.strokeCircle(this.x, this.y, radius);
      gfx.fillStyle(0xffffff, alpha);
      gfx.fillCircle(this.x, this.y, 6);

    } else if (this.type === SignalType.FIN) {
      const alpha = 1 - p * 0.5;
      gfx.fillStyle(0x1e466e, alpha);
      gfx.fillTriangle(
        this.x,      this.y - 32,
        this.x - 20, this.y + 12,
        this.x + 20, this.y + 12,
      );

    } else {
      gfx.fillStyle(0xffd700, 1 - p * 0.5);
      gfx.fillRect(this.x - 20, this.y - 20, 40, 40);
    }
  }

  destroy() { this.gfx.destroy(); }
}

// ─── ObstacleInstance ────────────────────────────────────────────────────────
class ObstacleInstance {
  constructor(event, spawnX, scene) {
    this.type   = event.obstacleType;
    this.lane   = event.lane;
    this.x      = spawnX;
    this.y      = LANE_Y[event.lane];
    this.active = true;
    this.passed = false;

    const meta   = OBSTACLE_META[this.type];
    this.hitboxW = meta.hitboxW;
    this.hitboxH = meta.hitboxH;

    if (this.type === ObstacleType.FLYING_FISH) {
      this.visual = scene.add.ellipse(this.x, this.y, this.hitboxW, this.hitboxH, 0xff8a3d)
        .setStrokeStyle(2, 0xffffff).setDepth(1);
      this.eye = scene.add.arc(this.x - this.hitboxW / 4, this.y - 4, 4, 0, 360, false, 0xffffff)
        .setDepth(1);
    } else {
      this.visual = scene.add.rectangle(this.x, this.y, this.hitboxW, this.hitboxH, 0x888888)
        .setDepth(1);
      this.eye = null;
    }
  }

  get hitbox() {
    return {
      x: this.x - this.hitboxW / 2,
      y: this.y - this.hitboxH / 2,
      w: this.hitboxW,
      h: this.hitboxH,
    };
  }

  update(deltaMs, scrollSpeed) {
    this.x -= scrollSpeed * (deltaMs / 1000);
    if (this.x < -200) this.active = false;
    this.visual.setPosition(this.x, this.y);
    if (this.eye) this.eye.setPosition(this.x - this.hitboxW / 4, this.y - 4);
  }

  destroy() {
    this.visual.destroy();
    this.eye?.destroy();
  }
}

// ─── ObstacleManager ─────────────────────────────────────────────────────────
export class ObstacleManager {
  constructor(scene) {
    this._scene           = scene;
    this._events          = [];
    this._eventIdx        = 0;
    this.signals          = [];
    this.obstacles        = [];
    this._pendingObstacles = [];
    this.scrollSpeed      = 600;
    this._signalX         = LOGICAL_WIDTH - 240;
    this._obstacleSpawnX  = LOGICAL_WIDTH + 100;
    this._stageDuration   = 60_000;
  }

  loadStage(stageData) {
    // Destroy any existing visuals
    for (const s of this.signals)   s.destroy();
    for (const o of this.obstacles) o.destroy();

    this._events           = [...stageData.events].sort((a, b) => a.t - b.t);
    this._eventIdx         = 0;
    this.signals           = [];
    this.obstacles         = [];
    this._pendingObstacles = [];
    this.scrollSpeed       = stageData.scrollSpeed  ?? 600;
    this._stageDuration    = stageData.duration     ?? 60_000;
  }

  update(deltaMs, stageTimerMs) {
    this._spawnFromScript(stageTimerMs);
    this._spawnPending(stageTimerMs);
    for (const sig of this.signals)   sig.update(deltaMs);
    for (const obs of this.obstacles) obs.update(deltaMs, this.scrollSpeed);
    this._cleanup();
  }

  _spawnFromScript(stageTimerMs) {
    while (
      this._eventIdx < this._events.length &&
      this._events[this._eventIdx].t <= stageTimerMs
    ) {
      const raw          = this._events[this._eventIdx++];
      const telegraphMs  = Math.max(500, raw.telegraphMs ?? 500);
      const ev           = telegraphMs === raw.telegraphMs ? raw : { ...raw, telegraphMs };

      this.signals.push(new SignalInstance(ev, this._signalX, this._scene));

      if (!ev.isFake) {
        this._pendingObstacles.push({ spawnAtMs: ev.t + telegraphMs, event: ev });
      }
    }
  }

  _spawnPending(stageTimerMs) {
    for (let i = this._pendingObstacles.length - 1; i >= 0; i--) {
      const p = this._pendingObstacles[i];
      if (p.spawnAtMs <= stageTimerMs) {
        this.obstacles.push(new ObstacleInstance(p.event, this._obstacleSpawnX, this._scene));
        this._pendingObstacles.splice(i, 1);
      }
    }
  }

  _cleanup() {
    for (const s of this.signals)   { if (s.done)    s.destroy(); }
    for (const o of this.obstacles) { if (!o.active) o.destroy(); }
    this.signals   = this.signals.filter(s => !s.done);
    this.obstacles = this.obstacles.filter(o => o.active);
  }

  checkCollision(playerHitbox) {
    for (const obs of this.obstacles) {
      if (obs.passed) continue;
      const o = obs.hitbox;
      const hit =
        playerHitbox.x < o.x + o.w &&
        playerHitbox.x + playerHitbox.w > o.x &&
        playerHitbox.y < o.y + o.h &&
        playerHitbox.y + playerHitbox.h > o.y;
      if (hit) return obs;
    }
    return null;
  }

  getJustPassed(playerX) {
    const passed = [];
    for (const obs of this.obstacles) {
      if (!obs.passed && obs.x + obs.hitboxW / 2 < playerX) {
        obs.passed = true;
        passed.push(obs);
      }
    }
    return passed;
  }

  destroyAll() {
    for (const s of this.signals)   s.destroy();
    for (const o of this.obstacles) o.destroy();
    this.signals   = [];
    this.obstacles = [];
  }
}
