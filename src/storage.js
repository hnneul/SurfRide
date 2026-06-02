const STORAGE_KEY = 'surfride_save';

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
    // 기존 데이터에 없는 필드를 기본값으로 채움
    return { ...this._defaultData(), ...data };
  }

  // ─── 진행 상황 업데이트 ──────────────────────────────────────────────────
  setCurrentStage(stageIndex) {
    this._data.currentStage = stageIndex;
    this.save();
  }

  updateStageResult(stageId, score, stars) {
    let entry = this._data.unlockedStages.find(s => s.id === stageId);
    if (!entry) {
      entry = { id: stageId, stars: 0, highScore: 0, cleared: false };
      this._data.unlockedStages.push(entry);
    }
    entry.cleared   = true;
    entry.stars     = Math.max(entry.stars, stars);
    entry.highScore = Math.max(entry.highScore, score);

    // 다음 스테이지 해금
    const nextId = stageId + 1;
    if (nextId <= 10 && !this._data.unlockedStages.find(s => s.id === nextId)) {
      this._data.unlockedStages.push({ id: nextId, stars: 0, highScore: 0, cleared: false });
    }

    if (score > this._data.globalHighScore) {
      this._data.globalHighScore = score;
    }

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
    Object.assign(this._data.settings, partial);
    this.save();
  }

  // 전체 초기화
  reset() {
    this._data = this._defaultData();
    localStorage.removeItem(STORAGE_KEY);
  }
}
