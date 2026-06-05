import { LOGICAL_WIDTH, RIDE_TOP_Y, RIDE_BOTTOM_Y } from '../constants.js';

// 게임 픽셀 좌표 → 3D 월드 유닛 스케일 (1 unit = PX_PER_UNIT px).
export const PX_PER_UNIT = 90;

// ── 게임 ↔ 3D 좌표 브리지 (서퍼·장애물·신호·황금물고기 공용) ──
// 게임은 고정 열(x=ERUPT_X)에서 수직(baseY/targetY)으로만 움직이는 2D. 카메라가 수면을
// 내려다보므로 게임 x→월드 x, 게임 수직→월드 z(깊이)로 매핑해 수면 위를 타게 한다.
// (수직을 월드 y로 두면 아래 레인이 물에 잠김.) 충돌은 기존 2D AABB가 담당.
export const WATER_Y     = 0.7;   // 서퍼·장애물이 얹히는 수면 높이
export const RIDE_Z_FAR  = 2;     // baseY=RIDE_TOP_Y(마루·안전·화면 위)    → 먼 z
export const RIDE_Z_NEAR = 11;    // baseY=RIDE_BOTTOM_Y(거친 바다·위험·아래) → 가까운 z

// 게임 x(고정 열) → 월드 x
export function gameX2WorldX(gx) {
  return (gx - LOGICAL_WIDTH / 2) / PX_PER_UNIT;
}

// 게임 수직(baseY/targetY) → 월드 z(깊이): 마루(위)=먼 z, 거친 바다(아래)=가까운 z
export function rideY2WorldZ(gy) {
  const f  = (gy - RIDE_TOP_Y) / (RIDE_BOTTOM_Y - RIDE_TOP_Y);
  const cf = f < 0 ? 0 : f > 1 ? 1 : f;
  return RIDE_Z_FAR + cf * (RIDE_Z_NEAR - RIDE_Z_FAR);
}

// 메시 트리의 geometry/material 일괄 해제
export function disposeObject(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    }
  });
}
