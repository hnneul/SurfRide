import * as THREE from 'three';
import { LOGICAL_WIDTH, LOGICAL_HEIGHT } from '../constants.js';
import { BACKGROUND_THEMES } from '../oceanBackground.js';

// 게임 픽셀 좌표 → 3D 월드 유닛 스케일 (1 unit = PX_PER_UNIT px)
const PX_PER_UNIT = 90;

// Phaser 캔버스 위에 겹치는 투명 Three.js 레이어 (렌더만 3D, 게임 루프는 Phaser가 주도).
//
// 3단계 — 바다 배경 3D화 (표면형):
//  - 평면을 수평으로 눕혀 "바다 바닥 표면"으로 두고, 위에서 비스듬히 내려다보는 2.5D 시점
//  - 정점 높이를 여러 sin파로 변위시켜 잔잔한 로우폴리 파도, 스테이지 테마색 적용
//  - gameToWorld(): 게임 픽셀 → 3D 월드 매핑 (4단계 서퍼/장애물 배치에 사용)
export class ThreeLayer {
  constructor(themeKey = 'jeju', parentId = 'game-container') {
    const parent = document.getElementById(parentId);
    const w = parent.clientWidth  || window.innerWidth;
    const h = parent.clientHeight || window.innerHeight;
    this.theme = BACKGROUND_THEMES[themeKey] ?? BACKGROUND_THEMES.jeju;
    this.t = 0;   // 파도 애니메이션 누적 시간(s)

    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);

    const el = this.renderer.domElement;
    el.style.position = 'absolute';
    el.style.inset = '0';
    el.style.width = '100%';
    el.style.height = '100%';
    el.style.pointerEvents = 'none';
    el.style.zIndex = '1';
    parent.appendChild(el);
    this._el = el;

    this.scene  = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 1000);
    // 바다 표면을 위에서 비스듬히 내려다보는 2.5D 시점
    this.camera.position.set(0, 12, 20);
    this.camera.lookAt(0, -3, -2);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(3, 10, 6);
    this.scene.add(key);

    this._buildOcean();

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
  }

  // 3D 바다 표면 — 수평으로 눕힌 평면, render()에서 정점 높이를 변위시켜 파도
  _buildOcean() {
    const wU = LOGICAL_WIDTH / PX_PER_UNIT;
    const geo = new THREE.PlaneGeometry(wU * 1.5, 38, 60, 72);
    const mat = new THREE.MeshStandardMaterial({
      color: this.theme.sea[1], roughness: 0.7, metalness: 0.15, flatShading: true,
    });
    this.ocean = new THREE.Mesh(geo, mat);
    this.ocean.rotation.x = -Math.PI / 2;   // 수평 바닥으로 눕힘
    this.ocean.position.y = -3;
    this.scene.add(this.ocean);
    // 변위 기준이 될 원본 정점 좌표 보관
    this._oceanBase = Float32Array.from(geo.attributes.position.array);
  }

  // 잔잔한 파도 — 여러 sin파 합성으로 정점 높이 변위
  _animateOcean() {
    const pos  = this.ocean.geometry.attributes.position;
    const base = this._oceanBase;
    const t = this.t;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3], y = base[i * 3 + 1];
      const z = Math.sin(x * 1.2 + t * 1.4)  * 0.09
              + Math.sin(y * 1.0 - t * 1.1)  * 0.06
              + Math.sin((x * 0.7 + y * 0.9) + t * 0.8) * 0.05;
      pos.setZ(i, z);
    }
    pos.needsUpdate = true;
    this.ocean.geometry.computeVertexNormals();   // 파도 음영을 위해 노멀 갱신
  }

  // 게임 화면 픽셀 → 3D 월드 좌표 (4단계 서퍼/장애물 배치에 사용)
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

  render(dtMs, _state) {
    this.t += dtMs / 1000;
    this._animateOcean();
    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    window.removeEventListener('resize', this._onResize);
    this.ocean.geometry.dispose();
    this.ocean.material.dispose();
    this.renderer.dispose();
    this._el.remove();
  }
}
