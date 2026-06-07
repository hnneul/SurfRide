import * as THREE from 'three';
import { disposeObject } from './bridge.js';
import { World } from './world.js';
import { Surfer } from './surfer.js';
import { Obstacles } from './obstacles.js';
import { Signals } from './signals.js';
import { GoldenFishLayer } from './goldenFish.js';
import { Reef } from './reef.js';
import { Fx } from './fx.js';

// Phaser 2D 캔버스를 대체하는 Three.js 렌더 레이어 (오케스트레이터).
// 렌더러·씬·카메라를 소유하고, 보이는 것은 하위 모듈에 위임한다:
//   world(바다·배경·조명·테마) · surfer · obstacles · signals · goldenFish · fx(흔들림).
// 게임 로직·입력·점수·HUD는 그대로 Phaser가 담당하고, 루프도 Phaser가 주도한다 —
// GameScene.update()가 매 프레임 render(dt, state)를 호출해 게임 상태만 읽어 렌더한다.
export class ThreeLayer {
  constructor(themeKey = 'jeju', parentId = 'game-container') {
    const parent = document.getElementById(parentId);
    const w = parent.clientWidth  || window.innerWidth;
    const h = parent.clientHeight || window.innerHeight;
    this.t = 0;   // 애니메이션 누적 시간(s)

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

    // ── 씬·카메라 ── (배경/포그/조명은 World가 테마에 맞춰 씬에 세팅)
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 1000);
    this.camera.position.set(0, 10, 22);   // 수면을 약간 위·뒤에서 내려다봄
    this.camera.lookAt(0, 0, 0);

    // ── 렌더 모듈 ──
    this.world      = new World(this.scene, themeKey);
    this.surfer     = new Surfer(this.scene);
    this.obstacles  = new Obstacles(this.scene);
    this.signals    = new Signals(this.scene);
    this.goldenFish = new GoldenFishLayer(this.scene);
    this.reef       = new Reef(this.scene);
    this.fx         = new Fx();

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
  }

  render(dtMs = 16.667, state = null) {
    this.t += dtMs / 1000;
    this.world.update(this.t);
    if (state) {
      this.surfer.update(state.player, state.cursors, this.t);
      this.signals.sync(state.signals);
      this.obstacles.sync(state.obstacles);
      this.goldenFish.sync(state.goldenFishes, this.t);
      this.reef.sync(state.reef);
    }
    this.goldenFish.updateBursts(dtMs);
    this.fx.applyShake(this.camera, dtMs);
    this.renderer.render(this.scene, this.camera);
  }

  // 카메라 흔들림 트리거 (피격·기상이변·위험구간)
  shake(durationMs, intensity = 0.006) {
    this.fx.shake(durationMs, intensity);
  }

  resize() {
    const w = this._el.parentElement?.clientWidth  || window.innerWidth;
    const h = this._el.parentElement?.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  destroy() {
    window.removeEventListener('resize', this._onResize);
    disposeObject(this.scene);
    this.world.dispose?.();
    this.obstacles.dispose();
    this.signals.dispose();
    this.goldenFish.dispose();
    this.reef.dispose();
    this.renderer.dispose();
    this._el.remove();
  }
}
