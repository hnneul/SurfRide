import * as THREE from 'three';
import { BACKGROUND_THEMES } from '../oceanBackground.js';
import { JejuStageSet } from './jejuStage.js';

const BG_COLOR = 0x87ceeb;   // 하늘색 폴백 (테마에 sky 없을 때)

// 파도 3겹 레이어 (원경 → 근경). y는 스펙엔 없지만, 같은 평면(y=0)으로 겹치면
// z-파이팅이 생겨 살짝 계단을 줘 근경이 원경 위로 오게 한다.
// ⚠️ 근경 base를 WATER_Y(0.7=서퍼·장애물 ride 평면) 아래로 둔다 — 예전 0.8+진폭0.7은
//    파도 마루(~1.47)가 ride 평면 앞을 휩쓸어 먼 레인 장애물을 가렸음. base를 낮춰 거친 바다(높은
//    진폭)에서도 마루가 장애물을 '지나칠' 뿐 덮지 않게. 진폭은 _animateWaves에서 테마 swell로 스케일.
const WAVE_LAYERS = [
  { z: 0, y: 0.0,  seg: 20, speed: 0.8, width: 120, depth: 30, amp: 1.0, opacity: 1.0 },   // 원경(깊은 청록)
  { z: 5, y: 0.22, seg: 16, speed: 1.1, width: 120, depth: 30, amp: 1.0, opacity: 1.0 },   // 중경
  { z: 9, y: 0.40, seg: 12, speed: 1.5, width: 120, depth: 30, amp: 1.0, opacity: 1.0 },   // 근경
];

const JEJU_WAVE_LAYERS = [
  // far: 불투명(opacity 1.0 → depthWrite:true) 기반판. 수면 바로 아래(y -0.12)에서 마루 crest ~0.34.
  // far edge z=-4 → 화면 44.0%로 투영돼 그림 수평선(45.5%)보다 1.5% 위 → 정적 청록 픽셀 전체를 가림.
  { z: 12.0, y: -0.12, seg: 24, speed: 0.62, width: 150, depth: 32, amp: 0.38, opacity: 1.0 },
  // mid: 불투명 기반판. far edge z=-1.5 → 화면 46.3%(수평선 아래) → 중간 너울 디테일 추가.
  { z:  5.5, y:  0.12, seg: 18, speed: 0.84, width: 132, depth: 14, amp: 0.52, opacity: 1.0 },
  // near: 반투명(0.88) 유지 → 마루 crest 0.58 < WATER_Y 0.7 → 장애물(FLYING_FISH) 위를 지나가되 흐리게만 함.
  { z:  9.0, y:  0.30, seg: 14, speed: 1.02, width: 132, depth: 20, amp: 0.52, opacity: 0.88 },
];

// 3D 물색 오버라이드(테마별, 원경→근경). 없으면 theme.sea[0]에서 밝기 램프로 파생.
// jeju(1스테이지): 사용자가 승인한 '선명한 시안'을 유지(테마 청록 대신).
const SEA3D_OVERRIDE = {
  jeju: [0x007fa7, 0x08b6c6, 0x31ded7],
};

// 스테이지 배경 이미지(픽셀아트) 토글. 테마에 경로를 넣으면 절차적 3D 바다·하늘·섬·구름을 전부
// 생략하고 그 이미지를 화면 전체 백드롭(scene.background)으로 깐다(서퍼·장애물 등 액터는 위에).
// 단점: 정적이라 파도·구름이 안 움직임 → 기본은 비활성(절차적 움직이는 바다 사용).
// 다시 정적 픽셀아트로 쓰려면 아래 한 줄 주석 해제. public/ 루트 절대경로(Vite base '/').
const STAGE_BACKDROP = {
  // jeju: '/stage-1-jeju-pixel.png',
};

// 월드 = 바다(파도 3겹) + 배경(하늘·태양/노을·별·섬·구름) + 조명 + 대기(배경/포그).
// 전부 스테이지 테마(2D OceanBackground와 같은 BACKGROUND_THEMES)에서 색/밤·폭풍/swell을 읽어 적용.
export class World {
  constructor(scene, themeKey) {
    this.scene = scene;
    this.themeKey = themeKey;
    this.theme = BACKGROUND_THEMES[themeKey] ?? BACKGROUND_THEMES.jeju;
    this.swell = this.theme.swell ?? 1;   // 잔잔(1.0) ~ 괴물 파도(1.75)
    this.backdropUrl = STAGE_BACKDROP[themeKey] ?? null;   // 이미지 백드롭 테마면 절차적 배경 생략
    this.stageSet = null;
    this._applyAtmosphere();
    this._buildLighting();
    if (this.backdropUrl) {
      this._buildImageBackdrop();   // 픽셀아트 전체 배경 — 3D 바다·하늘·섬·구름 미생성
    } else {
      this._buildOcean();
      this._buildBackground();
      if (this.themeKey === 'jeju') this.stageSet = new JejuStageSet(this.scene);
    }
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
    if (th.night)        return { ambColor: 0x9fb0da, ambI: 2.8, dirColor: 0x9aabd6, dirI: 0.6 };
    if (th.storm)        return { ambColor: 0xbcc6cf, ambI: 2.8, dirColor: 0xaab4be, dirI: 0.6 };
    if (th.volcanicGlow) return { ambColor: 0xe2b8a0, ambI: 2.8, dirColor: 0xffb070, dirI: 0.65 };
    return { ambColor: 0xffffff, ambI: 2.8, dirColor: 0xffffff, dirI: 0.7 };   // 주간
  }

  // 파도 3겹 — 수평으로 눕힌 평면, update()에서 정점 높이를 변위시켜 잔물결.
  _buildOcean() {
    this.waves = [];
    const colors = this._waterColors();   // [원경, 중경, 근경]
    const layers = this.themeKey === 'jeju' ? JEJU_WAVE_LAYERS : WAVE_LAYERS;
    layers.forEach((def, i) => {
      const geo = new THREE.PlaneGeometry(def.width, def.depth, def.seg, def.seg);
      geo.rotateX(-Math.PI / 2);   // 수평 바다 표면으로 눕힘
      const mat = new THREE.MeshLambertMaterial({
        color: colors[Math.min(colors.length - 1, i)],
        flatShading: true,
        transparent: def.opacity < 1,
        opacity: def.opacity,
        depthWrite: def.opacity >= 1,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(0, def.y, def.z);
      this.scene.add(mesh);
      this.waves.push({ mesh, speed: def.speed, amp: def.amp });
    });
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

  update(t) {
    if (this.waves) this._animateWaves(t);    // 이미지 백드롭 테마는 파도·구름 메시가 없음
    if (this.clouds) this._moveClouds();
    this.stageSet?.update(t);
  }

  // 백드롭 텍스처는 scene.background라 disposeObject(씬 자식 순회) 대상이 아님 — 직접 해제.
  dispose() {
    this.backdropTex?.dispose();
    this.stageSet?.dispose();
  }

  // 파도 — sin/cos 합성으로 정점 높이(y) 변위. flatShading이라 노멀 재계산 불필요. 진폭/촐싹임은
  // 테마 swell로 스케일(잔잔↔괴물파도). z-위상의 시간항을 음수로 둬 마루가 카메라(+z) 쪽으로 굴러와
  // '전진감'을 준다. 근경 base(0.40)가 ride 평면(0.7)보다 낮아 마루가 장애물 위를 '지나갈' 뿐 영구히
  // 덮지 않음(가독성 — swell↑ 시 이 여유가 줄어드니 과하게 올리지 말 것).
  // 참고: 흰 포말/물마루는 vertex-color로 시도했으나 이 매끈한 저폴리 물에선 블룸/스미어가 돼 보류.
  //       제대로 하려면 전용 셰이더/포말 텍스처 필요(별도 작업).
  _animateWaves(t) {
    const sw = this.swell;
    const a1 = 0.30 * sw, a2 = 0.15 * sw;          // 진폭 (잔잔 0.45 ~ 괴물파도 ~0.79)
    for (const { mesh, speed, amp = 1 } of this.waves) {
      const sp  = speed * (1 + (sw - 1) * 0.35);   // 거친 바다일수록 더 빠르게 촐싹임
      const pos = mesh.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const z = pos.getZ(i);
        pos.setY(i,
          (Math.sin(x * 0.18 + t * sp) * a1 +
          Math.cos(z * 0.25 - t * sp * 0.7) * a2) * amp,   // ⬅ -t: 마루가 카메라 쪽으로 굴러옴(전진감)
        );
      }
      pos.needsUpdate = true;
    }
  }

  _moveClouds() {
    for (const cloud of this.clouds) {
      cloud.position.x -= 0.03;   // 바람 — 더 빠른 흐름(파도 전진감과 함께 환경 생동감 ↑)
      if (cloud.position.x < -70) cloud.position.x = 70;
    }
  }
}
