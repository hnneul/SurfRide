import * as THREE from 'three';
import { disposeObject, rideY2WorldZ, WATER_Y, RIDE_Z_FAR, RIDE_Z_NEAR } from './bridge.js';

// 암초 지대(Stage 5 / narrowLane): 좁은 통로의 위·아래를 막는 암초 벽 두 줄.
// 통로 경계(topY/bottomY, 게임 좌표)를 월드 z로 변환해 통로 '밖'을 암초로 채운다.
// 충돌은 player 클램프(가동 폭 제한)가 담당 — 여기선 보이는 것만.
export class Reef {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.visible = false;
    this.top    = this._makeWall();
    this.bottom = this._makeWall();
    this.group.add(this.top, this.bottom);
    scene.add(this.group);
  }

  _makeWall() {
    // 폭 넓은 저음영 바위 띠 (z=1 기준, sync에서 scale.z로 두께 조절). flatShading으로 거친 질감.
    const geo = new THREE.BoxGeometry(60, 0.7, 1, 24, 1, 1);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      // 윗면을 들쭉날쭉하게 — 바위 실루엣 (서퍼를 가리지 않게 낮게)
      if (pos.getY(i) > 0) pos.setY(i, pos.getY(i) + Math.sin(pos.getX(i) * 1.7) * 0.18);
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({
      color: 0x4a5a4c, roughness: 1, metalness: 0, flatShading: true,
    });
    return new THREE.Mesh(geo, mat);
  }

  // state.reef = { topY, bottomY } (게임 좌표) | null
  sync(reef) {
    if (!reef) { this.group.visible = false; return; }
    this.group.visible = true;
    const topZ = rideY2WorldZ(reef.topY);     // 통로 위 경계
    const botZ = rideY2WorldZ(reef.bottomY);  // 통로 아래 경계
    this._placeWall(this.top,    RIDE_Z_FAR - 2, topZ);      // 통로 위쪽 암초
    this._placeWall(this.bottom, botZ, RIDE_Z_NEAR + 2);     // 통로 아래쪽 암초
  }

  _placeWall(mesh, zA, zB) {
    const depth = Math.max(0.2, zB - zA);
    mesh.position.set(0, WATER_Y - 0.5, (zA + zB) / 2);
    mesh.scale.z = depth;   // BoxGeometry z=1 기준
  }

  dispose() { disposeObject(this.group); }
}
