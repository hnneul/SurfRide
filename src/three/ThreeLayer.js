import * as THREE from 'three';
import { LOGICAL_WIDTH, LOGICAL_HEIGHT, RIDE_TOP_Y, RIDE_BOTTOM_Y } from '../constants.js';
import { BACKGROUND_THEMES } from '../oceanBackground.js';

// 게임 픽셀 좌표 → 3D 월드 유닛 스케일 (1 unit = PX_PER_UNIT px).
const PX_PER_UNIT = 90;

const BG_COLOR = 0x87ceeb;   // 하늘색 — scene.background + fog 공용(둘 다 같이 밝게)

// ── 게임 ↔ 3D 좌표 브리지 (서퍼·장애물 배치) ──
// 게임은 고정 열(x=ERUPT_X)에서 수직(baseY/targetY)으로만 움직이는 2D. 카메라가 수면을
// 내려다보므로 게임 x→월드 x, 게임 수직→월드 z(깊이)로 매핑해 수면 위를 타게 한다.
// (수직을 월드 y로 두면 아래 레인이 물에 잠김.) 충돌은 기존 2D AABB가 담당.
const WATER_Y     = 0.7;   // 서퍼·장애물이 얹히는 수면 높이
const RIDE_Z_FAR  = 2;     // baseY=RIDE_TOP_Y(마루·안전·화면 위)    → 먼 z
const RIDE_Z_NEAR = 11;    // baseY=RIDE_BOTTOM_Y(거친 바다·위험·아래) → 가까운 z

// 파도 3겹 레이어 (원경 → 근경). y는 스펙엔 없지만, 같은 평면(y=0)으로 겹치면
// z-파이팅이 생겨 살짝 계단을 줘 근경이 원경 위로 오게 한다.
// ⚠️ 근경 base를 WATER_Y(0.7=서퍼·장애물 ride 평면) 아래로 둔다 — 예전 0.8+진폭0.7은
//    파도 마루(~1.47)가 ride 평면 앞을 휩쓸어 먼 레인 장애물을 가렸음. base를 낮춰 거친 바다(높은
//    진폭)에서도 마루가 장애물을 '지나칠' 뿐 덮지 않게. 진폭은 _animateWaves에서 테마 swell로 스케일.
const WAVE_LAYERS = [
  { z: 0, y: 0.0,  color: 0x00b4d8, seg: 20, speed: 0.8 },   // 원경(깊은 청록)
  { z: 5, y: 0.22, color: 0x20c8e4, seg: 16, speed: 1.1 },   // 중경
  { z: 9, y: 0.40, color: 0x32e4ec, seg: 12, speed: 1.5 },   // 근경(밝은 시안) — ride 평면(0.7) 아래
];

// Phaser 2D 캔버스를 대체하는 Three.js 렌더 레이어.
//
// 1단계: 씬·카메라·조명. 2단계(현재): 파도 3겹 + 배경(하늘·태양·섬·구름) 추가.
// 게임 로직·입력·점수·HUD는 그대로 Phaser가 담당하고, 게임 루프도 Phaser가 주도한다.
// GameScene.update()가 매 프레임 render(dt)를 호출해 "보이는 것"만 Three에 위임한다.
export class ThreeLayer {
  constructor(themeKey = 'jeju', parentId = 'game-container') {
    const parent = document.getElementById(parentId);
    const w = parent.clientWidth  || window.innerWidth;
    const h = parent.clientHeight || window.innerHeight;
    this.t = 0;   // 파도 애니메이션 누적 시간(s)
    this._shakeMs = 0;   // 카메라 흔들림 남은 시간(ms)

    // 스테이지 테마 — 2D OceanBackground와 같은 데이터 사용(일관성). 지금은 swell(너울 세기)만
    // 3D 파도에 반영. (색/밤·폭풍 등 나머지 테마 적용은 후속.)
    this._theme = BACKGROUND_THEMES[themeKey] ?? BACKGROUND_THEMES.jeju;
    this._swell = this._theme.swell ?? 1;   // 잔잔(1.0) ~ 괴물 파도(1.75)

    // ── 렌더러 ── 게임 컨테이너 위에 absolute로 올리는 투명 가능 WebGL 캔버스
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);

    const el = this.renderer.domElement;
    el.style.position = 'absolute';
    el.style.inset = '0';
    el.style.width = '100%';
    el.style.height = '100%';
    el.style.pointerEvents = 'none';   // 키보드 입력은 Phaser(window)가 계속 수신
    el.style.zIndex = '1';
    parent.appendChild(el);
    this._el = el;

    // ── 씬 ── 배경·포그 = 테마 하늘 중간톤(거리 헤이즈). 밤/폭풍은 자동으로 어두워짐.
    this.scene = new THREE.Scene();
    const atmo = this._theme.sky?.[1] ?? BG_COLOR;
    this.scene.background = new THREE.Color(atmo);
    this.scene.fog = new THREE.Fog(atmo, 55, 110);

    // ── 카메라 ── 원점을 정면에서 약간 위·뒤로 물러나 바라보는 시점
    this.camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 1000);
    this.camera.position.set(0, 10, 22);
    this.camera.lookAt(0, 0, 0);

    // ── 조명 ── 테마 분위기별(주간 밝게 / 밤 어둡고 차갑게 / 폭풍 흐리게 / 화산 따뜻하게).
    // r0.184 ÷π 보정: 실효≈intensity/π → 주간 ambient 2.8(실효~0.9)로 색 선명. 신호·황금물고기는
    // MeshBasic/emissive라 조명과 무관하게 밝아, 밤에도 예고/획득은 보임(장애물 메시만 어두워짐 = 의도된 야간 가시성↓).
    const L = this._lightingForTheme(this._theme);
    this.scene.add(new THREE.AmbientLight(L.ambColor, L.ambI));

    const dir = new THREE.DirectionalLight(L.dirColor, L.dirI);
    dir.position.set(5, 10, 8);
    this.scene.add(dir);

    this._obstacleMeshes = new Map();   // 게임 장애물 인스턴스 → Three 메시
    this._signalMeshes = new Map();     // 예고 신호 인스턴스 → Three 마커
    this._goldenMeshes = new Map();     // 황금물고기 인스턴스 → Three 메시
    this._goldenBursts = [];            // 획득 연출(확장 링) — 수명 가진 임시 메시
    this._buildOcean();
    this._buildBackground();
    this._buildSurfer();

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
  }

  // 테마 분위기는 '빛 색(틴트)'으로 표현(밤=차가운 청 / 폭풍=회색 / 화산=따뜻함).
  // ⚠️ 밝기는 가독성 위해 주간과 거의 같게 유지 — 밤도 플레이 화면은 보여야 함.
  // (예전 1.55/1.95는 어두운 물색과 겹쳐 7~10해역이 안 보일 정도로 깜깜했음.) 밤 우선(final=night+storm).
  _lightingForTheme(th) {
    if (th.night)        return { ambColor: 0x9fb0da, ambI: 2.8, dirColor: 0x9aabd6, dirI: 0.6 };
    if (th.storm)        return { ambColor: 0xbcc6cf, ambI: 2.8, dirColor: 0xaab4be, dirI: 0.6 };
    if (th.volcanicGlow) return { ambColor: 0xe2b8a0, ambI: 2.8, dirColor: 0xffb070, dirI: 0.65 };
    return { ambColor: 0xffffff, ambI: 2.8, dirColor: 0xffffff, dirI: 0.7 };   // 주간
  }

  // 파도 3겹 — 수평으로 눕힌 평면, render()에서 정점 높이를 변위시켜 잔물결.
  // 색: 테마 표면색(sea[0]) 한 색에서 밝기 램프로 3겹 파생(원경 어둡게→근경 밝게).
  // ⚠️ 층이 z로 겹쳐 파도 골 사이로 아래 층이 비치는데, sea[0]→sea[2] 전 범위를 쓰면 대비가 커서
  //    어두운 패치가 튐 → 한 색에서 미세 darken만 줘 일관된 수면 유지(가독성).
  _buildOcean() {
    this.waves = [];
    const sea = this._theme.sea ?? [0x00b4d8, 0x20c8e4, 0x32e4ec];
    const surface = new THREE.Color(sea[0]);
    // 어두운 테마(밤·폭풍·화산)도 수면이 보이도록 명도 하한 — hue·채도(테마 분위기)는 유지.
    const hsl = { h: 0, s: 0, l: 0 };
    surface.getHSL(hsl);
    if (hsl.l < 0.45) surface.setHSL(hsl.h, hsl.s, 0.45);
    const shade = [0.80, 0.90, 1.0];   // 원경(z0)→근경(z9): 어둡게→밝은 표면색
    WAVE_LAYERS.forEach((def, i) => {
      const geo = new THREE.PlaneGeometry(120, 30, def.seg, def.seg);
      geo.rotateX(-Math.PI / 2);   // 수평 바다 표면으로 눕힘
      const color = surface.clone().multiplyScalar(shade[Math.min(shade.length - 1, i)]);
      const mat = new THREE.MeshLambertMaterial({ color, flatShading: true });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(0, def.y, def.z);
      this.scene.add(mesh);
      this.waves.push({ mesh, speed: def.speed });
    });
  }

  // 파도 — sin/cos 합성으로 정점 높이(y) 변위. flatShading이라 노멀 재계산 불필요.
  // 진폭/촐싹임을 테마 swell로 스케일(잔잔↔괴물파도). 근경 base(0.40)가 ride 평면(0.7)보다
  // 낮아, 거칠어져도 마루가 장애물 위를 '지나갈' 뿐 영구히 덮지 않음(가독성 보존).
  _animateWaves() {
    const t  = this.t;
    const sw = this._swell;
    const a1 = 0.30 * sw, a2 = 0.15 * sw;          // 진폭 (잔잔 0.45 ~ 괴물파도 ~0.79)
    for (const { mesh, speed } of this.waves) {
      const sp  = speed * (1 + (sw - 1) * 0.35);   // 거친 바다일수록 더 빠르게 촐싹임
      const pos = mesh.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const z = pos.getZ(i);
        pos.setY(i,
          Math.sin(x * 0.18 + t * sp) * a1 +
          Math.cos(z * 0.25 + t * sp * 0.7) * a2,
        );
      }
      pos.needsUpdate = true;
    }
  }

  // 배경 — 하늘(그라데이션) · 태양/화산노을 · 별(밤) · 섬(연안 테마만) · 구름. 전부 테마색.
  _buildBackground() {
    const th = this._theme;

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

    // 섬 — 연안 테마(jeju 계열)만. 외해/밤/폭풍은 생략해 탁 트인 바다.
    if (th.island) {
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

  _moveClouds() {
    for (const cloud of this.clouds) {
      cloud.position.x -= 0.012;
      if (cloud.position.x < -70) cloud.position.x = 70;
    }
  }

  // ── 서퍼 (BoxGeometry 조합, 모두 flatShading) ──
  // 팔 색은 스펙 미지정 → 머리(피부톤)와 동일하게 맞춤.
  _buildSurfer() {
    const box = (w, h, d, color) =>
      new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
        new THREE.MeshLambertMaterial({ color, flatShading: true }));

    const g = new THREE.Group();
    const board = box(2.4, 0.12, 0.65, 0xfff0d0);
    const body  = box(0.35, 0.58, 0.3, 0xff7733); body.position.y = 0.65;
    const head  = box(0.28, 0.28, 0.28, 0xe8a882); head.position.y = 1.1;
    const armL  = box(0.55, 0.14, 0.14, 0xe8a882); armL.position.set(-0.33, 0.78, 0); armL.rotation.z =  0.4;
    const armR  = box(0.55, 0.14, 0.14, 0xe8a882); armR.position.set( 0.33, 0.78, 0); armR.rotation.z = -0.4;
    const legL  = box(0.18, 0.36, 0.18, 0x3366aa); legL.position.set(-0.13, 0.3, 0);
    const legR  = box(0.18, 0.36, 0.18, 0x3366aa); legR.position.set( 0.13, 0.3, 0);

    g.add(board, legL, legR, body, armL, armR, head);
    this.surfer = g;
    this.scene.add(g);
  }

  // 게임 player 상태를 서퍼 메시에 연결 + 출렁임/기울임 애니메이션
  _updateSurfer(player, cursors) {
    if (!this.surfer || !player) return;
    const t = this.t;
    const bob  = Math.sin(t * 2) * 0.06;                  // 파도 출렁임
    const jump = (player.jumpOffset ?? 0) / PX_PER_UNIT;  // 점프 높이(게임 px → 월드)
    this.surfer.position.set(
      this._gameX2WorldX(player.x),
      WATER_Y + bob + jump,
      this._rideY2WorldZ(player.baseY),
    );
    const lean = (cursors?.left?.isDown ? -0.08 : 0) + (cursors?.right?.isDown ? 0.08 : 0);
    this.surfer.rotation.z = Math.sin(t * 1.8) * 0.06 + lean;
  }

  // ── 장애물 메시 (저폴리, 모두 base가 그룹 원점=수면에 — scale.y 분출에 맞춤) ──
  _makeObstacleMesh(type) {
    const g = new THREE.Group();
    const L = (geo, color, opts = {}) =>
      new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts }));
    const Bm = (geo, color, opts = {}) =>
      new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, ...opts }));

    switch (type) {
      case 'SHARK': {                        // 상어 — 등지느러미
        const fin = L(new THREE.ConeGeometry(0.4, 1.1, 4), 0x557799);
        fin.position.y = 0.55; fin.rotation.z = 0.15;
        g.add(fin);
        break;
      }
      case 'JELLYFISH': {                    // 해파리 — 반투명 돔
        g.add(L(new THREE.SphereGeometry(0.5, 5, 4, 0, Math.PI * 2, 0, Math.PI / 2),
          0xff88cc, { flatShading: false, transparent: true, opacity: 0.8 }));
        break;
      }
      case 'FLYING_FISH': {                  // 날치 — 주황 몸통 + 꼬리 + 날개
        const body = L(new THREE.IcosahedronGeometry(0.42, 0), 0xff8a3d);
        body.scale.set(1.9, 0.8, 0.8); body.position.y = 0.62;
        const tail = L(new THREE.ConeGeometry(0.28, 0.45, 4), 0xff7043);
        tail.rotation.z = Math.PI / 2; tail.position.set(-0.82, 0.62, 0);
        const wingL = L(new THREE.BoxGeometry(0.55, 0.05, 0.42), 0xffd180);
        wingL.position.set(0, 0.72, 0.34); wingL.rotation.x = -0.5;
        const wingR = L(new THREE.BoxGeometry(0.55, 0.05, 0.42), 0xffd180);
        wingR.position.set(0, 0.72, -0.34); wingR.rotation.x = 0.5;
        g.add(body, tail, wingL, wingR);
        break;
      }
      case 'WHALE': {                        // 고래 — 큰 짙은 청색 몸통 + 밝은 배 + 꼬리 + 물기둥
        const body = L(new THREE.IcosahedronGeometry(1.3, 0), 0x274a6e);
        body.scale.set(1.6, 0.82, 1.0); body.position.y = 1.05;
        const belly = L(new THREE.IcosahedronGeometry(1.0, 0), 0xbcdcec);
        belly.scale.set(1.5, 0.34, 0.74); belly.position.y = 0.6;
        const tail = L(new THREE.BoxGeometry(0.5, 0.08, 1.2), 0x1d324f);
        tail.position.set(-2.0, 1.1, 0); tail.rotation.z = 0.2;
        const spout = Bm(new THREE.ConeGeometry(0.22, 0.7, 5), 0xd6f4ff, { transparent: true, opacity: 0.7 });
        spout.position.set(0.7, 2.1, 0);
        g.add(body, belly, tail, spout);
        break;
      }
      case 'OCTOPUS': {                      // 문어 — 보라 머리 + 다리 6 + 눈
        const head = L(new THREE.IcosahedronGeometry(0.72, 0), 0x9b4dd8);
        head.position.y = 1.05;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const leg = L(new THREE.ConeGeometry(0.13, 0.8, 4), 0x7b2dbb);
          leg.position.set(Math.cos(a) * 0.44, 0.45, Math.sin(a) * 0.44);
          leg.rotation.x = Math.PI;          // 끝이 아래로
          g.add(leg);
        }
        const eyeL = Bm(new THREE.SphereGeometry(0.13, 6, 6), 0xffffff);
        eyeL.position.set(0.46, 1.1, 0.28);
        const eyeR = Bm(new THREE.SphereGeometry(0.13, 6, 6), 0xffffff);
        eyeR.position.set(0.46, 1.1, -0.28);
        g.add(head, eyeL, eyeR);
        break;
      }
      case 'LIGHTNING': {                    // 번개 — 노란 지그재그 볼트(발광)
        const seg = (x, y, rot) => {
          const s = Bm(new THREE.BoxGeometry(0.16, 0.78, 0.16), 0xffe14d);
          s.position.set(x, y, 0); s.rotation.z = rot;
          return s;
        };
        g.add(seg(0, 0.5, 0.5), seg(0.16, 1.1, -0.5), seg(0, 1.7, 0.5), seg(-0.12, 2.3, -0.4));
        break;
      }
      default: {                             // 폴백
        const box = L(new THREE.BoxGeometry(0.9, 0.9, 0.6), 0x8893a6);
        box.position.y = 0.45;
        g.add(box);
        break;
      }
    }
    return g;
  }

  // 활성 장애물 ↔ 메시 동기화: x→월드 x, targetY→월드 z, reveal→솟아오름(scale.y)
  _syncObstacles(obstacles) {
    const seen = this._seenObs ?? (this._seenObs = new Set());
    seen.clear();
    if (obstacles) {
      for (const obs of obstacles) {
        if (!obs.active) continue;
        let mesh = this._obstacleMeshes.get(obs);
        if (!mesh) {
          mesh = this._makeObstacleMesh(obs.type);
          this.scene.add(mesh);
          this._obstacleMeshes.set(obs, mesh);
        }
        mesh.position.set(this._gameX2WorldX(obs.x), WATER_Y, this._rideY2WorldZ(obs.targetY));
        mesh.scale.y = Math.max(0.08, obs.reveal ?? 1);
        mesh.visible = (obs.reveal ?? 1) > 0.02;
        seen.add(obs);
      }
    }
    for (const [obs, mesh] of this._obstacleMeshes) {   // 사라진 장애물 메시 정리
      if (!seen.has(obs)) {
        this.scene.remove(mesh);
        this._disposeObject(mesh);
        this._obstacleMeshes.delete(obs);
      }
    }
  }

  // ── 황금물고기 — 오른쪽에서 헤엄쳐 들어와 왼쪽으로 빠짐(머리는 -x 방향) ──
  // 장애물과 달리 x로 가로지르므로 게임 x→월드 x, 레인 y→월드 z(깊이). 자체발광+헤일로로 '특별함'.
  _makeGoldenFishMesh() {
    const g = new THREE.Group();
    const L = (geo, color, opts = {}) =>
      new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts }));
    const Bm = (geo, color, opts = {}) =>
      new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, ...opts }));

    const body = L(new THREE.IcosahedronGeometry(0.5, 0), 0xffd24a, { emissive: 0x7a5a00, emissiveIntensity: 0.55 });
    body.scale.set(1.5, 0.78, 0.6);
    const belly = L(new THREE.IcosahedronGeometry(0.42, 0), 0xfff0b0);
    belly.scale.set(1.35, 0.32, 0.5); belly.position.y = -0.12;
    const tail = L(new THREE.ConeGeometry(0.32, 0.62, 5), 0xffb300);
    tail.rotation.z = -Math.PI / 2; tail.position.x = 0.82;     // +x 뒤쪽(머리는 -x)
    const fin = L(new THREE.ConeGeometry(0.18, 0.42, 4), 0xffc233);
    fin.position.set(0.04, 0.34, 0); fin.rotation.z = -0.2;
    const eyeL = Bm(new THREE.SphereGeometry(0.09, 8, 8), 0xffffff); eyeL.position.set(-0.5, 0.12, 0.22);
    const eyeR = Bm(new THREE.SphereGeometry(0.09, 8, 8), 0xffffff); eyeR.position.set(-0.5, 0.12, -0.22);
    const pupilL = Bm(new THREE.SphereGeometry(0.045, 6, 6), 0x3a2600); pupilL.position.set(-0.56, 0.12, 0.24);
    const pupilR = Bm(new THREE.SphereGeometry(0.045, 6, 6), 0x3a2600); pupilR.position.set(-0.56, 0.12, -0.24);
    const glow = Bm(new THREE.SphereGeometry(0.72, 10, 8), 0xffe27a, { transparent: true, opacity: 0.18, depthWrite: false });
    glow.scale.set(1.6, 0.95, 0.85);

    g.add(body, belly, tail, fin, eyeL, eyeR, pupilL, pupilR, glow);
    g.userData.tail = tail;
    g.userData.glow = glow;
    return g;
  }

  // 활성 황금물고기 ↔ 메시 동기화. 획득 시(배열에서 빠진 키의 collected) 확장 링 연출.
  _syncGoldenFish(fishes) {
    const seen = this._seenGold ?? (this._seenGold = new Set());
    seen.clear();
    if (fishes) {
      for (const fish of fishes) {
        if (fish.gone) continue;
        let mesh = this._goldenMeshes.get(fish);
        if (!mesh) {
          mesh = this._makeGoldenFishMesh();
          this.scene.add(mesh);
          this._goldenMeshes.set(fish, mesh);
        }
        const age = fish.ageMs ?? 0;
        const bob = Math.sin(age * 0.006 + (fish.bobSeed ?? 0)) * 0.12;     // 2D bob(±10px)에 대응
        mesh.position.set(this._gameX2WorldX(fish.x), WATER_Y + 0.28 + bob, this._rideY2WorldZ(fish.y));
        const pulse = 0.5 + 0.5 * Math.sin(age * 0.01);
        mesh.userData.glow.scale.set(1.6 * (1 + pulse * 0.16), 0.95 * (1 + pulse * 0.16), 0.85 * (1 + pulse * 0.16));
        mesh.userData.glow.material.opacity = 0.14 + pulse * 0.16;
        mesh.userData.tail.rotation.y = Math.sin(this.t * 9 + (fish.bobSeed ?? 0)) * 0.5;   // 꼬리 흔듦
        seen.add(fish);
      }
    }
    for (const [fish, mesh] of this._goldenMeshes) {
      if (!seen.has(fish)) {
        if (fish.collected) this._spawnGoldenBurst(mesh.position);   // 잡힌 자리에서 펑
        this.scene.remove(mesh);
        this._disposeObject(mesh);
        this._goldenMeshes.delete(fish);
      }
    }
  }

  // 획득 연출 — 수면에서 퍼지며 사라지는 금빛 링(2D collect 링의 3D판)
  _spawnGoldenBurst(pos) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.25, 0.5, 24),
      new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(pos);
    this.scene.add(ring);
    this._goldenBursts.push({ obj: ring, ageMs: 0, lifeMs: 420 });
  }

  _animateGoldenBursts(dtMs) {
    for (let i = this._goldenBursts.length - 1; i >= 0; i--) {
      const b = this._goldenBursts[i];
      b.ageMs += dtMs;
      const k = Math.min(1, b.ageMs / b.lifeMs);
      b.obj.scale.setScalar(1 + k * 4.5);
      b.obj.material.opacity = 0.9 * (1 - k);
      if (k >= 1) {
        this.scene.remove(b.obj);
        this._disposeObject(b.obj);
        this._goldenBursts.splice(i, 1);
      }
    }
  }

  // ── 예고 신호(텔레그래프) — 장애물이 솟을 자리/타이밍을 수면에 표시 ──
  // 타입(SignalType)별 고유 비주얼: 날치=물보라 링, 상어=등지느러미, 고래=떠오르는 그림자,
  // 해파리=맥동 발광, 문어=솟는 다리, 번개=깜빡이는 광주. 2D(obstacle.js)의 신호 의미를 3D로 옮김.
  // 공통 조준 레티클(빨강 십자)은 타겟/임박일 때만 켜진다 — 색은 MeshBasic(조명 ÷π 영향 없이 선명).
  _makeSignalMarker(type) {
    const g = new THREE.Group();
    const mat = (color, opacity = 1, side = THREE.DoubleSide) =>
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side, depthWrite: false });
    const disc = (radius, color, opacity) => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(radius, 24), mat(color, opacity));
      m.rotation.x = -Math.PI / 2;
      return m;
    };
    const ring = (inner, outer, color, opacity) => {
      const m = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 28), mat(color, opacity));
      m.rotation.x = -Math.PI / 2;
      return m;
    };
    const ud = g.userData;
    ud.type = type;

    switch (type) {
      case 'SPLASH': {            // 날치 — 퍼지는 물보라 링 + 튀어오르는 물방울
        const r = ring(0.5, 0.72, 0xffffff, 0.7);
        const drops = [];
        for (let i = 0; i < 3; i++) {
          const d = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), mat(0xbfe7ff, 0.9, THREE.FrontSide));
          drops.push(d); g.add(d);
        }
        g.add(r);
        ud.ring = r; ud.drops = drops;
        break;
      }
      case 'FIN': {               // 상어 — 수면을 가르는 등지느러미 + 항적
        const fin = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.0, 3), mat(0x12324f, 0.9, THREE.FrontSide));
        fin.scale.z = 0.34; fin.position.y = 0.5; fin.rotation.x = 0.12;
        const wake = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.16), mat(0xbcd4e6, 0.5));
        wake.rotation.x = -Math.PI / 2; wake.position.set(0.95, 0.02, 0);
        g.add(fin, wake);
        ud.fin = fin; ud.wake = wake;
        break;
      }
      case 'SHADOW': {            // 고래 — 떠오르며 커지는 거대한 어두운 그림자(점프 불가 = 큰 발자국)
        const outer = disc(1.0, 0x041f3a, 0.5); outer.scale.set(1.5, 1, 1);
        const inner = disc(0.62, 0x0a3a63, 0.45); inner.scale.set(1.5, 1, 1); inner.position.y = 0.01;
        g.add(outer, inner);
        ud.outer = outer; ud.inner = inner;
        break;
      }
      case 'GLOW': {              // 해파리 — 맥동하는 발광(헤일로 + 돔 + 코어)
        const halo = disc(0.7, 0x7af7e0, 0.2);
        const dome = new THREE.Mesh(
          new THREE.SphereGeometry(0.42, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x7af7e0, 0.35));
        dome.position.y = 0.02;
        const core = disc(0.16, 0xd4fff6, 0.85); core.position.y = 0.04;
        g.add(halo, dome, core);
        ud.halo = halo; ud.dome = dome; ud.core = core;
        break;
      }
      case 'TENTACLE': {          // 문어 — 수면에서 솟아 구불대는 다리 3
        const arms = [];
        for (let i = -1; i <= 1; i++) {
          const arm = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.95, 5), mat(0x6a2db5, 0.85, THREE.FrontSide));
          arm.position.set(i * 0.3, 0.45, 0);
          arms.push(arm); g.add(arm);
        }
        ud.arms = arms;
        break;
      }
      case 'FLASH': {             // 번개 — 깜빡이는 광주 + 지그재그 볼트(점프 불가 = 위→아래)
        const column = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.2, 0.5), mat(0xfff7a0, 0.16));
        column.position.y = 1.6;
        const bolt = new THREE.Group();
        const seg = (x, y, rot) => {
          const s = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 0.1), mat(0xfff04d, 0.9, THREE.FrontSide));
          s.position.set(x, y, 0); s.rotation.z = rot; return s;
        };
        bolt.add(seg(0, 0.5, 0.4), seg(0.12, 1.05, -0.4), seg(-0.02, 1.6, 0.4));
        g.add(column, bolt);
        ud.column = column; ud.bolt = bolt;
        break;
      }
      default: {                  // 폴백 — 단순 링
        const r = ring(0.5, 0.72, 0xffffff, 0.7);
        g.add(r); ud.ring = r;
        break;
      }
    }

    // 공통 조준 레티클 — 타겟(빨강 십자) / 임박(흰 닫힘 링)일 때만 보임
    const reticle = new THREE.Group();
    const rRing = ring(0.95, 1.12, 0xff3b30, 0);
    reticle.add(rRing);
    const ticks = [];
    for (const [x, z, ry] of [[1.04, 0, 0], [-1.04, 0, 0], [0, 1.04, Math.PI / 2], [0, -1.04, Math.PI / 2]]) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.02, 0.06), mat(0xff6b5e, 0, THREE.FrontSide));
      t.position.set(x, 0.02, z); t.rotation.y = ry;
      ticks.push(t); reticle.add(t);
    }
    reticle.visible = false;
    g.add(reticle);
    ud.reticle = reticle; ud.reticleRing = rRing; ud.reticleTicks = ticks;
    return g;
  }

  // 활성 신호 ↔ 마커 동기화: x→월드 x, y(lane)→월드 z. 가짜 신호도 표시(블러핑).
  _syncSignals(signals) {
    const seen = this._seenSig ?? (this._seenSig = new Set());
    seen.clear();
    if (signals) {
      for (const sig of signals) {
        if (sig.done) continue;
        let m = this._signalMeshes.get(sig);
        if (!m) {
          m = this._makeSignalMarker(sig.type);
          this.scene.add(m);
          this._signalMeshes.set(sig, m);
        }
        m.position.set(this._gameX2WorldX(sig.x), WATER_Y + 0.06, this._rideY2WorldZ(sig.y));
        this._animateSignal(m, sig);
        seen.add(sig);
      }
    }
    for (const [sig, m] of this._signalMeshes) {
      if (!seen.has(sig)) {
        this.scene.remove(m);
        this._disposeObject(m);
        this._signalMeshes.delete(sig);
      }
    }
  }

  // 타입별 신호 애니메이션 + 공통 조준 레티클. progress(0→1)로 임박, elapsed로 맥동/깜빡임.
  _animateSignal(m, sig) {
    const p      = sig.progress ?? 0;
    const e      = sig.elapsed ?? 0;
    const ud     = m.userData;
    const appear = Math.min(1, p / 0.12);                 // 등장 직후 빠른 fade-in
    const pulse  = 0.5 + 0.5 * Math.sin(e * 0.012);

    switch (ud.type) {
      case 'SPLASH': {            // 퍼지는 링 + 튀는 물방울
        ud.ring.scale.setScalar(0.5 + p * 1.3);
        ud.ring.material.opacity = (0.7 - p * 0.45) * appear;
        ud.drops.forEach((d, i) => {
          const ph  = e * 0.009 + i * 2.1;
          const hop = Math.max(0, Math.sin(ph));
          d.position.set((i - 1) * 0.34, 0.05 + hop * 0.55, Math.cos(ph) * 0.2);
          d.material.opacity = 0.9 * appear;
        });
        break;
      }
      case 'FIN': {               // 좌우로 가르는 지느러미 + 길어지는 항적
        ud.fin.material.opacity = 0.9 * appear;
        ud.fin.rotation.z = Math.sin(e * 0.006) * 0.12;
        ud.wake.scale.x = 1 + p * 0.5;
        ud.wake.material.opacity = (0.5 - p * 0.2) * appear * (0.6 + 0.4 * pulse);
        break;
      }
      case 'SHADOW': {            // 떠오르며 커지고 짙어지는 그림자
        const grow = 0.7 + p * 0.9;
        ud.outer.scale.set(1.5 * grow, 1, grow);
        ud.inner.scale.set(1.5 * grow, 1, grow);
        ud.outer.material.opacity = (0.3 + p * 0.4) * appear;
        ud.inner.material.opacity = (0.25 + p * 0.35) * appear;
        break;
      }
      case 'GLOW': {              // 맥동하는 발광
        ud.halo.scale.setScalar(1 + pulse * 0.18 + p * 0.2);
        ud.halo.material.opacity = (0.12 + pulse * 0.16) * appear;
        ud.dome.scale.setScalar(0.9 + pulse * 0.12);
        ud.dome.material.opacity = (0.28 + pulse * 0.2) * appear;
        ud.core.material.opacity = (0.5 + pulse * 0.4) * appear;
        break;
      }
      case 'TENTACLE': {          // 솟아오르며 구불대는 다리
        ud.arms.forEach((arm, i) => {
          arm.position.y = 0.45 + p * 0.35;
          arm.scale.y    = 0.6 + p * 0.6;
          arm.rotation.z = Math.sin(e * 0.01 + i * 1.4) * 0.35;
          arm.material.opacity = 0.85 * appear;
        });
        break;
      }
      case 'FLASH': {             // 깜빡이는 광주 + 점멸 볼트
        const blink = 0.5 + 0.5 * Math.sin(e * 0.045);
        ud.column.material.opacity = (0.08 + blink * 0.22) * (0.4 + p * 0.6);
        ud.bolt.visible = blink > 0.35;
        ud.bolt.children.forEach((s) => { s.material.opacity = (0.5 + blink * 0.5) * appear; });
        break;
      }
      default: {
        if (ud.ring) ud.ring.material.opacity = (0.4 + 0.4 * p) * appear;
        break;
      }
    }

    // 공통 조준 레티클: 타겟(빨강 십자)이거나 임박(흰 닫힘 링)일 때만. 가짜 신호는 임박 tell 없음(블러핑).
    const targeted = !!sig.targeted;
    const imminent = !sig.isFake && p >= 0.75;
    const ret      = ud.reticle;
    if (targeted || imminent) {
      ret.visible = true;
      ret.scale.setScalar(1.25 - p * 0.55);               // 닫혀오는 조준
      const blink = 0.5 + 0.5 * Math.sin(e * (targeted ? 0.03 : 0.05));
      const op    = targeted ? 0.55 + 0.45 * blink
                             : ((p - 0.75) / 0.25) * (0.4 + 0.5 * blink);
      ud.reticleRing.material.color.setHex(targeted ? 0xff3b30 : 0xffffff);
      ud.reticleRing.material.opacity = op;
      ud.reticleTicks.forEach((t) => {                    // 십자선은 타겟 전용
        t.visible = targeted;
        t.material.opacity = op * 0.9;
      });
    } else {
      ret.visible = false;
    }
  }

  // 게임 x(고정 열) → 월드 x
  _gameX2WorldX(gx) {
    return (gx - LOGICAL_WIDTH / 2) / PX_PER_UNIT;
  }

  // 게임 수직(baseY/targetY) → 월드 z(깊이): 마루(위)=먼 z, 거친 바다(아래)=가까운 z
  _rideY2WorldZ(gy) {
    const f = (gy - RIDE_TOP_Y) / (RIDE_BOTTOM_Y - RIDE_TOP_Y);
    const cf = f < 0 ? 0 : f > 1 ? 1 : f;
    return RIDE_Z_FAR + cf * (RIDE_Z_NEAR - RIDE_Z_FAR);
  }

  _disposeObject(obj) {
    obj.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      }
    });
  }

  // 게임 화면 픽셀 → 3D 월드 좌표 (범용 헬퍼)
  gameToWorld(gx, gy, gz = 0) {
    return new THREE.Vector3(
       (gx - LOGICAL_WIDTH  / 2) / PX_PER_UNIT,
      -(gy - LOGICAL_HEIGHT / 2) / PX_PER_UNIT,
       gz,
    );
  }

  resize() {
    const w = this._el.parentElement?.clientWidth  || window.innerWidth;
    const h = this._el.parentElement?.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(dtMs = 16.667, state = null) {
    this.t += dtMs / 1000;
    this._animateWaves();
    this._moveClouds();
    if (state) {
      this._updateSurfer(state.player, state.cursors);
      this._syncSignals(state.signals);
      this._syncObstacles(state.obstacles);
      this._syncGoldenFish(state.goldenFishes);
    }
    this._animateGoldenBursts(dtMs);
    this._applyShake(dtMs);
    this.renderer.render(this.scene, this.camera);
  }

  // 카메라 흔들림 — GameScene이 shake()로 트리거(피격·기상이변·위험구간). 기준(0,10,22)에 지터.
  shake(durationMs, intensity = 0.006) {
    this._shakeMs  = durationMs;
    this._shakeDur = durationMs;
    this._shakeAmp = intensity;
  }

  _applyShake(dtMs) {
    let ox = 0, oy = 0;
    if (this._shakeMs > 0) {
      this._shakeMs -= dtMs;
      const f = Math.max(0, this._shakeMs) / (this._shakeDur || 1);   // 1→0 감쇠
      const amp = (this._shakeAmp || 0) * 26 * f;
      ox = (Math.random() - 0.5) * amp;
      oy = (Math.random() - 0.5) * amp;
    }
    this.camera.position.set(ox, 10 + oy, 22);
    this.camera.lookAt(0, 0, 0);
  }

  destroy() {
    window.removeEventListener('resize', this._onResize);
    this._disposeObject(this.scene);
    this._obstacleMeshes.clear();
    this._signalMeshes.clear();
    this._goldenMeshes.clear();
    this._goldenBursts = [];
    this.renderer.dispose();
    this._el.remove();
  }
}
