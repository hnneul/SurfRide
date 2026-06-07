import Phaser from 'phaser';
import { LOGICAL_WIDTH, LOGICAL_HEIGHT, RIDE_TOP_Y, fracToRideY, rideYToFrac, BALANCE } from '../constants.js';
import { Player } from '../player.js';
import { ObstacleManager } from '../obstacle.js';
import { ScoreManager } from '../score.js';
import { StorageManager } from '../storage.js';
import { STAGES } from '../stages.js';
import { OceanBackground } from '../oceanBackground.js';
import { GoldenFishManager } from '../goldenFish.js';
import { ThreeLayer } from '../three/ThreeLayer.js';
import { mountHud } from '../ui/hudDom.js';
import { mountPause } from '../ui/pauseDom.js';

/** @typedef {import('../types.js').GameSceneInit} GameSceneInit */
/** @typedef {import('../types.js').ResultScenePayload} ResultScenePayload */

// 렌더 경로: 'three'(3D, 기본) | 'phaser'(2.5D 폴백). 3D면 2D 표시 계층(OceanBackground·
// HUDScene·danger/tutorial graphics)을 아예 만들지 않는다 — 숨은 캔버스 드로 비용·죽은 상태 제거.
const RENDER_MODE = 'three';

const TUTORIAL_STEPS = [
  { until:  3400, text: '↑ ↓ 방향키로 파도를 타고 오르내려요' },
  { until:  7000, text: '← → 로 균형을 잡으세요 — 무너지면 와이프아웃!' },
  { until: 10400, text: '신호가 뜬 자리에서 장애물이 솟구쳐요. 미리 피하세요' },
  { until: 13600, text: 'Space 로 점프 — 공중에선 드리프트가 멈춰요(균형은 그대로!)' },
  { until: 17400, text: '점프 중 ← → 로 스핀! 똑바로 착지하면 트릭 점수 +' },
  { until: 20800, text: '장애물을 스치듯 피하면 아슬아슬 보너스!' },
];

const WIND_BY_STAGE = Object.freeze({
  4: 110,
  6: 145,
  9: 175,
  10: 205,
});

const LANDING_JITTER_BY_STAGE = Object.freeze({
  4: 8,
  6: 14,
  9: 18,
  10: 22,
});

const REEF_PERIOD_MS = 11_000;   // 암초 지대: 이벤트 주기(이 간격마다 한 번 발동)
const REEF_ACTIVE_MS = 4_000;    // 한 번 발동 길이(좁아짐 → 최협 → 풀림)

const CHASE_PERIOD_MS = 12_000;  // 추격 파도: 이벤트 주기
const CHASE_ACTIVE_MS = 4_500;   // 한 번 밀려옴 길이(차오름 → 최고 → 빠짐)

const HAZE_PERIOD_MS = 13_000;   // 시야 가림(물보라/수증기): 이벤트 주기
const HAZE_ACTIVE_MS = 4_500;    // 한 번 흐려짐 길이(짙어짐 → 최고 → 걷힘)

// ─── 큰 파도 이벤트 ────────────────────────────────────────────────────────────
const BIG_WAVE_WARN_MS = 1_800;  // 예고(다가오는 큰 파도) 길이
const BIG_WAVE_DUR_MS  = 5_200;  // 큰 파도가 지나가는 길이(world.triggerBigWave durMs와 일치)
const BIG_WAVE_RIDE_TOL_Z = 2.6; // 마루를 '타는' 것으로 보는 z 허용 오차
const BIG_WAVE_GOOD_MS = 1_600;  // 이 시간만큼 마루를 타면 품질 1.0(만점 보너스)

export default class GameScene extends Phaser.Scene {
  constructor() { super({ key: 'GameScene' }); }

  /** @param {GameSceneInit} data */
  init(data) {
    this.stageIndex = this._normalizeStageIndex(data.stageIndex);
  }

  create() {
    this.stage = STAGES[this.stageIndex] ?? STAGES[0];
    this.stageTimer  = 0;
    this.worldOffset = 0;
    this._active     = true;
    this._wasInDanger = false;
    this._wasGrounded = true;
    this._slowmoMs   = 0;
    this.renderMode  = RENDER_MODE;
    const use3D = this.renderMode === 'three';

    // 2D 표시 계층은 phaser(폴백) 모드에서만 생성. 3D에선 null로 두고 게이트.
    this.ocean     = use3D ? null : new OceanBackground(this, this.stage.theme);
    this.dangerGfx = use3D ? null : this.add.graphics().setDepth(4);

    this.storage         = new StorageManager();
    this.scoreManager    = new ScoreManager();
    this.player          = new Player(this);
    this.obstacleManager = new ObstacleManager(this);
    this.goldenFish      = new GoldenFishManager(this);
    this.storage.setCurrentStage(this.stageIndex);
    this.obstacleManager.loadStage(this.stage);

    this._setupWeather();
    this._setupStageGimmicks();
    this._setupBigWaves();
    this._balanceWarned = false;
    this._clutchCdMs    = 0;
    this._waveRideAcc   = 0;

    this.cursors  = this.input.keyboard.createCursorKeys();
    this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.pKey     = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.P);
    this.escKey   = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    this._setupTutorial();
    this._setupDangerText();

    if (!use3D) {
      // 2.5D 폴백: Phaser HUD 씬으로 표시
      this.scene.launch('HUDScene', { gameScene: this });
      return;
    }

    // ─── 3D 렌더 ──────────────────────────────────────────────────────────────
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
    this.scene.stop('HUDScene');
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

    this.stageTimer  += dt;
    this.worldOffset += this.obstacleManager.scrollSpeed * (dt / 1000);

    this._updateWeather();
    this._updateStageGimmicks(dt);
    this._updateBigWaves(dt);   // 큰 파도(예고→통과→마루 타기 보상) — stageGimmicks.balanceDrift에 흔들림 가산
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

    this._renderBackground(dt);
    this._renderDanger();
    // 렌더만 Three에 위임 — 서퍼·장애물은 게임 좌표(x·baseY·jumpOffset·targetY)를 그대로 추종.
    // 충돌 판정은 obstacleManager의 2D AABB(checkCollision)가 담당 — 여기선 안 건드림.
    this.three?.render(dt, {
      player:       this.player,
      cursors:      this.cursors,
      obstacles:    this.obstacleManager.obstacles,
      signals:      this.obstacleManager.signals,
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
      perfectJumps: this.scoreManager.perfectJumps,
      remainSec:    Math.max(0, (this.obstacleManager._stageDuration - this.stageTimer) / 1000),
      stageId:      this.stage.id,
      stageName:    this.stage.name,
      nextStageName: STAGES[this.stageIndex + 1]?.name ?? '완주',
      weatherActive: !!this._weatherActive,
      stageEffect:   this._stageEffectHud(),
      progress:     Math.min(this.stageTimer / this.obstacleManager._stageDuration, 1),
      danger:       this.player.inDanger,
      bigWave:      this._bigWaveHud(),
      tutorialText: this._tutorialActive
        ? (TUTORIAL_STEPS.find((s) => this.stageTimer < s.until)?.text ?? null)
        : null,
    });
  }

  // 피격: 하트 차감·콤보 리셋·연출. 사망(하트 0)이면 true 반환 → 게임오버.
  _onHit(obstacle) {
    const dead = this.player.takeHit();
    this.scoreManager.onComboBreak();
    this.ocean?.pulse();
    this.ocean?.splash(this.player.x, this.player.y + 6, 1.8);
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
      this.ocean?.splash(this.player.x, this.player.baseY + 12, 1.0);   // 이륙
      this.three?.surferSplash(0.9);
    } else if (!this._wasGrounded && grounded) {
      this.ocean?.splash(this.player.x, this.player.baseY + 14, 1.6);   // 착지
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
    this.ocean?.pulse();
    this.ocean?.splash(this.player.x, this.player.baseY + 8, 1.2);
    this.three?.surferSplash(1.3, 0xb8e6ff);
    this.cameras.main.flash(120, 180, 230, 255, false);
    this.hud?.flash(180, 230, 255, 120);
  }

  _onPerfectJump() {
    this._slowmoMs = Math.max(this._slowmoMs, 110);
    this.ocean?.pulse();
    this.ocean?.splash(this.player.x, this.player.baseY + 8, 1.55);
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
    this.ocean?.pulse();
    this.ocean?.splash(this.player.x, this.player.baseY + 8, 1.5);
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
    this.ocean?.pulse();
    this.cameras.main.shake(160, 0.006);
    this.three?.shake(160, 0.006);
    this.hud?.flash(255, 150, 90, 120);
  }

  _onGoldenFish() {
    this.ocean?.pulse();
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
      this.ocean?.pulse();
    }
  }

  // ─── 큰 파도 이벤트 (예고 → 통과 → 마루 타기 보상) ──────────────────────────────
  // 배경 장식이 아니라 게임 이벤트: 예고 후 거대 너울이 원경에서 밀려와 서퍼·장애물·수면을 함께
  // 들어올린다. 통과하는 동안 마루(crest) 가까이서 균형을 지키며 '타면' 초당 보상 + 마무리 보너스.
  // 실패(거의 못 탐)하면 보너스 없음 + 흔들림. 큰 파도 동안 보드가 흔들려(balanceDrift) 위험이 커진다.
  _setupBigWaves() {
    const dur = this.obstacleManager._stageDuration;
    // 현재는 1스테이지 프로토타입에만 활성(스폰 패턴이 큰 파도 창을 비워 둠). 추후 테마별
    // 파라미터(횟수·진폭·타이밍)로 확장 가능 — 다른 스테이지의 빽빽한 패턴과 겹치면 과해지므로 보류.
    this._bigWaveTimes = this.stageIndex === 0 ? [dur * 0.34, dur * 0.7] : [];
    this._bigWaveIdx = 0;
    this._bigWave = { phase: 'idle', warnMs: 0, goodMs: 0, totalMs: 0, _riding: false };
  }

  _bigWaveHud() {
    const bw = this._bigWave;
    if (!bw) return null;
    return {
      warn:     bw.phase === 'warn',
      active:   bw.phase === 'active',
      riding:   bw.phase === 'active' && bw._riding,
      progress: bw.phase === 'active' ? (this.three?.world?.bigWaveProgress ?? 0) : 0,
    };
  }

  _updateBigWaves(dt) {
    const bw = this._bigWave;
    if (!bw || !this.three) return;
    const t = this.stageTimer;

    if (bw.phase === 'idle') {
      if (this._bigWaveIdx < this._bigWaveTimes.length &&
          t >= this._bigWaveTimes[this._bigWaveIdx] - BIG_WAVE_WARN_MS) {
        bw.phase = 'warn'; bw.warnMs = 0;
        this.three.shake(150, 0.0026);
      }
      return;
    }

    if (bw.phase === 'warn') {
      bw.warnMs += dt;
      if (bw.warnMs >= BIG_WAVE_WARN_MS) {
        bw.phase = 'active'; bw.goodMs = 0; bw.totalMs = 0; bw._riding = false;
        this.three.triggerBigWave({ durMs: BIG_WAVE_DUR_MS });
        this.three.shake(240, 0.005);
        this.hud?.flash(150, 210, 255, 200);
      }
      return;
    }

    // active — 마루를 타는지 판정 + 흔들림 외란 + 초당 보상, world 파도가 끝나면 정산
    bw.totalMs += dt;
    this.stageGimmicks.balanceDrift += Math.sin(t * 0.013 + 1.3) * 0.34;   // 보드 흔들림(위험)

    const crestZ  = this.three.world?.bigWaveCrestZ;
    const surferZ = this.three.surfer?.pos?.z;
    const inRange = crestZ != null && crestZ >= 1.5 && crestZ <= 11.5;     // 마루가 플레이 영역에
    const riding  = inRange && surferZ != null &&
      Math.abs(crestZ - surferZ) <= BIG_WAVE_RIDE_TOL_Z &&
      this.player.isGrounded && Math.abs(this.player.tilt) < BALANCE.WARN_AT;
    bw._riding = riding;
    if (riding) {
      bw.goodMs += dt;
      this._waveRideAcc += dt;
      while (this._waveRideAcc >= 1000) {
        this._waveRideAcc -= 1000;
        this.scoreManager.onWaveRideTick(this.player.baseY);
        this.three?.surferSplash(0.7, 0xd6f4ff);
      }
    }

    if (!this.three.world?.bigWave) {   // 큰 파도 종료 → 정산
      const quality = Math.max(0, Math.min(1, bw.goodMs / BIG_WAVE_GOOD_MS));
      if (quality >= 0.25) this._onBigWaveSuccess(quality);
      else                 this._onBigWaveMiss();
      bw.phase = 'idle';
      bw._riding = false;
      this._bigWaveIdx++;
    }
  }

  _onBigWaveSuccess(quality) {
    const pts = this.scoreManager.onBigWave(quality, this.player.baseY);
    this._slowmoMs = Math.max(this._slowmoMs, 150);
    this.cameras.main.flash(160, 150, 220, 255, false);
    this.cameras.main.shake(200, 0.004);
    this.three?.shake(200, 0.004);
    this.three?.surferSplash(2.4, 0xcdefff);
    this.hud?.flash(150, 220, 255, 160);
    this.hud?.toast(quality > 0.8 ? 'BIG WAVE!!' : 'BIG WAVE!', `+${pts}`);
  }

  _onBigWaveMiss() {
    this.three?.shake(220, 0.005);
    this.cameras.main.shake(220, 0.005);
    this.hud?.flash(120, 150, 200, 150);
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

  // ─── 후반 해역 고유 기믹 ───────────────────────────────────────────────────
  _setupStageGimmicks() {
    const stageId = this.stage.id;
    const difficulty = this.stage.difficulty ?? {};
    this.stageGimmicks = {
      seed: Math.random() * Math.PI * 2,
      windStrength: WIND_BY_STAGE[stageId] ?? 0,
      windForce: 0,
      windRatio: 0,
      balanceDrift: 0,
      balanceWipeoutAt: difficulty.balanceWipeoutAt ?? null,
      landingJitter: LANDING_JITTER_BY_STAGE[stageId] ?? 0,
      night: !!difficulty.nightMode,
      storm: !!difficulty.screenShake,
      // 상승기류(점프대) 기믹: 화산 테마이거나 difficulty.updraft 명시 시(예: Stage 10 결합)
      volcanic: this.stage.theme === 'volcanic' || !!difficulty.updraft,
      updraftActive: false,
      playerInUpdraft: false,
      updraftY: null,
      jumpBoost: 1,
      updraftLift: 0,
      narrowLane: !!difficulty.narrowLane,
      chaseWave: !!difficulty.chaseWave,
      laneTopY: null,
      laneBottomY: null,
      reefActive: false,
      reefStyle: 'reef',
      hideTop: false,
      hazeKind: difficulty.squall ? 'squall' : (difficulty.steam ? 'steam' : null),
      visibility: 0,
      label: null,
    };
    this._nextStormRumble = 4_800;
  }

  _updateStageGimmicks(dt) {
    const fx = this.stageGimmicks;
    if (!fx) return;

    const t = this.stageTimer;
    const labels = [];

    fx.windForce = 0;
    fx.windRatio = 0;
    fx.balanceDrift = 0;
    fx.jumpBoost = 1;
    fx.updraftLift = 0;
    fx.updraftActive = false;
    fx.playerInUpdraft = false;
    fx.updraftY = null;
    fx.laneTopY = null;
    fx.laneBottomY = null;
    fx.reefActive = false;
    fx.reefStyle = 'reef';
    fx.hideTop = false;
    fx.visibility = 0;

    if (fx.windStrength > 0) {
      const base = Math.sin(t * 0.0011 + fx.seed) * 0.22;
      const gustCycle = (t + fx.seed * 1000) % 11_500;
      const gustWindow = gustCycle >= 3_500 && gustCycle <= 7_400;
      const gustEnvelope = gustWindow
        ? Math.sin(((gustCycle - 3_500) / 3_900) * Math.PI)
        : 0;
      const gustWave = Math.sin(t * 0.0019 + fx.seed * 2.7);
      const gust = Math.abs(gustWave) > 0.72
        ? Math.sign(gustWave) * ((Math.abs(gustWave) - 0.72) / 0.28) * gustEnvelope
        : 0;
      const force = fx.windStrength * (base + gust);
      fx.windForce = force;
      fx.windRatio = Math.max(-1, Math.min(1, force / fx.windStrength));
      fx.balanceDrift = fx.windRatio * 0.18;
      if (Math.abs(fx.windRatio) > 0.42) labels.push(`강풍 ${fx.windRatio < 0 ? '위쪽' : '아래쪽'}`);
    }

    if (fx.volcanic) {
      const cycle = t % 15_000;
      const active = cycle >= 5_200 && cycle <= 9_800;
      const cycleIndex = Math.floor(t / 15_000);
      const updraftFrac = cycleIndex % 2 === 0 ? 0.42 : 0.68;
      fx.updraftActive = active;
      fx.updraftY = active ? fracToRideY(updraftFrac) : null;

      if (active) {
        const playerFrac = rideYToFrac(this.player.baseY);
        fx.playerInUpdraft = Math.abs(playerFrac - updraftFrac) <= 0.13;
        if (fx.playerInUpdraft) {
          fx.jumpBoost = 1.24;
          fx.updraftLift = 360;
          labels.push('상승기류 점프 강화');
        } else {
          labels.push('수증기 상승기류');
        }
      }
    }

    if (fx.storm) {
      if (t >= this._nextStormRumble) {
        this.cameras.main.shake(220, 0.0045);
        this.three?.shake(220, 0.0045);
        this._nextStormRumble = t + 5_800 + Math.random() * 3_500;
      }
      labels.push('폭풍 흔들림');
    }

    if (fx.narrowLane) {
      // 암초는 상시가 아니라 '간헐적 이벤트' — 주기마다 잠깐 통로가 좁아졌다 풀린다.
      const cycle = (t + fx.seed * 800) % REEF_PERIOD_MS;
      if (cycle < REEF_ACTIVE_MS) {
        const ease   = Math.sin((cycle / REEF_ACTIVE_MS) * Math.PI);  // 0→1→0 (등장·최협·퇴장)
        const half   = 0.5 - ease * 0.30;                             // 0.5(자유) → 0.20(가장 좁음)
        const center = 0.5 + Math.sin(t * 0.0006 + fx.seed) * 0.12;
        fx.laneTopY    = fracToRideY(Math.max(0, center - half));
        fx.laneBottomY = fracToRideY(Math.min(1, center + half));
        fx.reefActive  = ease > 0.15;   // 충분히 좁아졌을 때만 암초 시각·라벨
        if (fx.reefActive) labels.push('좁은 수로 · 암초');
      }
    }

    if (fx.chaseWave) {
      // 추격 파도 — 주기마다 아래(위험구간)에서 파도가 차올라 가동 폭 하단을 잠식. 위로 피해야.
      const cycle = (t + fx.seed * 800) % CHASE_PERIOD_MS;
      if (cycle < CHASE_ACTIVE_MS) {
        const ease       = Math.sin((cycle / CHASE_ACTIVE_MS) * Math.PI);  // 0→1→0 (차오름·최고·빠짐)
        const bottomFrac = 1 - ease * 0.45;                                // 1(자유) → 0.55(많이 잠식)
        fx.laneTopY    = RIDE_TOP_Y;          // 위는 자유
        fx.laneBottomY = fracToRideY(bottomFrac);
        fx.reefActive  = ease > 0.12;
        fx.reefStyle   = 'wave';
        fx.hideTop     = true;
        if (fx.reefActive) labels.push('추격 파도 — 위로 피해!');
      }
    }

    if (fx.hazeKind) {
      // 물보라(6)·수증기(8) — 주기마다 화면이 잠깐 흐려져 신호 가독성이 떨어진다(예측 난이도).
      const cycle = (t + fx.seed * 500) % HAZE_PERIOD_MS;
      if (cycle < HAZE_ACTIVE_MS) {
        const ease = Math.sin((cycle / HAZE_ACTIVE_MS) * Math.PI);
        fx.visibility = ease * (fx.hazeKind === 'steam' ? 0.7 : 0.6);
        if (fx.visibility > 0.15) {
          labels.push(fx.hazeKind === 'steam' ? '수증기 · 시야 흐림' : '물보라 · 시야 흐림');
        }
      }
    }

    if (fx.night) labels.push('야간 시야 제한');
    fx.label = labels.slice(0, 2).join(' · ') || null;
  }

  _stageEffectHud() {
    const fx = this.stageGimmicks;
    if (!fx) return null;
    return {
      label: fx.label,
      night: fx.night,
      storm: fx.storm,
      windRatio: fx.windRatio,
      updraftActive: fx.updraftActive,
      playerInUpdraft: fx.playerInUpdraft,
      visibility: fx.visibility,
      hazeKind: fx.hazeKind,
    };
  }

  // ─── Background (OceanBackground 위임) ──────────────────────────────────────
  _renderBackground(dt) {
    const scrollSpeed = this.obstacleManager.scrollSpeed;
    this.ocean?.update({
      dt,
      scroll:    this.worldOffset,
      speedNorm: scrollSpeed / 540,
      combo:     this.scoreManager.combo,
      danger:    this.player.inDanger || this._weatherActive,
      jumping:   !this.player.isGrounded,
      playerX:   this.player.x,
      playerY:   this.player.baseY,
    });
  }

  // ─── 위험 구간 연출 ───────────────────────────────────────────────────────────
  _setupDangerText() {
    if (this.renderMode !== 'phaser') return;   // 3D: 위험 표시는 DOM HUD
    this.dangerText = this.add.text(LOGICAL_WIDTH - 40, LOGICAL_HEIGHT / 2, '위험구간 ×1.5', {
      fontSize: '40px', fontFamily: 'sans-serif', color: '#ff5252', fontStyle: 'bold',
    }).setOrigin(1, 0.5).setDepth(5).setAngle(90).setVisible(false);
  }

  _renderDanger() {
    const inDanger = this.player.inDanger;
    // 위험 진입 흔들림은 두 모드 공통(load-bearing)
    if (inDanger && !this._wasInDanger) {
      this.cameras.main.shake(180, 0.004);
      this.three?.shake(180, 0.004);
    }
    this._wasInDanger = inDanger;

    if (!this.dangerGfx) return;   // 3D: 비네트·속도선은 DOM HUD가 표시
    const gfx = this.dangerGfx;
    gfx.clear();

    if (!inDanger) { this.dangerText.setVisible(false); return; }

    const W = LOGICAL_WIDTH, H = LOGICAL_HEIGHT;
    const pulse = (Math.sin(this.stageTimer * 0.012) + 1) / 2;
    const a = 0.18 + pulse * 0.18;

    // 가장자리 비네트
    const t = 90;
    gfx.fillStyle(0xff3b30, a);
    gfx.fillRect(0, 0, W, t);
    gfx.fillRect(0, H - t, W, t);
    gfx.fillRect(0, 0, t, H);
    gfx.fillRect(W - t, 0, t, H);

    // 속도선
    gfx.fillStyle(0xffffff, 0.25 + pulse * 0.2);
    for (let i = 0; i < 7; i++) {
      const ly = 120 + i * 130;
      const lx = ((this.worldOffset * 2.2 + i * 260) % (W + 300)) - 150;
      gfx.fillRect(W - lx, ly, 120, 4);
    }

    this.dangerText.setVisible(true).setAlpha(0.6 + pulse * 0.4);
  }

  // ─── 인게임 튜토리얼 (1스테이지 첫 플레이) ──────────────────────────────────
  _setupTutorial() {
    this._tutorialActive = this.stageIndex === 0 && !this.storage.tutorialCompleted;
    if (!this._tutorialActive) return;
    this._tutStep = -1;
    if (this.renderMode !== 'phaser') return;   // 3D: 튜토리얼 안내는 DOM HUD(tutorialText)가 표시

    const cx = LOGICAL_WIDTH / 2;
    const y  = LOGICAL_HEIGHT - 120;
    this._tutBg = this.add.graphics().setDepth(5);
    this._tutText = this.add.text(cx, y, '', {
      fontSize: '34px', fontFamily: 'sans-serif', color: '#ffffff', fontStyle: 'bold',
      align: 'center',
    }).setOrigin(0.5).setDepth(6);
  }

  _updateTutorial() {
    if (!this._tutorialActive) return;

    const step = TUTORIAL_STEPS.findIndex(s => this.stageTimer < s.until);
    if (step === -1) {
      this._tutorialActive = false;
      this.storage.markTutorialComplete();
      this._tutBg?.destroy();
      this._tutText?.destroy();
      return;
    }
    if (step === this._tutStep) return;
    this._tutStep = step;
    if (!this._tutText) return;   // 3D: DOM HUD가 tutorialText로 표시(상태만 갱신)

    const text = TUTORIAL_STEPS[step].text;
    this._tutText.setText(text);
    const w = this._tutText.width + 64;
    const h = 72;
    const cx = LOGICAL_WIDTH / 2;
    const y  = LOGICAL_HEIGHT - 120;
    this._tutBg.clear();
    this._tutBg.fillStyle(0x000000, 0.6);
    this._tutBg.fillRoundedRect(cx - w / 2, y - h / 2, w, h, 14);
    this._tutBg.lineStyle(2, 0x4fc3f7, 0.8);
    this._tutBg.strokeRoundedRect(cx - w / 2, y - h / 2, w, h, 14);
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
    this.scene.stop('HUDScene');
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

    this.scene.stop('HUDScene');
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
