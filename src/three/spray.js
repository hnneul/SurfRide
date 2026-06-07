import * as THREE from 'three';
import { rideYToFrac } from '../constants.js';

// 물보라 파티클 — 카메라를 향하는 작은 물방울 스프라이트 풀.
//  · 지속 wake: 서퍼 보드 꼬리에서 매 프레임 분사(깊은 위험구간·카빙일수록 강하게).
//  · 버스트: 점프 이륙/착지·피격·퍼펙트·방향전환 때 ThreeLayer가 burst()로 강하게 터뜨림.
// 풀 재활용으로 GC 없이 굴린다. 충돌·점수와 무관한 순수 연출.
const GRAVITY = 7.0;   // world u/s²

export class Spray {
  constructor(scene, max = 90) {
    this.scene = scene;
    this.tex = makeDropTexture();
    this.parts = [];
    this._free = [];
    for (let i = 0; i < max; i++) {
      const mat = new THREE.SpriteMaterial({
        map: this.tex, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, fog: false,
      });
      const mesh = new THREE.Sprite(mat);
      mesh.renderOrder = 12;   // 물·서퍼 위
      mesh.visible = false;
      scene.add(mesh);
      const p = { mesh, mat, life: 0, maxLife: 1, vx: 0, vy: 0, vz: 0, size: 0, base: 0 };
      this.parts.push(p);
      this._free.push(p);
    }
    this._wakeAcc = 0;
  }

  _spawn(x, y, z, opts) {
    const p = this._free.pop();
    if (!p) return;
    p.mesh.position.set(x, y, z);
    p.vx = opts.vx; p.vy = opts.vy; p.vz = opts.vz;
    p.maxLife = opts.life; p.life = opts.life;
    p.size = opts.size; p.base = opts.opacity;
    p.mesh.material.color.setHex(opts.color ?? 0xffffff);
    p.mesh.scale.set(opts.size, opts.size, 1);
    p.mesh.material.opacity = opts.opacity;
    p.mesh.visible = true;
  }

  // 지속 wake — 보드 꼬리(대략 -x, 약간 카메라쪽 +z)에서 위로 솟는 물보라.
  emitWake(surfer, player, dtMs) {
    if (!surfer?.grounded) { return; }
    const depth = rideYToFrac(player?.baseY ?? 0);            // 0(마루)~1(거친 바다)
    const steer = Math.min(1, Math.abs(player?.vSteer ?? 0) / 420);
    const intensity = 0.5 + 0.6 * depth + 0.6 * steer;
    this._wakeAcc += dtMs * 0.12 * intensity;
    const px = surfer.pos.x, py = surfer.pos.y, pz = surfer.pos.z;
    const steerDir = Math.sign(player?.vSteer ?? 0);
    while (this._wakeAcc >= 1) {
      this._wakeAcc -= 1;
      this._spawn(
        px - 0.85 + (Math.random() - 0.5) * 0.7,
        py - 0.05,
        pz + 0.2 + (Math.random() - 0.5) * 0.7,
        {
          vx: -0.5 + (Math.random() - 0.5) * 1.0,
          vy: 1.7 + Math.random() * (1.5 + steer * 2.4),
          vz: 0.7 + steerDir * steer * 1.3 + (Math.random() - 0.5) * 0.9,
          life: 380 + Math.random() * 280,
          size: 0.24 + Math.random() * (0.2 + depth * 0.16),
          opacity: 0.55 + 0.35 * intensity,
        },
      );
    }
  }

  // 버스트 — 한 점에서 사방으로 터지는 물보라(강도 strength). 착지·피격·퍼펙트 등.
  burst(x, y, z, strength = 1, color = 0xffffff) {
    const n = Math.min(this._free.length, Math.round(8 + strength * 16));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (0.8 + Math.random() * 1.6) * strength;
      this._spawn(
        x + (Math.random() - 0.5) * 0.4, y, z + (Math.random() - 0.5) * 0.4,
        {
          vx: Math.cos(a) * sp,
          vy: 1.8 + Math.random() * 2.6 * strength,
          vz: Math.sin(a) * sp * 0.8 + 0.6,
          life: 380 + Math.random() * 320,
          size: 0.2 + Math.random() * 0.26 * strength,
          opacity: 0.7 + 0.3 * Math.min(1, strength),
          color,
        },
      );
    }
  }

  update(dtMs) {
    const dt = dtMs / 1000;
    for (const p of this.parts) {
      if (p.life <= 0) continue;
      p.life -= dtMs;
      if (p.life <= 0) { p.mesh.visible = false; p.mesh.material.opacity = 0; this._free.push(p); continue; }
      p.vy -= GRAVITY * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      const k = p.life / p.maxLife;            // 1→0
      p.mesh.material.opacity = p.base * k;
      p.mesh.scale.setScalar(p.size * (1 + (1 - k) * 0.8));
    }
  }

  dispose() { this.tex.dispose(); }
}

// 부드러운 원형 물방울 텍스처(중심 흰색 → 가장자리 투명)
function makeDropTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(232,252,255,0.75)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
