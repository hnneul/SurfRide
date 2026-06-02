import { Lane, LANE_Y } from './player.js';
import { LOGICAL_WIDTH } from './constants.js';

// ─── 장애물 타입 ─────────────────────────────────────────────────────────────
export const ObstacleType = Object.freeze({
  FLYING_FISH: 'FLYING_FISH', // 날치
  SHARK:       'SHARK',       // 상어
  WHALE:       'WHALE',       // 고래
  JELLYFISH:   'JELLYFISH',   // 해파리
  OCTOPUS:     'OCTOPUS',     // 문어
  LIGHTNING:   'LIGHTNING',   // 번개
});

// ─── 예고 신호 타입 ───────────────────────────────────────────────────────────
export const SignalType = Object.freeze({
  SPLASH:     'SPLASH',     // 수면 위 물방울 (날치)
  FIN:        'FIN',        // 지느러미 (상어)
  SHADOW:     'SHADOW',     // 바닷속 큰 그림자 (고래)
  GLOW:       'GLOW',       // 빛나는 점 (해파리)
  TENTACLE:   'TENTACLE',   // 다리 그림자 흔들림 (문어)
  FLASH:      'FLASH',      // 구역 번쩍임 (번개)
});

// ─── 장애물 타입별 메타 정보 ──────────────────────────────────────────────────
export const OBSTACLE_META = Object.freeze({
  [ObstacleType.FLYING_FISH]: {
    signalType: SignalType.SPLASH,
    hitboxW: 80, hitboxH: 40,
    response: '짧은 점프',
  },
  [ObstacleType.SHARK]: {
    signalType: SignalType.FIN,
    hitboxW: 100, hitboxH: 60,
    response: '타이밍 점프',
  },
  [ObstacleType.WHALE]: {
    signalType: SignalType.SHADOW,
    hitboxW: 200, hitboxH: 100,
    response: '미리 위치 이동',
  },
  [ObstacleType.JELLYFISH]: {
    signalType: SignalType.GLOW,
    hitboxW: 70, hitboxH: 70,
    response: '방향 회피 또는 점프',
  },
  [ObstacleType.OCTOPUS]: {
    signalType: SignalType.TENTACLE,
    hitboxW: 120, hitboxH: 80,
    response: '점프 회피',
  },
  [ObstacleType.LIGHTNING]: {
    signalType: SignalType.FLASH,
    hitboxW: 40, hitboxH: 300,
    response: '방향키 회피',
  },
});

// ─── 스테이지 이벤트 포맷 ────────────────────────────────────────────────────
// {
//   t:            number,       // 스테이지 경과 시간(ms)에 신호 표시
//   lane:         Lane,
//   obstacleType: ObstacleType,
//   telegraphMs:  number,       // 신호 → 장애물 간격(ms)
//   isFake:       boolean,      // true면 신호만 나오고 장애물 없음
// }

// ─── 신호 인스턴스 ────────────────────────────────────────────────────────────
class SignalInstance {
  constructor(event, spawnX) {
    this.event    = event;
    this.type     = event.signalType ?? OBSTACLE_META[event.obstacleType].signalType;
    this.x        = spawnX;
    this.y        = LANE_Y[event.lane];
    this.startMs  = event.t;
    this.duration = event.telegraphMs;
    this.elapsed  = 0;
    this.done     = false;
  }

  get progress() { return Math.min(this.elapsed / this.duration, 1); }

  update(deltaMs) {
    this.elapsed += deltaMs;
    if (this.elapsed >= this.duration) this.done = true;
  }

  // 임시 렌더링: SPLASH는 펄스하는 흰 링
  render(ctx) {
    const p = this.progress;
    if (this.type === SignalType.SPLASH) {
      const radius = 16 + p * 36;
      const alpha  = 1 - p * 0.6;
      ctx.save();
      ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(this.x, this.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      // 작은 중심점
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.beginPath();
      ctx.arc(this.x, this.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (this.type === SignalType.FIN) {
      const alpha = 1 - p * 0.5;
      ctx.save();
      ctx.fillStyle = `rgba(30, 70, 110, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(this.x,      this.y - 32); // 지느러미 끝
      ctx.lineTo(this.x - 20, this.y + 12);
      ctx.lineTo(this.x + 20, this.y + 12);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else {
      // 다른 신호 타입은 임시로 노란 사각형
      ctx.save();
      ctx.fillStyle = `rgba(255,215,0,${1 - p * 0.5})`;
      ctx.fillRect(this.x - 20, this.y - 20, 40, 40);
      ctx.restore();
    }
  }
}

// ─── 장애물 인스턴스 ──────────────────────────────────────────────────────────
class ObstacleInstance {
  constructor(event, spawnX) {
    this.type    = event.obstacleType;
    this.lane    = event.lane;
    this.x       = spawnX;
    this.y       = LANE_Y[event.lane];
    this.speed   = 0;  // main.js에서 스크롤 속도와 동기화 예정
    this.active  = true;
    this.passed  = false; // 플레이어가 지나쳤는지

    const meta = OBSTACLE_META[this.type];
    this.hitboxW = meta.hitboxW;
    this.hitboxH = meta.hitboxH;
  }

  get hitbox() {
    return {
      x: this.x - this.hitboxW / 2,
      y: this.y - this.hitboxH / 2,
      w: this.hitboxW,
      h: this.hitboxH,
    };
  }

  update(deltaMs, scrollSpeed) {
    const dt = deltaMs / 1000;
    this.x -= scrollSpeed * dt; // 화면 왼쪽으로 이동
    if (this.x < -200) this.active = false;
  }

  // 임시 렌더링: FLYING_FISH 는 주황 타원
  render(ctx) {
    const { x, y, w, h } = this.hitbox;
    if (this.type === ObstacleType.FLYING_FISH) {
      ctx.save();
      ctx.fillStyle = '#ff8a3d';
      ctx.beginPath();
      ctx.ellipse(this.x, this.y, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
      // 눈
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(this.x - w / 4, this.y - 4, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else {
      // 그 외는 임시 회색 사각형
      ctx.fillStyle = '#888';
      ctx.fillRect(x, y, w, h);
    }
  }
}

// ─── ObstacleManager ─────────────────────────────────────────────────────────
export class ObstacleManager {
  constructor() {
    this._events    = [];   // 스테이지 이벤트 배열 (정렬된 원본)
    this._eventIdx  = 0;    // 다음 처리할 이벤트 인덱스
    this.signals    = [];   // 현재 활성 신호 인스턴스
    this.obstacles  = [];   // 현재 활성 장애물 인스턴스
    this._pendingObstacles = []; // { spawnAtMs, event } — stageTimer 기준 예약
    this.scrollSpeed    = 600;    // px/s (스테이지별 조정 예정)
    this._signalX       = LOGICAL_WIDTH - 240; // 화면 안 경고 위치 (플레이어 우측)
    this._obstacleSpawnX = LOGICAL_WIDTH + 100; // 화면 오른쪽 바깥에서 스폰
    this._stageDuration = 60_000; // ms
  }

  loadStage(stageData) {
    this._events           = [...stageData.events].sort((a, b) => a.t - b.t);
    this._eventIdx         = 0;
    this.signals           = [];
    this.obstacles         = [];
    this._pendingObstacles = [];
    this.scrollSpeed       = stageData.scrollSpeed    ?? 600;
    this._stageDuration    = stageData.duration       ?? 60_000;
  }

  update(deltaMs, stageTimerMs) {
    this._spawnFromScript(stageTimerMs);
    this._spawnPendingObstacles(stageTimerMs);
    this._updateSignals(deltaMs);
    this._updateObstacles(deltaMs);
    this._cleanup();
  }

  _spawnFromScript(stageTimerMs) {
    while (
      this._eventIdx < this._events.length &&
      this._events[this._eventIdx].t <= stageTimerMs
    ) {
      const raw = this._events[this._eventIdx++];

      // telegraphMs 최소 500ms 강제
      const telegraphMs = Math.max(500, raw.telegraphMs ?? 500);
      const ev = telegraphMs === raw.telegraphMs ? raw : { ...raw, telegraphMs };

      // 예고 신호 생성 (화면 안 경고 위치)
      this.signals.push(new SignalInstance(ev, this._signalX));

      // 장애물은 telegraphMs 후에 스폰 (setTimeout 대신 stageTimer 기반 큐 → 일시정지·탭 이탈 안전)
      if (!ev.isFake) {
        this._pendingObstacles.push({
          spawnAtMs: ev.t + telegraphMs,
          event:     ev,
        });
      }
    }
  }

  _spawnPendingObstacles(stageTimerMs) {
    // 큐는 spawnAtMs 순으로 push 되지만 안전하게 모든 due 이벤트 처리
    for (let i = this._pendingObstacles.length - 1; i >= 0; i--) {
      const pending = this._pendingObstacles[i];
      if (pending.spawnAtMs <= stageTimerMs) {
        this.obstacles.push(new ObstacleInstance(pending.event, this._obstacleSpawnX));
        this._pendingObstacles.splice(i, 1);
      }
    }
  }

  _updateSignals(deltaMs) {
    for (const sig of this.signals) sig.update(deltaMs);
  }

  _updateObstacles(deltaMs) {
    for (const obs of this.obstacles) obs.update(deltaMs, this.scrollSpeed);
  }

  _cleanup() {
    this.signals   = this.signals.filter(s => !s.done);
    this.obstacles = this.obstacles.filter(o => o.active);
  }

  // AABB 충돌 판정 (player.js의 hitbox 와 비교)
  checkCollision(playerHitbox) {
    for (const obs of this.obstacles) {
      if (obs.passed) continue;
      const o = obs.hitbox;
      const collided =
        playerHitbox.x < o.x + o.w &&
        playerHitbox.x + playerHitbox.w > o.x &&
        playerHitbox.y < o.y + o.h &&
        playerHitbox.y + playerHitbox.h > o.y;
      if (collided) return obs; // 충돌한 장애물 반환
    }
    return null;
  }

  // 임시 렌더링: 모든 신호와 장애물 그리기
  render(ctx) {
    for (const sig of this.signals)    sig.render(ctx);
    for (const obs of this.obstacles)  obs.render(ctx);
  }

  // 플레이어가 방금 지나친 장애물 반환 (점수 계산용)
  getJustPassed(playerX) {
    const passed = [];
    for (const obs of this.obstacles) {
      if (!obs.passed && obs.x + obs.hitboxW / 2 < playerX) {
        obs.passed = true;
        passed.push(obs);
      }
    }
    return passed;
  }
}
