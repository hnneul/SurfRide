import * as THREE from 'three';
import { disposeObject } from './bridge.js';
import { World } from './world.js';
import { Surfer } from './surfer.js';
import { Obstacles } from './obstacles.js';
import { Signals } from './signals.js';
import { GoldenFishLayer } from './goldenFish.js';
import { Reef } from './reef.js';
import { Fx } from './fx.js';
import { Spray } from './spray.js';

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
    // 서퍼 뒤를 낮게 따라가는 추적 시점. _updateCamera가 매 프레임 서퍼 상태로 위치를 갱신.
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, w / h, 0.1, 1000);
    this._camZ = 5;                        // 부드럽게 추종할 서퍼 깊이(z)의 평활값
    this.camera.position.set(-6, 4.4, 17);
    this.camera.lookAt(-6, 1.2, 1);

    // ── 렌더 모듈 ──
    this.world      = new World(this.scene, themeKey);
    this.surfer     = new Surfer(this.scene);
    this.obstacles  = new Obstacles(this.scene);
    this.signals    = new Signals(this.scene);
    this.goldenFish = new GoldenFishLayer(this.scene);
    this.reef       = new Reef(this.scene);
    this.fx         = new Fx();
    this.spray      = new Spray(this.scene);

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
  }

  render(dtMs = 16.667, state = null) {
    this.t += dtMs / 1000;
    this.world.update(this.t, dtMs);
    if (state) {
      this.surfer.update(state.player, state.cursors, this.t, this.world);
      this.signals.sync(state.signals, this.t, this.world);
      this.obstacles.sync(state.obstacles, this.t, this.world);
      this.goldenFish.sync(state.goldenFishes, this.t, this.world);
      this.reef.sync(state.reef);
      this.spray.emitWake(this.surfer, state.player, dtMs);
    }
    this.spray.update(dtMs);
    this.goldenFish.updateBursts(dtMs);
    this._updateCamera(dtMs, state);
    this.renderer.render(this.scene, this.camera);
  }

  // 서퍼 위치에서 물보라 버스트(피격·착지·퍼펙트·트릭·황금물고기 등 — GameScene이 호출)
  surferSplash(strength = 1, color = 0xffffff) {
    const p = this.surfer?.pos;
    if (p) this.spray.burst(p.x, p.y - 0.05, p.z + 0.2, strength, color);
  }

  // 서퍼 뒤를 낮게 따라가는 추적 카메라. 서퍼 x는 고정이라 화면 중앙 유지, z(깊이 레인)를
  // 완만히 추종해 어지럽지 않게. 모든 분출 레인(z≈2..11) 앞(+z, 높은 z)에 카메라를 둬 가독성 확보.
  // 흔들림(fx)은 기준 위치 '위에' 더한다.
  _updateCamera(dtMs, state) {
    const s = this.surfer;
    const sx = s.pos?.x ?? -6;
    const sz = s.pos?.z ?? 5;
    const sy = s.pos?.y ?? 0.7;
    const k = Math.min(1, 0.06 * (dtMs / 16.667));
    this._camZ += (sz - this._camZ) * k;

    const jumpLift = Math.max(0, state?.player?.jumpOffset ?? 0) / 90 * 0.22;
    const o = this.fx.getOffset(dtMs);

    this.camera.position.set(sx + o.x, 4.4 + jumpLift + o.y, 16.8 + this._camZ * 0.16);
    this.camera.up.set(o.roll, 1, 0);
    this.camera.lookAt(sx, 1.2 + sy * 0.12, this._camZ - 4.5);
  }

  // 카메라 흔들림 트리거 (피격·기상이변·위험구간·큰 파도·퍼펙트)
  shake(durationMs, intensity = 0.006) {
    this.fx.shake(durationMs, intensity);
  }

  // 큰 파도 이벤트 트리거(GameScene → World)
  triggerBigWave(opts) {
    this.world.triggerBigWave(opts);
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
    this.spray.dispose();
    this.renderer.dispose();
    this._el.remove();
  }
}
