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

/** @typedef {import('../types.js').GameSceneInit} GameSceneInit */
/** @typedef {import('../types.js').ResultScenePayload} ResultScenePayload */

// 렌더는 Three(3D)가 전담한다. 게임 로직·입력·점수는 Phaser가, 표시는 Three 캔버스 + DOM HUD가
// 담당하고, Phaser 2D 캔버스 자체는 숨긴다(create에서 display:none). update()가 매 프레임
// three.render()로 렌더만 위임하며, 충돌·점수 등 판정은 전부 2D 매니저가 그대로 수행한다.

const TUTORIAL_STEPS = [
  { until:  3400, text: '← → 로 좌우로 움직여 장애물을 피해요' },
  { until:  7800, text: '↑ ↓ 로 파도 면을 오르내려요 — 위로 갈수록 빠르고 점수 ×1.5!' },
  { until: 11200, text: '위(마루)는 장애물이 솟는 곳 — 위험하지만 고득점, 아래(어깨)는 안전·저득점' },
  { until: 14400, text: 'Space 로 점프 — 낮은 장애물을 뛰어넘어요' },
  { until: 18200, text: 'Shift 로 잠수 — 위에 뜬 장애물 아래로 통과!' },
  { until: 21600, text: '장애물을 스치듯 피하면 아슬아슬 보너스 + 콤보!' },
];

export default class GameScene extends Phaser.Scene {
  constructor() { super({ key: 'GameScene' }); }

  /** @param {GameSceneInit} data */
  init(data) {
    this.stageIndex = this._normalizeStageIndex(data.stageIndex);
  }

  create() {
    this.stage = STAGES[this.stageIndex] ?? STAGES[0];
    this.stageTimer  = 0;
    this._active     = true;
    this._wasInDanger = false;
    this._wasGrounded = true;
    this._slowmoMs   = 0;

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
    this._balanceWarned = false;
    this._clutchCdMs    = 0;

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
    this._updateBalanceClutch(dt);   // 균형이 무너지기 직전 회복하면 보상(위험-보상)
    this.obstacleManager.update(dt, this.stageTimer, this.player);
    const caught = this.goldenFish.update(dt, this.player);
    for (let i = 0; i < caught; i++) this.scoreManager.onGoldenFish();
    if (caught > 0) this._onGoldenFish();
    this.scoreManager.update(dt, this.player);
    this._resolveScoring();
    this._handleSpray();
    this._updateTutorial();

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
      tutorialText: this._tutorialActive
        ? (TUTORIAL_STEPS.find((s) => this.stageTimer < s.until)?.text ?? null)
        : null,
    });
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

  // 균형이 경고 영역까지 갔다가 안정으로 회복하면 클러치 보상(지상 한정·쿨다운으로 악용 방지).
  _updateBalanceClutch(dt) {
    this._clutchCdMs = Math.max(0, this._clutchCdMs - dt);
    const tiltAbs = Math.abs(this.player.tilt);
    if (tiltAbs >= BALANCE.WARN_AT) {
      this._balanceWarned = true;
    } else if (this._balanceWarned && this.player.isGrounded &&
               tiltAbs < BALANCE.WARN_AT * 0.45 && this._clutchCdMs <= 0 && !this.player.wiped) {
      this._balanceWarned = false;
      this._clutchCdMs = 2_500;
      const pts = this.scoreManager.onBalanceClutch(this.player.baseY);
      this.three?.surferSplash(1.2, 0x9ffce0);
      this.cameras.main.flash(90, 120, 255, 200, false);
      this.hud?.flash(150, 255, 220, 110);
      this.hud?.toast('균형 회복!', `+${pts}`);
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
    this._tutorialActive = this.stageIndex === 0 && !this.storage.tutorialCompleted;
  }

  _updateTutorial() {
    if (!this._tutorialActive) return;
    // 마지막 스텝 시간을 지나면 튜토리얼 종료(완료 저장).
    if (this.stageTimer >= TUTORIAL_STEPS[TUTORIAL_STEPS.length - 1].until) {
      this._tutorialActive = false;
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
