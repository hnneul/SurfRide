import * as THREE from 'three';
import { LOGICAL_WIDTH, LOGICAL_HEIGHT } from '../constants.js';

// 게임 픽셀 좌표 → 3D 월드 유닛 스케일 (1 unit = PX_PER_UNIT px)
const PX_PER_UNIT = 90;

// Phaser 캔버스 위에 겹치는 투명 Three.js 레이어 (렌더만 3D, 게임 루프는 Phaser가 주도).
//
// 2단계 — 좌표 브리지 + 비스듬 2.5D 카메라:
//  - gameToWorld(): 게임 화면 픽셀(0~1920, 0~1080) → 3D 월드 좌표(z=0 평면) 변환
//  - 기준 평면(와이어프레임): 파도면이 놓일 자리 → 3단계에서 바다 메시로 교체
//  - 마커(박스): 서퍼 위치(player.baseY) 추종 → 4단계에서 실제 서퍼 메시로 교체
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
    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 1000);
    // 살짝 위에서 비스듬히 내려다보는 2.5D 시점
    this.camera.position.set(0, 6, 14);
    this.camera.lookAt(0, -0.5, 0);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.65));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(4, 8, 6);
    this.scene.add(key);

    this._buildReferencePlane();

    // 서퍼 자리 마커 (4단계에서 실제 서퍼 메시로 교체)
    this.marker = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.7, 0.7),
      new THREE.MeshStandardMaterial({ color: 0xffb74d, metalness: 0.1, roughness: 0.5 }),
    );
    this.scene.add(this.marker);

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
  }

  // 파도면이 놓일 기준 평면 (3단계에서 바다 메시로 교체)
  _buildReferencePlane() {
    const wU = LOGICAL_WIDTH  / PX_PER_UNIT;
    const hU = LOGICAL_HEIGHT / PX_PER_UNIT;
    const geo = new THREE.PlaneGeometry(wU, hU, 24, 14);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x3a7ca5, wireframe: true, transparent: true, opacity: 0.45,
    });
    this.plane = new THREE.Mesh(geo, mat);   // PlaneGeometry 기본 XY 평면(z=0)
    this.scene.add(this.plane);
  }

  // 게임 화면 픽셀 → 3D 월드 좌표 (좌표 브리지의 핵심)
  gameToWorld(gx, gy, gz = 0) {
    return new THREE.Vector3(
       (gx - LOGICAL_WIDTH  / 2) / PX_PER_UNIT,
      -(gy - LOGICAL_HEIGHT / 2) / PX_PER_UNIT,   // 화면 y-down → 월드 y-up
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

  // dtMs: Phaser 프레임 델타 | state: { playerX, playerY } 게임 픽셀 좌표
  render(dtMs, state) {
    if (state) {
      const p = this.gameToWorld(state.playerX, state.playerY, 0.5);
      this.marker.position.copy(p);
      this.marker.rotation.y += dtMs / 1000 * 1.2;
    }
    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    window.removeEventListener('resize', this._onResize);
    this.plane.geometry.dispose();
    this.plane.material.dispose();
    this.marker.geometry.dispose();
    this.marker.material.dispose();
    this.renderer.dispose();
    this._el.remove();
  }
}
