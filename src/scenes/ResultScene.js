import Phaser from 'phaser';
import { LOGICAL_WIDTH, LOGICAL_HEIGHT } from '../constants.js';
import { ScoreEvent } from '../score.js';
import { OBSTACLE_META } from '../obstacle.js';
import { STAGES } from '../stages.js';
import { submitScore } from '../ranking.js';
import { ensureNickname } from '../ui/rankingModal.js';

/** @typedef {import('../types.js').ResultScenePayload} ResultScenePayload */

// 색상 팔레트 — 처참한 빨강 대신 따뜻하고 격려하는 톤
const TEAL   = '#7af7e0';   // 기록 갱신/긍정
const ORANGE = '#ffb74d';   // 아슬아슬(따뜻한 경고)
const SOFT   = '#9fb8d4';   // 기록까지 멀 때(차분한 슬레이트)
const GOLD   = '#ffd700';   // 힌트/격려/하이라이트

const GAME_OVER_BG = 'game-over-night-ocean-neon';
const STAGE_CLEAR_BG = 'stage-clear-ocean-pixel';

// 게임오버 사인 문구 — 담백하게 "무슨 일이 있었는지"만 서술(타입별 후보 중 매번 랜덤)
const COLLISION_QUIPS = {
  SHARK:       ['상어에 부딪혔어요', '상어를 피하지 못했어요', '상어가 다가오는 걸 늦게 봤어요'],
  WHALE:       ['고래에 부딪혔어요', '고래를 미처 피하지 못했어요', '고래가 수면 위로 올라왔어요'],
  FLYING_FISH: ['날치 떼에 부딪혔어요', '날치 떼를 피하지 못했어요', '날치 떼가 한꺼번에 날아올랐어요'],
  JELLYFISH:   ['해파리에 닿았어요', '해파리를 피하지 못했어요', '해파리가 진로에 떠 있었어요'],
  OCTOPUS:     ['문어에 부딪혔어요', '문어를 피하지 못했어요', '문어가 발밑에서 솟아올랐어요'],
  LIGHTNING:   ['번개를 피하지 못했어요', '번개가 가까이 떨어졌어요', '번개를 늦게 봤어요'],
};
const WIPEOUT_QUIPS = ['균형을 잃었어요', '중심을 잡지 못했어요', '파도에 휘청였어요'];

const pickRandom = arr => arr[Math.floor(Math.random() * arr.length)];

export default class ResultScene extends Phaser.Scene {
  constructor() { super({ key: 'ResultScene' }); }

  preload() {
    if (!this.textures.exists(GAME_OVER_BG)) {
      this.load.image(GAME_OVER_BG, '/game-over-night-ocean-neon.png');
    }
    if (!this.textures.exists(STAGE_CLEAR_BG)) {
      this.load.image(STAGE_CLEAR_BG, '/stage-clear-ocean-pixel.png');
    }
  }

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

    this._renderBackdrop();

    const startY = this.cleared ? this._clearHeader(cx) : this._gameOverHeader(cx);
    this.rows  = this._buildRowModel();    // 순수 데이터
    this.final = this._finalState();       // 순수 데이터(차이/통계/힌트/배지/격려)
    this._renderStatic(cx, startY);        // 모든 텍스트를 0/숨김 상태로 생성
    this._renderButtons(cx);
    this._installSkip();
    this._animate();
    this._submitToLeaderboard();   // 온라인 랭킹 자동 등록(백그라운드)

    this.events.once('shutdown', this._teardown, this);
  }

  // 결과 화면 진입 시 점수를 Supabase 랭킹에 등록. 최초 1회만 닉네임 입력 다이얼로그가 뜨고,
  // 이후엔 저장된 닉네임으로 조용히 등록된다. 실패는 게임 흐름에 영향 없음(throw 안 함).
  async _submitToLeaderboard() {
    try {
      const nick = await ensureNickname();           // 닉네임 없으면 최초 1회 입력 받음
      if (!nick || !this.sys?.isActive()) return;     // 입력 취소 / 씬 이탈 시 등록 생략
      await submitScore(this.stageIndex + 1, this.summary?.total ?? 0);
    } catch { /* 랭킹 등록 실패 무시 */ }
  }

  // 추적 헬퍼 — 모든 트윈/타이머는 반드시 이 배열을 거친다
  _t(h) { this._tweens.push(h); return h; }
  _d(h) { this._timers.push(h); return h; }

  // ─── 헤더 ────────────────────────────────────────────────────────────────────
  _renderBackdrop() {
    if (this.cleared && this.textures.exists(STAGE_CLEAR_BG)) {
      const bg = this.add.image(LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2, STAGE_CLEAR_BG)
        .setOrigin(0.5)
        .setDepth(-20);
      bg.setScale(Math.max(LOGICAL_WIDTH / bg.width, LOGICAL_HEIGHT / bg.height));

      this.add.graphics().setDepth(-19)
        .fillStyle(0xffffff, 0.08).fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT)
        .fillStyle(0x004c7a, 0.30).fillRoundedRect(500, 318, 920, 548, 8)
        .lineStyle(2, 0xffffff, 0.34).strokeRoundedRect(500, 318, 920, 548, 8)
        .fillStyle(0x002f5a, 0.18).fillRect(0, 780, LOGICAL_WIDTH, 300);

      return;
    }

    if (!this.cleared && this.textures.exists(GAME_OVER_BG)) {
      const bg = this.add.image(LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2, GAME_OVER_BG)
        .setOrigin(0.5)
        .setDepth(-20);
      bg.setScale(Math.max(LOGICAL_WIDTH / bg.width, LOGICAL_HEIGHT / bg.height));
      this._gameOverBg = bg;

      this.add.graphics().setDepth(-19)
        .fillStyle(0x01081a, 0.34).fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT)
        .fillStyle(0x000000, 0.40).fillRect(0, 760, LOGICAL_WIDTH, 320);

      this._ambientGameOver();
      return;
    }

    this.add.graphics().fillStyle(0x000000, 0.85).fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
  }

  _ambientGameOver() {
    const shimmer = this.add.graphics().setDepth(-17).setAlpha(0.0);
    for (let i = 0; i < 12; i++) {
      const y = 516 + i * 8;
      shimmer.lineStyle(2, 0x69e7ff, 0.18 - i * 0.008)
        .beginPath()
        .moveTo(640 - i * 18, y)
        .lineTo(1280 + i * 18, y + Phaser.Math.Between(-3, 3))
        .strokePath();
    }
    this._t(this.tweens.add({
      targets: shimmer,
      alpha: { from: 0.08, to: 0.34 },
      x: { from: -26, to: 26 },
      duration: 2200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    }));

    for (let i = 0; i < 18; i++) {
      const bubble = this.add.circle(
        Phaser.Math.Between(120, LOGICAL_WIDTH - 120),
        Phaser.Math.Between(660, 1010),
        Phaser.Math.Between(3, 9),
        0x63dfff,
        Phaser.Math.FloatBetween(0.10, 0.28),
      ).setStrokeStyle(1, 0x7bf4ff, 0.22).setDepth(-16);
      this._t(this.tweens.add({
        targets: bubble,
        y: bubble.y - Phaser.Math.Between(60, 130),
        alpha: { from: bubble.alpha, to: 0 },
        duration: Phaser.Math.Between(2600, 5200),
        delay: Phaser.Math.Between(0, 1800),
        repeat: -1,
        ease: 'Sine.InOut',
      }));
    }
  }

  _clearHeader(cx) {
    const title = this.add.text(cx, 128, 'STAGE CLEAR!', {
      fontSize: '76px', fontFamily: 'sans-serif', color: '#fff8c7', fontStyle: 'bold',
      shadow: { offsetX: 0, offsetY: 4, color: '#0f6092', blur: 8, fill: true },
    }).setOrigin(0.5).setData('baseY', 128);

    this._cause.push({ obj: title, apply: () => title.setAlpha(1).setScale(1).setY(128) });
    this.clearStars = this._renderClearStars(cx, 238);
    return 372;
  }

  _renderClearStars(cx, y) {
    const count = Phaser.Math.Clamp(this.stars ?? 1, 1, 3);
    const defs = [
      { x: cx - 164, scale: 7.4, delay: 170 },
      { x: cx + 164, scale: 7.4, delay: 360 },
      { x: cx,       scale: 10.2, delay: 570 },
    ];
    return defs.slice(0, count).map((def, i, list) => {
      const star = this._pixelStar(def.x, y + (i === 2 ? -8 : 14), def.scale)
        .setAlpha(0)
        .setScale(0)
        .setData('baseX', def.x)
        .setData('baseY', y + (i === 2 ? -8 : 14))
        .setData('delay', def.delay)
        .setData('isLast', i === list.length - 1);

      this._cause.push({
        obj: star,
        apply: () => star.setAlpha(1).setScale(1).setAngle(0).setPosition(star.getData('baseX'), star.getData('baseY')),
      });
      return star;
    });
  }

  _pixelStar(cx, cy, px) {
    const c = this.add.container(cx, cy).setDepth(3);
    const draw = (x, y, w, h, color, alpha = 1) => {
      c.add(this.add.rectangle((x + w / 2 - 5) * px, (y + h / 2 - 5) * px, w * px, h * px, color, alpha));
    };

    [
      [4, 0, 2, 1], [3, 1, 4, 1], [2, 2, 6, 1], [0, 3, 10, 2],
      [1, 5, 8, 1], [2, 6, 6, 1], [2, 7, 2, 1], [6, 7, 2, 1],
      [1, 8, 2, 1], [7, 8, 2, 1],
    ].forEach(p => draw(...p, 0xf58a16));

    [
      [4, 1, 2, 1], [3, 2, 4, 1], [2, 3, 6, 2],
      [3, 5, 4, 1], [4, 6, 2, 1], [3, 7, 1, 1], [6, 7, 1, 1],
    ].forEach(p => draw(...p, 0xfff02f));

    [[6, 2, 1, 3], [7, 3, 1, 2], [5, 5, 1, 1], [7, 6, 1, 1]]
      .forEach(p => draw(...p, 0xffbc24, 0.92));
    [[3, 2, 2, 1], [2, 3, 2, 1], [3, 4, 1, 1]]
      .forEach(p => draw(...p, 0xffffff, 0.92));

    return c;
  }

  _wiggleLastStar(star, onComplete) {
    this._t(this.tweens.add({
      targets: star,
      angle: { from: -4, to: 4 },
      x: { from: star.getData('baseX') - 4, to: star.getData('baseX') + 4 },
      duration: 70,
      yoyo: true,
      repeat: 2,
      ease: 'Sine.InOut',
      onComplete: () => {
        star.setAngle(0).setPosition(star.getData('baseX'), star.getData('baseY'));
        onComplete?.();
      },
    }));
  }

  _gameOverHeader(cx) {
    if (this.cause === 'wipeout') this._causeWipeout(cx, 552);
    else                          this._causeCollision(cx, 552);

    return 646;
  }

  // 와이프아웃: 보드가 한 바퀴 돌며 물보라 + 큰 WIPEOUT! (상단 밴드 y≤230, 점수/버튼 영역 침범 금지)
  _causeWipeout(cx, y = 156) {
    const title = this.add.text(cx, y, 'WIPEOUT!', {
      fontSize: '42px', fontFamily: 'sans-serif', color: '#89f8ff', fontStyle: 'bold',
      shadow: { offsetX: 0, offsetY: 0, color: '#007dff', blur: 14, fill: true },
    }).setOrigin(0.5);
    this._cause.push({ obj: title, apply: () => title.setAlpha(1).setScale(1) });

    // 보드(타이틀 우측) — 게임오버 첫 화면은 정적으로 등장
    const bx = cx + 286, by = y;
    const boardBody = this.add.ellipse(0, 0, 110, 26, 0xffcc66).setStrokeStyle(3, 0xffffff, 0.85);
    const stripe    = this.add.rectangle(0, 0, 110, 6, 0xff8a3d);
    const board     = this.add.container(bx, by, [boardBody, stripe]);
    this._cause.push({ obj: board, apply: () => { board.angle = 0; } });

    this._causeSub(cx, y, pickRandom(WIPEOUT_QUIPS));
  }

  // 충돌: 장애물 이름을 크게 + 담백한 사실 서술(상단 밴드)
  _causeCollision(cx, y = 152) {
    const meta = this.hitObstacle ? OBSTACLE_META[this.hitObstacle.type] : null;
    const name = meta?.name ?? '장애물';

    const big = this.add.text(cx, y, `${name}!`, {
      fontSize: '42px', fontFamily: 'sans-serif', color: '#89f8ff', fontStyle: 'bold',
      shadow: { offsetX: 0, offsetY: 0, color: '#007dff', blur: 14, fill: true },
    }).setOrigin(0.5);
    this._cause.push({ obj: big, apply: () => big.setAlpha(1).setScale(1) });

    const quips = COLLISION_QUIPS[this.hitObstacle?.type] ?? [`${name}에 부딪혔어요`];
    this._causeSub(cx, y, pickRandom(quips));
  }

  // 사인 서브라인(1축) + 가끔만 등장하는 상황 서브라인(2축)
  _causeSub(cx, y, quip) {
    const sub = this.add.text(cx, y + 48, quip, {
      fontSize: '22px', fontFamily: 'sans-serif', color: '#b8d9ff',
    }).setOrigin(0.5);
    this._cause.push({ obj: sub, apply: () => sub.setAlpha(1).setY(y + 48) });

    const flavor = this._flavorSubline();
    if (flavor) {
      const fl = this.add.text(cx, y + 80, flavor, {
        fontSize: '17px', fontFamily: 'sans-serif', color: SOFT,
      }).setOrigin(0.5);
      this._cause.push({ obj: fl, apply: () => fl.setAlpha(1).setY(y + 80) });
    }
  }

  // 2축: 진행/점수 흐름을 담담히 덧붙임 — 가끔만(40%) 등장
  _flavorSubline() {
    if (Math.random() > 0.4) return null;
    const my = this.summary.total, pv = this.prevHigh ?? 0;
    const survival = this.summary.breakdown?.[ScoreEvent.SURVIVAL] ?? 0;
    if (my > pv && pv > 0) return '방금 최고 기록을 세웠어요';
    if (this._isClose)     return '여기까지 잘 타고 있었어요';
    if (survival < 100)    return '아직 출발선 근처였어요';
    return null;
  }

  // ─── 데이터 모델(순수) ────────────────────────────────────────────────────────
  _buildRowModel() {
    const b = this.summary.breakdown, s = this.summary, E = ScoreEvent;
    const defs = [
      { label: '생존 점수',         value: b[E.SURVIVAL] },
      { label: '장애물 회피',       value: b[E.DODGE] },
      { label: '아슬아슬 보너스',   value: b[E.NEAR_MISS] },
      { label: `퍼펙트 점프 ×${s.perfectJumps}`, value: b[E.PERFECT_JUMP] },
      { label: `파도 타기 ×${s.bigWaves ?? 0}`, value: b[E.WAVE_RIDE] },
      { label: '위험구간 보너스',   value: b[E.DANGER_LANE] },
      { label: `황금 물고기 ×${s.goldenFish ?? 0}`, value: b[E.GOLDEN_FISH] },
      { label: '기상이변 보너스 ×2', value: b[E.WEATHER_BONUS] },
    ];
    if (this.cleared) defs.push({ label: '스테이지 클리어', value: b[E.STAGE_CLEAR] });

    if (!this.cleared) {
      const compact = defs
        .filter(d => (d.value ?? 0) > 0)
        .filter(d => !d.label.includes('기상이변'))
        .slice(0, 5);
      return (compact.length ? compact : defs.slice(0, 4)).map(d => {
        const value = d.value ?? 0;
        return { label: d.label, value, color: value === 0 ? '#526a88' : '#d7f8ff' };
      });
    }

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
    if (!this.cleared) this._renderGameOverPanel(cx);

    const step = this.cleared ? 40 : 30;
    const lx = this.cleared ? cx - 300 : cx - 332;
    const rx = this.cleared ? cx + 300 : cx + 332;

    this.rows.forEach((row, i) => {
      const y = startY + i * step;
      row.labelObj = this.add.text(lx, y, row.label, {
        fontSize: this.cleared ? '26px' : '21px', fontFamily: 'sans-serif', color: row.color,
      }).setOrigin(0, 0.5).setAlpha(0).setData('baseY', y);
      row.valueObj = this.add.text(rx, y, '0', {
        fontSize: this.cleared ? '26px' : '21px', fontFamily: 'sans-serif', color: row.color,
      }).setOrigin(1, 0.5).setAlpha(0).setData('baseY', y);
    });

    let yt = startY + this.rows.length * step + 24;
    this._divider = this.add.graphics().setAlpha(0)
      .lineStyle(1, 0xffffff, 0.25)
      .beginPath().moveTo(lx, yt).lineTo(rx, yt).strokePath();

    yt += 28;
    this.totalLabel = this.add.text(lx, yt, '총점', {
      fontSize: this.cleared ? '40px' : '34px', fontFamily: 'sans-serif', color: '#ffffff', fontStyle: 'bold',
      shadow: this.cleared ? undefined : { offsetX: 0, offsetY: 0, color: '#00aaff', blur: 10, fill: true },
    }).setOrigin(0, 0.5).setAlpha(0);
    this.totalObj = this.add.text(rx, yt, '0', {
      fontSize: this.cleared ? '40px' : '34px', fontFamily: 'sans-serif', color: '#ffffff', fontStyle: 'bold',
      shadow: this.cleared ? undefined : { offsetX: 0, offsetY: 0, color: '#00aaff', blur: 10, fill: true },
    }).setOrigin(1, 0.5).setAlpha(0).setData('baseY', yt);

    this.statsObj = null;
    this.hintObj  = null;

    // 게임오버: 실패 원인(상단 헤더) + '좋았던 점'(배지) + '다음 목표'(격려) 세 줄로 다음 판을 당긴다.
    // ⚠️ 행 수에 따라 누적 배치하면 5행(생존·회피가 매번 쌓여 자주 발생)일 때 격려가 패널(y≤940)을
    //    넘어 버튼(top 946)을 침범했음 → 행 수와 무관하게 패널 하단에 '고정 y'로 둔다. 최대 총점 y=848
    //    < diff 872라 충돌 없음. 표시는 reveal()/_settle()이 getData('baseY')로 처리(고정 y면 그대로 동작).
    if (this.cleared) {
      this.diffObj = null;
      this.badgeObj = null;
      this.encourageObj = null;
    } else {
      const mkLine = (y, txt, style) =>
        this.add.text(cx, y, txt, style).setOrigin(0.5).setAlpha(0).setData('baseY', y);
      this.diffObj = mkLine(872, this._plainGameOverLine(this.final.diff.label),
        { fontSize: '22px', fontFamily: 'sans-serif', color: this.final.diff.color, fontStyle: 'bold' });
      this.badgeObj = mkLine(900, '좋았던 점 · ' + this._plainGameOverLine(this.final.badge.label),
        { fontSize: '19px', fontFamily: 'sans-serif', color: this.final.badge.color, fontStyle: 'bold' });
      this.encourageObj = mkLine(926, this._plainGameOverLine(this.final.encourage.label),
        { fontSize: '20px', fontFamily: 'sans-serif', color: this.final.encourage.color, fontStyle: 'bold' });
    }
  }

  _plainGameOverLine(label) {
    return label
      .replace(/[^\p{L}\p{N}\s+,.!×]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  _renderGameOverPanel(cx) {
    const panel = this.add.graphics();
    panel.setDepth(-2);
    panel.fillStyle(0x020816, 0.72);
    panel.lineStyle(2, 0x1ddfff, 0.42);
    panel.fillRoundedRect(cx - 410, 620, 820, 320, 8);
    panel.strokeRoundedRect(cx - 410, 620, 820, 320, 8);
    panel.lineStyle(1, 0x7af7ff, 0.18)
      .beginPath().moveTo(cx - 380, 628).lineTo(cx + 380, 628).strokePath();
  }

  // ─── 카운트업 시퀀스 ──────────────────────────────────────────────────────────
  // 체인이 '순서/등장 템포'를, 각 addCounter가 '숫자 모션'을 담당.
  // 한 행: alpha(140) + completeDelay(120) = 260ms == 행 카운터(260ms) → 숫자가 등장보다 뒤처지지 않음.
  _animate() {
    if (!this.cleared) {
      this._d(this.time.delayedCall(200, () => this._animateGameOverScores()));
      this._d(this.time.delayedCall(300, () => this._shakeGameOverLogo()));
      return;
    }

    const rowTweens = this.rows.map(row => ({
      targets: [row.labelObj, row.valueObj],
      alpha: { from: 0, to: 1 }, duration: 140, completeDelay: 120,
      onStart: () => { if (this._settled || !this.sys.isActive()) return; this._countRow(row); },
    }));

    const startRows = () => {
      if (this._settled || !this.sys.isActive()) return;
      this._t(this.tweens.chain({
        tweens: rowTweens,
        onComplete: () => { if (this._settled || !this.sys.isActive()) return; this._startTotal(); },
      }));
    };

    if (this.cleared) this._d(this.time.delayedCall(200, startRows));
    else startRows();
  }

  _animateGameOverScores() {
    if (this._settled || !this.sys.isActive()) return;

    const rowGap = 78;
    const rowDuration = 95;
    this.rows.forEach((row, i) => {
      this._d(this.time.delayedCall(i * rowGap, () => {
        if (this._settled || !this.sys.isActive()) return;
        row.labelObj.y = row.labelObj.getData('baseY');
        row.valueObj.y = row.valueObj.getData('baseY');
        this._t(this.tweens.add({
          targets: [row.labelObj, row.valueObj],
          alpha: 1,
          duration: rowDuration,
          ease: 'Quad.Out',
          onStart: () => this._countRow(row, 220),
          onComplete: () => {
            row.labelObj.setAlpha(1);
            row.valueObj.setAlpha(1);
          },
        }));
      }));
    });

    const totalDelay = this.rows.length * rowGap + 70;
    this._d(this.time.delayedCall(totalDelay, () => {
      if (this._settled || !this.sys.isActive()) return;
      this._startTotal();
    }));
  }

  _countRow(row, duration = 260) {
    if (!row.value) { row.valueObj.setText('0'); return; }   // 0점 행은 즉시 표시, 팝 없음
    this._t(this.tweens.addCounter({
      from: 0, to: row.value, duration, ease: 'Cubic.Out',
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

  _shakeGameOverLogo() {
    if (this.cleared || !this._gameOverBg || this._settled || !this.sys.isActive()) return;
    const bg = this._gameOverBg;
    const baseX = LOGICAL_WIDTH / 2;
    const baseY = LOGICAL_HEIGHT / 2;
    this._t(this.tweens.add({
      targets: bg,
      x: { from: baseX - 3, to: baseX + 3 },
      y: { from: baseY - 1, to: baseY + 1 },
      angle: { from: -0.08, to: 0.08 },
      duration: 42,
      yoyo: true,
      repeat: 2,
      ease: 'Sine.InOut',
      onComplete: () => bg.setPosition(baseX, baseY).setAngle(0),
    }));
  }

  // 총점 정산 후: 차이/통계/힌트/배지/격려를 순차 등장 → 마지막에 _settle(단일 종료점)
  _afterCounts() {
    if (this.cleared) {
      this._animateClearStars(() => {
        if (this._settled || !this.sys.isActive()) return;
        this._settle();
      });
      return;
    }

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
    reveal(this.statsObj, this.cleared ? 110 : 0);
    reveal(this.hintObj, this.cleared ? 220 : 0);
    reveal(this.badgeObj, this.cleared ? 330 : 0);
    reveal(this.encourageObj, this.cleared ? 440 : 120);

    this._d(this.time.delayedCall((this.cleared ? 440 : 120) + 240, () => {
      if (this._settled || !this.sys.isActive()) return;
      this._settle();
    }));
  }

  _animateClearStars(onComplete) {
    if (!this.clearStars?.length) {
      onComplete?.();
      return;
    }

    let finished = 0;
    const done = () => {
      finished += 1;
      if (finished >= this.clearStars.length) onComplete?.();
    };

    for (const star of this.clearStars) {
      this._d(this.time.delayedCall(star.getData('delay'), () => {
        if (this._settled || !this.sys.isActive()) return;
        star.setPosition(star.getData('baseX'), star.getData('baseY'));
        this._t(this.tweens.add({
          targets: star,
          alpha: 1,
          scale: { from: 0.1, to: 1.18 },
          y: { from: star.getData('baseY') - 38, to: star.getData('baseY') },
          duration: 280,
          ease: 'Back.Out',
          onComplete: () => {
            if (this._settled || !this.sys.isActive()) return;
            this._t(this.tweens.add({
              targets: star,
              scale: 1,
              duration: 90,
              ease: 'Sine.Out',
              onComplete: () => {
                star.setScale(1).setAlpha(1);
                if (star.getData('isLast')) {
                  this._wiggleLastStar(star, done);
                } else {
                  done();
                }
              },
            }));
          },
        }));
      }));
    }
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
      { ok: (s.bigWaves ?? 0) >= 2,             w: 88 + (s.bigWaves ?? 0) * 6,   label: '🌊 큰 파도를 멋지게 탔어요',  color: ORANGE },
      { ok: (s.goldenFish ?? 0) >= 1,           w: 80 + (s.goldenFish ?? 0) * 5, label: '🐟 황금 물고기 사냥 성공',   color: GOLD },
      { ok: (s.perfectJumps ?? 0) >= 3,         w: 60 + (s.perfectJumps ?? 0),   label: '🎯 점프 감각 좋았어요',      color: TEAL },
      { ok: (s.bigWaves ?? 0) >= 1,             w: 55,                           label: '🌊 큰 파도 타기 성공',       color: TEAL },
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

  // 다음 목표(next goal) — 다음 플레이로 끌어당기는 구체적 한 줄
  _encourageLine() {
    const s = this.summary;
    const gap = this._recordGap;
    if (this._isClose)               return { label: `🌊 다음 목표: +${gap.toLocaleString()}점만 더!`, color: GOLD };
    if ((s.bigWaves ?? 0) === 0)     return { label: '🌊 다음 목표: 큰 파도를 한 번 타보기', color: GOLD };
    if ((s.perfectJumps ?? 0) === 0) return { label: '🎯 다음 목표: 퍼펙트 점프 1회', color: GOLD };
    if ((s.bigWaves ?? 0) < 2)       return { label: '🌊 다음 목표: 큰 파도 2번 연속 타기', color: GOLD };
    if (gap > 0)                     return { label: `🌊 다음 목표: +${gap.toLocaleString()}점 도전!`, color: GOLD };
    if (this.cleared)                return { label: '🔥 다음 목표: 다음 해역 정복', color: GOLD };
    return { label: '🌊 다음 목표: 콤보 배율 ×2.0 찍기', color: GOLD };
  }

  _hint() {
    const s = this.summary;
    if ((s.bigWaves ?? 0) === 0)
      return '큰 파도가 올 때 마루(crest) 가까이서 균형을 지키면 보너스가 쏟아져요';
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
    const y = this.cleared ? 928 : 978;
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
    gfx.fillStyle(primary ? 0x063b7a : 0x010916, primary ? 0.88 : 0.64);
    gfx.lineStyle(2, primary ? 0x48edff : 0x3f7ca3, primary ? 1 : 0.78);
    gfx.fillRoundedRect(-w / 2, -h / 2, w, h, 8);
    gfx.strokeRoundedRect(-w / 2, -h / 2, w, h, 8);
    gfx.lineStyle(1, 0xb9fbff, primary ? 0.45 : 0.20);
    gfx.strokeRoundedRect(-w / 2 + 4, -h / 2 + 4, w - 8, h - 8, 6);

    const txt = this.add.text(0, 0, label, {
      fontSize: '26px', fontFamily: 'sans-serif', color: '#ffffff', fontStyle: 'bold',
      shadow: { offsetX: 0, offsetY: 0, color: primary ? '#00aaff' : '#0a5a8e', blur: primary ? 10 : 6, fill: true },
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
