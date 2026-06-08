import * as THREE from 'three';
import { WATER_Y, gameX2WorldX, rideY2WorldZ, disposeObject } from './bridge.js';

// 장애물 6종 — 서퍼·파도와 같은 저폴리 flatShading 톤으로 조립한 입체 생물.
// 설계 규칙: 옆면(broadside)을 카메라(+z)로 보이고 머리는 -x(왼쪽), base를 그룹 원점(=수면)에.
//   → sync()가 reveal을 scale.y에 실어 '수면에서 솟구쳐' 분출시킨다(번개만 위→아래 하강).
// 충돌·판정은 obstacle.js의 2D AABB가 담당하고, 여기선 보이는 것만 책임진다.

// 저폴리 음영(서퍼와 동일): flatShading Lambert. 발광/무광은 Basic.
const lambert = (color, opts = {}) =>
  new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts });
const basic = (color, opts = {}) =>
  new THREE.MeshBasicMaterial({ color, ...opts });
const M = (geo, mat) => new THREE.Mesh(geo, mat);

export class Obstacles {
  constructor(scene) {
    this.scene = scene;
    this.meshes = new Map();   // 게임 장애물 인스턴스 → Three 그룹
    this._seen = new Set();
  }

  _make(obsOrType) {
    const type = typeof obsOrType === 'string' ? obsOrType : obsOrType.type;
    switch (type) {
      case 'SHARK':       return this._faceForward(this._makeShark());
      case 'WHALE':       return this._faceForward(this._makeWhale());
      case 'FLYING_FISH': return this._faceForward(this._makeFlyingFish());
      case 'JELLYFISH':   return this._makeJellyfish();
      case 'OCTOPUS':     return this._makeOctopus();
      case 'LIGHTNING':   return this._makeLightning();
      default:            return this._makeFallback();
    }
  }

  // 방향성 생물(상어·고래·날치)을 진행 방향(+z=플레이어 쪽)으로 돌린다 — 옆모습(가로)이 아니라
  // '세로로 다가오는' 정면 실루엣. 머리(local -x)가 +z(가까운 쪽=플레이어)를 향한다.
  // 충돌 hitbox도 obstacle.js OBSTACLE_META에서 같이 세로(좁은 x)로 맞췄다.
  _faceForward(g) {
    g.rotation.y = Math.PI / 2;
    return g;
  }

  // ── 상어 — 강철빛 방추형 몸통 + 등지느러미 + 갈라진 꼬리 ──────────────────
  _makeShark() {
    const g = new THREE.Group();
    const skin = lambert(0x3a6a8c);
    const dark = lambert(0x244a65);
    const pale = lambert(0xd2e9f5);

    const body = M(new THREE.IcosahedronGeometry(0.5, 0), skin);
    body.scale.set(2.5, 0.66, 0.92); body.position.y = 0.5;
    const belly = M(new THREE.IcosahedronGeometry(0.46, 0), pale);
    belly.scale.set(2.2, 0.3, 0.78); belly.position.y = 0.32;
    const nose = M(new THREE.ConeGeometry(0.3, 0.85, 4), skin);
    nose.rotation.z = Math.PI / 2; nose.position.set(-1.2, 0.5, 0);    // 주둥이 앞(-x)
    const fin = M(new THREE.ConeGeometry(0.36, 1.0, 4), dark);          // 등지느러미(시그니처)
    fin.position.set(0.1, 1.0, 0); fin.rotation.z = 0.18;
    const tailT = M(new THREE.ConeGeometry(0.32, 0.78, 4), dark);       // 꼬리 윗날
    tailT.position.set(1.42, 0.86, 0); tailT.rotation.z = -0.7;
    const tailB = M(new THREE.ConeGeometry(0.26, 0.6, 4), dark);        // 꼬리 아랫날
    tailB.position.set(1.4, 0.4, 0); tailB.rotation.z = -2.45;
    const eye = M(new THREE.SphereGeometry(0.08, 6, 6), basic(0x06121c));
    eye.position.set(-0.95, 0.58, 0.34);

    g.add(body, belly, nose, fin, tailT, tailB, eye);
    g.userData.anim = { type: 'SHARK', fin };
    return g;
  }

  // ── 고래 — 짙은 청색 거구 + 밝은 배 + 꼬리 플루크 + 물기둥 ────────────────
  _makeWhale() {
    const g = new THREE.Group();
    const navy = lambert(0x274a6e);
    const dark = lambert(0x1d324f);
    const pale = lambert(0xbcdcec);

    const body = M(new THREE.IcosahedronGeometry(1.15, 0), navy);
    body.scale.set(1.9, 0.82, 1.05); body.position.y = 0.98;
    const head = M(new THREE.IcosahedronGeometry(0.8, 0), navy);
    head.scale.set(1.2, 0.85, 1.0); head.position.set(-1.55, 0.92, 0);
    const belly = M(new THREE.IcosahedronGeometry(1.0, 0), pale);
    belly.scale.set(1.7, 0.34, 0.82); belly.position.y = 0.52;
    const flukeT = M(new THREE.ConeGeometry(0.5, 0.95, 4), dark);       // 꼬리 V(위/아래)
    flukeT.position.set(2.05, 1.2, 0); flukeT.rotation.z = -0.7;
    const flukeB = M(new THREE.ConeGeometry(0.5, 0.95, 4), dark);
    flukeB.position.set(2.05, 0.78, 0); flukeB.rotation.z = -2.45;
    const flipper = M(new THREE.ConeGeometry(0.3, 0.95, 4), dark);      // 가슴지느러미(카메라쪽)
    flipper.position.set(-0.5, 0.5, 0.95); flipper.rotation.set(Math.PI / 2.3, 0, -0.5);
    const spoutMat = basic(0xd6f4ff, { transparent: true, opacity: 0.7 });
    const spout = M(new THREE.ConeGeometry(0.24, 0.95, 6), spoutMat);   // 물기둥
    spout.position.set(-0.95, 2.25, 0);
    const eye = M(new THREE.SphereGeometry(0.1, 6, 6), basic(0x05121e));
    eye.position.set(-1.95, 0.95, 0.6);

    g.add(body, head, belly, flukeT, flukeB, flipper, spout, eye);
    g.userData.anim = { type: 'WHALE', spout, spoutMat };
    return g;
  }

  // ── 날치 — 주황 몸통 + 꼬리 + 펼친 가슴지느러미(날개) ────────────────────
  _makeFlyingFish() {
    const g = new THREE.Group();
    const skin = lambert(0xff8a3d);
    const deep = lambert(0xff7043);
    const wingMat = lambert(0xffd180);

    const body = M(new THREE.IcosahedronGeometry(0.34, 0), skin);
    body.scale.set(2.0, 0.85, 0.8); body.position.y = 0.62;
    const nose = M(new THREE.ConeGeometry(0.18, 0.42, 4), skin);
    nose.rotation.z = Math.PI / 2; nose.position.set(-0.72, 0.62, 0);
    const tail = M(new THREE.ConeGeometry(0.26, 0.5, 4), deep);
    tail.rotation.z = -Math.PI / 2; tail.position.set(0.74, 0.62, 0);
    const wingL = M(new THREE.BoxGeometry(0.62, 0.05, 0.5), wingMat);   // 날개(양쪽 z로 펼침)
    wingL.position.set(0, 0.74, 0.36); wingL.rotation.x = -0.5;
    const wingR = M(new THREE.BoxGeometry(0.62, 0.05, 0.5), wingMat);
    wingR.position.set(0, 0.74, -0.36); wingR.rotation.x = 0.5;
    const eye = M(new THREE.SphereGeometry(0.06, 6, 6), basic(0x111111));
    eye.position.set(-0.5, 0.66, 0.22);

    g.add(body, nose, tail, wingL, wingR, eye);
    g.userData.anim = { type: 'FLYING_FISH', wingL, wingR };
    return g;
  }

  // ── 해파리 — 반투명 발광 돔 + 늘어진 촉수 ────────────────────────────────
  _makeJellyfish() {
    const g = new THREE.Group();
    const bellMat = new THREE.MeshLambertMaterial({
      color: 0xb76dff, transparent: true, opacity: 0.82,
      emissive: 0x7a2db5, emissiveIntensity: 0.55,
    });
    const bell = M(new THREE.SphereGeometry(0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), bellMat);
    bell.position.y = 0.5;
    const core = M(new THREE.SphereGeometry(0.2, 8, 6), basic(0xeafffb, { transparent: true, opacity: 0.85 }));
    core.position.y = 0.46;
    const tentMat = lambert(0xe0c4ff, { transparent: true, opacity: 0.85 });
    const tentacles = [];
    for (let i = 0; i < 5; i++) {
      const t = M(new THREE.CylinderGeometry(0.025, 0.06, 0.55, 4), tentMat);
      t.position.set((i - 2) * 0.13, 0.2, (i % 2 ? 0.06 : -0.06));
      tentacles.push(t);
      g.add(t);
    }
    g.add(bell, core);
    g.userData.anim = { type: 'JELLYFISH', bell, tentacles };
    return g;
  }

  // ── 문어 — 보라 머리 + 8 다리 + 큰 눈 ────────────────────────────────────
  _makeOctopus() {
    const g = new THREE.Group();
    const skin = lambert(0x9b4dd8);
    const deep = lambert(0x7b2dbb);

    const head = M(new THREE.IcosahedronGeometry(0.62, 0), skin);
    head.scale.set(1.0, 1.05, 1.0); head.position.y = 1.0;
    const legs = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const leg = M(new THREE.ConeGeometry(0.12, 0.9, 4), deep);
      leg.position.set(Math.cos(a) * 0.42, 0.42, Math.sin(a) * 0.42);
      leg.rotation.x = Math.PI;                 // 끝이 아래로
      leg.rotation.z = Math.cos(a) * 0.3;       // 바깥으로 벌어짐
      legs.push(leg);
      g.add(leg);
    }
    const eyeL = M(new THREE.SphereGeometry(0.14, 8, 8), basic(0xffffff));
    eyeL.position.set(-0.22, 1.08, 0.5);
    const eyeR = M(new THREE.SphereGeometry(0.14, 8, 8), basic(0xffffff));
    eyeR.position.set(0.22, 1.08, 0.5);
    const pupL = M(new THREE.SphereGeometry(0.06, 6, 6), basic(0x16061f));
    pupL.position.set(-0.22, 1.08, 0.62);
    const pupR = M(new THREE.SphereGeometry(0.06, 6, 6), basic(0x16061f));
    pupR.position.set(0.22, 1.08, 0.62);

    g.add(head, eyeL, eyeR, pupL, pupR);
    g.userData.anim = { type: 'OCTOPUS', legs };
    return g;
  }

  // ── 번개 — 발광 지그재그 볼트(무광 Basic) + 흰 코어 + 후광. 위→아래 하강. ──
  _makeLightning() {
    const g = new THREE.Group();
    const boltMat = basic(0xffe14d, { transparent: true });
    const coreMat = basic(0xfffde0, { transparent: true });
    const haloMat = basic(0xfff59d, { transparent: true, opacity: 0.14, side: THREE.DoubleSide });
    const seg = (mat, w, h, x, y, rot) => {
      const s = M(new THREE.BoxGeometry(w, h, w * 0.9), mat);
      s.position.set(x, y, 0); s.rotation.z = rot;
      return s;
    };
    const halo = M(new THREE.PlaneGeometry(0.95, 2.5), haloMat);
    halo.position.set(0.06, 1.15, -0.06);
    const bolts = [
      seg(boltMat, 0.2, 0.85, 0.0,  1.75, 0.5),
      seg(boltMat, 0.2, 0.85, 0.2,  1.1, -0.5),
      seg(boltMat, 0.2, 0.85, 0.0,  0.45, 0.5),
    ];
    const cores = [
      seg(coreMat, 0.08, 0.85, 0.0, 1.75, 0.5),
      seg(coreMat, 0.08, 0.85, 0.2, 1.1, -0.5),
      seg(coreMat, 0.08, 0.85, 0.0, 0.45, 0.5),
    ];
    g.add(halo, ...bolts, ...cores);
    g.userData.anim = {
      type: 'LIGHTNING',
      fade: [
        { mat: boltMat, base: 1, flicker: true },
        { mat: coreMat, base: 1, flicker: true },
        { mat: haloMat, base: 0.14, flicker: true },
      ],
    };
    g.userData.fromAbove = true;   // 수면에서 솟는 대신 위에서 내리꽂힌다
    g.userData.height = 2.6;
    return g;
  }

  _makeFallback() {
    const g = new THREE.Group();
    const box = M(new THREE.BoxGeometry(0.9, 0.9, 0.6), lambert(0x8893a6));
    box.position.y = 0.45;
    g.add(box);
    return g;
  }

  // 활성 장애물 ↔ 메시 동기화: x→월드 x, targetY→월드 z, reveal→분출(솟구침/하강).
  // y는 파동장(world.sampleWaveHeight)에 얹어 수면에서 함께 출렁이게 한다.
  sync(obstacles, t = 0, world = null) {
    const seen = this._seen;
    seen.clear();
    if (obstacles) {
      for (const obs of obstacles) {
        if (!obs.active) continue;
        let mesh = this.meshes.get(obs);
        if (!mesh) {
          mesh = this._make(obs);
          this.scene.add(mesh);
          this.meshes.set(obs, mesh);
        }
        const reveal = obs.reveal ?? 1;
        const vs = obs.visualScale ?? 1;        // 비주얼↔충돌 크기 매핑(OBSTACLE_META)
        const wx = gameX2WorldX(obs.x);
        const wz = rideY2WorldZ(obs.targetY);
        const waveH = world ? world.sampleWaveHeight(wx, wz, t) : 0;

        if (mesh.userData.fromAbove) {
          // 번개 — 위에서 내리꽂힘(납작해지지 않게 크기는 유지) + 등장 페이드.
          const rise = (1 - reveal) * (mesh.userData.height ?? 2);
          mesh.position.set(wx, WATER_Y + waveH + rise, wz);
          mesh.scale.set(vs, vs, vs);
        } else {
          // 그 외 — 수면(=바닥)에서 scale.y로 자라며 솟는다(분출). vs는 전체 크기.
          mesh.position.set(wx, WATER_Y + waveH, wz);
          mesh.scale.set(vs, vs * Math.max(0.08, reveal), vs);
        }
        mesh.visible = reveal > 0.02;
        this._animate(mesh, t, reveal);
        seen.add(obs);
      }
    }
    for (const [obs, mesh] of this.meshes) {   // 사라진 장애물 메시 정리
      if (!seen.has(obs)) {
        this.scene.remove(mesh);
        disposeObject(mesh);
        this.meshes.delete(obs);
      }
    }
  }

  // 종류별 미세 생동감 — 2D 비주얼의 흔들림을 3D로 옮긴 것(부위만 움직여 가볍게).
  _animate(mesh, t, reveal) {
    const a = mesh.userData.anim;
    if (!a) return;
    switch (a.type) {
      case 'SHARK':
        a.fin.rotation.z = 0.18 + Math.sin(t * 6) * 0.12;
        break;
      case 'WHALE': {
        const p = (Math.sin(t * 5) + 1) / 2;
        a.spoutMat.opacity = 0.4 + p * 0.4;
        a.spout.scale.y = 0.85 + p * 0.35;
        break;
      }
      case 'FLYING_FISH': {
        const flap = Math.sin(t * 13);
        a.wingL.rotation.x = -0.5 - flap * 0.35;   // 날갯짓
        a.wingR.rotation.x =  0.5 + flap * 0.35;
        break;
      }
      case 'JELLYFISH': {
        const pulse = 1 + Math.sin(t * 4) * 0.1;    // 종 맥동(넓어지며 납작)
        a.bell.scale.set(pulse, 2 - pulse, pulse);
        a.tentacles.forEach((tn, i) => { tn.rotation.z = Math.sin(t * 3 + i) * 0.18; });
        break;
      }
      case 'OCTOPUS':
        a.legs.forEach((lg, i) => { lg.rotation.x = Math.PI + Math.sin(t * 5 + i * 0.7) * 0.18; });
        break;
      case 'LIGHTNING': {
        // 등장 페이드(reveal) × 점멸. fromAbove라 reveal로 크기를 누르지 않으니 알파로 처리.
        const fade  = Math.min(1, reveal * 2);
        const flick = 0.65 + Math.random() * 0.35;
        a.fade.forEach((f) => { f.mat.opacity = f.base * fade * (f.flicker ? flick : 1); });
        break;
      }
    }
  }

  dispose() {
    for (const mesh of this.meshes.values()) disposeObject(mesh);
    this.meshes.clear();
  }
}
