import { LOGICAL_WIDTH, LOGICAL_HEIGHT } from '../constants.js';
import { ScoreEvent } from '../score.js';
import { STAGES } from '../stages.js';

const OBSTACLE_NAMES = {
  FLYING_FISH: '날치', SHARK: '상어', WHALE: '고래',
  JELLYFISH: '해파리', OCTOPUS: '문어', LIGHTNING: '번개',
};

export default class ResultScene extends Phaser.Scene {
  constructor() { super({ key: 'ResultScene' }); }

  init(data) {
    this.cleared    = data.cleared;
    this.stageIndex = data.stageIndex;
    this.summary    = data.summary;
    this.hitObstacle = data.hitObstacle ?? null;
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
      ['퍼펙트 점프',     this.summary.breakdown[ScoreEvent.PERFECT_JUMP]],
      ['위험구간 보너스', this.summary.breakdown[ScoreEvent.DANGER_LANE]],
      ['스테이지 클리어', this.summary.breakdown[ScoreEvent.STAGE_CLEAR]],
    ];

    items.forEach(([label, val], i) => {
      const y = 330 + i * 52;
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
    this.add.text(cx, 210, 'GAME OVER', {
      fontSize: '80px', fontFamily: 'sans-serif', color: '#ff4444', fontStyle: 'bold',
    }).setOrigin(0.5);

    const obsName = this.hitObstacle
      ? (OBSTACLE_NAMES[this.hitObstacle.type] ?? this.hitObstacle.type)
      : '장애물';
    this.add.text(cx, 300, `${obsName}에 충돌했습니다`, {
      fontSize: '38px', fontFamily: 'sans-serif', color: '#ffaaaa',
    }).setOrigin(0.5);

    const remainSec = Math.ceil((this.timeRemain ?? 0) / 1000);
    this.add.text(cx, 380, `클리어까지 ${remainSec}초 남았습니다`, {
      fontSize: '34px', fontFamily: 'sans-serif', color: '#cccccc',
    }).setOrigin(0.5);

    const stageId = this.stageIndex + 1;
    const hiScore = this.storage.getHighScore(stageId);
    const myScore = this.summary.total;
    let hiMsg, hiColor;
    if (hiScore === 0)        { hiMsg = '이번이 첫 도전입니다!';                           hiColor = '#ffd700'; }
    else if (myScore >= hiScore) { hiMsg = '최고기록 갱신!';                               hiColor = '#ffd700'; }
    else                      { hiMsg = `최고기록과 ${(hiScore - myScore).toLocaleString()}점 차이`; hiColor = '#cccccc'; }

    this.add.text(cx, 455, hiMsg, { fontSize: '34px', fontFamily: 'sans-serif', color: hiColor }).setOrigin(0.5);
    this.add.text(cx, 550, `이번 점수: ${myScore.toLocaleString()}`, {
      fontSize: '48px', fontFamily: 'sans-serif', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);

    this._btn(cx - 140, 660, 220, 64, '다시 도전', true,
      () => this.scene.start('GameScene', { stageIndex: this.stageIndex }));
    this._btn(cx + 140, 660, 220, 64, '세계지도로', false,
      () => this.scene.start('WorldMapScene'));
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
