import * as THREE from 'three';
import { PX_PER_UNIT, WATER_Y, gameX2WorldX, rideY2WorldZ } from './bridge.js';

// 서퍼 (BoxGeometry 조합, 모두 flatShading). 팔 색은 스펙 미지정 → 머리(피부톤)와 동일.
// 게임 player 상태(x·baseY·jumpOffset)를 그대로 추종 + 출렁임/기울임 애니메이션.
export class Surfer {
  constructor(scene) {
    const box = (w, h, d, color) =>
      new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
        new THREE.MeshLambertMaterial({ color, flatShading: true }));

    const g = new THREE.Group();
    const board = box(2.4, 0.12, 0.65, 0xfff0d0);
    const body  = box(0.35, 0.58, 0.3, 0xff7733); body.position.y = 0.65;
    const head  = box(0.28, 0.28, 0.28, 0xe8a882); head.position.y = 1.1;
    const armL  = box(0.55, 0.14, 0.14, 0xe8a882); armL.position.set(-0.33, 0.78, 0); armL.rotation.z =  0.4;
    const armR  = box(0.55, 0.14, 0.14, 0xe8a882); armR.position.set( 0.33, 0.78, 0); armR.rotation.z = -0.4;
    const legL  = box(0.18, 0.36, 0.18, 0x3366aa); legL.position.set(-0.13, 0.3, 0);
    const legR  = box(0.18, 0.36, 0.18, 0x3366aa); legR.position.set( 0.13, 0.3, 0);

    g.add(board, legL, legR, body, armL, armR, head);
    this.group = g;
    scene.add(g);
  }

  update(player, cursors, t) {
    if (!this.group || !player) return;
    const bob  = Math.sin(t * 2) * 0.06;                  // 파도 출렁임
    const jump = (player.jumpOffset ?? 0) / PX_PER_UNIT;  // 점프 높이(게임 px → 월드)
    this.group.position.set(
      gameX2WorldX(player.x),
      WATER_Y + bob + jump,
      rideY2WorldZ(player.baseY),
    );
    const grounded = player.isGrounded ?? true;
    // 지상: 좌우 기울임(카빙). 공중: 좌우가 스핀이 되므로 누적 트릭 회전을 그대로 반영.
    const lean    = grounded ? ((cursors?.left?.isDown ? -0.08 : 0) + (cursors?.right?.isDown ? 0.08 : 0)) : 0;
    const trick   = grounded ? 0 : (player.trickRotation ?? 0);
    const stagger = (player.staggerMs ?? 0) > 0 ? Math.sin(t * 46) * 0.22 : 0;   // botch 비틀거림 흔들
    this.group.rotation.z = Math.sin(t * 1.8) * 0.06 + lean + trick + stagger;
  }
}
