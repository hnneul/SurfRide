const STORAGE_KEY = 'surfride_save';
const MAX_STAGE_ID = 10;
const MAX_STAGE_INDEX = MAX_STAGE_ID - 1;

// ─── 저장 데이터 스키마 ──────────────────────────────────────────────────────
// {
//   currentStage:    number,           // 현재 진행 해역 인덱스 (0-indexed)
//   unlockedStages:  [                 // 해역별 진행 상황
//     { id, stars, highScore, cleared }
//   ],
//   globalHighScore: number,
//   settings: {
//     bgmVolume:    number,  // 0~1
//     sfxVolume:    number,  // 0~1
//     quality:      'high' | 'medium' | 'low',
//   },
//   tutorialCompleted: boolean,
//   lastPlayedTime:    number,         // Date.now()
// }

const DEFAULT_SAVE = {
  currentStage: 0,
  unlockedStages: [
    { id: 1, stars: 0, highScore: 0, cleared: false },
  ],
  globalHighScore: 0,
  settings: {
    bgmVolume: 0.7,
    sfxVolume: 1.0,
    quality:   'high',
  },
  tutorialCompleted: false,
  lastPlayedTime:    null,
};

// ─── StorageManager ──────────────────────────────────────────────────────────
export class StorageManager {
  constructor() {
    this._data = this.load() ?? this._defaultData();
  }

  _defaultData() {
    return JSON.parse(JSON.stringify(DEFAULT_SAVE));
  }

  // 로컬 스토리지에서 로드. 손상 시 초기값 반환
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return this._migrate(parsed);
    } catch {
      return null;
    }
  }

  save() {
    try {
      this._data.lastPlayedTime = Date.now();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._data));
    } catch {
      // localStorage 쓰기 실패 시 무시 (Private Browsing 등)
    }
  }

  // 스키마 버전 변경 시 마이그레이션 훅
  _migrate(data) {
    const base = this._defaultData();
    const source = data && typeof data === 'object' ? data : {};
    const settings = source.settings && typeof source.settings === 'object'
      ? { ...base.settings, ...source.settings }
      : base.settings;

    return {
      ...base,
      ...source,
      currentStage: this._clampStageIndex(source.currentStage),
      unlockedStages: this._normalizeUnlockedStages(source.unlockedStages),
      globalHighScore: this._toNonNegativeInt(source.globalHighScore),
      settings,
      tutorialCompleted: Boolean(source.tutorialCompleted),
      lastPlayedTime: Number.isFinite(source.lastPlayedTime) ? source.lastPlayedTime : null,
    };
  }

  // ─── 진행 상황 업데이트 ──────────────────────────────────────────────────
  setCurrentStage(stageIndex) {
    this._data.currentStage = this._clampStageIndex(stageIndex);
    this.save();
  }

  recordStageAttempt(stageId, score) {
    const safeStageId = this._clampStageId(stageId);
    const safeScore = this._toNonNegativeInt(score);
    let entry = this._data.unlockedStages.find(s => s.id === safeStageId);
    if (!entry) {
      entry = { id: safeStageId, stars: 0, highScore: 0, cleared: false };
      this._data.unlockedStages.push(entry);
    }

    entry.highScore = Math.max(entry.highScore, safeScore);
    this._data.globalHighScore = Math.max(this._data.globalHighScore, safeScore);
    this.save();
  }

  updateStageResult(stageId, score, stars) {
    const safeStageId = this._clampStageId(stageId);
    const safeScore = this._toNonNegativeInt(score);
    const safeStars = this._clampStars(stars);
    let entry = this._data.unlockedStages.find(s => s.id === safeStageId);
    if (!entry) {
      entry = { id: safeStageId, stars: 0, highScore: 0, cleared: false };
      this._data.unlockedStages.push(entry);
    }
    entry.cleared   = true;
    entry.stars     = Math.max(entry.stars, safeStars);
    entry.highScore = Math.max(entry.highScore, safeScore);

    // 다음 스테이지 해금
    const nextId = safeStageId + 1;
    if (nextId <= MAX_STAGE_ID && !this._data.unlockedStages.find(s => s.id === nextId)) {
      this._data.unlockedStages.push({ id: nextId, stars: 0, highScore: 0, cleared: false });
    }

    this._data.currentStage = this._clampStageIndex(nextId - 1);
    this._data.globalHighScore = Math.max(this._data.globalHighScore, safeScore);

    this.save();
  }

  markTutorialComplete() {
    this._data.tutorialCompleted = true;
    this.save();
  }

  isStageUnlocked(stageId) {
    return !!this._data.unlockedStages.find(s => s.id === stageId);
  }

  getHighScore(stageId) {
    return this._data.unlockedStages.find(s => s.id === stageId)?.highScore ?? 0;
  }

  get settings() { return this._data.settings; }
  get tutorialCompleted() { return this._data.tutorialCompleted; }
  get currentStage() { return this._data.currentStage; }
  get globalHighScore() { return this._data.globalHighScore; }

  // 설정 부분 업데이트
  updateSettings(partial) {
    if (!partial || typeof partial !== 'object') return;
    Object.assign(this._data.settings, partial);
    this.save();
  }

  // 전체 초기화
  reset() {
    this._data = this._defaultData();
    localStorage.removeItem(STORAGE_KEY);
  }

  _normalizeUnlockedStages(stages) {
    const source = Array.isArray(stages) ? stages : [];
    const byId = new Map([[1, { id: 1, stars: 0, highScore: 0, cleared: false }]]);

    for (const item of source) {
      if (!item || typeof item !== 'object') continue;
      const id = this._clampStageId(item.id);
      const prev = byId.get(id) ?? { id, stars: 0, highScore: 0, cleared: false };
      byId.set(id, {
        id,
        stars: Math.max(prev.stars, this._clampStars(item.stars)),
        highScore: Math.max(prev.highScore, this._toNonNegativeInt(item.highScore)),
        cleared: prev.cleared || Boolean(item.cleared),
      });
    }

    return [...byId.values()].sort((a, b) => a.id - b.id);
  }

  _clampStageIndex(value) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) return 0;
    return Math.max(0, Math.min(MAX_STAGE_INDEX, parsed));
  }

  _clampStageId(value) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) return 1;
    return Math.max(1, Math.min(MAX_STAGE_ID, parsed));
  }

  _clampStars(value) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) return 0;
    return Math.max(0, Math.min(3, parsed));
  }

  _toNonNegativeInt(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.floor(parsed));
  }
}
