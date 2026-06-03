import {
  LOGICAL_WIDTH, LOGICAL_HEIGHT, RIDE_TOP_Y, RIDE_BOTTOM_Y, DANGER_TOP_Y,
} from './constants.js';

const W = LOGICAL_WIDTH;
const H = LOGICAL_HEIGHT;
const HORIZON_Y = H * 0.42;

// 스테이지 테마 — 하늘/바다 색, 분위기 플래그(밤·폭풍·화산), 햇빛/해안 디테일
export const BACKGROUND_THEMES = Object.freeze({
  jeju: {
    sky:    [0x89d9ff, 0x46a9d6, 0x1e78b8],
    sea:    [0x2bb6c9, 0x0d7aa6, 0x063f63],
    clouds: 0.85,
    island: { color: 0x2f735e, alpha: 0.34, y: 0.37 },
    coast:  true,
    waveTint: 0xa0e9ff,
    sun:     0.85,
    sparkle: 0.55,
  },
  jeju_coast: {
    sky:    [0xb6f0ff, 0x58c7dc, 0x1596b5],
    sea:    [0x23c6c4, 0x0792a0, 0x044f63],
    clouds: 0.78,
    island: { color: 0x2f8065, alpha: 0.42, y: 0.39 },
    coast:  true,
    reef:   { color: 0x83d9c7, alpha: 0.16 },
    waveTint: 0xd5fff8,
    sun:     0.95,
    sparkle: 0.7,
  },
  south_jeju: {
    sky:    [0x8fcdf8, 0x3e91d0, 0x1d5c9a],
    sea:    [0x1f86c2, 0x0a4f8a, 0x04223f],
    clouds: 0.65,
    island: { color: 0x214e69, alpha: 0.28, y: 0.35 },
    coast:  true,
    swell:  1.25,
    waveTint: 0xc6e7ff,
    sun:     0.6,
    sparkle: 0.42,
  },
  east_china_sea: {
    sky:    [0xc7e9f5, 0x80bfd1, 0x4f8cab],
    sea:    [0x2f88b0, 0x155b82, 0x0a3050],
    clouds: 0.9,
    mist:   { color: 0xffffff, alpha: 0.16 },
    waveTint: 0xd7eef7,
    sun:     0.5,
    sparkle: 0.36,
  },
  okinawa: {
    sky:    [0x9beaff, 0x3fc9d3, 0x1395b0],
    sea:    [0x17c9c0, 0x0792a2, 0x044a63],
    clouds: 0.72,
    reef:   { color: 0xffdd8a, alpha: 0.18 },
    coast:  true,
    waveTint: 0xe3fff4,
    sun:     1.0,
    sparkle: 0.78,
  },
  philippines: {
    sky:    [0xb7d3e8, 0x6d94b3, 0x3e5d83],
    sea:    [0x2a78a4, 0x14507a, 0x081f3b],
    clouds: 0.5,
    mist:   { color: 0xdde8f0, alpha: 0.22 },
    swell:  1.35,
    waveTint: 0xc4d8ea,
    sun:     0.3,
    sparkle: 0.24,
  },
  pacific_night: {
    sky:    [0x182c5c, 0x0c1d42, 0x030b20],
    sea:    [0x103a6e, 0x07234a, 0x020a18],
    clouds: 0.28,
    stars:  true,
    night:  true,
    swell:  1.15,
    waveTint: 0x81b7ff,
    sun:     0,
    sparkle: 0.8,
  },
  volcanic: {
    sky:    [0x5f6f86, 0x354b62, 0x231f2b],
    sea:    [0x255874, 0x183246, 0x0b1724],
    clouds: 0.35,
    volcanicGlow: true,
    swell:  1.28,
    waveTint: 0xffa866,
    sun:     0,
    sparkle: 0.28,
  },
  storm: {
    sky:    [0x657689, 0x39485d, 0x151d2e],
    sea:    [0x1f516e, 0x102b43, 0x06111f],
    clouds: 0.32,
    storm:  true,
    swell:  1.55,
    waveTint: 0xb7c7d8,
    sun:     0,
    sparkle: 0.12,
  },
  final: {
    sky:    [0x3b4258, 0x191f33, 0x070914],
    sea:    [0x16315a, 0x081a32, 0x020611],
    clouds: 0.22,
    storm:  true,
    stars:  true,
    night:  true,
    swell:  1.75,
    waveTint: 0xd4e5ff,
    sun:     0,
    sparkle: 0.38,
  },
});

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function lerp(a, b, t) { return a + (b - a) * t; }

// 다층 패럴랙스 바다 배경. GameScene 위에 얹히지 않도록 모든 레이어 depth < 1.
// 게임 오브젝트(신호 depth1 / 장애물·플레이어 depth2)는 항상 위에 그려져 가독성 보존.
export class OceanBackground {
  constructor(scene, themeKey) {
    this.scene = scene;
    this.theme = BACKGROUND_THEMES[themeKey] ?? BACKGROUND_THEMES.jeju;

    this.t         = 0;     // 파도 진동 클럭(ms) — 스크롤과 무관히 항상 흐름
    this.intensity = 0;     // 0..1 흥분도(속도·콤보·위험) — 부드럽게 추종
    this.danger    = 0;     // 0..1 위험 강조 — 부드럽게 추종
    this.flash     = 0;     // 니어미스 등 순간 강조 0..1 (감쇠)
    this.wake      = 0.2;   // 플레이어 뒤 물살 길이 0..1 (콤보·속도로 성장)
    this.particles = [];    // 물보라 파티클 (런타임 그래픽)

    // 레이어: 멀리(하늘)→바다→메인 파도 면→전경 포말. 모두 게임 오브젝트 아래.
    this.gSky  = scene.add.graphics().setDepth(0.0);
    this.gSea  = scene.add.graphics().setDepth(0.1);
    this.gMain = scene.add.graphics().setDepth(0.2);
    this.gFore = scene.add.graphics().setDepth(0.3);
  }

  // state: { dt, scroll, speedNorm, combo, danger:bool, jumping:bool, playerX, playerY }
  update(state) {
    const dt = state.dt;
    this.t += dt;

    // 흥분도/위험 목표값 → 부드럽게 추종(연출이 튀지 않게)
    const targetI = clamp01(
      (state.speedNorm - 0.9) * 0.7 +
      Math.min(0.45, state.combo * 0.045) +
      (state.danger ? 0.35 : 0) +
      this.flash * 0.5
    );
    const k = Math.min(1, dt / 1000 * 3.2);
    this.intensity += (targetI - this.intensity) * k;
    this.danger    += ((state.danger ? 1 : 0) - this.danger) * Math.min(1, dt / 1000 * 4);
    this.flash      = Math.max(0, this.flash - dt / 260);

    // 콤보·속도가 높을수록 뒤쪽 물살이 길어짐
    const targetWake = clamp01(0.18 + Math.min(0.6, state.combo * 0.05) + this.intensity * 0.35);
    this.wake += (targetWake - this.wake) * k;

    this._integrateParticles(dt, state.scroll);

    this._drawSky(state.scroll);
    this._drawSea(state.scroll);
    this._drawMain(state.scroll, state);
    this._drawFore(state.scroll, state);
  }

  // 점프 이륙/착지·니어미스에서 물보라 분출
  splash(x, y, power = 1) {
    const n = Math.round(8 + power * 14);
    for (let i = 0; i < n; i++) {
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9;
      const spd = (120 + Math.random() * 260) * (0.6 + power * 0.6);
      this.particles.push({
        x: x + (Math.random() - 0.5) * 34,
        y: y + (Math.random() - 0.5) * 10,
        vx: Math.cos(ang) * spd - 80,            // 진행 반대(왼쪽)로 흩날림
        vy: Math.sin(ang) * spd,
        life: 0,
        max: 360 + Math.random() * 380,
        r: 2 + Math.random() * (2 + power * 3),
      });
      if (this.particles.length > 240) this.particles.shift();
    }
  }

  // 니어미스 등 짧은 파도 강조
  pulse() { this.flash = 1; }

  destroy() {
    this.gSky.destroy(); this.gSea.destroy();
    this.gMain.destroy(); this.gFore.destroy();
    this.particles.length = 0;
  }

  // ─── 레이어 1: 하늘 · 구름 · 별 · 햇빛 · 먼 섬/해안 실루엣 ────────────────────
  _drawSky(scroll) {
    const g = this.gSky;
    const t = this.theme;
    g.clear();

    g.fillGradientStyle(t.sky[0], t.sky[0], t.sky[1], t.sky[1], 1);
    g.fillRect(0, 0, W, HORIZON_Y * 0.6);
    g.fillGradientStyle(t.sky[1], t.sky[1], t.sky[2], t.sky[2], 1);
    g.fillRect(0, HORIZON_Y * 0.6, W, HORIZON_Y - HORIZON_Y * 0.6 + 2);

    if (t.stars) this._drawStars();
    if (t.sun) this._drawSun(t.sun);
    this._drawClouds(scroll * 0.04, t.clouds ?? 0.85);
    if (t.island) this._drawDistantIslands(scroll * 0.05, t.island);
    if (t.coast) this._drawCoastSilhouettes(scroll * 0.07);
    if (t.mist) this._drawSeaMist(scroll * 0.1, t.mist);
    if (t.volcanicGlow) this._drawVolcanicGlow();
    if (t.storm) this._drawStormStreaks(scroll);
  }

  _drawSun(strength) {
    const g = this.gSky;
    const sx = W * 0.74, sy = HORIZON_Y * 0.42;
    const pulse = (Math.sin(this.t * 0.001) + 1) * 0.5;
    g.fillStyle(0xfff4cf, 0.10 * strength);
    g.fillCircle(sx, sy, 220 + pulse * 14);
    g.fillStyle(0xfff7d8, 0.16 * strength);
    g.fillCircle(sx, sy, 130);
    g.fillStyle(0xfffdf2, 0.9 * strength);
    g.fillCircle(sx, sy, 64);
  }

  _drawStars() {
    const g = this.gSky;
    for (let i = 0; i < 70; i++) {
      const x = (i * 173 + Math.sin(i) * 41) % W;
      const y = 24 + ((i * 67) % Math.round(HORIZON_Y * 0.9));
      const a = 0.25 + (Math.sin(this.t * 0.001 + i * 1.9) + 1) * 0.25;
      g.fillStyle(0xffffff, a);
      g.fillCircle(x, y, i % 8 === 0 ? 2.4 : 1.4);
    }
  }

  _drawClouds(offset, alpha) {
    const g = this.gSky;
    const TILE = 2400;
    const defs = [
      { rx: 200,  y: 72,  rw: 130, rh: 46 }, { rx: 580,  y: 48,  rw:  96, rh: 36 },
      { rx: 950,  y: 98,  rw: 152, rh: 52 }, { rx: 1380, y: 62,  rw: 115, rh: 42 },
      { rx: 1820, y: 85,  rw: 140, rh: 50 }, { rx: 2180, y: 55,  rw: 105, rh: 38 },
    ];
    g.fillStyle(0xffffff, alpha ?? 0.85);
    const scrolled = ((offset % TILE) + TILE) % TILE;
    for (const d of defs) {
      for (let tile = -1; tile <= 2; tile++) {
        const cx = d.rx - scrolled + tile * TILE;
        if (cx + d.rw * 1.6 < 0 || cx - d.rw * 1.6 > W) continue;
        g.fillEllipse(cx,               d.y,                d.rw * 2,   d.rh * 2);
        g.fillEllipse(cx - d.rw * 0.55, d.y + d.rh * 0.15,  d.rw * 1.3, d.rh * 1.6);
        g.fillEllipse(cx + d.rw * 0.52, d.y + d.rh * 0.12,  d.rw * 1.2, d.rh * 1.5);
      }
    }
  }

  _drawDistantIslands(offset, island) {
    const g = this.gSky;
    const y = HORIZON_Y - 6;
    const scrolled = ((offset % W) + W) % W;
    g.fillStyle(island.color, island.alpha);
    for (let tile = -1; tile <= 1; tile++) {
      const x = tile * W - scrolled;
      g.beginPath();
      g.moveTo(x + 40, y + 4);
      g.lineTo(x + 250, y - 70);
      g.lineTo(x + 470, y - 16);
      g.lineTo(x + 670, y - 54);
      g.lineTo(x + 900, y + 6);
      g.lineTo(x + 40, y + 6);
      g.closePath();
      g.fillPath();
    }
  }

  // 저채도 야자수 · 등대 · 부표 · 작은 배 실루엣 (장애물과 혼동 안 되게 흐리게)
  _drawCoastSilhouettes(offset) {
    const g = this.gSky;
    const TILE = 1500;
    const y = HORIZON_Y - 2;
    const scrolled = ((offset % TILE) + TILE) % TILE;
    const dark = 0x143a4a;

    for (let tile = -1; tile <= W / TILE + 1; tile++) {
      const base = tile * TILE - scrolled;

      // 야자수
      this._palm(g, base + 120, y, dark, 0.22);
      this._palm(g, base + 168, y, dark, 0.18);

      // 등대
      g.fillStyle(dark, 0.2);
      g.fillTriangle(base + 620, y, base + 600, y - 64, base + 640, y - 64);
      g.fillStyle(0xffd27a, 0.16);
      g.fillCircle(base + 620, y - 64, 7);

      // 부표 (살짝 까딱)
      const bobY = y - 4 + Math.sin(this.t * 0.004 + tile) * 3;
      g.fillStyle(0xff6b5e, 0.22);
      g.fillCircle(base + 980, bobY, 7);
      g.fillStyle(dark, 0.18);
      g.fillRect(base + 979, bobY - 16, 2, 10);

      // 작은 배
      const boatY = y - 6 + Math.sin(this.t * 0.0035 + tile * 1.7) * 3;
      g.fillStyle(dark, 0.2);
      g.beginPath();
      g.moveTo(base + 1230, boatY);
      g.lineTo(base + 1290, boatY);
      g.lineTo(base + 1276, boatY + 12);
      g.lineTo(base + 1244, boatY + 12);
      g.closePath();
      g.fillPath();
      g.lineStyle(2, dark, 0.2);
      g.beginPath();
      g.moveTo(base + 1260, boatY); g.lineTo(base + 1260, boatY - 22);
      g.strokePath();
      g.fillStyle(dark, 0.16);
      g.fillTriangle(base + 1260, boatY - 22, base + 1260, boatY - 2, base + 1284, boatY - 2);
    }
  }

  _palm(g, x, baseY, color, alpha) {
    g.lineStyle(4, color, alpha);
    g.beginPath();
    g.moveTo(x, baseY);
    g.lineTo(x - 6, baseY - 52);
    g.strokePath();
    g.fillStyle(color, alpha);
    for (let a = 0; a < 5; a++) {
      const ang = -Math.PI / 2 + (a - 2) * 0.5;
      const lx = x - 6 + Math.cos(ang) * 34;
      const ly = baseY - 52 + Math.sin(ang) * 22;
      g.fillTriangle(x - 6, baseY - 52, lx, ly, x - 6 + Math.cos(ang) * 14, baseY - 52 + Math.sin(ang) * 8);
    }
  }

  _drawSeaMist(offset, mist) {
    const g = this.gSky;
    g.fillStyle(mist.color, mist.alpha);
    for (let i = 0; i < 8; i++) {
      const x = ((i * 310 - offset) % (W + 260) + W + 260) % (W + 260) - 130;
      const y = HORIZON_Y - 8 + Math.sin(this.t * 0.001 + i) * 14;
      g.fillEllipse(x, y, 240, 26);
    }
  }

  _drawVolcanicGlow() {
    const g = this.gSky;
    const pulse = (Math.sin(this.t * 0.0012) + 1) * 0.5;
    g.fillStyle(0xff6b2f, 0.08 + pulse * 0.05);
    g.fillCircle(W * 0.72, HORIZON_Y * 0.8, 210);
    g.fillStyle(0xffb15a, 0.08);
    g.fillCircle(W * 0.72, HORIZON_Y * 0.8, 95);
  }

  _drawStormStreaks(scroll) {
    const g = this.gSky;
    g.lineStyle(2, 0xd9e8f4, 0.14 + this.intensity * 0.06);
    for (let i = 0; i < 30; i++) {
      const x = ((i * 91 - scroll * 1.15) % (W + 140) + W + 140) % (W + 140) - 70;
      const y = (i * 53 + this.t * 0.05) % HORIZON_Y;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x - 30, y + 66);
      g.strokePath();
    }
  }

  // ─── 레이어 2: 바다 본체 그라데이션 · 햇빛 반사 · 먼/중간 파도 ────────────────
  _drawSea(scroll) {
    const g = this.gSea;
    const t = this.theme;
    g.clear();

    // 수평선 아래 바다 — 위쪽 밝은 에메랄드 → 아래 깊은 남청
    g.fillGradientStyle(t.sea[0], t.sea[0], t.sea[1], t.sea[1], 1);
    g.fillRect(0, HORIZON_Y, W, (H - HORIZON_Y) * 0.5);
    g.fillGradientStyle(t.sea[1], t.sea[1], t.sea[2], t.sea[2], 1);
    g.fillRect(0, HORIZON_Y + (H - HORIZON_Y) * 0.5, W, (H - HORIZON_Y) * 0.5 + 2);

    // 수평선 밝은 띠(빛 산란)
    g.fillStyle(0xffffff, 0.12);
    g.fillRect(0, HORIZON_Y - 2, W, 4);

    // 햇빛 반사 컬럼 (어른거리는 가로 하이라이트)
    if (t.sun) this._drawSunGlitter(scroll, t.sun);

    const swell = t.swell ?? 1;
    // 먼 파도(느림) → 중간 파도(보통). 반투명 청록을 겹쳐 깊이감.
    this._wave(g, scroll * 0.18, HORIZON_Y + 28, 10 * swell, t.waveTint, 0.22, 0.0055);
    this._wave(g, scroll * 0.30, lerp(HORIZON_Y, RIDE_TOP_Y, 0.6), 16 * swell, t.waveTint, 0.18, 0.006);
    this._wave(g, scroll * 0.45, RIDE_TOP_Y - 6, 22 * swell, t.sea[0], 0.5, 0.0058);
  }

  _drawSunGlitter(scroll, strength) {
    const g = this.gSea;
    const cx = W * 0.74;
    for (let i = 0; i < 22; i++) {
      const y = HORIZON_Y + 8 + i * ((RIDE_BOTTOM_Y - HORIZON_Y) / 22);
      const spread = 24 + i * 9;
      const x = cx + Math.sin(this.t * 0.002 + i * 1.3) * spread;
      const a = (0.22 - i * 0.008) * strength * (0.6 + (Math.sin(this.t * 0.004 + i) + 1) * 0.2);
      if (a <= 0) continue;
      g.fillStyle(0xfff6d8, a);
      g.fillEllipse(x, y, 60 + i * 6, 4 + i * 0.4);
    }
  }

  // ─── 레이어 3: 메인 파도 면(서퍼가 타는 표면) · 위험 띠 · 윤슬 ────────────────
  _drawMain(scroll, state) {
    const g = this.gMain;
    const t = this.theme;
    const swell = t.swell ?? 1;
    g.clear();

    // 위험도에 따라 더 거칠고 어두운 진폭/색
    const rough = 1 + this.danger * 0.6 + this.intensity * 0.3;

    // 메인 라이딩 면 — 채워진 물 표면(반투명 청록), crest가 시간에 따라 출렁
    const baseY = RIDE_BOTTOM_Y + 22;
    const darkBlue = this.danger > 0.5 ? 0x06294a : 0x0a3b6e;
    g.fillStyle(darkBlue, 0.5 + this.danger * 0.18);
    g.beginPath();
    g.moveTo(0, baseY);
    for (let x = 0; x <= W; x += 8) {
      g.lineTo(x, this._mainCrest(x, scroll, baseY, swell * rough));
    }
    g.lineTo(W, H); g.lineTo(0, H); g.closePath(); g.fillPath();

    // crest 흰 포말 라인
    g.lineStyle(4, 0xffffff, 0.3 + this.intensity * 0.15);
    g.beginPath();
    for (let x = 0; x <= W; x += 8) {
      const y = this._mainCrest(x, scroll, baseY, swell * rough);
      x === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.strokePath();

    // 중간 파도 한 겹 더(메인 면 위쪽) — waveTint 하이라이트
    this._wave(g, scroll * 0.7, RIDE_TOP_Y + 70, 26 * swell * rough, t.waveTint, 0.14, 0.006);

    // 위험 구간(거친 바다) 어둡게 + whitecaps
    this._drawDangerBand(scroll);

    // 윤슬(반짝임)
    this._drawSparkles(scroll, t.sparkle ?? 0.5);
  }

  _mainCrest(x, scroll, baseY, amp) {
    const p = x + scroll * 0.7;
    return baseY
      + Math.sin(p * 0.006 + this.t * 0.0016) * amp
      + Math.sin(p * 0.013 + this.t * 0.0022 + 1) * amp * 0.45
      + Math.sin(p * 0.003 - this.t * 0.001 + 2.5) * amp * 0.6;
  }

  _drawDangerBand(scroll) {
    const g = this.gMain;
    const top = DANGER_TOP_Y;
    g.fillStyle(0x05284a, 0.3 + this.danger * 0.3);
    g.fillRect(0, top, W, H - top);

    g.fillStyle(0xffffff, 0.12 + this.danger * 0.12);
    const n = 26;
    for (let i = 0; i < n; i++) {
      const x = (((i * 121 + scroll * 1.1) % (W + 120)) + (W + 120)) % (W + 120) - 60;
      const y = top + 20 + ((i * 53) % (H - top - 40));
      const bob = Math.sin(this.t * 0.003 + i) * 3;
      g.fillCircle(x, y + bob, 5 + (i % 3) * 4 + this.danger * 3);
    }
  }

  _drawSparkles(scroll, alphaScale) {
    const g = this.gMain;
    for (let i = 0; i < 24; i++) {
      const x = (((i * 97 + scroll * 0.85) % W) + W) % W;
      const y = RIDE_TOP_Y + ((i * 71) % (RIDE_BOTTOM_Y - RIDE_TOP_Y));
      const a = (Math.sin(this.t * 0.004 + i * 1.7) + 1) / 2 * alphaScale;
      g.fillStyle(0xffffff, a);
      g.fillCircle(x, y, 1.5 + Math.sin(i * 0.9) * 1);
    }
  }

  // ─── 레이어 4: 전경 포말 · 잔물결 · 스피드 라인 · 플레이어 물살 · 파티클 ──────
  _drawFore(scroll, state) {
    const g = this.gFore;
    g.clear();

    const speedMul = 1.2 + this.intensity * 1.3;

    // 스피드 라인 — 화면 하단을 빠르게 가로지름(전진감 핵심)
    const lines = 8 + Math.round(this.intensity * 6);
    g.fillStyle(0xffffff, 0.1 + this.intensity * 0.18);
    for (let i = 0; i < lines; i++) {
      const ly = RIDE_TOP_Y + 40 + ((i * 137) % (H - RIDE_TOP_Y - 60));
      const span = 90 + (i % 3) * 60;
      const x = (((i * 233 - scroll * speedMul) % (W + 300)) + (W + 300)) % (W + 300) - 150;
      g.fillRect(x, ly, span, 3);
    }

    // 전경 잔물결 — 빠른 가로 타원, 아래로 갈수록 진함
    for (let i = 0; i < 16; i++) {
      const ly = RIDE_TOP_Y + 80 + ((i * 91) % (H - RIDE_TOP_Y - 80));
      const depth = (ly - RIDE_TOP_Y) / (H - RIDE_TOP_Y);
      const x = (((i * 271 - scroll * (1.0 + depth * 0.6)) % (W + 360)) + (W + 360)) % (W + 360) - 180;
      const wob = Math.sin(this.t * 0.005 + i) * 6;
      g.fillStyle(this.theme.waveTint, (0.05 + depth * 0.1) * (0.7 + this.intensity * 0.5));
      g.fillEllipse(x, ly + wob, 150 + depth * 90, 7 + depth * 6);
    }

    // 전경 흰 포말 덩어리 — 가장 빠르게 흘러 강한 전진감
    const foam = 14 + Math.round(this.intensity * 10);
    for (let i = 0; i < foam; i++) {
      const ly = DANGER_TOP_Y - 40 + ((i * 67) % (H - DANGER_TOP_Y + 40));
      const x = (((i * 149 - scroll * (1.5 + this.intensity * 0.8)) % (W + 200)) + (W + 200)) % (W + 200) - 100;
      const r = 4 + (i % 4) * 3 + this.intensity * 3;
      g.fillStyle(0xffffff, 0.1 + this.intensity * 0.12);
      g.fillCircle(x, ly + Math.sin(this.t * 0.004 + i) * 4, r);
    }

    // 플레이어 뒤쪽 물살 — 콤보·속도로 길어짐
    if (state.playerX != null) this._drawWake(state.playerX, state.playerY);

    // 물보라 파티클
    this._drawParticles();
  }

  _drawWake(px, py) {
    const g = this.gFore;
    const len = 90 + this.wake * 320;
    const steps = 16;
    g.fillStyle(0xffffff, 0.16 + this.wake * 0.18);
    g.beginPath();
    g.moveTo(px, py - 8);
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      const x = px - f * len;
      const spread = (1 - f) * 14 + Math.sin(this.t * 0.01 + i) * 2;
      g.lineTo(x, py - 8 - spread);
    }
    for (let i = steps; i >= 0; i--) {
      const f = i / steps;
      const x = px - f * len;
      const spread = (1 - f) * 14 + Math.sin(this.t * 0.01 + i + 1) * 2;
      g.lineTo(x, py + 12 + spread);
    }
    g.closePath();
    g.fillPath();

    // 물살 가장자리 포말 점
    g.fillStyle(0xffffff, 0.28 + this.wake * 0.2);
    for (let i = 0; i < 8; i++) {
      const f = i / 8;
      const x = px - f * len - Math.random() * 10;
      g.fillCircle(x, py + 2 + Math.sin(this.t * 0.02 + i) * 6, 2 + (1 - f) * 3);
    }
  }

  _integrateParticles(dt, scroll) {
    const g = 1500;            // 중력 px/s²
    const s = dt / 1000;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.max) { this.particles.splice(i, 1); continue; }
      p.vy += g * s;
      p.x += (p.vx - 120) * s;   // 진행감: 전체적으로 왼쪽으로 흐름
      p.y += p.vy * s;
    }
  }

  _drawParticles() {
    const g = this.gFore;
    for (const p of this.particles) {
      const a = (1 - p.life / p.max) * 0.85;
      g.fillStyle(0xffffff, a);
      g.fillCircle(p.x, p.y, p.r * (1 - p.life / p.max * 0.4));
    }
  }

  // 공통 파도 곡선 채우기(아래를 채워 바다와 이어지게)
  _wave(g, offset, baseY, amp, color, alpha, freq) {
    g.fillStyle(color, alpha);
    g.beginPath();
    const f = freq ?? 0.0055;
    g.moveTo(0, baseY);
    for (let x = 0; x <= W; x += 6) {
      const p = x + offset;
      const y = baseY
        + Math.sin(p * f + this.t * 0.0014) * amp
        + Math.sin(p * f * 2 + this.t * 0.002 + 1.3) * amp * 0.4
        + Math.sin(p * f * 0.55 - this.t * 0.001 + 2.7) * amp * 0.6;
      g.lineTo(x, y);
    }
    g.lineTo(W, H); g.lineTo(0, H); g.closePath(); g.fillPath();
  }
}
