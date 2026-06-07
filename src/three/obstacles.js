import * as THREE from 'three';
import { WATER_Y, gameX2WorldX, rideY2WorldZ, disposeObject } from './bridge.js';

const PIXEL_ASSETS = Object.freeze({
  FLYING_FISH: '/obstacles/flying-fish-b.png',
  SHARK:       '/obstacles/shark.png',
  WHALE:       '/obstacles/whale.png',
  JELLYFISH:   '/obstacles/jellyfish.png',
  OCTOPUS:     '/obstacles/octopus.png',
  LIGHTNING:   '/obstacles/lightning.png',
});

const PIXEL_SPRITE_SCALE = Object.freeze({
  FLYING_FISH: [2.15, 1.72],
  SHARK:       [2.75, 1.78],
  WHALE:       [3.7, 2.6],
  JELLYFISH:   [1.62, 1.94],
  OCTOPUS:     [2.05, 1.95],
  LIGHTNING:   [0.82, 4.9],
});

// 장애물 메시 6종 (저폴리). 모두 base가 그룹 원점=수면에 — reveal을 scale.y에 실어 분출.
// 게임 ObstacleInstance ↔ 메시를 Map으로 동기화. 충돌은 obstacle.js의 2D AABB가 담당.
export class Obstacles {
  constructor(scene) {
    this.scene = scene;
    this.meshes = new Map();   // 게임 장애물 인스턴스 → Three 메시
    this._seen = new Set();
    this._loader = new THREE.TextureLoader();
    this._textures = new Map();
  }

  _texture(type) {
    const url = PIXEL_ASSETS[type];
    if (!url) return null;
    if (!this._textures.has(type)) {
      const texture = this._loader.load(url);
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.colorSpace = THREE.SRGBColorSpace;
      this._textures.set(type, texture);
    }
    return this._textures.get(type);
  }

  _makePixelSprite(type) {
    const texture = this._texture(type);
    if (!texture) return null;

    const g = new THREE.Group();
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    const [w, h] = PIXEL_SPRITE_SCALE[type] ?? [1.5, 1.2];
    sprite.scale.set(w, h, 1);
    sprite.position.y = h * 0.45;
    // 물 위에 그린다: 반투명 파도 레이어(JEJU_WAVE_LAYERS, depthWrite:false, renderOrder 0)는
    // depth를 안 써서, depthWrite:false인 스프라이트가 페인터 정렬상 파도 뒤로 밀려 청록색에
    // 덮여 '물 속에 잠긴 듯' 보였다. renderOrder를 올려 파도보다 나중에(=위에) 그린다.
    // depthTest는 그대로 둬(true) 불투명 서퍼와의 앞뒤 가림은 유지.
    sprite.renderOrder = 10;
    g.add(sprite);
    // sync()에서 분출을 scale.y 압착 대신 솟구침(translate)+페이드로 처리하기 위한 표식.
    g.userData.isPixelSprite = true;
    g.userData.spriteH       = h;          // 솟구침 거리 = 스프라이트 한 키
    g.userData.spriteMat     = material;   // 분출 페이드용
    return g;
  }

  _make(type) {
    const pixel = this._makePixelSprite(type);
    if (pixel) return pixel;

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
  sync(obstacles) {
    const seen = this._seen;
    seen.clear();
    if (obstacles) {
      for (const obs of obstacles) {
        if (!obs.active) continue;
        let mesh = this.meshes.get(obs);
        if (!mesh) {
          mesh = this._make(obs.type);
          this.scene.add(mesh);
          this.meshes.set(obs, mesh);
        }
        const reveal = obs.reveal ?? 1;
        const vs = obs.visualScale ?? 1;   // 비주얼↔충돌 크기 매핑(OBSTACLE_META)
        const wx = gameX2WorldX(obs.x);
        const wz = rideY2WorldZ(obs.targetY);
        if (mesh.userData.isPixelSprite) {
          // 빌보드 스프라이트는 scale.y로 누르면 납작해져 '물에 깔린' 것처럼 보인다.
          // 크기는 그대로(uniform vs) 두고 수면 아래→위로 솟구쳐 튀어오르게 한다
          // (번개 등 fromAbove는 위→아래). 솟는 동안 알파로 페이드해 허공 팝인을 가린다.
          const dir  = obs.fromAbove ? 1 : -1;
          const rise = (1 - reveal) * mesh.userData.spriteH * dir;
          mesh.position.set(wx, WATER_Y + rise, wz);
          mesh.scale.set(vs, vs, vs);
          mesh.userData.spriteMat.opacity = Math.min(1, reveal * 2);
          mesh.visible = reveal > 0.02;
        } else {
          // 저폴리 메시는 바닥(=수면)에서 scale.y로 자라며 솟는다(기존 분출).
          mesh.position.set(wx, WATER_Y, wz);
          mesh.scale.set(vs, vs * Math.max(0.08, reveal), vs);   // reveal은 y에만(분출), vs는 전체 크기
          mesh.visible = reveal > 0.02;
        }
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

  dispose() {
    for (const mesh of this.meshes.values()) disposeObject(mesh);
    this.meshes.clear();
    for (const texture of this._textures.values()) texture.dispose();
    this._textures.clear();
  }
}
