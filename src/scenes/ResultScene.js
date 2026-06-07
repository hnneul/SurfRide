import Phaser from 'phaser';
import { LOGICAL_WIDTH, LOGICAL_HEIGHT } from '../constants.js';
import { ScoreEvent } from '../score.js';
import { OBSTACLE_META } from '../obstacle.js';
import { STAGES } from '../stages.js';

/** @typedef {import('../types.js').ResultScenePayload} ResultScenePayload */

// 색상 팔레트 — 처참한 빨강 대신 따뜻하고 격려하는 톤
const TEAL   = '#7af7e0';   // 기록 갱신/긍정
const ORANGE = '#ffb74d';   // 아슬아슬(따뜻한 경고)
const SOFT   = '#9fb8d4';   // 기록까지 멀 때(차분한 슬레이트)
const GOLD   = '#ffd700';   // 힌트/격려/하이라이트

export default class ResultScene extends Phaser.Scene {
  constructor() { super({ key: 'ResultScene' }); }

  /** @param {ResultScenePayload} data */
  init(data) {
    this.cleared     = data.cleared;
    this.stageIndex  = data.stageIndex;
    this.summary     = data.summary;
    this.prevHigh    = data.prevHigh ?? 0;
    this.hitObstacle = data.hitObstacle ?? null;
    this.cause       = data.cause ?? 'collision';
    this.timeRemain  = data.timeRemain ?? 0;
    this.stars       = data.stars ?? 1;
    this.storage     = data.storage;
  }

  create() {
    const cx = LOGICAL_WIDTH / 2;

    // 애니메이션/타이머 추적 — 스킵·종료 시 일괄 정리하기 위한 단일 레지스트리
    this._tweens  = [];
    this._timers  = [];
    this._cause   = [];      // 연출 오브젝트의 최종 프레임 강제용 {obj, apply}
    this._settled = false;
    this._pulsed  = false;

    // 최고기록 차이를 한 번만 계산 — 차이/하이라이트/격려 문구가 모두 동일 기준 사용
    const my = this.summary.total, pv = this.prevHigh ?? 0;
    this._recordGap      = (pv > 0 && my < pv) ? pv - my : 0;
    this._closeThreshold = Math.max(500, Math.round(pv * 0.10));
    this._isClose        = this._recordGap > 0 && this._recordGap <= this._closeThreshold;

    this.add.graphics().fillStyle(0x000000, 0.85).fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    const startY = this.cleared ? this._clearHeader(cx) : this._gameOverHeader(cx);
    this.rows  = this._buildRowModel();    // 순수 데이터
    this.final = this._finalState();       // 순수 데이터(차이/통계/힌트/배지/격려)
    this._renderStatic(cx, startY);        // 모든 텍스트를 0/숨김 상태로 생성
    this._renderButtons(cx);
    this._installSkip();
    this._animate();

    this.events.once('shutdown', this._teardown, this);
  }

  // 추적 헬퍼 — 모든 트윈/타이머는 반드시 이 배열을 거친다
  _t(h) { this._tweens.push(h); return h; }
  _d(h) { this._timers.push(h); return h; }

  // ─── 헤더 ────────────────────────────────────────────────────────────────────
  _clearHeader(cx) {
    this.add.text(cx, 120, 'STAGE CLEAR!', {
      fontSize: '72px', fontFamily: 'sans-serif', color: '#4fc3f7', fontStyle: 'bold',
    }).setOrigin(0.5);

    const starSize = 52, gap = 14;
    const startX = cx - (3 * starSize + 2 * gap) / 2;
    for (let i = 0; i < 3; i++) {
      this.add.text(startX + i * (starSize + gap), 158, '★', {
        fontSize: `${starSize}px`, color: i < this.stars ? '#ffd700' : '#3a3a3a',
      });
    }
    return 248;
  }

  _gameOverHeader(cx) {
    this.add.text(cx, 84, 'GAME OVER', {
      fontSize: '56px', fontFamily: 'sans-serif', color: '#ff4444', fontStyle: 'bold',
    }).setOrigin(0.5);

    if (this.cause === 'wipeout') this._causeWipeout(cx);
    else                          this._causeCollision(cx);

    return 248;
  }

  // 와이프아웃: 보드가 한 바퀴 돌며 물보라 + 큰 WIPEOUT! (상단 밴드 y≤230, 점수/버튼 영역 침범 금지)
  _causeWipeout(cx) {
    const title = this.add.text(cx, 156, 'WIPEOUT!', {
      fontSize: '54px', fontFamily: 'sans-serif', color: '#4fc3f7', fontStyle: 'bold',
    }).setOrigin(0.5).setAlpha(0).setScale(0.4);
    this._t(this.tweens.add({ targets: title, alpha: 1, scale: 1, duration: 300, ease: 'Back.Out' }));
    this._cause.push({ obj: title, apply: () => title.setAlpha(1).setScale(1) });

    // 보드(타이틀 우측) 한 바퀴 회전
    const bx = cx + 300, by = 156;
    const boardBody = this.add.ellipse(0, 0, 110, 26, 0xffcc66).setStrokeStyle(3, 0xffffff, 0.85);
    const stripe    = this.add.rectangle(0, 0, 110, 6, 0xff8a3d);
    const board     = this.add.container(bx, by, [boardBody, stripe]);
    this._t(this.tweens.add({ targets: board, angle: 360, duration: 760, ease: 'Cubic.Out' }));
    this._cause.push({ obj: board, apply: () => { board.angle = 360; } });

    // 물보라 링(퍼지며 사라짐) — 트윈과 오브젝트 모두 추적해 스킵 시 정리
    const ring = this.add.circle(bx, by + 6, 12, 0xbfe7ff, 0.55);
    this._t(this.tweens.add({
      targets: ring, scale: { from: 0.4, to: 3 }, alpha: 0, duration: 640, ease: 'Quad.Out',
      onComplete: () => { if (!this._settled && this.sys.isActive()) ring.destroy(); },
    }));
    this._cause.push({ obj: ring, apply: () => ring.destroy() });

    this.add.text(cx, 210, '← → 로 균형을 잡으세요', {
      fontSize: '27px', fontFamily: 'sans-serif', color: '#ffb4b4',
    }).setOrigin(0.5);
  }

  // 충돌: 장애물 이름을 크게 + 짧은 코믹 리액션(상단 밴드)
  _causeCollision(cx) {
    const meta = this.hitObstacle ? OBSTACLE_META[this.hitObstacle.type] : null;
    const name = meta?.name ?? '장애물';

    const big = this.add.text(cx, 152, `${name}!`, {
      fontSize: '58px', fontFamily: 'sans-serif', color: '#ff8a3d', fontStyle: 'bold',
    }).setOrigin(0.5).setAlpha(0).setScale(0.4);
    this._t(this.tweens.add({ targets: big, alpha: 1, scale: 1, duration: 300, ease: 'Back.Out' }));
    this._cause.push({ obj: big, apply: () => big.setAlpha(1).setScale(1) });

    const QUIPS = {
      SHARK:       '상어가 길막했어요',
      WHALE:       '고래가 앞을 막았어요',
      FLYING_FISH: '날치 떼가 덮쳤어요',
      JELLYFISH:   '해파리에 감전됐어요',
      OCTOPUS:     '문어가 발목을 잡았어요',
      LIGHTNING:   '번개를 못 피했어요',
    };
    const quip = QUIPS[this.hitObstacle?.type] ?? `${name}에 부딪혔어요`;
    const sub  = this.add.text(cx, 208, quip, {
      fontSize: '30px', fontFamily: 'sans-serif', color: '#ffb4b4',
    }).setOrigin(0.5).setAlpha(0);
    this._t(this.tweens.add({ targets: sub, alpha: 1, y: 202, duration: 240, delay: 180, ease: 'Quad.Out' }));
    this._cause.push({ obj: sub, apply: () => sub.setAlpha(1).setY(202) });
  }

  // ─── 데이터 모델(순수) ────────────────────────────────────────────────────────
  _buildRowModel() {
    const b = this.summary.breakdown, s = this.summary, E = ScoreEvent;
    const defs = [
      { label: '생존 점수',         value: b[E.SURVIVAL] },
      { label: '장애물 회피',       value: b[E.DODGE] },
      { label: '아슬아슬 보너스',   value: b[E.NEAR_MISS] },
      { label: `퍼펙트 점프 ×${s.perfectJumps}`, value: b[E.PERFECT_JUMP] },
      { label: '위험구간 보너스',   value: b[E.DANGER_LANE] },
      { label: `황금 물고기 ×${s.goldenFish ?? 0}`, value: b[E.GOLDEN_FISH] },
      { label: '기상이변 보너스 ×2', value: b[E.WEATHER_BONUS] },
    ];
    if (this.cleared) defs.push({ label: '스테이지 클리어', value: b[E.STAGE_CLEAR] });

    return defs.map(d => {
      const value = d.value ?? 0;
      return { label: d.label, value, color: value === 0 ? '#6b7785' : '#e0e0e0' };
    });
  }

  _finalState() {
    const s = this.summary;
    return {
      diff:      this._highScoreDiff(),
      statsText: `최대 콤보 ×${s.maxComboMultiplier.toFixed(1)}   ·   퍼펙트 ${s.perfectJumps}회   ·   황금 물고기 ${s.goldenFish ?? 0}마리`,
      hintText:  this._hint(),
      badge:     this._pickBadge(),
      encourage: this._encourageLine(),
    };
  }

  // ─── 정적 렌더(모두 0/숨김 상태) ──────────────────────────────────────────────
  _renderStatic(cx, startY) {
    const step = 40, lx = cx - 300, rx = cx + 300;

    this.rows.forEach((row, i) => {
      const y = startY + i * step;
      row.labelObj = this.add.text(lx, y, row.label, {
        fontSize: '26px', fontFamily: 'sans-serif', color: row.color,
      }).setOrigin(0, 0.5).setAlpha(0).setData('baseY', y);
      row.valueObj = this.add.text(rx, y, '0', {
        fontSize: '26px', fontFamily: 'sans-serif', color: row.color,
      }).setOrigin(1, 0.5).setAlpha(0).setData('baseY', y);
    });

    let yt = startY + this.rows.length * step + 24;
    this._divider = this.add.graphics().setAlpha(0)
      .lineStyle(1, 0xffffff, 0.25)
      .beginPath().moveTo(lx, yt).lineTo(rx, yt).strokePath();

    yt += 28;
    this.totalLabel = this.add.text(lx, yt, '총점', {
      fontSize: '40px', fontFamily: 'sans-serif', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0, 0.5).setAlpha(0);
    this.totalObj = this.add.text(rx, yt, '0', {
      fontSize: '40px', fontFamily: 'sans-serif', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(1, 0.5).setAlpha(0).setData('baseY', yt);

    const post = (dy, txt, style) => {
      yt += dy;
      return this.add.text(cx, yt, txt, style).setOrigin(0.5).setAlpha(0).setData('baseY', yt);
    };
    this.diffObj  = post(62, this.final.diff.label,    { fontSize: '28px', fontFamily: 'sans-serif', color: this.final.diff.color,  fontStyle: 'bold' });
    this.statsObj = post(42, this.final.statsText,      { fontSize: '24px', fontFamily: 'sans-serif', color: '#9fb8d4' });
    this.hintObj  = post(46, `💡 ${this.final.hintText}`, { fontSize: '28px', fontFamily: 'sans-serif', color: '#ffd700', fontStyle: 'bold' });
    this.badgeObj = post(44, this.final.badge.label,    { fontSize: '28px', fontFamily: 'sans-serif', color: this.final.badge.color, fontStyle: 'bold' });

    // 격려 문구는 버튼(y=928) 바로 위에 고정 — 누적 배치가 버튼을 침범하지 않도록
    this.encourageObj = this.add.text(cx, 864, this.final.encourage.label, {
      fontSize: '28px', fontFamily: 'sans-serif', color: this.final.encourage.color, fontStyle: 'bold',
    }).setOrigin(0.5).setAlpha(0).setData('baseY', 864);
  }

  // ─── 카운트업 시퀀스 ──────────────────────────────────────────────────────────
  // 체인이 '순서/등장 템포'를, 각 addCounter가 '숫자 모션'을 담당.
  // 한 행: alpha(140) + completeDelay(120) = 260ms == 행 카운터(260ms) → 숫자가 등장보다 뒤처지지 않음.
  _animate() {
    const rowTweens = this.rows.map(row => ({
      targets: [row.labelObj, row.valueObj],
      alpha: { from: 0, to: 1 }, duration: 140, completeDelay: 120,
      onStart: () => { if (this._settled || !this.sys.isActive()) return; this._countRow(row); },
    }));

    this._t(this.tweens.chain({
      tweens: rowTweens,
      onComplete: () => { if (this._settled || !this.sys.isActive()) return; this._startTotal(); },
    }));
  }

  _countRow(row) {
    if (!row.value) { row.valueObj.setText('0'); return; }   // 0점 행은 즉시 표시, 팝 없음
    this._t(this.tweens.addCounter({
      from: 0, to: row.value, duration: 260, ease: 'Cubic.Out',
      onUpdate: t => { if (this._settled || !this.sys.isActive()) return; row.valueObj.setText(Math.round(t.getValue()).toLocaleString()); },
      onComplete: () => {
        if (this._settled || !this.sys.isActive()) return;
        row.valueObj.setText(row.value.toLocaleString());
        this._punch(row.valueObj);                            // "찰칵" 팝
      },
    }));
  }

  _startTotal() {
    this._divider.setAlpha(1);
    this.totalLabel.setAlpha(1);
    this.totalObj.setAlpha(1);
    this._countTotal();
  }

  _countTotal() {
    this._t(this.tweens.addCounter({
      from: 0, to: this.summary.total, duration: 700, ease: 'Cubic.Out',
      onUpdate: t => { if (this._settled || !this.sys.isActive()) return; this.totalObj.setText(Math.round(t.getValue()).toLocaleString()); },
      onComplete: () => {
        if (this._settled || !this.sys.isActive()) return;
        this.totalObj.setText(this.summary.total.toLocaleString());
        this._punch(this.totalObj, 1.18);
        this._punch(this.totalLabel, 1.10);
        this._afterCounts();
      },
    }));
  }

  _punch(o, peak = 1.12) {
    this._t(this.tweens.add({
      targets: o, scale: { from: 1, to: peak }, duration: 90, yoyo: true, ease: 'Quad.Out',
      onComplete: () => o.setScale(1),
    }));
  }

  // 총점 정산 후: 차이/통계/힌트/배지/격려를 순차 등장 → 마지막에 _settle(단일 종료점)
  _afterCounts() {
    const reveal = (o, d) => {
      if (!o) return;
      const baseY = o.getData('baseY');
      this._t(this.tweens.add({
        targets: o, alpha: { from: 0, to: 1 }, y: { from: baseY - 12, to: baseY },
        duration: 220, delay: d, ease: 'Back.Out',
        onComplete: () => { if (!this.sys.isActive()) return; o.setAlpha(1); o.y = baseY; },
      }));
    };
    reveal(this.diffObj, 0);
    reveal(this.statsObj, 110);
    reveal(this.hintObj, 220);
    reveal(this.badgeObj, 330);
    reveal(this.encourageObj, 440);

    this._d(this.time.delayedCall(440 + 240, () => {
      if (this._settled || !this.sys.isActive()) return;
      this._settle();
    }));
  }

  // ─── 스킵 / 정산(단일 진실 공급원) ────────────────────────────────────────────
  _installSkip() {
    this.input.keyboard.on('keydown-SPACE', this._onSkip, this);
    this.input.keyboard.on('keydown-ENTER', this._onSkip, this);
    // 전체 화면 스킵 영역(버튼보다 아래 depth) — 빈 곳 클릭은 스킵, 버튼 클릭은 버튼이 우선
    this._skipZone = this.add.zone(960, 540, 1920, 1080).setOrigin(0.5).setInteractive().setDepth(-1);
    this._skipZone.on('pointerdown', this._onSkip, this);
  }

  _onSkip() {
    if (this._settled) return;   // 정산 후엔 무반응(멱등)
    this._finishNow();
  }

  _finishNow() {
    if (this._settled) return;
    this._killAnimations();   // 큐된 onUpdate가 정산 텍스트를 덮어쓰지 않도록 먼저 정지
    this._settle();
  }

  // 추적된 모든 트윈/타이머 정리 — 스킵·종료 양쪽에서 공유
  _killAnimations() {
    for (const t of this._tweens) { try { t.stop(); } catch (e) { /* already removed */ } }
    for (const tm of this._timers) tm.remove(false);   // 콜백 실행 안 함
    this._tweens.length = 0;
    this._timers.length = 0;
  }

  // 종료 프레임을 '데이터'로부터 재구성 — 자연 완료/스킵 어느 쪽이든 동일한 결과
  _settle() {
    if (this._settled) return;

    for (const r of this.rows) {
      r.labelObj.setAlpha(1).setScale(1);
      r.labelObj.y = r.labelObj.getData('baseY');
      r.valueObj.setAlpha(1).setScale(1).setText((r.value ?? 0).toLocaleString());
      r.valueObj.y = r.valueObj.getData('baseY');
    }

    this._divider.setAlpha(1);
    this.totalLabel.setAlpha(1).setScale(1);
    this.totalObj.setAlpha(1).setScale(1).setText(this.summary.total.toLocaleString());

    for (const o of [this.diffObj, this.statsObj, this.hintObj, this.badgeObj, this.encourageObj]) {
      if (!o) continue;
      o.setAlpha(1).setScale(1);
      o.y = o.getData('baseY');
    }

    for (const c of this._cause) c.apply();   // 연출 오브젝트 최종 프레임 강제

    this._settled = true;   // 펄스보다 먼저: 펄스 트윈이 정산 후에도 살아있어야 함
    this._pulseButton();
  }

  _pulseButton() {
    if (this._pulsed || !this.retryBtn) return;
    this._pulsed = true;
    this.retryBtn.setScale(1);
    this._t(this.tweens.add({
      targets: this.retryBtn, scale: { from: 1, to: 1.12 }, duration: 170, yoyo: true, repeat: 1, ease: 'Sine.InOut',
      onComplete: () => this.retryBtn.setScale(1),
    }));
  }

  // 씬 shutdown — Phaser가 트윈/타이머/리스너를 이미 정리하지만 방어적으로 한 번 더
  _teardown() {
    this._killAnimations();
    this.input.keyboard.off('keydown-SPACE', this._onSkip, this);
    this.input.keyboard.off('keydown-ENTER', this._onSkip, this);
    this._skipZone?.off('pointerdown', this._onSkip, this);
  }

  // ─── 문구 헬퍼(순수) ──────────────────────────────────────────────────────────
  _highScoreDiff() {
    const my = this.summary.total;
    const prev = this.prevHigh ?? 0;
    if (prev === 0)  return { label: '🏅 첫 기록 수립!', color: TEAL };
    if (my > prev)   return { label: `🏅 최고 기록 갱신!  +${(my - prev).toLocaleString()}`, color: TEAL };
    if (my === prev) return { label: '🏅 최고 기록 타이!', color: TEAL };
    const gap = prev - my;   // 양수, 마이너스 표기 없음
    return { label: `최고 기록까지  ${gap.toLocaleString()}점`, color: this._isClose ? ORANGE : SOFT };
  }

  // 가중 우선순위 — 항상 하나를 선정
  _pickBadge() {
    const s = this.summary;
    const cands = [
      { ok: this._isClose,                      w: 100,                          label: '🌊 기록까지 한 파도',        color: ORANGE },
      { ok: (s.goldenFish ?? 0) >= 1,           w: 80 + (s.goldenFish ?? 0) * 5, label: '🐟 황금 물고기 사냥 성공',   color: GOLD },
      { ok: (s.perfectJumps ?? 0) >= 3,         w: 60 + (s.perfectJumps ?? 0),   label: '🎯 점프 감각 좋았어요',      color: TEAL },
      { ok: (s.dangerSeconds ?? 0) >= 8,        w: 50 + (s.dangerSeconds ?? 0),  label: '🔥 위험한 라인에서 버텼어요', color: ORANGE },
      { ok: (s.maxComboMultiplier ?? 1) >= 1.5, w: 40,                           label: '⚡ 콤보가 매서웠어요',        color: TEAL },
      { ok: (s.perfectJumps ?? 0) >= 1,         w: 30,                           label: '🎯 첫 퍼펙트 점프 성공',     color: TEAL },
      { ok: (s.nearMisses ?? 0) >= 1,           w: 20,                           label: '😮 아슬아슬하게 잘 피했어요', color: TEAL },
    ];
    const best = cands.filter(c => c.ok).sort((a, b) => b.w - a.w)[0];
    if (best) return { label: best.label, color: best.color };
    if (this.cleared) return { label: '🏆 스테이지 정복!', color: GOLD };
    return { label: '🌊 다음 파도를 노려봐요', color: SOFT };
  }

  _encourageLine() {
    const s = this.summary;
    const gap = this._recordGap;
    if (this._isClose)                return { label: `🌊 다음 판엔 +${gap.toLocaleString()}점만 더!`, color: GOLD };
    if ((s.perfectJumps ?? 0) === 0)  return { label: '🎯 퍼펙트 점프 하나면 기록권이에요', color: GOLD };
    if (gap > 0)                      return { label: `🌊 다음 판엔 +${gap.toLocaleString()}점 도전!`, color: GOLD };
    if (this.cleared)                 return { label: '🔥 다음 해역이 기다려요', color: GOLD };
    return { label: '🌊 이 기세로 한 판 더!', color: GOLD };
  }

  _hint() {
    const s = this.summary;
    if ((s.perfectJumps ?? 0) === 0)
      return 'Perfect Jump를 노려보세요 — 정확한 타이밍 점프로 +200!';
    if ((s.dangerSeconds ?? 0) === 0)
      return '아래 거친 바다(×1.5)에 더 머물면 점수가 크게 올라요';
    if ((s.goldenFish ?? 0) === 0)
      return '지나가는 황금 물고기를 잡으면 +500!';
    if ((s.breakdown[ScoreEvent.WEATHER_BONUS] ?? 0) === 0)
      return '기상 이변 구간에선 점수가 ×2 — 그때 공격적으로 점수를 쌓으세요';
    return '콤보를 더 길게 이어 배율(최대 ×2.0)을 끌어올리세요';
  }

  // ─── 버튼 ────────────────────────────────────────────────────────────────────
  _renderButtons(cx) {
    const y = 928;
    if (this.cleared) {
      this.retryBtn = this._btn(cx - 140, y, 220, 64, '다시 도전', false,
        () => this.scene.start('GameScene', { stageIndex: this.stageIndex }));
      const next = this.stageIndex + 1;
      const hasNext = next < STAGES.length;
      this._btn(cx + 140, y, 220, 64, hasNext ? '다음 해역으로' : '세계지도로', true, () => {
        if (hasNext) this.scene.start('GameScene', { stageIndex: next });
        else         this.scene.start('WorldMapScene');
      });
    } else {
      this.retryBtn = this._btn(cx - 140, y, 220, 64, '다시 도전', true,
        () => this.scene.start('GameScene', { stageIndex: this.stageIndex }));
      this._btn(cx + 140, y, 220, 64, '세계지도로', false,
        () => this.scene.start('WorldMapScene'));
    }
  }

  // 컨테이너로 만들어 펄스(스케일) 시 박스+라벨이 함께 커지도록
  _btn(cx, cy, w, h, label, primary, cb) {
    const gfx = this.add.graphics();
    gfx.fillStyle(primary ? 0x1565c0 : 0x000000, primary ? 1 : 0.12);
    gfx.lineStyle(2, primary ? 0x42a5f5 : 0xffffff, primary ? 1 : 0.3);
    gfx.fillRoundedRect(-w / 2, -h / 2, w, h, 10);
    gfx.strokeRoundedRect(-w / 2, -h / 2, w, h, 10);

    const txt = this.add.text(0, 0, label, {
      fontSize: '28px', fontFamily: 'sans-serif', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);

    const c = this.add.container(cx, cy, [gfx, txt]).setSize(w, h);

    this.add.zone(cx, cy, w, h).setOrigin(0.5).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        if (!this._settled) { this._finishNow(); return; }   // 카운트업 중 클릭 → 스킵만(네비게이션 X)
        cb();
      });

    return c;
  }
}
