import { LOGICAL_WIDTH, RIDE_FIXED_Y } from './constants.js';

const W = LOGICAL_WIDTH;

// 황금 물고기 — 가끔 오른쪽에서 헤엄쳐 들어와 왼쪽으로 빠져나간다.
// 서퍼(ERUPT_X 열)와 같은 높이로 맞춰 가로지를 때 잡으면 +500. (매번 등장하지 않음)
class GoldenFish {
  constructor(scene, y, speed) {
    this.scene = scene;
    this.x = W + 90;
    this.y = y;
    this.speed = speed;
    this.bobSeed = Math.random() * Math.PI * 2;
    this.ageMs = 0;
    this.collected = false;
    this.gone = false;
    this.hw = 64;   // 판정 반폭/반높이
    this.hh = 34;

    this.visual = scene.add.container(this.x, this.y).setDepth(1.9);
    this.glow = scene.add.ellipse(0, 0, 120, 70, 0xffe27a, 0.22);
    const body = scene.add.ellipse(0, 0, 96, 46, 0xffd24a).setStrokeStyle(3, 0xfff3c0);
    const belly = scene.add.ellipse(-8, 9, 60, 18, 0xfff0b0, 0.9);
    const tail = scene.add.triangle(50, 0, 0, 0, 30, -24, 30, 24, 0xffb300);
    const finTop = scene.add.triangle(-2, -20, -18, 6, 4, -22, 22, 6, 0xffc233, 0.92);
    const eye = scene.add.circle(-30, -6, 5, 0xffffff);
    const pupil = scene.add.circle(-31, -6, 2.4, 0x3a2600);
    const shine = scene.add.arc(-6, -10, 22, 200, 320, false, 0xffffff, 0.6)
      .setStrokeStyle(3, 0xffffff, 0.6);
    this.visual.add([this.glow, tail, finTop, body, belly, shine, eye, pupil]);
  }

  get box() {
    return { x: this.x - this.hw, y: this.y - this.hh, w: this.hw * 2, h: this.hh * 2 };
  }

  update(dtMs) {
    this.ageMs += dtMs;
    this.x -= this.speed * (dtMs / 1000);
    const bob = Math.sin(this.ageMs * 0.006 + this.bobSeed) * 10;
    this.visual.setPosition(this.x, this.y + bob);
    const pulse = (Math.sin(this.ageMs * 0.01) + 1) / 2;
    this.glow.setScale(1 + pulse * 0.25).setAlpha(0.16 + pulse * 0.18);
    if (this.x < -120) this.gone = true;
  }

  collect() {
    if (this.collected) return;
    this.collected = true;
    this.gone = true;
    // 획득 연출: 반짝이는 링 + 떠오르는 +500
    const ring = this.scene.add.graphics().setDepth(3);
    ring.lineStyle(5, 0xffe27a, 1).strokeCircle(this.x, this.y, 24);
    this.scene.tweens.add({
      targets: ring, alpha: 0, duration: 360,
      onUpdate: (tw) => {
        const k = tw.getValue();
        ring.clear();
        ring.lineStyle(5, 0xffe27a, 1 - k).strokeCircle(this.x, this.y, 24 + k * 60);
      },
      onComplete: () => ring.destroy(),
    });
    const pop = this.scene.add.text(this.x, this.y, '+500', {
      fontSize: '40px', fontFamily: 'sans-serif', color: '#ffd24a', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(6);
    this.scene.tweens.add({
      targets: pop, y: this.y - 80, alpha: 0, duration: 700, ease: 'Cubic.easeOut',
      onComplete: () => pop.destroy(),
    });
    this.visual.destroy();
  }

  destroy() { if (!this.collected) this.visual.destroy(); }
}

export class GoldenFishManager {
  constructor(scene) {
    this.scene = scene;
    this.fishes = [];
    this._nextSpawnMs = 5500 + Math.random() * 3500;   // 첫 등장
    this._timer = 0;
  }

  // dt 기반 스폰 + 이동 + 수집 판정. 이번 프레임 획득 수 반환.
  update(dtMs, player) {
    this._timer += dtMs;
    if (this._timer >= this._nextSpawnMs) {
      this._timer = 0;
      this._nextSpawnMs = 6500 + Math.random() * 6000;  // 다음 등장 간격(좌우 수집 — 좀 더 자주)
      if (Math.random() < 0.8) this._spawn();            // 매번은 아님
    }

    let collected = 0;
    for (const f of this.fishes) {
      f.update(dtMs);
      if (!f.collected && this._overlap(player.hitbox, f.box)) {
        f.collect();
        collected++;
      }
    }
    this.fishes = this.fishes.filter((f) => {
      if (f.gone && !f.collected) f.destroy();
      return !f.gone;
    });
    return collected;
  }

  _spawn() {
    // 서퍼 깊이(고정)로 가로질러 지나가게 → 좌우(←/→)로 가서 잡는다.
    const speed = (this.scene.obstacleManager?.scrollSpeed ?? 600) * 0.62;
    this.fishes.push(new GoldenFish(this.scene, RIDE_FIXED_Y, speed));
  }

  _overlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  destroy() {
    for (const f of this.fishes) f.destroy();
    this.fishes = [];
  }
}
