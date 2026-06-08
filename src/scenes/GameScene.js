import Phaser from 'phaser';
import { BALANCE } from '../constants.js';
import { Player } from '../player.js';
import { ObstacleManager } from '../obstacle.js';
import { ScoreManager } from '../score.js';
import { StorageManager } from '../storage.js';
import { STAGES } from '../stages.js';
import { GoldenFishManager } from '../goldenFish.js';
import { BigWaveManager } from '../bigWaves.js';
import { BarrelManager } from '../barrel.js';
import { StageGimmickManager } from '../stageGimmicks.js';
import { ThreeLayer } from '../three/ThreeLayer.js';
import { mountHud } from '../ui/hudDom.js';
import { mountPause } from '../ui/pauseDom.js';
import { mountTutorial } from '../ui/tutorialDom.js';

/** @typedef {import('../types.js').GameSceneInit} GameSceneInit */
/** @typedef {import('../types.js').ResultScenePayload} ResultScenePayload */

// 렌더는 Three(3D)가 전담한다. 게임 로직·입력·점수는 Phaser가, 표시는 Three 캔버스 + DOM HUD가
// 담당하고, Phaser 2D 캔버스 자체는 숨긴다(create에서 display:none). update()가 매 프레임
// three.render()로 렌더만 위임하며, 충돌·점수 등 판정은 전부 2D 매니저가 그대로 수행한다.

const TUTORIAL_STEPS = Object.freeze({
  move: {
    title: '좌우로 파도를 타요',
    body: '← / → 로 서퍼를 움직여 물보라가 생긴 줄에서 벗어나요.',
    keys: ['←', '→'],
  },
  jumpFlyingFish: {
    title: '물보라가 보이면 점프',
    body: '날치는 낮게 튀어올라요. Space로 넘으면 퍼펙트 점프 보너스를 받아요.',
    keys: ['Space'],
  },
  rideZone: {
    title: '위쪽은 빠르고 위험해요',
    body: '↑ 로 마루에 올라가면 점수가 커지고, ↓ 로 내려오면 더 안전해요.',
    keys: ['↑', '↓'],
  },
  balance: {
    title: '균형을 잃으면 와이프아웃',
    body: 'BALANCE 마커가 끝까지 밀리기 전에 ↑ / ↓ 로 중심을 되찾아요.',
    keys: ['↑', '↓'],
  },
  diveJellyfish: {
    title: '해파리는 아래로 빠져나가요',
    body: '해파리처럼 위에 뜬 장애물은 Shift를 누르고 잠수해서 통과해요.',
    keys: ['Shift'],
  },
  moveShark: {
    title: '상어는 점프로 피할 수 없어요',
    body: '등지느러미가 보이면 좌우로 빠져나가요. 위치 이동이 먼저예요.',
    keys: ['←', '→'],
  },
  moveWhale: {
    title: '큰 그림자는 미리 비켜요',
    body: '고래 그림자는 넓게 올라와요. 신호가 보이면 바로 안전한 쪽으로 이동해요.',
    keys: ['←', '→'],
  },
  jumpOctopus: {
    title: '문어 다리는 점프로 넘어요',
    body: '다리 그림자가 솟으면 Space로 뛰어올라 지나가요.',
    keys: ['Space'],
  },
  fakeSignal: {
    title: '가짜 신호도 나와요',
    body: '가끔 신호만 나타나고 공격이 오지 않아요. 끝까지 보고 다음 움직임을 정해요.',
    keys: ['보기', '판단'],
  },
  moveLightning: {
    title: '번개는 줄을 벗어나요',
    body: '섬광이 보이면 그 줄에서 빠르게 벗어나요. 늦게 움직이면 피하기 어려워요.',
    keys: ['←', '→'],
  },
  bigWave: {
    title: '큰 파도는 타는 기회예요',
    body: '화면 안내 방향으로 이동해 포켓에 머물면 큰 파도 보너스를 받아요.',
    keys: ['←', '→'],
  },
  barrel: {
    title: '파도가 말리면 버텨요',
    body: '튜브가 열리면 ↓ 를 누르고 버티세요. 끝까지 유지하면 큰 보너스를 받아요.',
    keys: ['↓'],
  },
  updraft: {
    title: '상승기류는 점프를 키워요',
    body: '빛나는 기류 안에서 점프하면 더 높이 떠올라 어려운 장애물을 넘기 쉬워요.',
    keys: ['Space'],
  },
});

const CORE_TUTORIAL_STEP_IDS = ['move', 'jumpFlyingFish', 'rideZone', 'balance'];

const OBSTACLE_TUTORIAL_STEP = Object.freeze({
  FLYING_FISH: 'jumpFlyingFish',
  JELLYFISH: 'diveJellyfish',
  SHARK: 'moveShark',
  WHALE: 'moveWhale',
  OCTOPUS: 'jumpOctopus',
  LIGHTNING: 'moveLightning',
});

export default class GameScene extends Phaser.Scene {
  constructor() { super({ key: 'GameScene' }); }

  /** @param {GameSceneInit} data */
  init(data = {}) {
    this.stageIndex = this._normalizeStageIndex(data.stageIndex);
    this._forceTutorial = !!data.forceTutorial;
  }

  create() {
    this.stage = STAGES[this.stageIndex] ?? STAGES[0];
    this.stageTimer  = 0;
    this._active     = true;
    this._wasInDanger = false;
    this._wasGrounded = true;
    this._slowmoMs   = 0;
    this._tutorialPaused = false;
    this._tutorialCurrentStep = null;
    this._tutorialPendingStep = null;
    this._tutorialSessionSeen = new Set();

    this.storage         = new StorageManager();
    this.scoreManager    = new ScoreManager();
    this.player          = new Player(this);
    this.obstacleManager = new ObstacleManager(this);
    this.goldenFish      = new GoldenFishManager(this);
    this.storage.setCurrentStage(this.stageIndex);
    this.obstacleManager.loadStage(this.stage);

    this._setupWeather();
    this.stageGimmickManager = new StageGimmickManager(this);
    this.stageGimmicks       = this.stageGimmickManager.fx;   // player·Three·HUD가 공유하는 fx blackboard
    this.bigWaveManager      = new BigWaveManager(this);
    this.barrelManager       = new BarrelManager(this);
    this.cursors  = this.input.keyboard.createCursorKeys();
    this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.pKey     = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.P);
    this.escKey   = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    this._setupTutorial();

    // Phaser 2D 캔버스를 숨기고 그 위에 Three 캔버스 + DOM HUD/일시정지 오버레이를 올린다.
    // 게임 로직·입력은 그대로 — update()가 매 프레임 three.render()로 렌더만 위임한다.
    this.three = new ThreeLayer(this.stage.theme);
    this._phaserCanvas = this.sys.game.canvas;
    this._phaserCanvas.style.display = 'none';
    this.hud = mountHud();
    this.pauseUi = mountPause({
      onResume: () => this.resumeGame(),
      onMenu:   () => this._exitToMenu(),
    });
    this.tutorialUi = mountTutorial({
      onNext: () => this._resumeTutorial(),
      onSkip: () => this._resumeTutorial(),
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this._teardownThree, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this._teardownThree, this);
  }

  // 씬 종료 시 Three 레이어·HUD·일시정지 UI 정리 + Phaser 캔버스 복구
  _teardownThree() {
    this.three?.destroy();
    this.three = null;
    this.hud?.destroy();
    this.hud = null;
    this.pauseUi?.destroy();
    this.pauseUi = null;
    this.tutorialUi?.destroy();
    this.tutorialUi = null;
    if (this._phaserCanvas) {
      this._phaserCanvas.style.display = '';
      this._phaserCanvas = null;
    }
  }

  // 일시정지 '메인으로' — PauseScene 메뉴 동작을 DOM 버튼에서도 수행
  _exitToMenu() {
    this.scene.stop('PauseScene');
    this.scene.start('MainMenuScene');
  }

  update(_time, delta) {
    if (!this._active) return;

    // Near-miss 슬로우모션: 실제 시간은 그대로, 게임 dt만 감속
    let dt = Math.min(delta, 50);
    if (this._slowmoMs > 0) {
      this._slowmoMs = Math.max(0, this._slowmoMs - delta);
      dt *= 0.45;
    }

    this.stageTimer += dt;

    this._updateWeather();
    this.stageGimmickManager.update(dt);
    this.bigWaveManager.update(dt);   // 큰 파도(예고→통과→마루 타기 보상) — stageGimmicks.balanceDrift에 흔들림 가산
    this.barrelManager.update(dt);    // 배럴(튜브 라이딩) — 포켓 커밋 유지 시 대점수, 피격 시 붕괴
    this.stageGimmicks.barrelTucked = this.barrelManager.tubed;   // 배럴에 ↓로 박힌 동안 서퍼 세로 고정(제자리 튜브)
    this.player.update(dt, this.cursors, this.spaceKey, this.stageGimmicks);
    if (this.player.trickLanded)       this._onTrick();
    else if (this.player.trickBotched) this._onTrickBotch();
    this.obstacleManager.update(dt, this.stageTimer, this.player);
    const caught = this.goldenFish.update(dt, this.player);
    for (let i = 0; i < caught; i++) this.scoreManager.onGoldenFish();
    if (caught > 0) this._onGoldenFish();
    this.scoreManager.update(dt, this.player);
    this._resolveScoring();
    this._handleSpray();
    this._updateTutorialTriggers();

    if (this.player.wiped) { this._gameOver(null, 'wipeout'); return; }

    if (!this.player.invulnerable) {
      const hit = this.obstacleManager.checkCollision(this.player);
      if (hit && this._onHit(hit)) { this._gameOver(hit, 'collision'); return; }
    }

    if (this.stageTimer >= this.obstacleManager._stageDuration) {
      this._stageClear();
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.pKey) ||
        Phaser.Input.Keyboard.JustDown(this.escKey)) {
      this._pause();
    }

    this._handleDanger();
    // 렌더만 Three에 위임 — 서퍼·장애물은 게임 좌표(x·baseY·jumpOffset·targetY)를 그대로 추종.
    // 충돌 판정은 obstacleManager의 2D AABB(checkCollision)가 담당 — 여기선 안 건드림.
    this.three?.render(dt, {
      player:       this.player,
      cursors:      this.cursors,
      obstacles:    this.obstacleManager.obstacles,
      signals:      this.obstacleManager.signals,
      barrel:       this.barrelManager.tube(),
      goldenFishes: this.goldenFish.fishes,
      reef: this.stageGimmicks?.reefActive
        ? { topY: this.stageGimmicks.laneTopY, bottomY: this.stageGimmicks.laneBottomY,
            style: this.stageGimmicks.reefStyle, hideTop: this.stageGimmicks.hideTop }
        : null,
    });
    this.hud?.update({
      health:       this.player.health,
      maxHealth:    this.player.maxHealth,
      invulnerable: this.player.invulnerable,
      tilt:         this.player.tilt,
      wipeoutAt:    this.stageGimmicks?.balanceWipeoutAt ?? undefined,
      score:        this.scoreManager.total,
      combo:        this.scoreManager.combo,
      comboMul:     this.scoreManager.comboMultiplier,
      perfectJumps: this.scoreManager.perfectJumps,
      remainSec:    Math.max(0, (this.obstacleManager._stageDuration - this.stageTimer) / 1000),
      stageId:      this.stage.id,
      stageName:    this.stage.name,
      nextStageName: STAGES[this.stageIndex + 1]?.name ?? '완주',
      weatherActive: !!this._weatherActive,
      stageEffect:   this.stageGimmickManager.hud(),
      progress:     Math.min(this.stageTimer / this.obstacleManager._stageDuration, 1),
      danger:       this.player.inDanger,
      bigWave:      this.bigWaveManager.hud(),
      barrel:       this.barrelManager.hud(),
      tutorialText: null,
    });
    this._showPendingTutorial();
  }

  // 피격: 하트 차감·콤보 리셋·연출. 사망(하트 0)이면 true 반환 → 게임오버.
  _onHit(obstacle) {
    const dead = this.player.takeHit();
    this.scoreManager.onComboBreak();
    this.barrelManager?.onPlayerHit();   // 배럴 도중 피격 → 튜브 붕괴(마무리 보너스 날림)
    this.cameras.main.shake(dead ? 320 : 180, dead ? 0.012 : 0.008);
    this.cameras.main.flash(140, 255, 90, 90, false);
    this.three?.shake(dead ? 320 : 180, dead ? 0.012 : 0.008);
    this.three?.surferSplash(dead ? 2.4 : 1.8, 0xff9a9a);
    this.hud?.flash(255, 90, 90, 140);
    return dead;
  }

  // 점프 이륙·착지 순간에 물보라 분출
  _handleSpray() {
    const grounded = this.player.isGrounded;
    if (this._wasGrounded && !grounded) {
      this.three?.surferSplash(0.9);                                    // 이륙
    } else if (!this._wasGrounded && grounded) {
      this.three?.surferSplash(1.8);                                    // 착지 물보라 강하게
    }
    this._wasGrounded = grounded;
  }

  // 안전 통과한 분출들에 회피·니어미스·퍼펙트 점수 부여
  _resolveScoring() {
    const y = this.player.baseY;
    for (const obs of this.obstacleManager.collectResolved()) {
      this.scoreManager.onDodge(y);
      if (obs.jumpedOver) {
        this.scoreManager.onPerfectJump(y);
        this._onPerfectJump();
      }
      if (obs.grazed && !obs.jumpedOver) {
        this.scoreManager.onNearMiss(y);
        this._triggerSlowmo();
      }
    }
  }

  _triggerSlowmo() {
    this._slowmoMs = 200;
    this.three?.surferSplash(1.3, 0xb8e6ff);
    this.cameras.main.flash(120, 180, 230, 255, false);
    this.hud?.flash(180, 230, 255, 120);
  }

  _onPerfectJump() {
    this._slowmoMs = Math.max(this._slowmoMs, 110);
    this.cameras.main.flash(95, 255, 236, 120, false);
    this.cameras.main.shake(110, 0.003);
    this.three?.shake(110, 0.003);
    this.three?.surferSplash(1.7, 0xfff6aa);
    this.hud?.flash(255, 246, 170, 120);
    this.hud?.perfectJump();
  }

  // 에어 트릭 클린 랜딩 — 점수 적립 + 보상 연출(슬로우모션·플래시·토스트)
  _onTrick() {
    const pts = this.scoreManager.onTrick(this.player.baseY, this.player.trickHalfSpins);
    this._slowmoMs = Math.max(this._slowmoMs, 130);
    this.cameras.main.flash(110, 130, 220, 255, false);
    this.cameras.main.shake(120, 0.0035);
    this.three?.shake(120, 0.0035);
    this.three?.surferSplash(1.6, 0x96d6ff);
    this.hud?.flash(150, 220, 255, 120);
    this.hud?.trick(this.player.trickHalfSpins, pts);
  }

  // 에어 트릭 착지 실패(어중간) — 점수 없음, 휘청 피드백만
  _onTrickBotch() {
    this.scoreManager.onComboBreak();   // 쌓은 콤보 배율 날림 — 점프로 회복 불가한 페널티
    this.cameras.main.shake(160, 0.006);
    this.three?.shake(160, 0.006);
    this.hud?.flash(255, 150, 90, 120);
  }

  _onGoldenFish() {
    this.three?.surferSplash(1.2, 0xffe27a);
    this.cameras.main.flash(120, 255, 224, 120, false);
    this.hud?.flash(255, 224, 120, 120);
  }

  // ─── 기상 이변 구간 (구간 점수 ×2) ────────────────────────────────────────────
  // 스테이지 중반에 한 차례 발생. 활성 동안 ScoreManager가 구간 점수를 ×2 적립.
  _setupWeather() {
    const dur   = this.obstacleManager._stageDuration;
    const start = dur * 0.42;
    const end   = start + Math.min(13_000, dur * 0.22);
    this._weatherWindow = { start, end };
    this._weatherActive = false;
  }

  _updateWeather() {
    const w      = this._weatherWindow;
    const active = this.stageTimer >= w.start && this.stageTimer < w.end;
    if (active === this._weatherActive) return;

    this._weatherActive = active;
    this.scoreManager.setWeather(active);
    if (active) {
      this.cameras.main.flash(220, 120, 150, 220, false);
      this.cameras.main.shake(260, 0.005);
      this.three?.shake(260, 0.005);
      this.hud?.flash(120, 150, 220, 220);
    }
  }

  // ─── 위험 구간: 진입 순간 카메라 흔들림(three). 비네트·라벨 등 표시는 DOM HUD가 담당. ──────
  _handleDanger() {
    const inDanger = this.player.inDanger;
    if (inDanger && !this._wasInDanger) {
      this.cameras.main.shake(180, 0.004);
      this.three?.shake(180, 0.004);
    }
    this._wasInDanger = inDanger;
  }

  // ─── 인게임 튜토리얼 (1스테이지 첫 플레이) ──────────────────────────────────
  // 안내 문구는 DOM HUD가 tutorialText로 표시한다 — 여기선 활성 상태만 관리한다.
  _setupTutorial() {
    this._tutorialActive = true;
  }

  _updateTutorialTriggers() {
    if (!this._tutorialActive) return;
    if (this.stageIndex === 0 && this.stageTimer >= 260) this._queueTutorial('move');
    if (this.stageIndex === 0 && this.stageTimer >= 8_600) this._queueTutorial('rideZone');
    if (this.stageIndex === 0 && Math.abs(this.player.tilt) >= 0.46) this._queueTutorial('balance');
    if (this.bigWaveManager.hud().warn) this._queueTutorial('bigWave');
    if (this.barrelManager.hud().warn) this._queueTutorial('barrel');
    if (this.stageGimmickManager.hud().updraftActive) this._queueTutorial('updraft');
  }

  _onObstacleSignal(event) {
    if (!this._tutorialActive) return;
    if (event.isFake) {
      this._queueTutorial('fakeSignal');
      return;
    }
    this._queueTutorial(OBSTACLE_TUTORIAL_STEP[event.obstacleType]);
  }

  _queueTutorial(stepId) {
    if (!stepId || !TUTORIAL_STEPS[stepId]) return;
    if (this._tutorialPendingStep || this._tutorialPaused) return;
    if (this._tutorialSessionSeen.has(stepId)) return;
    if (!this._forceTutorial && this.storage.hasSeenTutorialStep(stepId)) return;
    this._tutorialPendingStep = stepId;
  }

  _showPendingTutorial() {
    if (!this._tutorialPendingStep || this._tutorialPaused) return;
    const stepId = this._tutorialPendingStep;
    this._tutorialPendingStep = null;
    this._tutorialSessionSeen.add(stepId);
    this.storage.markTutorialStepSeen(stepId);
    this._tutorialPaused = true;
    this._tutorialCurrentStep = stepId;
    this._active = false;
    this.tutorialUi?.show(TUTORIAL_STEPS[stepId]);
  }

  _resumeTutorial() {
    if (!this._tutorialPaused) return;
    this._tutorialPaused = false;
    this._tutorialCurrentStep = null;
    this.tutorialUi?.hide();
    this._active = true;
    if (CORE_TUTORIAL_STEP_IDS.every((id) => this.storage.hasSeenTutorialStep(id))) {
      this.storage.markTutorialComplete();
    }
  }

  // ─── State transitions ──────────────────────────────────────────────────────
  _pause() {
    this._active = false;
    this.scene.launch('PauseScene', { gameScene: this });
    this.pauseUi?.show();
  }

  resumeGame() {
    this._active = true;
    this.scene.stop('PauseScene');
    this.pauseUi?.hide();
  }

  _gameOver(hitObstacle, cause = 'collision') {
    this._active = false;
    const summary = this.scoreManager.getSummary();
    const prevHigh = this.storage.getHighScore(this.stageIndex + 1);
    this.storage.recordStageAttempt(this.stageIndex + 1, summary.total);
    /** @type {ResultScenePayload} */
    const payload = {
      cleared:     false,
      stageIndex:  this.stageIndex,
      summary,
      prevHigh,
      hitObstacle,
      cause,
      timeRemain:  Math.max(0, this.obstacleManager._stageDuration - this.stageTimer),
      storage:     this.storage,
    };
    this.scene.start('ResultScene', payload);
  }

  _stageClear() {
    this._active = false;
    this.scoreManager.onStageClear();
    const stageId = this.stageIndex + 1;
    const summary = this.scoreManager.getSummary();
    const stars   = this._calcStars(stageId, summary);
    const prevHigh = this.storage.getHighScore(stageId);
    this.storage.updateStageResult(stageId, summary.total, stars);

    /** @type {ResultScenePayload} */
    const payload = {
      cleared:    true,
      stageIndex: this.stageIndex,
      summary,
      prevHigh,
      stars,
      storage:    this.storage,
    };
    this.scene.start('ResultScene', payload);
  }

  _calcStars(stageId, summary) {
    const pt = ({ 1:2, 2:3, 3:4, 4:5, 5:6, 6:7, 7:8, 8:9, 9:10, 10:11 })[stageId] ?? 2;
    const ct = ({ 1:1.4, 2:1.5, 3:1.6, 4:1.7, 5:1.8, 6:1.8, 7:1.9, 8:1.9, 9:2.0, 10:2.0 })[stageId] ?? 1.4;
    if (summary.perfectJumps >= pt || summary.maxComboMultiplier >= ct) return 3;
    if (summary.perfectJumps >= 1  || summary.maxCombo >= 3)            return 2;
    return 1;
  }

  _normalizeStageIndex(stageIndex) {
    const parsed = Number(stageIndex);
    if (!Number.isInteger(parsed)) return 0;
    return Phaser.Math.Clamp(parsed, 0, STAGES.length - 1);
  }
}
