import * as THREE from 'three';
import { WATER_Y, gameX2WorldX, rideY2WorldZ, disposeObject } from './bridge.js';

// 황금물고기 3D 레이어 — 오른쪽에서 헤엄쳐 들어와 왼쪽으로 빠짐(머리는 -x 방향).
// 장애물과 달리 x로 가로지르므로 게임 x→월드 x, 레인 y→월드 z(깊이). 자체발광+헤일로로 '특별함'.
// (게임 로직 GoldenFishManager는 ../goldenFish.js — 여기는 렌더만.)
export class GoldenFishLayer {
  constructor(scene) {
    this.scene = scene;
    this.meshes = new Map();   // 황금물고기 인스턴스 → Three 메시
    this.bursts = [];          // 획득 연출(확장 링) — 수명 가진 임시 메시
    this._seen = new Set();
  }

  _make() {
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
  sync(fishes, t, world = null) {
    const seen = this._seen;
    seen.clear();
    if (fishes) {
      for (const fish of fishes) {
        if (fish.gone) continue;
        let mesh = this.meshes.get(fish);
        if (!mesh) {
          mesh = this._make();
          this.scene.add(mesh);
          this.meshes.set(fish, mesh);
        }
        const age = fish.ageMs ?? 0;
        const bob = Math.sin(age * 0.006 + (fish.bobSeed ?? 0)) * 0.12;     // 2D bob(±10px)에 대응
        const wx = gameX2WorldX(fish.x);
        const wz = rideY2WorldZ(fish.y);
        const waveH = world ? world.sampleWaveHeight(wx, wz, t) : 0;
        mesh.position.set(wx, WATER_Y + waveH + 0.28 + bob, wz);
        const pulse = 0.5 + 0.5 * Math.sin(age * 0.01);
        mesh.userData.glow.scale.set(1.6 * (1 + pulse * 0.16), 0.95 * (1 + pulse * 0.16), 0.85 * (1 + pulse * 0.16));
        mesh.userData.glow.material.opacity = 0.14 + pulse * 0.16;
        mesh.userData.tail.rotation.y = Math.sin(t * 9 + (fish.bobSeed ?? 0)) * 0.5;   // 꼬리 흔듦
        seen.add(fish);
      }
    }
    for (const [fish, mesh] of this.meshes) {
      if (!seen.has(fish)) {
        if (fish.collected) this._spawnBurst(mesh.position);   // 잡힌 자리에서 펑
        this.scene.remove(mesh);
        disposeObject(mesh);
        this.meshes.delete(fish);
      }
    }
  }

  // 획득 연출 — 수면에서 퍼지며 사라지는 금빛 링(2D collect 링의 3D판)
  _spawnBurst(pos) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.25, 0.5, 24),
      new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(pos);
    this.scene.add(ring);
    this.bursts.push({ obj: ring, ageMs: 0, lifeMs: 420 });
  }

  updateBursts(dtMs) {
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.ageMs += dtMs;
      const k = Math.min(1, b.ageMs / b.lifeMs);
      b.obj.scale.setScalar(1 + k * 4.5);
      b.obj.material.opacity = 0.9 * (1 - k);
      if (k >= 1) {
        this.scene.remove(b.obj);
        disposeObject(b.obj);
        this.bursts.splice(i, 1);
      }
    }
  }

  dispose() { this.meshes.clear(); this.bursts = []; }
}
