// 사운드 매니저 — Phaser 비의존 standalone(DOM 메뉴/캔버스 어디서나 동일 호출).
//  · SFX: Web Audio(AudioContext) 버퍼 재생 — 저지연·중첩 가능. 부팅 시 미리 디코드.
//  · BGM: HTMLAudioElement 루프 + 짧은 페이드 전환.
//  · 자동재생 정책: 첫 사용자 제스처(클릭/키) 전엔 소리 못 냄 → 언락 후 대기 중인 BGM 자동 시작.
//  · 볼륨: localStorage 설정(bgmVolume/sfxVolume)에서 시드, 변경 시 안전하게 되쓰기.
//  · 파일 누락/디코드 실패/정책 차단에도 절대 throw 하지 않음(게임 흐름 우선).

import { StorageManager } from './storage.js';

const SFX = {
  click:    '/audio/sfx-click.wav',
  back:     '/audio/sfx-back.wav',
  jump:     '/audio/sfx-jump.wav',
  perfect:  '/audio/sfx-perfect.wav',
  near:     '/audio/sfx-near.wav',
  pickup:   '/audio/sfx-pickup.wav',
  wave:     '/audio/sfx-wave.wav',
  barrel:   '/audio/sfx-barrel.wav',
  hit:      '/audio/sfx-hit.wav',
  wipeout:  '/audio/sfx-wipeout.wav',
  gameover: '/audio/sfx-gameover.wav',
  clear:    '/audio/sfx-clear.wav',
};

const BGM = {
  menu:   '/audio/bgm-menu.ogg',
  stage1: '/audio/bgm-stage-1.ogg',
  stage2: '/audio/bgm-stage-2.ogg',
  stage3: '/audio/bgm-stage-3.ogg',
  clear:  '/audio/bgm-clear.ogg',
};

// 스테이지 인덱스(0-based) → BGM 키. 1~3구역=stage1, 4~6=stage2, 7~10=stage3.
export function bgmForStage(stageIndex) {
  const i = Number(stageIndex) || 0;
  if (i <= 2) return 'stage1';
  if (i <= 5) return 'stage2';
  return 'stage3';
}

class AudioManager {
  constructor() {
    this._ctx        = null;
    this._buffers    = new Map();   // key -> AudioBuffer
    this._sfxVol     = 1.0;
    this._bgmVol     = 0.7;
    this._muted      = false;
    this._unlocked   = false;
    this._inited     = false;
    this._pendingBgm = null;        // 언락 전 요청된 BGM 키
    this._bgmKey     = null;
    this._bgmEl      = null;        // 현재 재생 중인 <audio>
    this._fadeTimers = new Map();   // el -> intervalId (진행 중 페이드)
  }

  // 앱 부팅 시 1회. 볼륨 시드 + SFX 디코드 시작 + 언락 리스너 설치.
  init() {
    if (this._inited) return;
    this._inited = true;
    try {
      const s = new StorageManager().settings;   // 읽기 전용(저장 안 함) → 진행데이터 안 건드림
      if (s) {
        this._bgmVol = clamp01(s.bgmVolume ?? 0.7);
        this._sfxVol = clamp01(s.sfxVolume ?? 1.0);
      }
    } catch { /* 무시 */ }

    this._ensureCtx();
    this._preloadSfx();

    const unlock = () => {
      this._unlocked = true;
      try { this._ctx?.resume(); } catch { /* 무시 */ }
      if (this._pendingBgm) { const k = this._pendingBgm; this._pendingBgm = null; this.playBgm(k); }
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
  }

  _ensureCtx() {
    if (this._ctx) return this._ctx;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this._ctx = Ctx ? new Ctx() : null;
    } catch { this._ctx = null; }
    return this._ctx;
  }

  // SFX 전부 fetch+decode(작은 wav들). 정지(suspended) 컨텍스트에서도 디코드 가능 → 첫 클릭 즉시 소리.
  async _preloadSfx() {
    const ctx = this._ctx;
    if (!ctx) return;
    await Promise.all(Object.entries(SFX).map(async ([key, url]) => {
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const buf = await res.arrayBuffer();
        const decoded = await ctx.decodeAudioData(buf);
        this._buffers.set(key, decoded);
      } catch { /* 파일 누락/디코드 실패 무시 */ }
    }));
  }

  // ── 효과음 ──────────────────────────────────────────────────────────────────
  // rate: 재생 속도(피치). volume: 이벤트별 가중(0~1).
  playSfx(key, { volume = 1, rate = 1 } = {}) {
    if (this._muted || this._sfxVol <= 0) return;
    const ctx = this._ctx;
    const buf = this._buffers.get(key);
    if (!ctx || !buf || ctx.state !== 'running') return;   // 언락 전이면 조용히 패스
    try {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate;
      const g = ctx.createGain();
      g.gain.value = clamp01(this._sfxVol * volume);
      src.connect(g).connect(ctx.destination);
      src.start(0);
    } catch { /* 무시 */ }
  }

  // ── 배경음 ──────────────────────────────────────────────────────────────────
  // 같은 트랙이면 무시. 다르면 이전 곡 페이드아웃 후 새 곡 페이드인.
  playBgm(key, { fade = true } = {}) {
    if (!BGM[key]) return;
    if (this._bgmKey === key && this._bgmEl) return;
    this._bgmKey = key;
    if (!this._unlocked) { this._pendingBgm = key; return; }   // 언락되면 자동 시작

    const prev = this._bgmEl;
    const next = new Audio(BGM[key]);
    next.loop = true;
    next.volume = 0;
    this._bgmEl = next;

    const target = this._muted ? 0 : this._bgmVol;
    const play = next.play();
    if (play && typeof play.catch === 'function') play.catch(() => { /* 정책 차단 무시 */ });

    if (fade) {
      this._fade(next, 0, target, 420);
      if (prev) this._fade(prev, prev.volume, 0, 380, () => { try { prev.pause(); } catch {} });
    } else {
      next.volume = target;
      if (prev) { try { prev.pause(); } catch {} }
    }
  }

  stopBgm({ fade = true } = {}) {
    this._bgmKey = null;
    this._pendingBgm = null;
    const el = this._bgmEl;
    if (!el) return;
    this._bgmEl = null;
    if (fade) this._fade(el, el.volume, 0, 380, () => { try { el.pause(); } catch {} });
    else { try { el.pause(); } catch {} }
  }

  // setInterval 기반 볼륨 램프 — rAF와 달리 비가시 탭에서도 진행돼 항상 목표값에 도달한다.
  _fade(el, from, to, ms, done) {
    this._clearFade(el);
    const steps = Math.max(1, Math.round(ms / 30));
    let i = 0;
    try { el.volume = clamp01(from); } catch { /* detached */ }
    const id = setInterval(() => {
      i += 1;
      const t = i / steps;
      try { el.volume = clamp01(from + (to - from) * t); } catch { /* detached */ }
      if (i >= steps) { this._clearFade(el); done?.(); }
    }, 30);
    this._fadeTimers.set(el, id);
  }

  _clearFade(el) {
    const id = this._fadeTimers.get(el);
    if (id) { clearInterval(id); this._fadeTimers.delete(el); }
  }

  // ── 볼륨/뮤트 ───────────────────────────────────────────────────────────────
  get bgmVolume() { return this._bgmVol; }
  get sfxVolume() { return this._sfxVol; }
  get muted()     { return this._muted; }

  setBgmVolume(v, { persist = true } = {}) {
    this._bgmVol = clamp01(v);
    if (this._bgmEl) {
      this._clearFade(this._bgmEl);   // 진행 중 페이드보다 사용자 조절을 우선
      if (!this._muted) { try { this._bgmEl.volume = this._bgmVol; } catch {} }
    }
    if (persist) this._persist({ bgmVolume: this._bgmVol });
  }

  setSfxVolume(v, { persist = true } = {}) {
    this._sfxVol = clamp01(v);
    if (persist) this._persist({ sfxVolume: this._sfxVol });
  }

  setMuted(m) {
    this._muted = !!m;
    if (this._bgmEl) { try { this._bgmEl.volume = this._muted ? 0 : this._bgmVol; } catch {} }
  }

  toggleMuted() { this.setMuted(!this._muted); return this._muted; }

  // 변경 시점에 새 StorageManager 로 read-modify-write → 다른 인스턴스의 진행데이터 보존
  _persist(partial) {
    try { new StorageManager().updateSettings(partial); } catch { /* private mode 무시 */ }
  }
}

function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

// 싱글턴
export const audio = new AudioManager();
