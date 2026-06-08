// ─── 배럴(튜브 라이딩) — 위험-보상의 하이라이트 ────────────────────────────────
// 파도가 말려 동굴(튜브)을 만든다. 열린 동안 ↓를 눌러 '튜브에 박혀' 버티면(서퍼는 제자리 고정 — player가
// barrelTucked로 세로를 잠금) 튜브 안 → 초당 대점수. 그 와중에 좌우로 장애물을 피해야 하고, 끝까지
// 버티면 '메이드 잇' 대박, 도중에 장애물에 맞으면 배럴이 깨져 마무리 보너스를 날린다(커밋 = 진짜 위험).
//
// 판정·점수·연출만 담당. 튜브 렌더는 ThreeLayer.barrel(BarrelTube)가 tube()를 읽어 그린다.
// GameScene이 소유하며 매 프레임 update(dt)를 호출하고, HUD는 hud()로 읽어간다.

import { audio } from './audio.js';

const WARN_MS = 1_600;   // 예고(말려 들어오는 파도) 길이
const OPEN_MS = 6_000;   // 배럴이 열려 있는 창
const GOOD_MS = 3_200;   // 이만큼 튜브에 박혀 있으면 품질 1.0(만점 보너스)

export class BarrelManager {
  constructor(scene) {
    this.scene = scene;
    const dur = scene.obstacleManager._stageDuration;
    // 1스테이지(45s)는 큰 파도 2개(0.34·0.70)가 각 ~7s를 차지해, 깨끗한 빈 구간은 그 사이(0.52)
    // 하나뿐 → 배럴 1회를 거기 배치(겹침 없음). 큰 파도가 없는 다른 스테이지는 중반 1회.
    // (배럴을 늘리려면 큰 파도를 솎거나 배럴 창을 줄여야 함 — bigWaves.js와 함께 튜닝.)
    this.times = scene.stageIndex === 0
      ? [dur * 0.47]
      : [dur * 0.55];
    this.idx = 0;

    this.phase   = 'idle';   // idle | warn | open
    this.warnMs  = 0;
    this.openMs  = 0;
    this.goodMs  = 0;
    this.tubed   = false;    // 지금 튜브 안에 있는가
    this.busted  = false;    // 이번 배럴이 피격으로 깨졌는가
    this._tickAcc = 0;
  }

  get isOpen() { return this.phase === 'open'; }
  get progress() { return this.phase === 'open' ? Math.min(1, this.openMs / OPEN_MS) : 0; }

  // HUD 표시용
  hud() {
    return {
      warn:     this.phase === 'warn',
      active:   this.phase === 'open',
      tubed:    this.phase === 'open' && this.tubed,
      progress: this.progress,
      quality:  Math.min(1, this.goodMs / GOOD_MS),
    };
  }

  // 3D 튜브 렌더용
  tube() {
    return { active: this.phase === 'open', tubed: this.tubed, progress: this.progress };
  }

  update(dt) {
    const s = this.scene;
    if (!s.three) return;
    const t = s.stageTimer;

    if (this.phase === 'idle') {
      if (this.idx < this.times.length && t >= this.times[this.idx] - WARN_MS) {
        this.phase = 'warn'; this.warnMs = 0;
        s.three.shake(160, 0.003);
      }
      return;
    }

    if (this.phase === 'warn') {
      this.warnMs += dt;
      if (this.warnMs >= WARN_MS) {
        this.phase = 'open';
        this.openMs = 0; this.goodMs = 0; this.tubed = false; this.busted = false; this._tickAcc = 0;
        s.three.shake(220, 0.0045);
        s.hud?.flash(150, 220, 255, 200);
      }
      return;
    }

    // open — 포켓 유지 판정 + 초당 보상, 창이 끝나면 정산
    this.openMs += dt;
    // '제자리에 박혀 유지' — 위치가 아니라 ↓ 홀드(튜브에 박혀 버티기)로 판정. player가 세로를 고정한다.
    const tubed = !this.busted && s.player.isGrounded && !!s.cursors?.down?.isDown;
    this.tubed = tubed;

    if (tubed) {
      this.goodMs += dt;
      this._tickAcc += dt;
      while (this._tickAcc >= 700) {
        this._tickAcc -= 700;
        s.scoreManager.onBarrelTick(s.player.baseY);
        s.three?.surferSplash(0.6, 0xcdfaff);
      }
    }

    if (this.openMs >= OPEN_MS) {
      const quality = Math.min(1, this.goodMs / GOOD_MS);
      if (!this.busted && quality >= 0.4) this._onMade(quality);
      else                                this._onMiss();
      this.phase = 'idle';
      this.tubed = false;
      this.idx++;
    }
  }

  // 배럴 도중 피격 — 튜브가 무너진다. 마무리 보너스 날림(깊게 커밋한 만큼 뼈아픔).
  onPlayerHit() {
    if (this.phase !== 'open' || this.busted) return;
    this.busted = true;
    this.tubed = false;
    const s = this.scene;
    s.three?.shake(240, 0.006);
    s.hud?.flash(255, 120, 90, 160);
    s.hud?.toast('배럴 붕괴!', '튜브를 놓쳤다');
  }

  _onMade(quality) {
    const s = this.scene;
    const pts = s.scoreManager.onBarrelMade(quality, s.player.baseY);
    audio.playSfx('barrel');
    s._slowmoMs = Math.max(s._slowmoMs, 200);
    s.cameras.main.flash(200, 150, 240, 255, false);
    s.cameras.main.shake(220, 0.005);
    s.three?.shake(220, 0.005);
    s.three?.surferSplash(2.6, 0xeafdff);
    s.hud?.flash(170, 235, 255, 200);
    s.hud?.toast(quality > 0.85 ? '메이드 잇!! 🌊' : '메이드 잇! 🌊', `+${pts}`);
  }

  _onMiss() {
    const s = this.scene;
    if (!this.busted) {   // 피격 외(그냥 못 버팀) — 가벼운 피드백
      s.three?.shake(160, 0.003);
      s.hud?.flash(120, 160, 210, 130);
    }
  }
}
