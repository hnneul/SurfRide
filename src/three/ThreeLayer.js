import * as THREE from 'three';

// Phaser 캔버스 위에 겹치는 투명 Three.js 레이어.
// 게임 루프는 Phaser가 주도한다 — GameScene.update()에서 render(dt)를 호출하고,
// 씬 종료 시 destroy()로 정리한다. (캔버스는 2개, 게임 루프는 1개)
//
// 1단계 스파이크: "Phaser + Three.js 하이브리드가 실제로 된다"를 검증하기 위한
// 회전 큐브 1개만 올린다. 좌표 정합/실제 게임 오브젝트는 이후 단계에서.
export class ThreeLayer {
  constructor(parentId = 'game-container') {
    const parent = document.getElementById(parentId);
    const w = parent.clientWidth  || window.innerWidth;
    const h = parent.clientHeight || window.innerHeight;

    // alpha:true → 투명 배경. 뒤의 Phaser 게임이 그대로 비친다.
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);

    const el = this.renderer.domElement;
    el.style.position = 'absolute';
    el.style.inset = '0';
    el.style.width = '100%';
    el.style.height = '100%';
    el.style.pointerEvents = 'none';   // 입력은 Phaser가 받는다
    el.style.zIndex = '1';             // Phaser 캔버스 위
    parent.appendChild(el);
    this._el = el;

    this.scene  = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 1000);
    this.camera.position.set(0, 0, 6);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(4, 6, 5);
    this.scene.add(key);

    // 스파이크용 회전 큐브 (서프라이드 하늘색)
    this.cube = new THREE.Mesh(
      new THREE.BoxGeometry(2, 2, 2),
      new THREE.MeshStandardMaterial({ color: 0x4fc3f7, metalness: 0.1, roughness: 0.4 }),
    );
    this.scene.add(this.cube);

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
  }

  resize() {
    const w = this._el.parentElement?.clientWidth  || window.innerWidth;
    const h = this._el.parentElement?.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // dtMs: Phaser가 넘겨주는 프레임 델타(슬로우모션 등 게임 시간 그대로 공유)
  render(dtMs) {
    const dt = dtMs / 1000;
    this.cube.rotation.x += dt * 0.8;
    this.cube.rotation.y += dt * 1.2;
    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    window.removeEventListener('resize', this._onResize);
    this.cube.geometry.dispose();
    this.cube.material.dispose();
    this.renderer.dispose();
    this._el.remove();
  }
}
