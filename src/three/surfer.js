import * as THREE from 'three';
import { PX_PER_UNIT, WATER_Y, gameX2WorldX, rideY2WorldZ } from './bridge.js';

const STEER_MAX = 420;   // player.js STEER_MAX (수직 속도 정규화용) — 함께 유지

// 서퍼 (BoxGeometry 조합, 모두 flatShading). 보드 길이축=월드 x, 깊이축=월드 z.
// 낮은 추적 카메라(대략 -z 방향)에서: 화면상 좌우 뱅크=rotation.z, 앞뒤 피치=rotation.x.
// 게임 player 상태(x·baseY·jumpOffset)를 추종하되 y/기울기는 파동장(world.sampleWaveHeight)에서
// 샘플링 → '렌더된 바로 그 파도' 위에 올라타고 마루 기울기로 보드가 기운다.
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
    this.board = board;
    // 외부(카메라/FX)가 읽는 현재 월드 상태
    this.pos = g.position;
    this.grounded = true;
    this.waveH = 0;
    scene.add(g);
  }

  update(player, cursors, t, world) {
    if (!this.group || !player) return;
    const wx = gameX2WorldX(player.x);
    const wz = rideY2WorldZ(player.baseY);

    const jump = (player.jumpOffset ?? 0) / PX_PER_UNIT;   // 점프 높이(월드)
    const dive = (player.diveOffset ?? 0) / PX_PER_UNIT;   // 잠수 깊이(아래로)
    const grounded = player.isGrounded ?? true;
    this.grounded = grounded;

    // 점프 중엔 파도 추종을 약하게(수면을 떠난다) — 착지하며 다시 수면에 붙는다.
    const follow = grounded ? 1 : Math.max(0.15, 1 - jump * 0.7);
    const waveH = world ? world.sampleWaveHeight(wx, wz, t) : Math.sin(t * 2) * 0.06;
    this.waveH = waveH;
    // 플레이닝 리프트 — 보드가 수면에 박히지 않고 위로 미끄러지듯 얹힌다(서핑감, 마루 뒤 가림 완화).
    const PLANE_LIFT = 0.18;
    this.group.position.set(wx, WATER_Y + waveH * follow + PLANE_LIFT + jump - dive, wz);

    const slope = world ? world.sampleWaveSlope(wx, wz, t) : { dHdx: 0, dHdz: 0 };

    // 좌우 뱅크(rotation.z) = 마루 측면기울기 + 카빙(vSteer) + 균형(tilt) + 트릭/비틀거림
    const waveBank = grounded ? clamp(slope.dHdx * 0.85, -0.3, 0.3) : 0;
    const carve    = clamp((player.vSteer ?? 0) / STEER_MAX, -1, 1) * 0.16;
    const balance  = clamp(player.tilt ?? 0, -1.25, 1.25) * 0.18;          // 위험한 균형이 보드 기울임으로
    const trick    = grounded ? 0 : (player.trickRotation ?? 0);
    const stagger  = (player.staggerMs ?? 0) > 0 ? Math.sin(t * 46) * 0.22 : 0;
    const idle     = Math.sin(t * 1.8) * 0.04;
    this.group.rotation.z = idle + waveBank + carve + balance + trick + stagger;

    // 앞뒤 피치(rotation.x) = 마루 진행기울기. 마루를 내려갈 땐 노즈가 떨어진다.
    const wavePitch = clamp(-slope.dHdz * 0.6, -0.32, 0.32) * follow;
    const airPitch  = grounded ? 0 : -0.16;                                // 점프 중 살짝 노즈업
    this.group.rotation.x = wavePitch + airPitch;

    this.board.material.color.setHex(grounded ? 0xfff0d0 : 0xffffff);
  }
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
