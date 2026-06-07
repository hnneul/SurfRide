// 카메라 흔들림 — GameScene이 shake()로 트리거(피격·기상이변·큰 파도·퍼펙트). 추적 카메라의
// 기준 위치(ThreeLayer._updateCamera) '위에' 더해지는 감쇠 지터 오프셋만 만든다(절대 위치 X).
export class Fx {
  constructor() {
    this._ms  = 0;   // 남은 시간(ms)
    this._dur = 0;
    this._amp = 0;
  }

  shake(durationMs, intensity = 0.006) {
    // 더 센 흔들림이 약한 진행 중 흔들림을 끊지 않게 — 에너지(시간×세기)가 클 때만 덮어쓴다.
    if (this._ms <= 0 || durationMs * intensity >= this._ms * this._amp) {
      this._ms  = durationMs;
      this._dur = durationMs;
      this._amp = intensity;
    }
  }

  // 매 프레임 카메라 위치/업벡터에 더할 오프셋 반환(없으면 0).
  getOffset(dtMs) {
    if (this._ms <= 0) return { x: 0, y: 0, roll: 0 };
    this._ms -= dtMs;
    const f   = Math.max(0, this._ms) / (this._dur || 1);   // 1→0 감쇠
    const amp = (this._amp || 0) * 26 * f;
    return {
      x: (Math.random() - 0.5) * amp,
      y: (Math.random() - 0.5) * amp,
      roll: (Math.random() - 0.5) * amp * 0.02,
    };
  }
}
