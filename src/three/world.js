import * as THREE from 'three';
import { BACKGROUND_THEMES } from '../backgroundThemes.js';
import { WATER_Y } from './bridge.js';
import { JejuStageSet } from './jejuStage.js';

const BG_COLOR = 0x87ceeb;   // 하늘색 폴백 (테마에 sky 없을 때)

// ─── 메인 파도 시스템 (서핑 감각의 핵심) ──────────────────────────────────────
// 단일 '큰 너울' 수면을 sampleWaveHeight(x,z,t) 하나의 파동장으로 정의하고, 그 함수로
//  (1) 수면 메시 정점을 변위시키고  (2) 서퍼·장애물 y를 같은 높이에 얹는다.
// → 서퍼가 '렌더된 바로 그 파도' 위에 정확히 올라타고, 마루 기울기로 보드가 기운다.
// 너울은 +z(카메라/서퍼 쪽)로 굴러와 '밀려오는 큰 파도' 전진감을 준다. 잔물결(chop)은 x축으로 교차.
// 테마별 파라미터로 잔잔(jeju)↔괴물파도(storm/final)를 swell로 스케일한다.
const WAVE_DEFAULTS = {
  swellAmp:   0.52,   // 메인 너울 높이(world u) — 마루 crest ≈ WATER_Y(0.7)+amp
  swellLen:   8.0,    // 너울 파장(z축, 진행 방향)
  swellSpeed: 1.05,   // 너울 진행 속도
  swellSkew:  0.05,   // x에 따른 위상차(파면이 비스듬히 굴러오게)
  chopAmp:    0.13,   // 잔물결 높이(x축 교차)
  chopLen:    5.0,
  chopSpeed:  1.7,
  swell2Amp:  0.2,    // 2차 저주파 너울(불규칙한 바다)
  swell2Len:  17.0,
  swell2Speed: 0.6,
  foamColor:  0xffffff,
  foamCrests: 3,      // 동시에 보이는 흰 포말 마루 줄 수
};

// 테마별 오버라이드(없으면 swell로 진폭/속도 자동 스케일). jeju=승인된 선명 시안 바다.
const WAVE_THEME = {
  jeju: { swellAmp: 0.62, swellLen: 7.2, swellSpeed: 1.0, chopAmp: 0.17, chopLen: 4.2,
          swell2Amp: 0.24, swell2Len: 15, foamColor: 0xeafdff, foamCrests: 4 },
};

// 메인 수면 평면 — 카메라가 보는 영역을 넉넉히 덮는다(서퍼 x≈-6.4 중심). 저폴리 facet이
// 또렷하게 음영지도록 너무 잘게 쪼개지 않는다(파장당 ~4.5 세그먼트).
const OCEAN_PLANE = { width: 110, depth: 66, segX: 56, segZ: 42, cx: -6, cz: 6 };

// 3D 물색 오버라이드(테마별, 원경→근경). 없으면 theme.sea[0]에서 밝기 램프로 파생.
// jeju(1스테이지): 사용자가 승인한 '선명한 시안'을 유지(테마 청록 대신).
const SEA3D_OVERRIDE = {
  jeju: [0x007fa7, 0x08b6c6, 0x31ded7],
};

const SCENIC_STAGE_SET = {
  jeju: {
    backdropUrl: '/stage-1-jeju-scenic-loop.png',
    backdropRepeatX: 0.5,
  },
  jeju_coast: {
    backdropUrl: '/stage-2-coral-waterway-loop.png',
    backdropRepeatX: 0.5,
    backdropScrollSpeed: 0.014,
  },
  south_jeju: {
    backdropUrl: '/stage-3-ancient-gate-loop.png',
    backdropRepeatX: 0.5,
    backdropScrollSpeed: 0.014,
  },
  east_china_sea: {
    backdropUrl: '/stage-4-mushroom-coral-loop.png',
    backdropRepeatX: 0.5,
    backdropScrollSpeed: 0.014,
  },
  okinawa: {
    backdropUrl: '/stage-5-shipwreck-reef-loop.png',
    backdropRepeatX: 0.5,
    backdropScrollSpeed: 0.014,
  },
  philippines: {
    backdropUrl: '/stage-6-crystal-cave-loop.png',
    backdropRepeatX: 0.5,
    backdropScrollSpeed: 0.014,
  },
  pacific_night: {
    backdropUrl: '/stage-7-mariana-abyss-loop.png',
    backdropRepeatX: 0.5,
    backdropScrollSpeed: 0.014,
  },
  volcanic: {
    backdropUrl: '/stage-8-volcanic-island-loop.png',
    backdropRepeatX: 0.5,
    backdropScrollSpeed: 0.014,
  },
  storm: {
    backdropUrl: '/stage-9-storm-vortex-loop.png',
    backdropRepeatX: 0.5,
    backdropScrollSpeed: 0.014,
  },
  final: {
    backdropUrl: '/stage-10-pacific-temple-loop.png',
    backdropRepeatX: 0.5,
    backdropScrollSpeed: 0.014,
  },
};

// 스테이지 배경 이미지(픽셀아트) 토글. 테마에 경로를 넣으면 절차적 3D 바다·하늘·섬·구름을 전부
// 생략하고 그 이미지를 화면 전체 백드롭(scene.background)으로 깐다(서퍼·장애물 등 액터는 위에).
// 단점: 정적이라 파도·구름이 안 움직임 → 기본은 비활성(절차적 움직이는 바다 사용).
// 다시 정적 픽셀아트로 쓰려면 아래 한 줄 주석 해제. public/ 루트 절대경로(Vite base '/').
const STAGE_BACKDROP = {
  // jeju: '/stage-1-jeju-pixel.png',
};

// 월드 = 바다(파도 3겹) + 배경(하늘·태양/노을·별·섬·구름) + 조명 + 대기(배경/포그).
// 전부 스테이지 테마(backgroundThemes.js의 BACKGROUND_THEMES)에서 색/밤·폭풍/swell을 읽어 적용.
export class World {
  constructor(scene, themeKey) {
    this.scene = scene;
    this.themeKey = themeKey;
    this.theme = BACKGROUND_THEMES[themeKey] ?? BACKGROUND_THEMES.jeju;
    this.swell = this.theme.swell ?? 1;   // 잔잔(1.0) ~ 괴물 파도(1.75)
    this.backdropUrl = STAGE_BACKDROP[themeKey] ?? null;   // 이미지 백드롭 테마면 절차적 배경 생략
    this.scenicStageSet = SCENIC_STAGE_SET[themeKey] ?? null;
    this.stageSet = null;
    this.waveParams = this._resolveWaveParams();
    this._t = 0;                          // 마지막 update 시간(샘플러 기본값)
    this.bigWave = null;                  // 큰 파도 이벤트 상태(없으면 null)
    this.bigWavePocketX = null;           // 활성 시 포켓 중심(월드 x) — 한쪽에만 솟음

    this._applyAtmosphere();
    this._buildLighting();
    if (this.backdropUrl) {
      this._buildImageBackdrop();   // 픽셀아트 전체 배경 — 3D 바다·하늘·섬·구름 미생성
    } else {
      this._buildMainOcean();
      if (!this.scenicStageSet) this._buildBackground();
      if (this.scenicStageSet) this.stageSet = new JejuStageSet(this.scene, this.scenicStageSet);
    }
  }

  // 테마 파라미터 = 기본값 + 테마 오버라이드, 그 위에 swell(잔잔↔괴물)로 진폭/속도 스케일.
  _resolveWaveParams() {
    const p = { ...WAVE_DEFAULTS, ...(WAVE_THEME[this.themeKey] ?? {}) };
    const sw = this.swell;
    const ampK = 1 + (sw - 1) * 0.7;      // 거친 바다일수록 마루가 높게
    const spdK = 1 + (sw - 1) * 0.35;     // 그리고 더 빠르게 굴러옴
    p.swellAmp  *= ampK;
    p.swell2Amp *= ampK;
    p.chopAmp   *= ampK;
    p.swellSpeed  *= spdK;
    p.swell2Speed *= spdK;
    p.chopSpeed   *= spdK;
    return p;
  }

  // 배경·포그 = 테마 하늘 중간톤(거리 헤이즈). 밤/폭풍은 자동으로 어두워짐.
  // 이미지 백드롭 테마는 텍스처 로드 전까지의 임시 색만 깔고 포그는 끈다(그림과 톤 불일치 방지;
  // 액터는 z<55라 어차피 포그 무영향).
  _applyAtmosphere() {
    const atmo = this.theme.sky?.[1] ?? BG_COLOR;
    this.scene.background = new THREE.Color(atmo);
    this.scene.fog = this.backdropUrl ? null : new THREE.Fog(atmo, 55, 110);
  }

  // 픽셀아트 전체 배경 — public 이미지를 scene.background 텍스처로 깔아 화면을 꽉 채운다.
  // NearestFilter로 업스케일 시에도 픽셀 경계를 선명하게 유지(픽셀아트 보존). 비동기 로드라
  // 로드 전엔 _applyAtmosphere의 임시 하늘색이 보인다.
  _buildImageBackdrop() {
    new THREE.TextureLoader().load(this.backdropUrl, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;   // sRGB 이미지 정확한 색
      tex.magFilter = THREE.NearestFilter;     // 픽셀아트 선명한 경계 유지
      tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      this.scene.background = tex;
      this.backdropTex = tex;
    });
  }

  // 조명 — 테마 분위기는 '빛 색(틴트)'으로(밤=차가운 청 / 폭풍=회색 / 화산=따뜻함).
  // ⚠️ 밝기는 가독성 위해 주간과 거의 같게 유지 — 밤도 플레이 화면은 보여야 함.
  // r0.184 ÷π 보정: 실효≈intensity/π → ambient 2.8(실효~0.9)로 색 선명. 신호·황금물고기는
  // MeshBasic/emissive라 조명과 무관하게 밝아, 밤에도 예고/획득은 보임(장애물 메시만 어두워짐).
  _buildLighting() {
    const L = this._lightingForTheme(this.theme);
    this.scene.add(new THREE.AmbientLight(L.ambColor, L.ambI));
    const dir = new THREE.DirectionalLight(L.dirColor, L.dirI);
    dir.position.set(5, 10, 8);
    this.scene.add(dir);
  }

  // 밤 우선(final=night+storm 둘 다라 밤 채택).
  _lightingForTheme(th) {
    // 앰비언트를 낮추고 방향광을 키워 파도 경사가 빛/그늘을 받게 한다 → 입체감.
    // 밤/폭풍은 가독성 위해 앰비언트 하한을 조금 더 높게 유지.
    if (th.night)        return { ambColor: 0x9fb0da, ambI: 2.0, dirColor: 0xaebbe0, dirI: 1.5 };
    if (th.storm)        return { ambColor: 0xbcc6cf, ambI: 2.1, dirColor: 0xbac4ce, dirI: 1.4 };
    if (th.volcanicGlow) return { ambColor: 0xe2b8a0, ambI: 1.9, dirColor: 0xffb070, dirI: 1.7 };
    return { ambColor: 0xffffff, ambI: 1.5, dirColor: 0xffffff, dirI: 2.2 };   // 주간
  }

  // ── 파동장 샘플러 ── 메인 수면 메시·서퍼·장애물이 공유하는 단일 진실. 같은 함수로
  // 정점을 변위시키고 액터 y를 얹어, 액터가 '렌더된 바로 그 파도' 위에 정확히 올라탄다.
  // 너울은 +z(카메라 쪽)로 진행 → 밀려오는 큰 파도. (t는 초 단위 누적시간)
  sampleWaveHeight(x, z, t = this._t) {
    const p = this.waveParams;
    const k  = (Math.PI * 2) / p.swellLen;
    let h = p.swellAmp * Math.sin(z * k - t * p.swellSpeed + x * p.swellSkew);
    const k2 = (Math.PI * 2) / p.swell2Len;
    h += p.swell2Amp * Math.sin(z * k2 - t * p.swell2Speed - x * 0.03);
    const kc = (Math.PI * 2) / p.chopLen;
    h += p.chopAmp * Math.sin(x * kc + t * p.chopSpeed + z * 0.4);
    if (this.bigWave) h += this._bigWaveHeight(x, z);
    return h;
  }

  // 마루 기울기(보드·몸 기울임용). 유한차분으로 dH/dx(좌우 뱅크), dH/dz(앞뒤 피치).
  sampleWaveSlope(x, z, t = this._t) {
    const e = 0.6;
    return {
      dHdx: (this.sampleWaveHeight(x + e, z, t) - this.sampleWaveHeight(x - e, z, t)) / (2 * e),
      dHdz: (this.sampleWaveHeight(x, z + e, t) - this.sampleWaveHeight(x, z - e, t)) / (2 * e),
    };
  }

  // 하늘 그라데이션 환경맵 — 평면 반사(2차 렌더) 없이 수면이 하늘·태양을 비추게 한다.
  // flatShading facet마다 노멀 각도로 하늘을 샘플 → 파도가 일렁이며 하늘빛·태양 글린트를 반사.
  // 색은 테마 sky(천정→수평선)에서 뽑아 씬과 톤을 맞춘다.
  _buildSkyEnv() {
    const sky = this.theme.sky ?? [0x89d9ff, 0x46a9d6, 0x1e78b8];
    const hex = (c) => '#' + new THREE.Color(c).getHexString();
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 128;
    const ctx = cv.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0.0, hex(sky[0]));            // 천정
    g.addColorStop(0.5, hex(sky[1] ?? sky[0]));
    g.addColorStop(0.72, hex(sky[2] ?? sky[0])); // 수평선
    g.addColorStop(1.0, '#0a3550');              // 아래(어두운 물 반사)
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 128);
    if ((this.theme.sun ?? 0) > 0) {             // 주간: 태양 글린트(밝은 반점)
      const sx = 256 * 0.62, sy = 128 * 0.3, r = 28;
      const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
      sg.addColorStop(0, 'rgba(255,250,220,0.95)');
      sg.addColorStop(1, 'rgba(255,250,220,0)');
      ctx.fillStyle = sg; ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // 메인 수면 — 넓고 깊은 평면 하나를 매 프레임 파동장으로 변위. 정점색은 원경(짙음)→근경(밝음)
  // 그라데이션. jeju는 살짝 반투명(opacity<1)으로 사진 수평선이 먼 가장자리에서 비쳐 어우러진다.
  _buildMainOcean() {
    const def = OCEAN_PLANE;
    const geo = new THREE.PlaneGeometry(def.width, def.depth, def.segX, def.segZ);
    geo.rotateX(-Math.PI / 2);   // xz 평면(수평 바다)으로 눕힘 — local y→world -z

    const [cFar, cMid, cNear] = this._waterColors();
    const pos = geo.attributes.position;
    const cols = [];
    const half = def.depth / 2;
    for (let i = 0; i < pos.count; i++) {
      const f = (pos.getZ(i) + half) / def.depth;        // 0(원경)~1(근경)
      const c = f < 0.5 ? cFar.clone().lerp(cMid, f * 2) : cMid.clone().lerp(cNear, (f - 0.5) * 2);
      cols.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));

    // 불투명 — 깊이를 써서 서퍼/장애물이 마루 뒤로 깔끔히 가려지고(서핑감) 마루 위에선 또렷이 보인다.
    // (반투명이면 가까운 물이 서퍼 위로 비쳐 '물에 잠긴 유령'처럼 보였다.) 사진 백드롭은 수면 위로 비침.
    this.skyEnv = this._buildSkyEnv();   // 하늘 반사용 환경맵(저비용, 2차 렌더 없음)
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true, flatShading: true,
      metalness: 0.45, roughness: 0.30,
      envMap: this.skyEnv, envMapIntensity: 1.5,   // 수면이 하늘·태양을 반사(글로시 워터)
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(def.cx, WATER_Y, def.cz);
    mesh.renderOrder = 0;
    this.scene.add(mesh);
    // 정점의 월드 (x,z)를 미리 캐시(매 프레임 재계산 회피)
    const wx = new Float32Array(pos.count);
    const wz = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) { wx[i] = def.cx + pos.getX(i); wz[i] = def.cz + pos.getZ(i); }
    this.ocean = {
      mesh, geo, pos, wx, wz,
      col: geo.attributes.color,
      baseCol: new Float32Array(cols),                            // 높이 변조 전 기준색(원경→근경)
      crest: new THREE.Color(0xcdeeff),                           // 마루 하이라이트(하늘 반사) 색
      amp: this.waveParams.swellAmp + this.waveParams.swell2Amp,  // 높이 정규화 기준
    };

    this._buildFoamCrests();
  }

  // 흰 포말 마루 — vertex-color 화이트캡은 이 매끈한 저폴리 물에선 블룸이 돼 실패했으므로(메모),
  // 전용 메시로 처리: 너울 마루를 가로지르는 밝은 띠 N개. 매 프레임 마루 z를 풀어 그 위에 얹는다.
  _buildFoamCrests() {
    this.foamCrests = [];
    const n = this.waveParams.foamCrests;
    for (let i = 0; i < n; i++) {
      const geo = new THREE.PlaneGeometry(OCEAN_PLANE.width * 0.92, 1.05, 24, 1);
      geo.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({
        color: this.waveParams.foamColor, transparent: true, opacity: 0,
        depthWrite: false, fog: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.x = OCEAN_PLANE.cx;
      mesh.renderOrder = 1;   // 물 위, 액터 아래
      this.scene.add(mesh);
      this.foamCrests.push(mesh);
    }
  }

  // 파도 3겹 색(원경→근경). SEA3D_OVERRIDE 있으면 레이어별 색 직접 사용(jeju=승인 시안).
  // 없으면 테마 sea[0] 한 색에서 밝기 램프로 파생.
  // ⚠️ 층이 z로 겹쳐 파도 골 사이로 아래 층이 비치는데, sea[0]→sea[2] 전 범위를 쓰면 대비가 커서
  //    어두운 패치가 튐 → 한 색에서 미세 darken만 줘 일관된 수면 유지(가독성).
  _waterColors() {
    const override = SEA3D_OVERRIDE[this.themeKey];
    if (override) return override.map((c) => new THREE.Color(c));
    const sea = this.theme.sea ?? [0x00b4d8, 0x20c8e4, 0x32e4ec];
    const surface = new THREE.Color(sea[0]);
    // 어두운 테마(밤·폭풍·화산)도 수면이 보이도록 명도 하한 — hue·채도(테마 분위기)는 유지.
    const hsl = { h: 0, s: 0, l: 0 };
    surface.getHSL(hsl);
    if (hsl.l < 0.45) surface.setHSL(hsl.h, hsl.s, 0.45);
    return [0.80, 0.90, 1.0].map((s) => surface.clone().multiplyScalar(s));   // 원경 어둡게→근경 밝은 표면색
  }

  // 배경 — 하늘(그라데이션) · 태양/화산노을 · 별(밤) · 섬(연안 테마만) · 구름. 전부 테마색.
  _buildBackground() {
    const th = this.theme;
    if (this.themeKey === 'jeju') return;

    // 하늘 — sky[0](천정)→sky[2](수평선) 세로 그라데이션(정점 색). 조명 영향 없는 백드롭.
    const skyGeo = new THREE.PlaneGeometry(200, 80, 1, 8);
    const cTop = new THREE.Color(th.sky?.[0] ?? 0xb8e4f9);
    const cBot = new THREE.Color(th.sky?.[2] ?? 0xb8e4f9);
    const sp = skyGeo.attributes.position;
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < sp.count; i++) { const y = sp.getY(i); if (y < minY) minY = y; if (y > maxY) maxY = y; }
    const cols = [];
    for (let i = 0; i < sp.count; i++) {
      const f = (sp.getY(i) - minY) / (maxY - minY || 1);          // 0 아래 → 1 위
      const c = cBot.clone().lerp(cTop, f);
      cols.push(c.r, c.g, c.b);
    }
    skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
    sky.position.set(0, 20, -48);
    this.scene.add(sky);

    // 태양(주간 sun>0) 또는 화산 노을(volcanicGlow). 밤/폭풍은 둘 다 없음.
    if ((th.sun ?? 0) > 0) {
      const sun = new THREE.Mesh(new THREE.CircleGeometry(4, 6),
        new THREE.MeshBasicMaterial({ color: 0xfff5b0, transparent: true, opacity: Math.min(1, 0.55 + th.sun * 0.45), fog: false }));
      sun.position.set(18, 12, -47);
      this.scene.add(sun);
    } else if (th.volcanicGlow) {
      const glow = new THREE.Mesh(new THREE.CircleGeometry(5, 7),
        new THREE.MeshBasicMaterial({ color: 0xff5a2a, transparent: true, opacity: 0.5, fog: false }));
      glow.position.set(14, 9, -47);
      this.scene.add(glow);
    }

    // 별 (밤 테마) — 하늘 띠에 흩뿌린 점. 의사난수 분포, 하늘판(z=-48) 앞쪽에 배치.
    if (th.stars) {
      const arr = [];
      for (let i = 0; i < 90; i++) {
        arr.push((((i * 137.5) % 92) - 46) * 1.9, 7 + ((i * 53) % 12), -40 - ((i * 29) % 7));
      }
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      const stars = new THREE.Points(sg, new THREE.PointsMaterial({
        color: 0xffffff, size: 0.5, sizeAttenuation: true, transparent: true, opacity: 0.85, fog: false,
      }));
      this.scene.add(stars);
    }

    // 섬 — 연안 테마만. jeju는 별도 3D 세트가 제주 해안을 담당한다.
    if (th.island && this.themeKey !== 'jeju') {
      const island = new THREE.Group();
      const sandMat = new THREE.MeshLambertMaterial({ color: 0xffd166, flatShading: true });
      const peakMat = new THREE.MeshLambertMaterial({ color: th.island.color ?? 0x52b788, flatShading: true });
      const base = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 0.5, 5), sandMat);
      base.position.y = 0.25;
      const peak = new THREE.Mesh(new THREE.ConeGeometry(2.8, 2.2, 5), peakMat);
      peak.position.y = 0.5 + 1.1;
      island.add(base, peak);
      island.position.set(-18, 0, -12);
      this.scene.add(island);
    }

    // 구름 — Icosa 뭉치 ×4, x로 흐름. 테마 clouds(밀도→투명도), 밤/폭풍은 흐릿한 회색.
    this.clouds = [];
    const dim = th.night || th.storm;
    const cloudMat = new THREE.MeshLambertMaterial({
      color: dim ? 0x9aa6b4 : 0xffffff, flatShading: true,
      transparent: true, opacity: Math.max(0.12, Math.min(1, th.clouds ?? 0.85)),
    });
    const puffs = [
      { r: 2.6, p: [ 0.0,  0.0,  0.0] },
      { r: 2.0, p: [-2.4, -0.3,  0.3] },
      { r: 2.2, p: [ 2.2, -0.2, -0.2] },
    ];
    const placements = [
      { pos: [-30, 10, -38], scale: 1.0 },
      { pos: [ 10, 13, -42], scale: 1.3 },
      { pos: [ 35,  8, -34], scale: 0.85 },
      { pos: [ -8, 14, -45], scale: 1.15 },
    ];
    for (const place of placements) {
      const cloud = new THREE.Group();
      for (const pf of puffs) {
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(pf.r, 0), cloudMat);
        m.position.set(...pf.p);
        cloud.add(m);
      }
      cloud.position.set(...place.pos);
      cloud.scale.setScalar(place.scale);
      this.scene.add(cloud);
      this.clouds.push(cloud);
    }
  }

  update(t, dtMs = 16.667) {
    this._t = t;
    this._updateBigWave(dtMs);
    if (this.ocean) this._animateMainOcean(t);   // 이미지 백드롭 테마는 바다 메시가 없음
    if (this.clouds) this._moveClouds();
    this.stageSet?.update(t);
  }

  // 백드롭 텍스처는 scene.background라 disposeObject(씬 자식 순회) 대상이 아님 — 직접 해제.
  dispose() {
    this.backdropTex?.dispose();
    this.skyEnv?.dispose();
    this.stageSet?.dispose();
  }

  // 메인 수면 변위 — 캐시한 정점 월드 (x,z)를 sampleWaveHeight에 넣어 마루를 만든다.
  // mesh.position.y=WATER_Y이므로 정점 y엔 파고만 싣는다(액터도 WATER_Y+파고에 얹혀 정확히 일치).
  _animateMainOcean(t) {
    const { pos, wx, wz, col, baseCol, crest, amp } = this.ocean;
    for (let i = 0; i < pos.count; i++) {
      const h = this.sampleWaveHeight(wx[i], wz[i], t);
      pos.setY(i, h);
      // 높이로 정점색 변조: 마루는 밝은 시안(하늘 반사)으로, 골은 어둡게 → 입체 깊이감.
      let n = h / amp; n = n < -1 ? -1 : n > 1 ? 1 : n;
      const j = i * 3;
      let r = baseCol[j], g = baseCol[j + 1], b = baseCol[j + 2];
      if (n > 0) { const m = n * 0.55; r += (crest.r - r) * m; g += (crest.g - g) * m; b += (crest.b - b) * m; }
      else       { const d = 1 + n * 0.38; r *= d; g *= d; b *= d; }
      col.setXYZ(i, r, g, b);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    this._animateFoamCrests(t);
  }

  // 포말 띠를 너울 마루 위로. 마루 위상 z*k - t*speed = π/2 + 2πn 을 풀어 마루 z를 구한다.
  _animateFoamCrests(t) {
    if (!this.foamCrests) return;
    const p = this.waveParams;
    const k = (Math.PI * 2) / p.swellLen;
    const cx = OCEAN_PLANE.cx;
    // 서퍼 열(cx) 기준 마루 위상. z = (π/2 + 2πn + t*speed - cx*skew) / k
    const base = (Math.PI / 2 + t * p.swellSpeed - cx * p.swellSkew) / k;
    const span = OCEAN_PLANE.depth;
    const zNearEdge = OCEAN_PLANE.cz + span / 2;
    for (let i = 0; i < this.foamCrests.length; i++) {
      const m = this.foamCrests[i];
      // 가장 가까운 마루부터 i파장씩 뒤(원경)로
      let z = base - i * p.swellLen;
      // 마루를 보이는 범위 안으로 래핑(근경 가장자리를 넘으면 한 주기 원경으로)
      const period = p.swellLen;
      const lo = OCEAN_PLANE.cz - span / 2;
      while (z > zNearEdge) z -= period;
      while (z < lo) z += period;
      const crestH = this.sampleWaveHeight(cx, z, t);
      m.position.set(cx, WATER_Y + crestH + 0.05, z);
      // 근경(큰 z)일수록 또렷, 원경일수록 옅게 + 마루가 높을수록 진한 포말
      const near = (z - lo) / span;                       // 0~1
      const sharp = Math.min(1, Math.max(0, crestH / (p.swellAmp * 0.8)));
      m.material.opacity = (0.18 + 0.62 * sharp) * (0.4 + 0.6 * near);
    }
  }

  // ─── 큰 파도 이벤트 ────────────────────────────────────────────────────────────
  // 평소 너울 위에 '진행하는 거대 마루'를 더한다. 원경(작은 z)에서 근경(큰 z=서퍼)으로 밀려온다.
  // GameScene이 trigger로 켜고, sampleWaveHeight에 가산돼 서퍼·장애물·수면이 함께 솟는다.
  // 좌우 포켓형 큰 파도 — 화면 '한쪽(pocketX)'에만 거대 너울이 솟고 나머지는 평평.
  // 플레이어가 그 x-구역에 들어가 타게 한다(판정은 bigWaves.js). env로 차올랐다 빠진다.
  triggerBigWave(opts = {}) {
    this.bigWave = {
      amp:     opts.amp     ?? (1.6 + (this.swell - 1) * 0.7),
      pocketX: opts.pocketX ?? -4.4,   // 포켓 중심(월드 x)
      pocketW: opts.pocketW ?? 1.8,    // 포켓 가로 폭(Gaussian σ, 월드u)
      durMs:   opts.durMs   ?? 5200,
      ageMs: 0, env: 0,
    };
    this.bigWaveProgress = 0;
    this.bigWavePocketX = this.bigWave.pocketX;
  }

  _updateBigWave(dtMs) {
    const bw = this.bigWave;
    if (!bw) { this.bigWaveProgress = 0; this.bigWavePocketX = null; return; }
    bw.ageMs += dtMs;
    const k = Math.min(1, bw.ageMs / bw.durMs);
    bw.env = Math.sin(k * Math.PI);                  // 0→1→0 부드러운 차오름·빠짐
    this.bigWaveProgress = k;
    this.bigWavePocketX = bw.pocketX;
    if (k >= 1) this.bigWave = null;
  }

  // 포켓 x 중심으로만 솟는 덩어리(전폭 벽이 아니라 한쪽). z는 플레이 깊이(≈6) 근처에 완만히.
  _bigWaveHeight(x, z) {
    const bw = this.bigWave;
    const dx = x - bw.pocketX;
    const dz = z - 6;
    const lateral = Math.exp(-(dx * dx) / (bw.pocketW * bw.pocketW));
    const depth   = Math.exp(-(dz * dz) / (7 * 7));
    return bw.amp * bw.env * lateral * depth;
  }

  _moveClouds() {
    for (const cloud of this.clouds) {
      cloud.position.x -= 0.03;   // 바람 — 더 빠른 흐름(파도 전진감과 함께 환경 생동감 ↑)
      if (cloud.position.x < -70) cloud.position.x = 70;
    }
  }
}
