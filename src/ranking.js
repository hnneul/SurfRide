// Supabase 온라인 랭킹 데이터 레이어 — 점수 등록 / 스테이지별 상위 점수 조회 + 닉네임 관리.
// Supabase 클라이언트는 index.html 에서 CDN(UMD)으로 불러온 전역 `window.supabase` 를 사용한다(npm 패키지 X).
// 네트워크/CDN 실패가 게임 흐름을 막지 않도록, 모든 함수는 throw 하지 않고 안전한 기본값을 반환한다.

// publishable(anon) 키 — 브라우저 노출용으로 설계된 공개 키. 접근은 테이블 RLS 로 제한된다.
const SUPABASE_URL = 'https://ghyiktaviconotxhckpo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_LeSj1mAUU2j6dEWGSRbPVA_4tSIjteD';

const TABLE        = 'rankings';                 // 컬럼: id(uuid) · stage(int) · nickname(text) · score(int) · created_at(timestamp)
const NICKNAME_KEY = 'surfride_nickname';
export const NICKNAME_MAX = 12;

let _client;   // 지연 초기화 싱글턴 (undefined=미시도, null=사용불가, object=클라이언트)

// CDN 전역에서 클라이언트를 1회 생성. window.supabase 가 없거나 생성에 실패하면 null.
function client() {
  if (_client !== undefined) return _client;
  try {
    const lib = typeof window !== 'undefined' ? window.supabase : null;
    _client = lib && typeof lib.createClient === 'function'
      ? lib.createClient(SUPABASE_URL, SUPABASE_KEY)
      : null;
  } catch {
    _client = null;
  }
  if (!_client) console.warn('[ranking] Supabase 클라이언트를 사용할 수 없습니다 (CDN 로드 실패?).');
  return _client;
}

// 온라인 랭킹 사용 가능 여부 — UI 가 오프라인 안내를 띄울 때 참고.
export function isAvailable() {
  return !!client();
}

// ─── 닉네임 (localStorage) ───────────────────────────────────────────────────
export function getNickname() {
  try {
    const v = localStorage.getItem(NICKNAME_KEY);
    return v && v.trim() ? v : null;
  } catch {
    return null;
  }
}

export function hasNickname() {
  return !!getNickname();
}

// 공백 정리 + 최대 길이 제한. 빈 문자열이면 '' 반환(저장 안 함의 신호).
export function sanitizeNickname(name) {
  return String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, NICKNAME_MAX);
}

// 닉네임 저장. 정리 후 빈 값이면 저장하지 않고 null, 성공 시 저장된 문자열 반환.
export function setNickname(name) {
  const clean = sanitizeNickname(name);
  if (!clean) return null;
  try { localStorage.setItem(NICKNAME_KEY, clean); } catch { /* private mode: 무시 */ }
  return clean;
}

// ─── 점수 등록 / 조회 ─────────────────────────────────────────────────────────
// 결과 화면에서 자동 호출. 닉네임/클라이언트 없거나 점수 0 이하면 등록 생략. 성공 true / 그 외 false.
export async function submitScore(stage, score) {
  const c        = client();
  const nickname = getNickname();
  const s        = Math.max(0, Math.floor(Number(score) || 0));
  if (!c || !nickname || s <= 0) return false;
  try {
    const { error } = await c.from(TABLE).insert({ stage: Number(stage), nickname, score: s });
    if (error) { console.warn('[ranking] 점수 등록 실패:', error.message); return false; }
    return true;
  } catch (e) {
    console.warn('[ranking] 점수 등록 예외:', e);
    return false;
  }
}

// 스테이지별 상위 N개(기본 10). 동점은 먼저 기록한 사람이 위. 실패 시 빈 배열.
// 각 항목: { nickname, score, created_at }
export async function fetchTopScores(stage, limit = 10) {
  const c = client();
  if (!c) return [];
  try {
    const { data, error } = await c
      .from(TABLE)
      .select('nickname,score,created_at')
      .eq('stage', Number(stage))
      .order('score', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(limit);
    if (error) { console.warn('[ranking] 랭킹 조회 실패:', error.message); return []; }
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn('[ranking] 랭킹 조회 예외:', e);
    return [];
  }
}
