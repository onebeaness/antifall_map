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

/** GET /api/weather/warnings 응답 항목 (기상청 특보) */
export interface WeatherWarning {
  region_group: string;
  region: string;
  effective: string;
  type_code: string;
  type: string; // 대설·한파·호우 등
  level: string;
  level_name: string; // 주의보/경보
  relevance: "danger" | "warn" | "info";
}

/** GET /api/safety/lights 응답 (보안등 밀도) */
export interface LightsResult {
  count: number;
  radius_m: number;
  scanned: number;
  total_in_filter: number | null;
  truncated: boolean;
  sample: { lat: number; lon: number; addr: string }[];
}

/** 서울 행정동 보행환경 geojson 속성 (팀 분석 산출물, 번들 자산) */
export interface DongRiskProps {
  name: string;
  sgg: string;
  adm_cd: string;  // 통계청(SGIS) 코드
  adm_cd2: string; // 행자부 10자리 — 생활인구는 앞 8자리
  risk: number | null;       // 환경위험도 0~100
  slope_idx: number | null;  // 경사 지수 0~100
  narrow_idx: number | null; // 협소 지수 0~100
  surface_idx: number | null; // 재질 지수 0~100
  factor: string | null;     // 주요위험요인 (경사/협소/재질)
  slope_mean: number | null;
  slope_max: number | null;
  steep_ratio: number | null;
  width_mean: number | null;
  lat: number;
  lon: number;
}

/** GET /api/population/floating/citywide 응답 — 서울 전역 일평균 생활인구 */
export interface CitywideFloating {
  date: string;
  hours_used: number;
  dongs: Record<string, { avg: number; peak: number; peak_hour: number }>;
}
