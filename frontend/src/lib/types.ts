/** 공용 타입 — 백엔드 API 계약(IA.md 3절)과 클라이언트 상태. */

export type Gender = "M" | "F";
export type Level = "danger" | "warn" | "good";

/** 등록 프로필 (HANDOFF 4절: 클라이언트 state 유지) */
export interface Profile {
  name: string;
  birth: string; // YYYYMMDD 8자리
  gender: Gender;
  /** 최근 1년 낙상 경험 — ML Model B(재발위험) 게이트 */
  fallExperience: boolean;
}

/** 설문 응답: 문항 코드 → 값 (예: S1:"F", S2:78, E1:["고혈압"], G1:0) */
export type Answers = Record<string, string | number | string[]>;

export interface Contributor {
  feature: string;
  label: string;
  value: number;
  direction: "up" | "down";
}

/** POST /api/assess/* 응답 */
export interface AssessResult {
  prob_a: number;
  pct_a: number;
  label_a: string;
  threshold_a: number;
  contributors: Contributor[];
  fall_experience: boolean;
  prob_b?: number;
  pct_b?: number;
  label_b?: string;
  threshold_b?: number;
}

/** 저장되는 진단 레코드 (응답 + ML 결과 + 저장 시각) */
export interface AssessmentRecord {
  answers: Answers;
  /** ML 결과 — 백엔드 미연결 시 null(휴리스틱 폴백 표시) */
  result: AssessResult | null;
  savedAt: string; // ISO
}

export interface Poi {
  name: string;
  address: string;
  lat: number;
  lon: number;
}

/** POST /api/route 응답 */
export interface RouteResult {
  route_points: [number, number][];
  points: [number, number][];
  distances: number[];
  elevations: number[];
  slopes: number[];
  total_distance_m: number;
  total_time_s: number;
}

/** GET /api/weather 응답 */
export interface WeatherInfo {
  date: string;
  description: string;
  code: number | null;
  t_max: number | null;
  t_min: number | null;
  precipitation_mm: number;
  precipitation_prob: number | null;
  wind_max_kmh: number | null;
  is_past: boolean;
  risk_level: Level;
  advice: string;
  source: string;
}

/** GET /api/population/dong 응답 항목 (SGIS 총조사 주요지표) */
export interface DongPopulation {
  adm_cd: string;
  adm_nm: string;
  tot_ppltn: number | null;
  /** 인구밀도 (명/㎢) */
  ppltn_dnsty: number | null;
  avg_age: number | null;
  /** 노령화지수 (고령인구/유소년인구 × 100) */
  aged_child_idx: number | null;
  tot_house: number | null;
}

/** GET /api/population/floating 응답 (서울 생활인구, 시간대별) */
export interface FloatingPopulation {
  adm_cd: string;
  date: string;
  hours: number[];
  values: number[];
}

/** GET /api/map/config 응답 */
export interface MapConfig {
  provider: "vworld" | "osm";
  tile_url: string;
  attribution: string;
  max_zoom: number;
}
