// ─────────────────────────────────────────────────────────────────────────────
// 프로젝트 공용 타입 정의 (JSDoc 전용 — 런타임 코드 없음)
//
// 이 파일은 import 해도 아무것도 실행되지 않습니다. VS Code(TS 언어 서비스)가
// 아래 @typedef 들을 읽어 자동완성·오타 검사를 제공합니다.
// 다른 파일에서 쓰려면 상단에 한 줄만 추가하세요:
//   /** @typedef {import('./types.js').SpawnEvent} SpawnEvent */
// ─────────────────────────────────────────────────────────────────────────────

// ─── 장애물 / 신호 식별자 ─────────────────────────────────────────────────────

/** @typedef {'FLYING_FISH'|'SHARK'|'WHALE'|'JELLYFISH'|'OCTOPUS'|'LIGHTNING'} ObstacleTypeName */
/** @typedef {'SPLASH'|'FIN'|'SHADOW'|'GLOW'|'TENTACLE'|'FLASH'} SignalTypeName */
/** @typedef {'jump'|'move'} AvoidMode  점프로 넘김('jump') vs 위치 이동 강제('move') */
/** @typedef {'small'|'burst'} FlyingFishVariant */

// ─── 스폰 이벤트 (spawnPatterns.js → ObstacleManager → Signal/Obstacle) ───────

/**
 * 스테이지 스크립트의 한 이벤트. spawnPatterns.js 에 데이터로 존재하며
 * ObstacleManager 가 신호→분출 파이프라인으로 소비한다.
 * lane / yFrac 은 분출 높이, t 는 신호 시각, telegraphMs 는 분출까지 시간.
 *
 * @typedef {Object} SpawnEvent
 * @property {number} t                       신호 표시 시각(ms)
 * @property {string} obstacleType            장애물 종류 (ObstacleTypeName 중 하나)
 * @property {number} [lane]                   수직 앵커(TOP=0 / MID=1 / BOT=2). yFrac 없을 때 사용
 * @property {number} [yFrac]                  분출 높이 비율(0=마루 ~ 1=거친 바다). 있으면 lane보다 우선
 * @property {number} [telegraphMs]            신호→분출 시간(ms). 최소 500 강제
 * @property {boolean} [isFake]                true면 신호만 뜨고 장애물 없음(블러핑)
 * @property {boolean} [aimAtPlayer]           true면 신호 순간 서퍼 높이를 겨냥해 분출
 * @property {SignalTypeName} [signalType]     신호 비주얼 강제(없으면 obstacleType 기본값)
 * @property {FlyingFishVariant} [variant]      날치 변형(small=작은 날치 / burst=붉은 예고 후 큰 날치)
 * @property {boolean} [targeted]              (런타임 부여) 타겟 분출 여부
 */

// ─── 스테이지 데이터 (stages.js) ──────────────────────────────────────────────

/**
 * @typedef {Object} StageDifficulty
 * @property {number} telegraphMs        시작 telegraphMs(참고용 — 실제값은 events에 개별 지정)
 * @property {number} obstaclesPerMin    이벤트 밀도
 * @property {number} fakeSignalRate     가짜 신호 비율
 * @property {number} compoundRate       복합 신호 비율
 * @property {boolean} [nightMode]        야간(신호 가시성 저하)
 * @property {boolean} [screenShake]      상시 화면 흔들림
 * @property {number} [balanceWipeoutAt]  와이프아웃 임계값(기본 BALANCE.WIPEOUT_AT)
 */

/**
 * @typedef {Object} StageData
 * @property {number} id                 1-indexed 스테이지 번호
 * @property {string} name               해역 이름
 * @property {string} theme              배경 테마 키
 * @property {number} duration           목표 시간(ms)
 * @property {number} scrollSpeed        배경 스크롤 속도(px/s)
 * @property {StageDifficulty} difficulty
 * @property {SpawnEvent[]} events        스테이지 스크립트
 */

// ─── 점수 리포트 (score.js → ResultScene / HUDScene) ──────────────────────────

/**
 * 점수 항목별 누적. 키는 score.js 의 ScoreEvent 값과 1:1.
 * @typedef {Object} ScoreBreakdown
 * @property {number} SURVIVAL
 * @property {number} DODGE
 * @property {number} NEAR_MISS
 * @property {number} PERFECT_JUMP
 * @property {number} COMBO_BONUS
 * @property {number} DANGER_LANE
 * @property {number} GOLDEN_FISH
 * @property {number} WEATHER_BONUS
 * @property {number} STAGE_CLEAR
 */

/**
 * ScoreManager.getSummary() 의 반환 — 결과/HUD 화면이 소비.
 * @typedef {Object} ScoreSummary
 * @property {number} total
 * @property {number} combo
 * @property {number} maxCombo
 * @property {number} maxComboMultiplier
 * @property {number} perfectJumps
 * @property {number} nearMisses
 * @property {number} dangerSeconds
 * @property {number} goldenFish
 * @property {ScoreBreakdown} breakdown
 */

// ─── 저장 데이터 (storage.js / localStorage) ──────────────────────────────────

/**
 * @typedef {Object} StageProgress
 * @property {number} id
 * @property {number} stars       0~3
 * @property {number} highScore
 * @property {boolean} cleared
 */

/**
 * @typedef {Object} GameSettings
 * @property {number} bgmVolume                0~1
 * @property {number} sfxVolume                0~1
 * @property {'high'|'medium'|'low'} quality
 */

/**
 * @typedef {Object} SaveData
 * @property {number} currentStage             현재 진행 해역 인덱스(0-indexed)
 * @property {StageProgress[]} unlockedStages
 * @property {number} globalHighScore
 * @property {GameSettings} settings
 * @property {boolean} tutorialCompleted
 * @property {number|null} lastPlayedTime      Date.now()
 */

// ─── 씬 전환 페이로드 ─────────────────────────────────────────────────────────

/**
 * MainMenu/WorldMap/Result → GameScene 진입 데이터.
 * @typedef {Object} GameSceneInit
 * @property {number} stageIndex   0-indexed
 */

/**
 * 피격한 장애물의 최소 정보(결과 화면 표시용).
 * @typedef {Object} ObstacleHit
 * @property {ObstacleTypeName} type
 */

/**
 * GameScene → ResultScene 전환 데이터.
 * @typedef {Object} ResultScenePayload
 * @property {boolean} cleared
 * @property {number} stageIndex
 * @property {ScoreSummary} summary
 * @property {number} [prevHigh]
 * @property {ObstacleHit|null} [hitObstacle]
 * @property {'collision'|'wipeout'} [cause]
 * @property {number} [timeRemain]
 * @property {number} [stars]               클리어 시 별 개수(1~3)
 * @property {import('./storage.js').StorageManager} storage
 */

export {};
