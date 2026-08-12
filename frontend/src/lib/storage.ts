/** 저장 계층 — 인터페이스로 분리해 두고 기본 구현은 localStorage.
 *
 * Supabase(Auth + Postgres)로 전환할 때는 SupabaseStorage 를 구현해서
 * `storage` export만 바꾸면 된다. 스키마는 supabase/schema.sql 참고.
 * (프로필 → public.profiles, 진단 레코드 → public.assessments)
 */
import type { AssessmentRecord, Profile } from "./types";

export interface AppStorage {
  getProfile(): Promise<Profile | null>;
  saveProfile(p: Profile): Promise<void>;
  getSimple(): Promise<AssessmentRecord | null>;
  saveSimple(r: AssessmentRecord): Promise<void>;
  clearSimple(): Promise<void>;
  getPrecision(): Promise<AssessmentRecord | null>;
  savePrecision(r: AssessmentRecord): Promise<void>;
  clearPrecision(): Promise<void>;
  /** 진단만 초기화 (프로필 유지) — 허브의 "기록 지우기" */
  clearAssessments(): Promise<void>;
  clearAll(): Promise<void>;
}

const KEYS = {
  profile: "ansim.profile",
  simple: "ansim.assessment.simple",
  precision: "ansim.assessment.precision",
} as const;

/** 진행 중 초안 — 설문 화면이 직접 읽고 쓴다(문항마다 저장해야 해서 여기를
 * 거치지 않는다). 다만 기록을 지울 때 남으면 "지웠는데 이어하기가 뜬다"가
 * 되므로, 삭제 목록에는 포함해 둔다. */
const DRAFT_KEYS = ["ansim.draft.simple", "ansim.draft.precision"] as const;

function read<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function remove(key: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(key);
}

class LocalStorageStorage implements AppStorage {
  async getProfile() { return read<Profile>(KEYS.profile); }
  async saveProfile(p: Profile) { write(KEYS.profile, p); }
  async getSimple() { return read<AssessmentRecord>(KEYS.simple); }
  async saveSimple(r: AssessmentRecord) { write(KEYS.simple, r); }
  async clearSimple() { remove(KEYS.simple); }
  async getPrecision() { return read<AssessmentRecord>(KEYS.precision); }
  async savePrecision(r: AssessmentRecord) { write(KEYS.precision, r); }
  async clearPrecision() { remove(KEYS.precision); }
  async clearAssessments() {
    remove(KEYS.simple);
    remove(KEYS.precision);
    DRAFT_KEYS.forEach(remove);
  }
  async clearAll() {
    Object.values(KEYS).forEach(remove);
    DRAFT_KEYS.forEach(remove);
  }
}

/* Supabase 전환 스텁 — 활성화하려면:
 * 1) supabase/schema.sql 을 프로젝트에 적용 (profiles/assessments + RLS)
 * 2) `npm i @supabase/supabase-js` 후 클라이언트 생성
 * 3) 아래 클래스를 구현하고 `storage` 를 교체
 *
 * class SupabaseStorage implements AppStorage { ... }
 */

export const storage: AppStorage = new LocalStorageStorage();
