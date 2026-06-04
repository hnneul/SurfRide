import * as THREE from 'three';
import { LOGICAL_WIDTH, LOGICAL_HEIGHT, RIDE_TOP_Y, RIDE_BOTTOM_Y } from '../constants.js';

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
const WAVE_LAYERS = [
  { z: 0, y: 0.0, color: 0x00b4d8, seg: 20, speed: 0.8 },   // 원경(깊은 청록)
  { z: 5, y: 0.4, color: 0x20c8e4, seg: 16, speed: 1.1 },   // 중경
  { z: 9, y: 0.8, color: 0x32e4ec, seg: 12, speed: 1.5 },   // 근경(밝은 시안)
];

// Phaser 2D 캔버스를 대체하는 Three.js 렌더 레이어.
//
// 1단계: 씬·카메라·조명. 2단계(현재): 파도 3겹 + 배경(하늘·태양·섬·구름) 추가.
// 게임 로직·입력·점수·HUD는 그대로 Phaser가 담당하고, 게임 루프도 Phaser가 주도한다.
// GameScene.update()가 매 프레임 render(dt)를 호출해 "보이는 것"만 Three에 위임한다.
export class ThreeLayer {
  constructor(parentId = 'game-container') {
    const parent = document.getElementById(parentId);
    const w = parent.clientWidth  || window.innerWidth;
    const h = parent.clientHeight || window.innerHeight;
    this.t = 0;   // 파도 애니메이션 누적 시간(s)

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

    // ── 씬 ── 심해 남색 배경 + 거리 페이드 포그
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(BG_COLOR);
    this.scene.fog = new THREE.Fog(BG_COLOR, 55, 110);

    // ── 카메라 ── 원점을 정면에서 약간 위·뒤로 물러나 바라보는 시점
    this.camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 1000);
    this.camera.position.set(0, 10, 22);
    this.camera.lookAt(0, 0, 0);

    // ── 조명 ── 환경광 위주 + 약한 방향광.
    // r0.184 물리기반 조명은 디퓨즈를 1/π 처리 → 강도가 ~3배 약하게 렌더되는 게 "탁함"의 원인.
    // 색이 제 색대로 선명히(실효 ambient ~0.9, 날아가진 않게) 나오도록 강도를 보정.
    this.scene.add(new THREE.AmbientLight(0xffffff, 2.8));

    const dir = new THREE.DirectionalLight(0xffffff, 0.7);
    dir.position.set(5, 10, 8);
    this.scene.add(dir);

    this._obstacleMeshes = new Map();   // 게임 장애물 인스턴스 → Three 메시
    this._signalMeshes = new Map();     // 예고 신호 인스턴스 → Three 마커
    this._buildOcean();
    this._buildBackground();
    this._buildSurfer();

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
  }

  // 파도 3겹 — 수평으로 눕힌 평면, render()에서 정점 높이를 변위시켜 잔물결
  _buildOcean() {
    this.waves = [];
    for (const def of WAVE_LAYERS) {
      const geo = new THREE.PlaneGeometry(120, 30, def.seg, def.seg);
      geo.rotateX(-Math.PI / 2);   // 수평 바다 표면으로 눕힘
      const mat = new THREE.MeshLambertMaterial({ color: def.color, flatShading: true });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(0, def.y, def.z);
      this.scene.add(mesh);
      this.waves.push({ mesh, speed: def.speed });
    }
  }

  // 잔잔한 파도 — sin/cos 합성으로 정점 높이(y) 변위. flatShading이라 노멀 재계산 불필요.
  _animateWaves() {
    const t = this.t;
    for (const { mesh, speed } of this.waves) {
      const pos = mesh.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const z = pos.getZ(i);
        pos.setY(i,
          Math.sin(x * 0.18 + t * speed) * 0.42 +
          Math.cos(z * 0.25 + t * speed * 0.7) * 0.28,
        );
      }
      pos.needsUpdate = true;
    }
  }

  // 배경 — 하늘 · 태양 · 섬 실루엣 · 떠다니는 구름
  _buildBackground() {
    // 하늘 (단색 백드롭, 조명 영향 없음)
    const sky = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 80),
      new THREE.MeshBasicMaterial({ color: 0xb8e4f9 }),
    );
    sky.position.set(0, 20, -48);
    this.scene.add(sky);

    // 태양 (저폴리 원반) — 1단계 카메라가 아래를 보므로 보이는 하늘 띠에 맞춰 y를 낮춤(스펙 28→12)
    const sun = new THREE.Mesh(
      new THREE.CircleGeometry(4, 6),
      new THREE.MeshBasicMaterial({ color: 0xfff5b0 }),
    );
    sun.position.set(18, 12, -47);
    this.scene.add(sun);

    // 섬 — 모래 받침(원기둥) + 산봉우리(원뿔), 수면(y=0)에서 솟음
    const island = new THREE.Group();
    const sandMat = new THREE.MeshLambertMaterial({ color: 0xffd166, flatShading: true });   // 모래
    const peakMat = new THREE.MeshLambertMaterial({ color: 0x52b788, flatShading: true });   // 산
    const base = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 0.5, 5), sandMat);
    base.position.y = 0.25;
    const peak = new THREE.Mesh(new THREE.ConeGeometry(2.8, 2.2, 5), peakMat);
    peak.position.y = 0.5 + 1.1;   // 받침 위(0.5) + 원뿔 절반 높이(1.1)
    island.add(base, peak);
    island.position.set(-18, 0, -12);   // z -20→-12: 30깊이 물(z≥-15) 위에 앉도록 당김(스펙 위치는 물 밖에서 떠 보임)
    this.scene.add(island);

    // 구름 — Icosahedron 3개를 뭉친 덩어리 × 4개, x축으로 천천히 흐름.
    // (이전 emissive 보정은 밝은 ambient 1.0에서 불필요 → 순백으로 제거)
    this.clouds = [];
    const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    const puffs = [
      { r: 2.6, p: [ 0.0,  0.0,  0.0] },
      { r: 2.0, p: [-2.4, -0.3,  0.3] },
      { r: 2.2, p: [ 2.2, -0.2, -0.2] },
    ];
    // y는 스펙(22~29)이면 카메라 프레임 위로 벗어나, 보이는 하늘 띠(≈8~14)로 낮춤
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

  // ── 장애물 메시 (상어 지느러미 / 해파리 / 그 외 폴백) ──
  _makeObstacleMesh(type) {
    const g = new THREE.Group();
    if (type === 'SHARK') {
      const fin = new THREE.Mesh(
        new THREE.ConeGeometry(0.4, 1.1, 4),
        new THREE.MeshLambertMaterial({ color: 0x557799, flatShading: true }));
      fin.position.y = 0.55;     // 밑면을 그룹 원점(수면)에 맞춤
      fin.rotation.z = 0.15;
      g.add(fin);
    } else if (type === 'JELLYFISH') {
      const bell = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 5, 4, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshLambertMaterial({ color: 0xff88cc, transparent: true, opacity: 0.8 }));
      g.add(bell);
    } else {
      // 날치·고래·문어·번개 등 (스펙 미지정) — 임시 박스 폴백
      const fallback = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.9, 0.6),
        new THREE.MeshLambertMaterial({ color: 0x8893a6, flatShading: true }));
      fallback.position.y = 0.45;
      g.add(fallback);
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

  // ── 예고 신호(텔레그래프) — 장애물이 솟을 자리/타이밍을 수면에 표시 ──
  // P0: 타입별 비주얼 대신 공통 레티클(수면 위 링+점). 임박할수록 닫히고 붉어짐.
  _makeSignalMarker() {
    const g = new THREE.Group();
    const mat = () => new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.6,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.2, 28), mat());
    ring.rotation.x = -Math.PI / 2;
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.32, 18), mat());
    dot.rotation.x = -Math.PI / 2;
    g.add(ring, dot);
    g.userData.ring = ring;
    g.userData.dot = dot;
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
          m = this._makeSignalMarker();
          this.scene.add(m);
          this._signalMeshes.set(sig, m);
        }
        m.position.set(this._gameX2WorldX(sig.x), WATER_Y + 0.06, this._rideY2WorldZ(sig.y));
        const p = sig.progress ?? 0;
        const pulse = 0.5 + 0.5 * Math.sin((sig.elapsed ?? 0) * 0.012);
        const s = 1.4 - p * 0.8;                                       // 닫혀오는 레티클
        m.scale.set(s, s, s);
        const col = (sig.targeted || p >= 0.7) ? 0xff3b30 : 0xffffff;  // 임박/타겟이면 적색
        const op = (0.35 + 0.45 * p) * (0.6 + 0.4 * pulse);
        m.userData.ring.material.color.setHex(col);
        m.userData.ring.material.opacity = op;
        m.userData.dot.material.color.setHex(col);
        m.userData.dot.material.opacity = op * 0.8;
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
    }
    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    window.removeEventListener('resize', this._onResize);
    this._disposeObject(this.scene);
    this._obstacleMeshes.clear();
    this._signalMeshes.clear();
    this.renderer.dispose();
    this._el.remove();
  }
}
