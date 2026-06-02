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
    this.scene  = scene;
    this.type   = event.obstacleType;
    this.lane   = event.lane;
    this.x      = spawnX;
    this.y      = LANE_Y[event.lane];
    this.active = true;
    this.passed = false;
    this.ageMs  = 0;

    const meta   = OBSTACLE_META[this.type];
    this.hitboxW = meta.hitboxW;
    this.hitboxH = meta.hitboxH;
    this.parts   = {};

    this.visual = scene.add.container(this.x, this.y).setDepth(1);
    this._buildVisual();
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
    this.ageMs += deltaMs;
    this.x -= scrollSpeed * (deltaMs / 1000);
    if (this.x < -200) this.active = false;
    this.visual.setPosition(this.x, this.y);
    this._animateVisual();
  }

  destroy() {
    this.visual.destroy();
  }

  _buildVisual() {
    switch (this.type) {
      case ObstacleType.FLYING_FISH: this._buildFlyingFish(); break;
      case ObstacleType.SHARK:       this._buildShark();      break;
      case ObstacleType.WHALE:       this._buildWhale();      break;
      case ObstacleType.JELLYFISH:   this._buildJellyfish();  break;
      case ObstacleType.OCTOPUS:     this._buildOctopus();    break;
      case ObstacleType.LIGHTNING:   this._buildLightning();  break;
      default:                       this._buildFallback();   break;
    }
  }

  _buildFlyingFish() {
    const s = this.scene;
    const body = s.add.ellipse(0, 0, 82, 34, 0xff8a3d).setStrokeStyle(2, 0xffffff);
    const wingTop = s.add.triangle(-6, -14, -28, 0, 4, -48, 34, -7, 0xffd180, 0.88)
      .setStrokeStyle(2, 0xffffff, 0.65);
    const wingBot = s.add.triangle(-8, 12, -26, 0, 6, 40, 34, 5, 0xffcc80, 0.72);
    const tail = s.add.triangle(44, 0, 0, 0, 24, -20, 24, 20, 0xff7043);
    const eye = s.add.circle(-27, -6, 4, 0xffffff);
    const pupil = s.add.circle(-28, -6, 1.8, 0x111111);
    this.parts.wingTop = wingTop;
    this.parts.wingBot = wingBot;
    this.visual.add([wingBot, body, wingTop, tail, eye, pupil]);
  }

  _buildShark() {
    const s = this.scene;
    const shadow = s.add.ellipse(4, 12, 112, 32, 0x0a2036, 0.32);
    const body = s.add.ellipse(0, 0, 112, 46, 0x315f7f).setStrokeStyle(2, 0x9fd4f5, 0.85);
    const belly = s.add.ellipse(-10, 10, 72, 18, 0xd7edf7, 0.9);
    const nose = s.add.triangle(-58, 0, 0, 0, 22, -18, 22, 18, 0x315f7f);
    const tail = s.add.triangle(58, 0, 0, 0, 26, -24, 26, 24, 0x244a65);
    const fin = s.add.triangle(-2, -24, -24, 4, 2, -42, 24, 4, 0x183a58);
    const eye = s.add.circle(-34, -8, 3, 0xffffff);
    const pupil = s.add.circle(-35, -8, 1.5, 0x080808);
    this.parts.fin = fin;
    this.visual.add([shadow, tail, nose, body, belly, fin, eye, pupil]);
  }

  _buildWhale() {
    const s = this.scene;
    const shadow = s.add.ellipse(14, 24, 210, 40, 0x031321, 0.28);
    const body = s.add.ellipse(0, 0, 210, 94, 0x263f63).setStrokeStyle(3, 0x94b9d7, 0.9);
    const belly = s.add.ellipse(-16, 22, 132, 30, 0xb8d7e8, 0.92);
    const tailTop = s.add.triangle(106, -14, 0, 0, 38, -32, 32, 4, 0x1d324f);
    const tailBot = s.add.triangle(106, 14, 0, 0, 38, 32, 32, -4, 0x1d324f);
    const flipper = s.add.triangle(-8, 32, -40, 0, 6, 42, 36, 6, 0x172a43);
    const spray1 = s.add.line(-62, -52, 0, 0, -14, -22, 0xcef3ff, 0.65).setLineWidth(4);
    const spray2 = s.add.line(-62, -52, 0, 0, 14, -22, 0xcef3ff, 0.65).setLineWidth(4);
    const eye = s.add.circle(-62, -12, 3, 0xffffff);
    const pupil = s.add.circle(-63, -12, 1.4, 0x080808);
    this.parts.spray1 = spray1;
    this.parts.spray2 = spray2;
    this.visual.add([shadow, tailTop, tailBot, body, belly, flipper, spray1, spray2, eye, pupil]);
  }

  _buildJellyfish() {
    const s = this.scene;
    const glow = s.add.ellipse(0, 0, 92, 92, 0x9cfff6, 0.18);
    const bell = s.add.ellipse(0, -8, 74, 54, 0xb76dff, 0.82).setStrokeStyle(2, 0xf7d7ff, 0.9);
    const cap = s.add.arc(0, -10, 36, 180, 360, false, 0xe5b6ff, 0.65);
    const tentacles = [];
    for (let i = -2; i <= 2; i++) {
      const line = s.add.line(i * 13, 22, 0, 0, i * 6, 36, 0xead7ff, 0.8).setLineWidth(4);
      tentacles.push(line);
    }
    this.parts.glow = glow;
    this.parts.tentacles = tentacles;
    this.visual.add([glow, bell, cap, ...tentacles]);
  }

  _buildOctopus() {
    const s = this.scene;
    const body = s.add.ellipse(0, -12, 86, 72, 0x9b4dd8).setStrokeStyle(2, 0xf1d5ff, 0.88);
    const headGlow = s.add.ellipse(0, -18, 48, 34, 0xcc8cff, 0.5);
    const eyes = [
      s.add.circle(-16, -20, 8, 0xffffff),
      s.add.circle(16, -20, 8, 0xffffff),
      s.add.circle(-17, -20, 3.5, 0x111111),
      s.add.circle(15, -20, 3.5, 0x111111),
    ];
    const tentacles = [];
    for (let i = -3; i <= 3; i++) {
      const line = s.add.line(i * 13, 24, 0, 0, i * 9, 30 + Math.abs(i) * 7, 0x7b2dbb).setLineWidth(9);
      tentacles.push(line);
    }
    this.parts.tentacles = tentacles;
    this.visual.add([...tentacles, body, headGlow, ...eyes]);
  }

  _buildLightning() {
    const s = this.scene;
    const glow = s.add.rectangle(0, 0, 72, 320, 0xfff59d, 0.13);
    const bolt = s.add.graphics();
    bolt.fillStyle(0xffeb3b, 1);
    bolt.lineStyle(5, 0xffffff, 0.95);
    bolt.beginPath();
    bolt.moveTo(6, -150);
    bolt.lineTo(-26, -24);
    bolt.lineTo(4, -24);
    bolt.lineTo(-12, 148);
    bolt.lineTo(34, -62);
    bolt.lineTo(4, -62);
    bolt.closePath();
    bolt.fillPath();
    bolt.strokePath();
    const core = s.add.line(6, -142, 0, 0, -10, 140, 0xffffff, 0.85).setLineWidth(3);
    this.parts.glow = glow;
    this.visual.add([glow, bolt, core]);
  }

  _buildFallback() {
    this.visual.add(
      this.scene.add.rectangle(0, 0, this.hitboxW, this.hitboxH, 0x888888)
    );
  }

  _animateVisual() {
    const t = this.ageMs / 1000;
    if (this.type === ObstacleType.FLYING_FISH) {
      this.visual.y = this.y + Math.sin(t * 9) * 5;
      this.parts.wingTop.rotation = Math.sin(t * 13) * 0.18;
      this.parts.wingBot.rotation = -Math.sin(t * 13) * 0.12;
    } else if (this.type === ObstacleType.SHARK) {
      this.parts.fin.y = Math.sin(t * 8) * 3;
    } else if (this.type === ObstacleType.WHALE) {
      this.parts.spray1.alpha = 0.45 + Math.sin(t * 5) * 0.25;
      this.parts.spray2.alpha = 0.45 + Math.cos(t * 5) * 0.25;
    } else if (this.type === ObstacleType.JELLYFISH) {
      const pulse = 1 + Math.sin(t * 5) * 0.08;
      this.parts.glow.setScale(pulse);
      this.parts.tentacles.forEach((line, i) => { line.rotation = Math.sin(t * 4 + i) * 0.12; });
    } else if (this.type === ObstacleType.OCTOPUS) {
      this.parts.tentacles.forEach((line, i) => { line.rotation = Math.sin(t * 5 + i * 0.7) * 0.16; });
    } else if (this.type === ObstacleType.LIGHTNING) {
      this.parts.glow.alpha = 0.1 + Math.random() * 0.16;
    }
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
