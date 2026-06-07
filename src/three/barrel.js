import * as THREE from 'three';
import { WATER_Y } from './bridge.js';

// 배럴(튜브) 3D — 서퍼 레인 위로 말려 덮는 반투명 물의 아치(윗 절반, 아래는 열림).
// open 동안 윤곽이 나타나고, tubed(포켓 유지)면 더 짙고 좁게 조여 서퍼를 감싼다.
// 판정·점수는 barrel.js(BarrelManager)가, 여기선 비주얼만. ThreeLayer가 tube() 상태로 sync.

const R = 3.6, LEN = 13;

export class BarrelTube {
  constructor(scene) {
    this.scene = scene;
    const g = new THREE.Group();
    g.visible = false;

    // 윗 절반 아치(아래는 열림) — 축을 z로 눕혀 깊이 방향의 동굴을 만든다.
    const arch = new THREE.CylinderGeometry(R, R, LEN, 28, 1, true, Math.PI, Math.PI);
    this.shellMat = new THREE.MeshBasicMaterial({
      color: 0x2cc6da, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false,
    });
    const shell = new THREE.Mesh(arch, this.shellMat);
    shell.rotation.x = Math.PI / 2;
    shell.renderOrder = 6;

    // 안쪽 그림자(동굴감) — 살짝 작게, 짙은 청록 뒷면.
    this.innerMat = new THREE.MeshBasicMaterial({
      color: 0x05283a, transparent: true, opacity: 0.24, side: THREE.BackSide, depthWrite: false,
    });
    const inner = new THREE.Mesh(arch.clone(), this.innerMat);
    inner.rotation.x = Math.PI / 2; inner.scale.set(0.86, 1.0, 0.86);
    inner.renderOrder = 5;

    // 말리는 립의 흰 포말 — 입구(근경) 쪽 윗 반원 테두리.
    const foamGeo = new THREE.TorusGeometry(R, 0.18, 8, 28, Math.PI);
    this.foamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false });
    this.foam = new THREE.Mesh(foamGeo, this.foamMat);
    this.foam.renderOrder = 7;

    g.add(shell, inner, this.foam);
    scene.add(g);
    this.group = g;
    this.shell = shell;
    this._open = 0;   // 0..1 등장
    this._tube = 0;   // 0..1 조임(서퍼 감쌈)
  }

  // state: { active, tubed, progress } (BarrelManager.tube())
  sync(state, surfer, t, dtMs) {
    const openT = state && state.active ? 1 : 0;
    const tubeT = state && state.tubed ? 1 : 0;
    this._open += (openT - this._open) * Math.min(1, dtMs / 260);
    this._tube += (tubeT - this._tube) * Math.min(1, dtMs / 170);
    this.group.visible = this._open > 0.01;
    if (!this.group.visible) return;

    const sx = surfer?.pos?.x ?? -6.4;
    const sz = surfer?.pos?.z ?? 8;
    this.group.position.set(sx + 0.2, WATER_Y + 1.5, sz);

    // tubed면 더 짙고 좁게(서퍼를 감쌈). open만 되어도 윤곽은 보인다.
    const tighten = 1 - this._tube * 0.2;
    this.group.scale.set(tighten, tighten, 1);
    this.shellMat.opacity = 0.16 + this._open * 0.26 + this._tube * 0.26;
    this.innerMat.opacity = 0.16 + this._open * 0.30 + this._tube * 0.34;
    this.foamMat.opacity  = 0.10 + this._open * 0.22 + this._tube * 0.22;

    // 말리는 립을 근경 입구에 두고 살짝 흔들어 '굴러 도는' 느낌.
    this.foam.position.set(0, 0, LEN * 0.32);
    this.foam.rotation.z = Math.sin(t * 1.4) * 0.05;
    this.shell.rotation.z = Math.sin(t * 0.7) * 0.03;
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }
}
