import { GameState, LOGICAL_WIDTH, LOGICAL_HEIGHT } from './constants.js';
import { Lane, LANE_MULTIPLIER } from './player.js';
import { ScoreEvent } from './score.js';
import { STAGES } from './stages.js';

const OBSTACLE_NAMES = {
  FLYING_FISH: '날치',
  SHARK:       '상어',
  WHALE:       '고래',
  JELLYFISH:   '해파리',
  OCTOPUS:     '문어',
  LIGHTNING:   '번개',
};

// ─── 버튼 정의 헬퍼 ───────────────────────────────────────────────────────────
function makeBtn(label, x, y, w, h, action) {
  return { label, x, y, w, h, action };
}

// ─── UIManager ───────────────────────────────────────────────────────────────
export class UIManager {
  constructor(ctx, game) {
    this.ctx  = ctx;
    this.game = game;

    // 화면별 버튼 목록 (handleClick에서 히트 테스트)
    this._buttons = [];

    this._showingControls = false;

    // 인게임 가이드 상태
    this._guide = {
      active:  false,
      stepIdx: 0,
      steps: [
        { triggerSec: 0,  text: '← → 로 이동하세요' },
        { triggerSec: 4,  text: '↑ ↓ 로 파도 위치를 바꾸세요' },
        { triggerSec: -1, text: '장애물이 옵니다! Space로 점프!' }, // -1 = 첫 신호 직전
        { triggerSec: -2, text: '좋아요! 콤보를 이어가세요' },      // -2 = 첫 회피 성공 후
      ],
      currentText: '',
      visible: false,
      timer: 0,
    };
  }

  // ─── 클릭 처리 ─────────────────────────────────────────────────────────────
  handleClick(lx, ly) {
    for (const btn of this._buttons) {
      if (lx >= btn.x && lx <= btn.x + btn.w &&
          ly >= btn.y && ly <= btn.y + btn.h) {
        btn.action();
        return;
      }
    }
  }

  // ─── 렌더링 진입점 ─────────────────────────────────────────────────────────
  render(state) {
    this._buttons = [];

    switch (state) {
      case GameState.MAIN:     this._renderMain();     break;
      case GameState.WORLDMAP: this._renderWorldMap(); break;
      case GameState.PLAYING:  this._renderHUD();      break;
      case GameState.PAUSED:   this._renderHUD(); this._renderPauseOverlay(); break;
      case GameState.RESULT:   this._renderResult();   break;
    }

    if (this._showingControls) this._renderControlsPopup();
  }

  // ─── 메인 화면 ─────────────────────────────────────────────────────────────
  _renderMain() {
    const { ctx, game } = this;
    const cx = LOGICAL_WIDTH / 2;

    // 배경
    ctx.fillStyle = '#a8d4e8';
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    // 파도 실루엣 (하단)
    this._renderWaveSilhouette();

    // 게임 타이틀
    ctx.font      = 'bold 130px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#1a3a5c';
    ctx.fillText('서프라이드  SurfRide', cx, 230);

    // 한 줄 소개
    ctx.font      = '38px sans-serif';
    ctx.fillStyle = '#1a3a5c';
    ctx.fillText('제주에서 태평양 끝까지, 파도를 타고 횡단하는 60초 서핑 어드벤처', cx, 308);

    // 버튼
    const save      = game.storage.load();
    const hasPlayed = !!(save?.lastPlayedTime);

    const btnW = 580, btnH = 90;
    const btnX = cx - btnW / 2;
    const gap  = 18;
    let   btnY = 400;

    const startBtn = makeBtn('시작하기', btnX, btnY, btnW, btnH, () => this.game.startStage(0));
    this._drawMainBtn(startBtn, 'primary');
    this._buttons.push(startBtn);
    btnY += btnH + gap;

    const resumeBtn = makeBtn('이어하기', btnX, btnY, btnW, btnH, () => this._onResume());
    this._drawMainBtn(resumeBtn, hasPlayed ? 'secondary' : 'disabled');
    if (hasPlayed) this._buttons.push(resumeBtn);
    btnY += btnH + gap;

    const ctrlBtn = makeBtn('조작법 보기', btnX, btnY, btnW, btnH, () => this._onControls());
    this._drawMainBtn(ctrlBtn, 'secondary');
    this._buttons.push(ctrlBtn);
    btnY += btnH + gap;

    const mapBtn = makeBtn('세계지도 보기', btnX, btnY, btnW, btnH,
      () => this.game.changeState(GameState.WORLDMAP));
    this._drawMainBtn(mapBtn, 'secondary');
    this._buttons.push(mapBtn);
  }

  _renderWaveSilhouette() {
    const { ctx } = this;

    // 뒷쪽 파도 레이어
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.moveTo(0, 900);
    for (let x = 0; x <= LOGICAL_WIDTH; x += 8) {
      const y = 900 + Math.sin((x / LOGICAL_WIDTH) * Math.PI * 5 + 1.2) * 55;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(LOGICAL_WIDTH, LOGICAL_HEIGHT);
    ctx.lineTo(0, LOGICAL_HEIGHT);
    ctx.closePath();
    ctx.fill();

    // 앞쪽 파도 레이어 (흰색)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, 950);
    for (let x = 0; x <= LOGICAL_WIDTH; x += 8) {
      const y = 950 + Math.sin((x / LOGICAL_WIDTH) * Math.PI * 6) * 42;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(LOGICAL_WIDTH, LOGICAL_HEIGHT);
    ctx.lineTo(0, LOGICAL_HEIGHT);
    ctx.closePath();
    ctx.fill();
  }

  _drawMainBtn(btn, variant = 'primary') {
    const { ctx } = this;

    if (variant === 'primary') {
      ctx.fillStyle   = '#2d6a4f';
      ctx.strokeStyle = '#2d6a4f';
    } else if (variant === 'secondary') {
      ctx.fillStyle   = 'rgba(0,0,0,0)';
      ctx.strokeStyle = '#1a3a5c';
    } else {
      ctx.fillStyle   = 'rgba(0,0,0,0)';
      ctx.strokeStyle = 'rgba(26,58,92,0.3)';
    }

    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(btn.x, btn.y, btn.w, btn.h, 12);
    ctx.fill();
    ctx.stroke();

    if (variant === 'primary') {
      ctx.fillStyle = '#ffffff';
    } else if (variant === 'secondary') {
      ctx.fillStyle = '#1a3a5c';
    } else {
      ctx.fillStyle = 'rgba(26,58,92,0.3)';
    }

    ctx.font      = 'bold 32px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2 + 12);
  }

  // ─── 세계지도 화면 ─────────────────────────────────────────────────────────
  _renderWorldMap() {
    const { ctx } = this;
    ctx.fillStyle = '#0a1628';
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    ctx.fillStyle = '#ffffff';
    ctx.font      = 'bold 48px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('세계지도', LOGICAL_WIDTH / 2, 80);

    // TODO: 해역 노드, 별점, 잠금/해금 렌더링
    // TODO: 서핑보드 아이콘 이동 애니메이션

    const backBtn = makeBtn('← 돌아가기', 60, 40, 200, 50, () => this.game.changeState(GameState.MAIN));
    this._drawButton(backBtn);
    this._buttons.push(backBtn);
  }

  // ─── 인게임 HUD ────────────────────────────────────────────────────────────
  _renderHUD() {
    const { ctx, game } = this;
    const score  = game.score;
    const player = game.player;
    const stage  = game.currentStage;
    const elapsed = game.stageTimer / 1000;
    const stageDuration = game.obstacles._stageDuration ?? 60_000;
    const remain = Math.max(0, stageDuration / 1000 - elapsed);

    // 상단 HUD 배경
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, LOGICAL_WIDTH, 72);

    // 점수
    ctx.fillStyle = '#ffffff';
    ctx.font      = 'bold 36px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`SCORE  ${score.total.toLocaleString()}`, 24, 48);

    // 콤보
    if (score.combo > 0) {
      ctx.fillStyle = '#ffd700';
      ctx.font      = 'bold 30px sans-serif';
      ctx.fillText(`COMBO ×${score.combo}`, 340, 48);
    }

    // 스테이지 번호 + 이름 (중앙)
    const stageData = STAGES[game.currentStage];
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font      = 'bold 28px sans-serif';
    ctx.fillText(`STAGE ${stageData.id}`, LOGICAL_WIDTH / 2, 30);
    ctx.fillStyle = '#c8e0f8';
    ctx.font      = '22px sans-serif';
    ctx.fillText(stageData.name, LOGICAL_WIDTH / 2, 58);

    // 타이머
    ctx.fillStyle = remain < 10 ? '#ff4444' : '#ffffff';
    ctx.font      = 'bold 36px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.ceil(remain)}s`, LOGICAL_WIDTH - 24, 48);

    // 레인 배율 표시
    this._renderLaneMultipliers(player.lane);

    // 미니맵
    this._renderMinimap(stage, elapsed);

    // 인게임 가이드
    if (this._guide.visible) this._renderGuide();
  }

  _renderLaneMultipliers(currentLane) {
    const { ctx } = this;
    const labels = ['×1.0', '×1.2', '×1.5'];
    const laneNames = ['위', '중', '아래'];
    const x = LOGICAL_WIDTH - 200;
    const startY = 100;

    ctx.font = '22px sans-serif';
    ctx.textAlign = 'right';

    for (let i = 0; i < 3; i++) {
      const isActive = i === currentLane;
      ctx.fillStyle = isActive ? '#ffd700' : 'rgba(255,255,255,0.5)';
      if (isActive) {
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 26px sans-serif';
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '22px sans-serif';
      }
      ctx.fillText(`${laneNames[i]} ${labels[i]}`, LOGICAL_WIDTH - 16, startY + i * 36);
    }
  }

  _renderMinimap(stageIndex, elapsedSec) {
    const { ctx } = this;
    const mx = 24, my = 80, mw = 220, mh = 50;

    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(mx, my, mw, mh);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.strokeRect(mx, my, mw, mh);

    // TODO: 세계지도 경로 축약 렌더링
    // 진행 바
    const stageDurationSec = 60; // 임시
    const progress = Math.min(elapsedSec / stageDurationSec, 1);
    ctx.fillStyle = '#4fc3f7';
    ctx.fillRect(mx + 4, my + mh - 12, (mw - 8) * progress, 8);
  }

  // ─── 일시정지 오버레이 ──────────────────────────────────────────────────────
  _renderPauseOverlay() {
    const { ctx, game } = this;
    const cx = LOGICAL_WIDTH / 2;
    const cy = LOGICAL_HEIGHT / 2;

    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    ctx.fillStyle = '#ffffff';
    ctx.font      = 'bold 72px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('일시정지', cx, cy - 80);

    ctx.font = '28px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('ESC 키로 재개', cx, cy - 30);

    const resumeBtn = makeBtn('계속하기',   cx - 230, cy + 20, 210, 64, () => game.changeState(GameState.PLAYING));
    const mainBtn   = makeBtn('메인으로',   cx + 20,  cy + 20, 210, 64, () => game.changeState(GameState.MAIN));
    this._drawButton(resumeBtn, true);
    this._drawButton(mainBtn);
    this._buttons.push(resumeBtn, mainBtn);
  }

  // ─── 조작법 팝업 ───────────────────────────────────────────────────────────
  _renderControlsPopup() {
    const { ctx } = this;
    const cx = LOGICAL_WIDTH / 2;
    const cy = LOGICAL_HEIGHT / 2;
    const pw = 800, ph = 560;
    const px = cx - pw / 2, py = cy - ph / 2;

    // 배경 패널
    ctx.fillStyle = 'rgba(8,24,56,0.96)';
    ctx.beginPath();
    ctx.roundRect(px, py, pw, ph, 20);
    ctx.fill();
    ctx.strokeStyle = 'rgba(100,180,255,0.4)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 제목
    ctx.fillStyle = '#ffffff';
    ctx.font      = 'bold 44px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('조작법', cx, py + 60);

    // 조작 목록
    const controls = [
      ['← / →',       '좌우 이동'],
      ['↑ / ↓',       '레인 전환 (위/아래 파도)'],
      ['Space',        '점프 (장애물 회피)'],
      ['ESC',          '일시정지'],
    ];

    ctx.font = '32px sans-serif';
    const rowH = 72;
    const startY = py + 120;

    controls.forEach(([key, desc], i) => {
      const y = startY + i * rowH;
      const isEven = i % 2 === 0;

      if (isEven) {
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.fillRect(px + 20, y - 6, pw - 40, rowH - 8);
      }

      // 키
      ctx.fillStyle = '#4fc3f7';
      ctx.textAlign = 'left';
      ctx.fillText(key, px + 60, y + 38);

      // 설명
      ctx.fillStyle = '#e0e0e0';
      ctx.textAlign = 'left';
      ctx.fillText(desc, px + 260, y + 38);
    });

    // 닫기 버튼
    const closeBtn = makeBtn('닫기 (ESC)', cx - 120, py + ph - 90, 240, 56,
      () => { this._showingControls = false; });
    this._drawButton(closeBtn, true);
    this._buttons.push(closeBtn);
  }

  // ─── 결과/실패 화면 ────────────────────────────────────────────────────────
  _renderResult() {
    if (this.game._lastResultCleared) {
      this._renderClear();
    } else {
      this._renderGameOver();
    }
  }

  _renderGameOver() {
    const { ctx, game } = this;
    const cx = LOGICAL_WIDTH / 2;

    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    // 제목
    ctx.font      = 'bold 80px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff4444';
    ctx.fillText('GAME OVER', cx, 210);

    // 충돌 장애물명
    const hitObs = game._lastHitObstacle;
    const obsName = hitObs ? (OBSTACLE_NAMES[hitObs.type] ?? hitObs.type) : '장애물';
    ctx.font      = '38px sans-serif';
    ctx.fillStyle = '#ffaaaa';
    ctx.fillText(`${obsName}에 충돌했습니다`, cx, 300);

    // 클리어까지 부족한 시간
    const remainSec = Math.ceil((game._lastTimeRemain ?? 0) / 1000);
    ctx.font      = '34px sans-serif';
    ctx.fillStyle = '#cccccc';
    ctx.fillText(`클리어까지 ${remainSec}초 남았습니다`, cx, 380);

    // 최고기록 차이
    const stageId  = game.currentStage + 1;
    const hiScore  = game.storage.getHighScore(stageId);
    const myScore  = game.score.total;

    ctx.font = '34px sans-serif';
    if (hiScore === 0) {
      ctx.fillStyle = '#ffd700';
      ctx.fillText('이번이 첫 도전입니다!', cx, 455);
    } else if (myScore >= hiScore) {
      ctx.fillStyle = '#ffd700';
      ctx.fillText('최고기록 갱신!', cx, 455);
    } else {
      ctx.fillStyle = '#cccccc';
      ctx.fillText(`최고기록과 ${(hiScore - myScore).toLocaleString()}점 차이`, cx, 455);
    }

    // 현재 점수
    ctx.font      = 'bold 48px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`이번 점수: ${myScore.toLocaleString()}`, cx, 550);

    // 버튼
    const retryBtn = makeBtn('다시 도전',  cx - 230, 660, 210, 64, () => game.startStage(game.currentStage));
    const mapBtn   = makeBtn('세계지도로', cx + 20,  660, 210, 64, () => game.changeState(GameState.WORLDMAP));
    this._drawButton(retryBtn, true);
    this._drawButton(mapBtn);
    this._buttons.push(retryBtn, mapBtn);
  }

  _renderClear() {
    const { ctx, game } = this;
    const summary = game.score.getSummary();
    const cx = LOGICAL_WIDTH / 2;

    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    // 제목
    ctx.font      = 'bold 80px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#4fc3f7';
    ctx.fillText('STAGE CLEAR!', cx, 160);

    // 별점
    this._renderStars(cx, 185, game._lastClearStars ?? 1);

    // 점수 항목별 내역
    const items = [
      ['생존 점수',       summary.breakdown[ScoreEvent.SURVIVAL]],
      ['회피 점수',       summary.breakdown[ScoreEvent.DODGE]],
      ['퍼펙트 점프',     summary.breakdown[ScoreEvent.PERFECT_JUMP]],
      ['위험구간 보너스', summary.breakdown[ScoreEvent.DANGER_LANE]],
      ['스테이지 클리어', summary.breakdown[ScoreEvent.STAGE_CLEAR]],
    ];

    ctx.font      = '32px sans-serif';
    ctx.fillStyle = '#e0e0e0';
    items.forEach(([label, val], i) => {
      const y = 330 + i * 52;
      ctx.textAlign = 'left';
      ctx.fillText(label, cx - 280, y);
      ctx.textAlign = 'right';
      ctx.fillText((val ?? 0).toLocaleString(), cx + 280, y);
    });

    // 구분선 + 총점
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 280, 600); ctx.lineTo(cx + 280, 600);
    ctx.stroke();

    ctx.font      = 'bold 44px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.fillText('총점', cx - 280, 655);
    ctx.textAlign = 'right';
    ctx.fillText(summary.total.toLocaleString(), cx + 280, 655);

    // 최대 콤보 / 퍼펙트 횟수
    ctx.font      = '26px sans-serif';
    ctx.fillStyle = '#a0a0a0';
    ctx.textAlign = 'center';
    ctx.fillText(`최대 콤보: ${summary.maxCombo}회   퍼펙트 점프: ${summary.perfectJumps}회`, cx, 705);

    // 버튼
    const retryBtn = makeBtn('다시 도전',    cx - 250, 780, 220, 64, () => game.startStage(game.currentStage));
    const nextBtn  = makeBtn('다음 해역으로', cx + 30,  780, 220, 64, () => this._onNextStage());
    this._drawButton(retryBtn);
    this._drawButton(nextBtn, true);
    this._buttons.push(retryBtn, nextBtn);
  }

  _renderStars(cx, topY, count) {
    const { ctx } = this;
    const size = 64;
    const gap  = 16;
    const totalW = 3 * size + 2 * gap;
    const startX = cx - totalW / 2;

    for (let i = 0; i < 3; i++) {
      ctx.font      = `${size}px sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillStyle = i < count ? '#ffd700' : '#3a3a3a';
      ctx.fillText('★', startX + i * (size + gap), topY + size + 10);
    }
  }

  // ─── 인게임 가이드 말풍선 ──────────────────────────────────────────────────
  _renderGuide() {
    const { ctx } = this;
    const text = this._guide.currentText;
    if (!text) return;

    const px = LOGICAL_WIDTH / 2, py = LOGICAL_HEIGHT - 120;
    const padding = 20;

    ctx.font = 'bold 28px sans-serif';
    const tw = ctx.measureText(text).width;
    const bw = tw + padding * 2, bh = 56;

    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.roundRect(px - bw / 2, py - bh / 2, bw, bh, 12);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(text, px, py + 10);
  }

  // ─── 버튼 렌더링 ───────────────────────────────────────────────────────────
  _drawButton(btn, primary = false) {
    const { ctx } = this;
    ctx.fillStyle = primary ? '#1565c0' : 'rgba(255,255,255,0.12)';
    ctx.strokeStyle = primary ? '#42a5f5' : 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(btn.x, btn.y, btn.w, btn.h, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font      = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2 + 10);
  }

  // ─── 버튼 액션 ─────────────────────────────────────────────────────────────
  _onResume() {
    const save = this.game.storage.load();
    if (save && save.currentStage > 0) {
      this.game.startStage(save.currentStage);
    }
  }

  _onControls() {
    this._showingControls = true;
  }

  _onNextStage() {
    const next = this.game.currentStage + 1;
    if (next < this.game.stageCount) {
      this.game.startStage(next);
    } else {
      this.game.changeState(GameState.WORLDMAP);
    }
  }

  // 가이드 트리거 (main.js 에서 호출)
  triggerGuideStep(stepIdx, text) {
    this._guide.currentText = text;
    this._guide.visible     = true;
    this._guide.timer       = 3000; // 3초 표시 후 자동 소멸
  }

  hideGuide() {
    this._guide.visible = false;
  }
}
