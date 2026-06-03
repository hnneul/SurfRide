import Phaser from 'phaser';
import { LOGICAL_WIDTH, LOGICAL_HEIGHT } from '../constants.js';
import { ScoreEvent } from '../score.js';
import { OBSTACLE_META } from '../obstacle.js';
import { STAGES } from '../stages.js';

export default class ResultScene extends Phaser.Scene {
  constructor() { super({ key: 'ResultScene' }); }

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
    this.add.graphics().fillStyle(0x000000, 0.85).fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    const startY = this.cleared ? this._clearHeader(cx) : this._gameOverHeader(cx);
    this._renderReport(cx, startY);
    this._renderButtons(cx);
  }

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
    this.add.text(cx, 104, 'GAME OVER', {
      fontSize: '68px', fontFamily: 'sans-serif', color: '#ff4444', fontStyle: 'bold',
    }).setOrigin(0.5);

    let subtitle;
    if (this.cause === 'wipeout') {
      subtitle = '균형을 잃고 와이프아웃! — ← → 로 보드를 잡으세요';
    } else {
      const meta = this.hitObstacle ? OBSTACLE_META[this.hitObstacle.type] : null;
      const obsName    = meta?.name ?? '장애물';
      const signalName = meta?.signalName ?? '예고 신호';
      subtitle = `${obsName}에 충돌 — '${signalName}' 신호를 놓쳤어요`;
    }
    this.add.text(cx, 180, subtitle, {
      fontSize: '30px', fontFamily: 'sans-serif', color: '#ffaaaa',
    }).setOrigin(0.5);
    return 248;
  }

  // ─── 리포트(항목별 점수 분해 + 최고기록 차이 + 개선 힌트) ─────────────────────
  _renderReport(cx, startY) {
    const b = this.summary.breakdown;
    const rows = [
      ['생존 점수',         b[ScoreEvent.SURVIVAL]],
      ['장애물 회피',       b[ScoreEvent.DODGE]],
      ['니어미스 보너스',   b[ScoreEvent.NEAR_MISS]],
      [`퍼펙트 점프 ×${this.summary.perfectJumps}`, b[ScoreEvent.PERFECT_JUMP]],
      ['위험구간 보너스',   b[ScoreEvent.DANGER_LANE]],
      [`황금 물고기 ×${this.summary.goldenFish ?? 0}`, b[ScoreEvent.GOLDEN_FISH]],
      ['기상이변 보너스 ×2', b[ScoreEvent.WEATHER_BONUS]],
    ];
    if (this.cleared) rows.push(['스테이지 클리어', b[ScoreEvent.STAGE_CLEAR]]);

    const step = 40;
    rows.forEach(([label, val], i) => {
      const y = startY + i * step;
      const dim = !val;
      this.add.text(cx - 300, y, label, {
        fontSize: '26px', fontFamily: 'sans-serif', color: dim ? '#6b7785' : '#e0e0e0',
      });
      this.add.text(cx + 300, y, (val ?? 0).toLocaleString(), {
        fontSize: '26px', fontFamily: 'sans-serif',
        color: dim ? '#6b7785' : '#e0e0e0',
      }).setOrigin(1, 0);
    });

    let y = startY + rows.length * step + 12;
    this.add.graphics()
      .lineStyle(1, 0xffffff, 0.25)
      .beginPath().moveTo(cx - 300, y).lineTo(cx + 300, y).strokePath();

    y += 12;
    this.add.text(cx - 300, y, '총점', {
      fontSize: '40px', fontFamily: 'sans-serif', color: '#ffffff', fontStyle: 'bold',
    });
    this.add.text(cx + 300, y, this.summary.total.toLocaleString(), {
      fontSize: '40px', fontFamily: 'sans-serif', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(1, 0);

    // 최고 기록과의 차이
    y += 62;
    const [diffLabel, diffColor] = this._highScoreDiff();
    this.add.text(cx, y, diffLabel, {
      fontSize: '28px', fontFamily: 'sans-serif', color: diffColor, fontStyle: 'bold',
    }).setOrigin(0.5);

    // 보조 통계
    y += 42;
    this.add.text(cx, y,
      `최대 콤보 ×${this.summary.maxComboMultiplier.toFixed(1)}   ·   퍼펙트 ${this.summary.perfectJumps}회   ·   황금 물고기 ${this.summary.goldenFish ?? 0}마리`, {
      fontSize: '24px', fontFamily: 'sans-serif', color: '#9fb8d4',
    }).setOrigin(0.5);

    // 다음 플레이 개선 힌트
    y += 46;
    this.add.text(cx, y, `💡 ${this._hint()}`, {
      fontSize: '28px', fontFamily: 'sans-serif', color: '#ffd700', fontStyle: 'bold',
    }).setOrigin(0.5);
  }

  _highScoreDiff() {
    const my = this.summary.total;
    const prev = this.prevHigh ?? 0;
    if (prev === 0) return ['🏅 첫 기록 수립!', '#7af7e0'];
    if (my > prev)  return [`🏅 최고 기록 갱신!  +${(my - prev).toLocaleString()}`, '#7af7e0'];
    if (my === prev) return ['🏅 최고 기록 타이!', '#7af7e0'];
    return [`최고 기록까지  −${(prev - my).toLocaleString()}점`, '#ffaaaa'];
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
      this._btn(cx - 140, y, 220, 64, '다시 도전', false,
        () => this.scene.start('GameScene', { stageIndex: this.stageIndex }));
      const next = this.stageIndex + 1;
      const hasNext = next < STAGES.length;
      this._btn(cx + 140, y, 220, 64, hasNext ? '다음 해역으로' : '세계지도로', true, () => {
        if (hasNext) this.scene.start('GameScene', { stageIndex: next });
        else         this.scene.start('WorldMapScene');
      });
    } else {
      this._btn(cx - 140, y, 220, 64, '다시 도전', true,
        () => this.scene.start('GameScene', { stageIndex: this.stageIndex }));
      this._btn(cx + 140, y, 220, 64, '세계지도로', false,
        () => this.scene.start('WorldMapScene'));
    }
  }

  _btn(cx, cy, w, h, label, primary, cb) {
    const gfx = this.add.graphics();
    gfx.fillStyle(primary ? 0x1565c0 : 0x000000, primary ? 1 : 0.12);
    gfx.lineStyle(2, primary ? 0x42a5f5 : 0xffffff, primary ? 1 : 0.3);
    gfx.fillRoundedRect(cx - w/2, cy - h/2, w, h, 10);
    gfx.strokeRoundedRect(cx - w/2, cy - h/2, w, h, 10);

    this.add.text(cx, cy, label, {
      fontSize: '28px', fontFamily: 'sans-serif', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.zone(cx, cy, w, h).setInteractive({ useHandCursor: true }).on('pointerdown', cb);
  }
}
