import {
  eventLaneX, lateralFracFromX, RIDE_TOP_Y, RIDE_BOTTOM_Y, RIDE_FIXED_Y, TARGET_RATIO,
  GRAZE_MARGIN,
} from './constants.js';

// 너울 타고 다가오는 장애물 — 먼 수평선(RIDE_TOP_Y)에서 근경(RIDE_BOTTOM_Y)으로 이동.
// 서퍼 깊이(RIDE_FIXED_Y)를 지나는 순간이 충돌 창 → 좌우(←/→)로 비켜 피한다.
const TRAVEL_MS = 2200;   // 먼→근 이동 시간(=다가오는 시간)
const FADE_MS   = 280;    // 등장 페이드인

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

// avoid: 'jump' = 점프로 넘기(낮은 장애물) | 'move' = 점프 무효, ↑↓로 위치 이동
//        'dive' = 잠수로 통과(위에 뜬 장애물) — Shift 덕다이브, 안 하면 ↑↓로 비켜야
// visualScale: 3D 메시 크기 배율 — 보이는 크기를 hitbox에 맞춰 '안 닿았는데 맞음/닿았는데 안 맞음'을
//   줄이는 튜닝 값(렌더 전용, three/obstacles.js가 사용). 1.0=메시 설계 크기. 얇은 상어 지느러미는
//   넓은 hitbox를 못 채워 키움. 느낌 기반이니 플레이하며 조정.
export const OBSTACLE_META = Object.freeze({
  [ObstacleType.FLYING_FISH]: { signalType: SignalType.SPLASH,   name: '날치',   signalName: '물보라', hitboxW:  56, hitboxH:  48, avoid: 'jump', visualScale: 1.0 },
  [ObstacleType.SHARK]:       { signalType: SignalType.FIN,      name: '상어',   signalName: '등지느러미', hitboxW: 100, hitboxH:  48, avoid: 'move', visualScale: 1.3 },
  [ObstacleType.WHALE]:       { signalType: SignalType.SHADOW,   name: '고래',   signalName: '바닷속 그림자', hitboxW: 200, hitboxH: 100, avoid: 'move', visualScale: 1.0 },
  [ObstacleType.JELLYFISH]:   { signalType: SignalType.GLOW,     name: '해파리', signalName: '빛나는 점', hitboxW:  70, hitboxH:  50, avoid: 'dive', visualScale: 1.0 },
  [ObstacleType.OCTOPUS]:     { signalType: SignalType.TENTACLE, name: '문어',   signalName: '다리 그림자', hitboxW: 120, hitboxH:  72, avoid: 'jump', visualScale: 1.0 },
  [ObstacleType.LIGHTNING]:   { signalType: SignalType.FLASH,    name: '번개',   signalName: '섬광', hitboxW:  55, hitboxH: 160, avoid: 'move', visualScale: 1.15 },
});

// ─── SignalInstance (예고 신호 — 6종 고유 비주얼) ─────────────────────────────
class SignalInstance {
  constructor(event, spawnX, scene) {
    this.scene    = scene;
    this.event    = event;
    this.type     = event.signalType ?? OBSTACLE_META[event.obstacleType].signalType;
    this.variant  = event.variant ?? null;
    this.x        = spawnX;
    this.y        = RIDE_FIXED_Y;
    this.duration = event.telegraphMs;
    this.targeted = !!event.targeted;
    this.isFake   = !!event.isFake;
    this.elapsed  = 0;
    this.done     = false;
    this._told    = false;       // 등장 직전 tell 1회성
    this.gfx      = scene.add.graphics().setDepth(1);
  }

  get progress() { return Math.min(this.elapsed / this.duration, 1); }

  update(deltaMs) {
    this.elapsed += deltaMs;
    if (this.elapsed >= this.duration) this.done = true;
    // 실제 공격 직전 tell: 짧은 화면 흔들림(가짜 신호는 블러핑 — tell 없음)
    if (!this._told && !this.isFake && this.progress >= 0.8) {
      this._told = true;
      this.scene.cameras.main.shake(90, 0.0022);
    }
    this._redraw();
  }

  _redraw() {
    const p   = this.progress;
    const gfx = this.gfx;
    const x   = this.x;
    const y   = this.y;
    gfx.clear();

    switch (this.type) {
      case SignalType.SPLASH: {        // 날치 — 물 튀는 확장 링
        const r = 16 + p * 38;
        const burst = this.variant === 'burst';
        gfx.lineStyle(burst ? 6 : 4, burst ? 0xff4d35 : 0xffffff, 1 - p * 0.6);
        gfx.strokeCircle(x, y, r);
        if (burst) {
          const blink = (Math.sin(this.elapsed * 0.035) + 1) / 2;
          gfx.fillStyle(0xff3d25, 0.18 + blink * 0.18);
          gfx.fillCircle(x, y, 42 + p * 20);
          gfx.lineStyle(3, 0xffd1c8, 0.55 + blink * 0.35);
          gfx.strokeCircle(x, y, 18 + p * 48);
        }
        gfx.fillStyle(burst ? 0xffb07a : 0xbfe7ff, 1 - p * 0.5);
        gfx.fillCircle(x, y - p * 24, 6);
        gfx.fillCircle(x + 14, y - p * 14, 4);
        gfx.fillCircle(x - 12, y - p * 18, 4);
        break;
      }
      case SignalType.FIN: {           // 상어 — 등지느러미 + 항적선
        const a = 1 - p * 0.4;
        gfx.fillStyle(0x12324f, a);
        gfx.fillTriangle(x, y - 34, x - 22, y + 14, x + 22, y + 14);
        gfx.lineStyle(3, 0xffffff, a * 0.6);
        gfx.beginPath();
        gfx.moveTo(x + 22, y + 12);
        gfx.lineTo(x + 70 + p * 40, y + 12);
        gfx.strokePath();
        break;
      }
      case SignalType.SHADOW: {        // 고래 — 떠오르는 거대한 어두운 그림자
        const w = 120 + p * 130;
        const h = 50 + p * 60;
        gfx.fillStyle(0x041f3a, 0.25 + p * 0.45);
        gfx.fillEllipse(x, y + (1 - p) * 40, w, h);
        gfx.fillStyle(0x0a3a63, 0.3);
        gfx.fillEllipse(x, y + (1 - p) * 40, w * 0.6, h * 0.55);
        break;
      }
      case SignalType.GLOW: {          // 해파리 — 맥동하는 발광 원
        const pulse = (Math.sin(this.elapsed * 0.018) + 1) / 2;
        gfx.fillStyle(0x7af7e0, 0.10 + pulse * 0.18);
        gfx.fillCircle(x, y, 30 + pulse * 16 + p * 14);
        gfx.fillStyle(0xd4fff6, 0.5 + pulse * 0.4);
        gfx.fillCircle(x, y, 8 + pulse * 4);
        break;
      }
      case SignalType.TENTACLE: {      // 문어 — 솟아오르는 구불구불한 다리
        const a = 0.35 + p * 0.5;
        gfx.lineStyle(7, 0x6a2db5, a);
        for (let t = -1; t <= 1; t++) {
          const baseX = x + t * 26;
          gfx.beginPath();
          gfx.moveTo(baseX, y + 50);
          for (let s = 0; s <= 1.01; s += 0.12) {
            const ty = y + 50 - s * (40 + p * 50);
            const tx = baseX + Math.sin(s * 6 + this.elapsed * 0.012 + t) * 14;
            gfx.lineTo(tx, ty);
          }
          gfx.strokePath();
        }
        break;
      }
      case SignalType.FLASH: {         // 번개 — 섬광 + 경고 번개 윤곽
        const blink = (Math.sin(this.elapsed * 0.045) + 1) / 2;
        gfx.fillStyle(0xfff7a0, (0.08 + blink * 0.22) * (0.4 + p * 0.6));
        gfx.fillRect(x - 26, y - 150, 52, 300);
        gfx.lineStyle(4, 0xfff04d, 0.5 + blink * 0.5);
        gfx.beginPath();
        gfx.moveTo(x, y - 150);
        gfx.lineTo(x - 16, y - 40);
        gfx.lineTo(x + 8, y - 40);
        gfx.lineTo(x - 14, y + 90);
        gfx.strokePath();
        break;
      }
      default: {
        gfx.fillStyle(0xffd700, 1 - p * 0.5);
        gfx.fillRect(x - 20, y - 20, 40, 40);
      }
    }

    // 등장 직전 tell: 신호가 밝게 번쩍이며 곧 공격이 옴을 알림(가짜 신호 제외)
    if (!this.isFake && p >= 0.8) {
      const f     = (p - 0.8) / 0.2;              // 0→1
      const blink = (Math.sin(this.elapsed * 0.05) + 1) / 2;
      gfx.lineStyle(3 + f * 3, 0xffffff, (0.3 + blink * 0.5) * f);
      gfx.strokeCircle(x, y, 22 + f * 30);
    }

    // 타겟 분출: '너를 노린다' 조준 레티클 (빨강 점멸 링 + 십자선)
    if (this.targeted) {
      const blink = (Math.sin(this.elapsed * 0.03) + 1) / 2;
      const r     = 30 + (1 - p) * 26;           // 좁혀지는 조준원
      gfx.lineStyle(3, 0xff3b30, 0.55 + blink * 0.45);
      gfx.strokeCircle(x, y, r);
      gfx.lineStyle(2, 0xff6b5e, 0.5 + blink * 0.4);
      gfx.beginPath();
      gfx.moveTo(x - r - 8, y); gfx.lineTo(x - r + 10, y);
      gfx.moveTo(x + r - 10, y); gfx.lineTo(x + r + 8, y);
      gfx.moveTo(x, y - r - 8); gfx.lineTo(x, y - r + 10);
      gfx.moveTo(x, y + r - 10); gfx.lineTo(x, y + r + 8);
      gfx.strokePath();
    }
  }

  destroy() { this.gfx.destroy(); }
}

// ─── ObstacleInstance ────────────────────────────────────────────────────────
const OBSTACLE_COLOR = {
  [ObstacleType.FLYING_FISH]: 0xff8a3d,
  [ObstacleType.SHARK]:       0x4a5a6a,
  [ObstacleType.WHALE]:       0x123a5e,
  [ObstacleType.JELLYFISH]:   0xc77dff,
  [ObstacleType.OCTOPUS]:     0x7a2db5,
  [ObstacleType.LIGHTNING]:   0xffe14d,
};

const OBSTACLE_TEXTURE_KEY = {
  [ObstacleType.FLYING_FISH]: 'obstacle-flying-fish',
  [ObstacleType.SHARK]:       'obstacle-shark',
  [ObstacleType.WHALE]:       'obstacle-whale',
  [ObstacleType.JELLYFISH]:   'obstacle-jellyfish',
  [ObstacleType.OCTOPUS]:     'obstacle-octopus',
  [ObstacleType.LIGHTNING]:   'obstacle-lightning',
};

const FLYING_FISH_TEXTURE_KEY = {
  small: 'obstacle-flying-fish-small',
  burst: 'obstacle-flying-fish-burst',
};

// 분출 단계 머신: RISE(솟구침) → ACTIVE(노출) → SINK(가라앉음) → done.
// 이벤트별 좌우 위치(x)에서 제자리 분출 — 깊이(y)는 RIDE_FIXED_Y 고정, 좌우로 회피한다.
class ObstacleInstance {
  constructor(event, spawnX, scene) {
    this.scene   = scene;
    this.type    = event.obstacleType;
    this.variant = this.type === ObstacleType.FLYING_FISH ? (event.variant ?? 'small') : null;
    this.targetY = RIDE_TOP_Y;   // 먼 수평선에서 시작 → RIDE_FIXED_Y(서퍼 깊이)로 다가옴
    this.x       = spawnX;
    this.y       = this.targetY;
    this.active  = true;

    this.ageMs   = 0;
    this.reveal  = 0;          // 0(숨음)~1(완전 노출) — 등장 페이드인
    this.passed  = false;      // 서퍼 깊이 통과(회피 확정) 여부

    // 판정/스코어 상태
    this.grazed        = false;   // 그레이즈(아슬아슬) 진입 여부
    this.jumpedOver    = false;   // 점프로 넘었는지
    this.resolved      = false;   // 안전 통과 처리 완료
    this.hitByPlayer   = false;

    const meta = OBSTACLE_META[this.type];
    const burstFlyingFish = this.type === ObstacleType.FLYING_FISH && this.variant === 'burst';
    this.hitboxW = burstFlyingFish ? 64 : meta.hitboxW;
    this.hitboxH = burstFlyingFish ? 60 : meta.hitboxH;
    this.visualScale = burstFlyingFish ? 1.16 : (meta.visualScale ?? 1);   // 3D 메시 크기 배율(three/obstacles.js)
    this.avoidMode = meta.avoid;                            // 'jump' | 'move'
    this.fromAbove = this.type === ObstacleType.LIGHTNING;  // 번개는 위→아래
    this.parts   = {};

    // 분출 비주얼: 부위별로 조립한 디테일 아트(컨테이너). 분출 단계에 따라 스케일/알파 적용.
    this.visual = scene.add.container(this.x, this.y).setDepth(2);
    this._buildVisual();
  }

  // 충분히 솟은 동안만 충돌 유효(완전히 가라앉기 직전 제외)
  get collidable() {
    return this.active && this.reveal > 0.55 && !this.passed;
  }

  get hitbox() {
    // 분출(reveal) 비례로 세로를 줄임 — 덜 솟은 동안엔 보이는 만큼만 판정(솟는 중 오판 방지)
    const r = Math.max(0.001, Math.min(1, this.reveal ?? 1));
    const h = this.hitboxH * r;
    return {
      x: this.x - this.hitboxW / 2,
      y: this.y - h / 2,
      w: this.hitboxW,
      h,
    };
  }

  get grazebox() {
    return {
      x: this.x - this.hitboxW / 2 - GRAZE_MARGIN,
      y: this.y - this.hitboxH / 2 - GRAZE_MARGIN,
      w: this.hitboxW + GRAZE_MARGIN * 2,
      h: this.hitboxH + GRAZE_MARGIN * 2,
    };
  }

  update(deltaMs) {
    this.ageMs += deltaMs;
    const f = Math.min(1, this.ageMs / TRAVEL_MS);
    this.targetY = RIDE_TOP_Y + (RIDE_BOTTOM_Y - RIDE_TOP_Y) * f;       // 먼 수평선 → 근경(다가옴)
    this.reveal  = Math.min(1, this.ageMs / FADE_MS);                   // 등장 페이드인
    if (f >= 1) { this.active = false; this.passed = true; }            // 끝까지 쓸려가면 회피 확정(맨 아래 라이딩 보정)
    this._applyVisual();
    this._animateVisual();
  }

  _buildVisual() {
    if (this._buildPixelSprite()) return;

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

  _buildPixelSprite() {
    const key = this.type === ObstacleType.FLYING_FISH
      ? FLYING_FISH_TEXTURE_KEY[this.variant] ?? FLYING_FISH_TEXTURE_KEY.small
      : OBSTACLE_TEXTURE_KEY[this.type];
    if (!key || !this.scene.textures.exists(key)) return false;

    const img = this.scene.add.image(0, 0, key)
      .setOrigin(0.5)
      .setDisplaySize(
        this.hitboxW * (this.variant === 'burst' ? 1.22 : 1.08),
        this.hitboxH * (this.variant === 'burst' ? 1.34 : 1.22),
      );

    this.parts.sprite = img;
    this.parts.spriteBaseScaleX = img.scaleX;
    this.parts.spriteBaseScaleY = img.scaleY;
    this.visual.add(img);
    return true;
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
    if (this.parts.sprite) {
      this.parts.sprite.setScale(
        this.parts.spriteBaseScaleX * (1 + Math.sin(t * 8) * 0.025),
        this.parts.spriteBaseScaleY * (1 + Math.cos(t * 7) * 0.025),
      );
      if (this.type === ObstacleType.FLYING_FISH) this.visual.y = this.y + Math.sin(t * 9) * 5;
      if (this.type === ObstacleType.LIGHTNING) this.parts.sprite.alpha = 0.78 + Math.random() * 0.22;
    } else if (this.type === ObstacleType.FLYING_FISH) {
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

  _applyVisual() {
    // 충돌·3D는 targetY(이동 깊이)를 쓴다. 아래 Phaser 비주얼은 숨김 캔버스라 안 보임(상태만 추종).
    this.y = this.targetY;
    this.visual.setPosition(this.x, this.y);
    this.visual.setScale(0.8 + 0.2 * this.reveal, Math.max(0.12, this.reveal));
    this.visual.setAlpha(this.reveal);
  }

  // 안전 통과(분출 종료) 시점 — 한 번만 resolved 처리
  isResolved() {
    return this.passed;   // 서퍼 깊이를 통과 = 안전 회피(점수)
  }

  destroy() { this.visual.destroy(); }
}

// ─── ObstacleManager ─────────────────────────────────────────────────────────
export class ObstacleManager {
  constructor(scene) {
    this._scene            = scene;
    this._events           = [];
    this._eventIdx         = 0;
    this.signals           = [];
    this.obstacles         = [];
    this._pendingObstacles = [];
    this._resolvedQueue    = [];
    this.scrollSpeed       = 600;          // 배경 패럴랙스 속도(분출엔 미사용)
    // 신호·분출 x는 이벤트별 좌우 위치(eventLaneX), 깊이 y는 RIDE_FIXED_Y 고정 → 좌우 회피.
    this._stageDuration    = 60_000;
  }

  loadStage(stageData) {
    for (const s of this.signals)   s.destroy();
    for (const o of this.obstacles) o.destroy();

    this._events           = [...stageData.events].sort((a, b) => a.t - b.t);
    this._eventIdx         = 0;
    this.signals           = [];
    this.obstacles         = [];
    this._pendingObstacles = [];
    this._resolvedQueue    = [];
    this.scrollSpeed       = stageData.scrollSpeed ?? 600;
    this._stageDuration    = stageData.duration    ?? 60_000;
  }

  update(deltaMs, stageTimerMs, player) {
    this._spawnFromScript(stageTimerMs, player);
    this._spawnPending(stageTimerMs);
    for (const sig of this.signals)   sig.update(deltaMs);
    for (const obs of this.obstacles) {
      obs.update(deltaMs);
      if (player) this._trackPlayer(obs, player);
    }
    this._cleanup();
  }

  // 그레이즈/점프 통과 감지 + 안전 통과 시점을 resolvedQueue에 적재
  _trackPlayer(obs, player) {
    if (obs.collidable) {
      // 그레이즈도 충돌과 같은 레인(파도면 baseY) 기준 — 점프 중 위쪽 다른 레인을
      // 훑고 지나갈 때 생기던 '허깨비 아슬아슬'을 막는다(checkCollision 주석 참고).
      const hb = player.groundHitbox;
      if (!this._aabb(hb, obs.hitbox) && this._aabb(hb, obs.grazebox)) obs.grazed = true;
      // 퍼펙트 점프는 '점프로 넘는' 장애물에만 — 고래·번개(move)는 점프로 못 넘음
      if (this._isJumpClear(obs, player)) obs.jumpedOver = true;
    }
    // 서퍼의 '현재' 깊이(baseY)를 지나치면 회피 확정 — 라이딩 높이에 맞춰 판정(고정선 X).
    if (!obs.passed && obs.targetY > player.baseY + obs.hitboxH * 0.5) obs.passed = true;
    if (!obs.resolved && !obs.hitByPlayer && obs.isResolved()) {
      obs.resolved = true;
      this._resolvedQueue.push(obs);
    }
  }

  _aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  _spawnFromScript(stageTimerMs, player) {
    while (
      this._eventIdx < this._events.length &&
      this._events[this._eventIdx].t <= stageTimerMs
    ) {
      const raw         = this._events[this._eventIdx++];
      const telegraphMs = Math.max(500, raw.telegraphMs ?? 500);
      let   ev          = telegraphMs === raw.telegraphMs ? raw : { ...raw, telegraphMs };

      // 타겟 분출: 신호가 뜨는 '지금' 서퍼 높이를 찍어 그 자리로 분출시킨다.
      // event.aimAtPlayer로 명시하거나, 일부(TARGET_RATIO)를 무작위로 겨냥.
      const targeted = player && !ev.isFake &&
        (ev.aimAtPlayer ?? (Math.random() < TARGET_RATIO));
      if (targeted) {
        ev = { ...ev, xFrac: lateralFracFromX(player.x), targeted: true };
      }

      this.signals.push(new SignalInstance(ev, eventLaneX(ev), this._scene));
      this._scene._onObstacleSignal?.(ev);

      if (!ev.isFake) {
        this._pendingObstacles.push({ spawnAtMs: ev.t, event: ev });   // 즉시 먼 곳에 등장 → 다가옴(travel이 리드)
      }
    }
  }

  _spawnPending(stageTimerMs) {
    for (let i = this._pendingObstacles.length - 1; i >= 0; i--) {
      const p = this._pendingObstacles[i];
      if (p.spawnAtMs <= stageTimerMs) {
        this.obstacles.push(
          new ObstacleInstance(p.event, eventLaneX(p.event), this._scene),
        );
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

  checkCollision(player) {
    for (const obs of this.obstacles) {
      if (!obs.collidable || obs.hitByPlayer) continue;
      if (this._hitsPlayer(obs, player)) { obs.hitByPlayer = true; return obs; }
    }
    return null;
  }

  // 충돌 판정. 레인(파도면 baseY = 3D 깊이)이 겹쳐야 하며, 'jump' 장애물은 점프 높이로 넘는다.
  // 핵심: 레인=깊이(z)와 점프=높이(y)는 3D에서 직교축이다. 예전엔 점프를 baseY에 합산한
  // player.hitbox(y) 한 축으로 판정해, 점프하면 player.y가 '위쪽 다른 레인' 장애물의 y를
  // 훑고 지나가며 "안 덮쳤는데 맞았다"가 났다. 이제 레인 겹침은 groundHitbox(baseY)로만 보고,
  // 점프는 '장애물을 넘었는지' 높이 게이트로 분리한다.
  _hitsPlayer(obs, player) {
    if (!this._aabb(player.groundHitbox, obs.hitbox)) return false;   // 다른 레인이면 안전
    if (obs.avoidMode === 'move') return true;                        // 점프 무효(상어·고래·번개) — 레인 겹치면 피격
    if (obs.avoidMode === 'dive') return !player.diving;              // 잠수 중이면 통과(해파리) — 안 하면 레인 비켜야
    if (obs.jumpedOver) return false;                                  // 퍼펙트 점프로 넘긴 장애물은 재충돌 없음
    return !this._isJumpClear(obs, player);                            // jump: 충분히 못 떴으면 피격
  }

  _isJumpClear(obs, player) {
    if (obs.avoidMode !== 'jump' || player.isGrounded) return false;
    const vNear = Math.abs(obs.targetY - player.baseY) < obs.hitboxH / 2 + 60;
    if (!vNear) return false;
    const clearH = (player.hitboxH + obs.hitbox.h) / 2;                // 넘는 데 필요한 점프 높이(px)
    return player.jumpOffset > clearH;
  }

  // 이번 프레임에 안전 통과로 확정된 장애물들(점수 처리용). 큐를 비운다.
  collectResolved() {
    const out = this._resolvedQueue;
    this._resolvedQueue = [];
    return out;
  }

  destroyAll() {
    for (const s of this.signals)   s.destroy();
    for (const o of this.obstacles) o.destroy();
    this.signals   = [];
    this.obstacles = [];
  }
}
