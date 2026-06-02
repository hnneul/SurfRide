import Phaser from 'phaser';
import { LOGICAL_WIDTH, LOGICAL_HEIGHT } from '../constants.js';
import { ScoreEvent } from '../score.js';
import { OBSTACLE_META } from '../obstacle.js';
import { STAGES } from '../stages.js';

export default class ResultScene extends Phaser.Scene {
  constructor() { super({ key: 'ResultScene' }); }

  init(data) {
    this.cleared    = data.cleared;
    this.stageIndex = data.stageIndex;
    this.summary    = data.summary;
    this.hitObstacle = data.hitObstacle ?? null;
    this.cause       = data.cause ?? 'collision';
    this.timeRemain  = data.timeRemain ?? 0;
    this.stars       = data.stars ?? 1;
    this.storage     = data.storage;
  }

  create() {
    const cx = LOGICAL_WIDTH / 2;

    this.add.graphics().fillStyle(0x000000, 0.85).fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    if (this.cleared) {
      this._renderClear(cx);
    } else {
      this._renderGameOver(cx);
    }
  }

  _renderClear(cx) {
    this.add.text(cx, 160, 'STAGE CLEAR!', {
      fontSize: '80px', fontFamily: 'sans-serif', color: '#4fc3f7', fontStyle: 'bold',
    }).setOrigin(0.5);

    // Stars
    const starSize = 64, gap = 16;
    const startX = cx - (3 * starSize + 2 * gap) / 2;
    for (let i = 0; i < 3; i++) {
      this.add.text(startX + i * (starSize + gap), 185, '★', {
        fontSize: `${starSize}px`, color: i < this.stars ? '#ffd700' : '#3a3a3a',
      });
    }

    const items = [
      ['생존 점수',       this.summary.breakdown[ScoreEvent.SURVIVAL]],
      ['회피 점수',       this.summary.breakdown[ScoreEvent.DODGE]],
      ['니어미스 보너스', this.summary.breakdown[ScoreEvent.NEAR_MISS]],
      ['퍼펙트 점프',     this.summary.breakdown[ScoreEvent.PERFECT_JUMP]],
      ['위험구간 보너스', this.summary.breakdown[ScoreEvent.DANGER_LANE]],
      ['스테이지 클리어', this.summary.breakdown[ScoreEvent.STAGE_CLEAR]],
    ];

    items.forEach(([label, val], i) => {
      const y = 318 + i * 50;
      this.add.text(cx - 280, y, label, { fontSize: '32px', fontFamily: 'sans-serif', color: '#e0e0e0' });
      this.add.text(cx + 280, y, (val ?? 0).toLocaleString(), {
        fontSize: '32px', fontFamily: 'sans-serif', color: '#e0e0e0',
      }).setOrigin(1, 0);
    });

    this.add.graphics()
      .lineStyle(1, 0xffffff, 0.25)
      .beginPath().moveTo(cx - 280, 600).lineTo(cx + 280, 600).strokePath();

    this.add.text(cx - 280, 610, '총점', { fontSize: '44px', fontFamily: 'sans-serif', color: '#ffffff', fontStyle: 'bold' });
    this.add.text(cx + 280, 610, this.summary.total.toLocaleString(), {
      fontSize: '44px', fontFamily: 'sans-serif', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(1, 0);

    this.add.text(cx, 710, `최대 콤보: ${this.summary.maxCombo}회   퍼펙트 점프: ${this.summary.perfectJumps}회`, {
      fontSize: '26px', fontFamily: 'sans-serif', color: '#a0a0a0',
    }).setOrigin(0.5);

    this._btn(cx - 140, 790, 220, 64, '다시 도전', false,
      () => this.scene.start('GameScene', { stageIndex: this.stageIndex }));

    const next = this.stageIndex + 1;
    const hasNext = next < STAGES.length;
    this._btn(cx + 140, 790, 220, 64, hasNext ? '다음 해역으로' : '세계지도로', true, () => {
      if (hasNext) this.scene.start('GameScene', { stageIndex: next });
      else         this.scene.start('WorldMapScene');
    });
  }

  _renderGameOver(cx) {
    this.add.text(cx, 130, 'GAME OVER', {
      fontSize: '76px', fontFamily: 'sans-serif', color: '#ff4444', fontStyle: 'bold',
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
    this.add.text(cx, 220, subtitle, {
      fontSize: '34px', fontFamily: 'sans-serif', color: '#ffaaaa',
    }).setOrigin(0.5);

    const stageId = this.stageIndex + 1;
    const hiScore = this.storage.getHighScore(stageId);
    const myScore = this.summary.total;
    const remainSec = Math.ceil((this.timeRemain ?? 0) / 1000);

    // 브리핑 항목
    const rows = [];
    rows.push(['클리어까지', `${remainSec}초 부족`]);
    rows.push(['이번 점수', `${myScore.toLocaleString()}점`]);
    if (hiScore === 0)          rows.push(['최고기록', '이번이 첫 도전!']);
    else if (myScore >= hiScore) rows.push(['최고기록', '갱신!']);
    else                         rows.push(['최고기록까지', `${(hiScore - myScore).toLocaleString()}점 부족`]);
    rows.push(['최대 콤보', `×${this.summary.maxCombo}`]);
    if ((this.summary.combo ?? 0) > 0) rows.push(['콤보 끊긴 지점', `×${this.summary.combo}`]);
    rows.push(['위험구간 보너스', `${(this.summary.breakdown[ScoreEvent.DANGER_LANE] ?? 0).toLocaleString()}점`]);

    rows.forEach(([label, val], i) => {
      const y = 320 + i * 50;
      this.add.text(cx - 280, y, label, { fontSize: '30px', fontFamily: 'sans-serif', color: '#bcbcbc' });
      this.add.text(cx + 280, y, val, { fontSize: '30px', fontFamily: 'sans-serif', color: '#ffffff', fontStyle: 'bold' }).setOrigin(1, 0);
    });

    // 다음 목표 제안
    const tip = this._nextGoalTip(hiScore, myScore);
    this.add.text(cx, 320 + rows.length * 50 + 30, tip, {
      fontSize: '32px', fontFamily: 'sans-serif', color: '#ffd700', fontStyle: 'bold',
    }).setOrigin(0.5);

    this._btn(cx - 140, 820, 220, 64, '다시 도전', true,
      () => this.scene.start('GameScene', { stageIndex: this.stageIndex }));
    this._btn(cx + 140, 820, 220, 64, '세계지도로', false,
      () => this.scene.start('WorldMapScene'));
  }

  _nextGoalTip(hiScore, myScore) {
    const diff = hiScore - myScore;
    if (hiScore > 0 && diff > 0 && diff <= 500)
      return `${diff.toLocaleString()}점만 더 모으면 최고기록!`;
    if ((this.summary.dangerSeconds ?? 0) === 0)
      return '아래 거친 바다(×1.5)에 머물면 점수가 크게 올라요';
    if ((this.summary.perfectJumps ?? 0) === 0)
      return '신호에 맞춰 점프하면 퍼펙트 보너스 +200!';
    return '콤보를 더 길게 이어 배율을 높여보세요';
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
