import * as THREE from 'three';
import { WATER_Y, gameX2WorldX, rideY2WorldZ, disposeObject } from './bridge.js';

// 예고 신호(텔레그래프) — 장애물이 솟을 자리/타이밍을 수면에 표시.
// 타입(SignalType)별 고유 비주얼: 날치=물보라 링, 상어=등지느러미, 고래=떠오르는 그림자,
// 해파리=맥동 발광, 문어=솟는 다리, 번개=깜빡이는 광주. 2D(obstacle.js)의 신호 의미를 3D로 옮김.
// 공통 조준 레티클(빨강 십자)은 타겟/임박일 때만 켜진다 — 색은 MeshBasic(조명 ÷π 영향 없이 선명).
export class Signals {
  constructor(scene) {
    this.scene = scene;
    this.meshes = new Map();
    this._seen = new Set();
  }

  _make(type) {
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
  // 수면 높이에 얹어(파동장) 장애물과 같은 면에서 예고가 뜨게 한다.
  sync(signals, t = 0, world = null) {
    const seen = this._seen;
    seen.clear();
    if (signals) {
      for (const sig of signals) {
        if (sig.done) continue;
        let m = this.meshes.get(sig);
        if (!m) {
          m = this._make(sig.type);
          this.scene.add(m);
          this.meshes.set(sig, m);
        }
        const wx = gameX2WorldX(sig.x);
        const wz = rideY2WorldZ(sig.y);
        const waveH = world ? world.sampleWaveHeight(wx, wz, t) : 0;
        m.position.set(wx, WATER_Y + waveH + 0.06, wz);
        this._animate(m, sig);
        seen.add(sig);
      }
    }
    for (const [sig, m] of this.meshes) {
      if (!seen.has(sig)) {
        this.scene.remove(m);
        disposeObject(m);
        this.meshes.delete(sig);
      }
    }
  }

  // 타입별 신호 애니메이션 + 공통 조준 레티클. progress(0→1)로 임박, elapsed로 맥동/깜빡임.
  _animate(m, sig) {
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

  dispose() { this.meshes.clear(); }
}
