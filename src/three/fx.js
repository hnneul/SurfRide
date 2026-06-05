// 카메라 흔들림 — GameScene이 shake()로 트리거(피격·기상이변·위험구간). 기준(0,10,22)에 지터.
export class Fx {
  constructor() {
    this._ms  = 0;   // 남은 시간(ms)
    this._dur = 0;
    this._amp = 0;
  }

  shake(durationMs, intensity = 0.006) {
    this._ms  = durationMs;
    this._dur = durationMs;
    this._amp = intensity;
  }

  // 매 프레임 카메라 위치에 감쇠 지터를 적용(기준 위치로 복귀).
  applyShake(camera, dtMs) {
    let ox = 0, oy = 0;
    if (this._ms > 0) {
      this._ms -= dtMs;
      const f = Math.max(0, this._ms) / (this._dur || 1);   // 1→0 감쇠
      const amp = (this._amp || 0) * 26 * f;
      ox = (Math.random() - 0.5) * amp;
      oy = (Math.random() - 0.5) * amp;
    }
    camera.position.set(ox, 10 + oy, 22);
    camera.lookAt(0, 0, 0);
  }
}
