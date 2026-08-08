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
  /** 경사 출처 — walkway=보행로 실측(서울), dem=위성 고도모델(서울 밖 폴백) */
  slope_source: "walkway" | "dem";
  /** 보행로 지점에 붙은 좌표 수 */
  matched_points: number;
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
  /** 실제로 자료를 가져온 날짜 — 공개 지연 때문에 요청 날짜와 다를 수 있다 */
  date: string;
  requested_date?: string;
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

/** 서울 행정동 보행 경사위험도 geojson 속성 (scripts/build_risk_geojson.py 산출) */
export interface DongRiskProps {
  name: string;
  sgg: string;
  adm_cd: string;  // 통계청(SGIS) 코드
  adm_cd2: string; // 행자부 10자리 — 생활인구는 앞 8자리
  /** 보행 경사위험도 0~100 (scripts/build_risk_geojson.py 산식) */
  risk: number | null;
  /** 보행로 지점 평균 경사(도) */
  slope_mean: number | null;
  /** 최대 경사(도) */
  slope_max: number | null;
  /** 무장애 설계기준 최대 종단경사(4.76°)를 넘는 지점의 비율 0~1 */
  exceed_ratio: number | null;
  /** 분석에 쓰인 보행로 지점 수 */
  points: number | null;
  /** ── 참고 정보 (위험도 점수 미반영) ──
   * 폭·재질은 현장 기록 기반이라 결측이 많다. *_n 은 실제 기록된 지점 수로,
   * 이 값이 작으면 평균을 믿을 수 없어 화면에서 숫자를 감춘다. */
  width_n: number;
  width_mean: number | null;
  narrow_ratio: number | null;
  surface_n: number;
  surface_top: string | null;
  slippery_ratio: number | null;
  /** 가장 가파른 보행로 지점 — 로드뷰는 중심점 대신 여기를 가리킨다.
   * 중심점은 큰길 한복판이라 평지인 경우가 많아 현장 확인에 쓸 수 없다. */
  worst_lat: number | null;
  worst_lon: number | null;
  lat: number;
  lon: number;
}

/** 자치구 보행 경사위험도 (seoul_gu_risk.geojson) — 드릴다운 1단계.
 * 행정동 값을 지점 수로 가중 평균해 만든다. */
export interface GuRiskProps {
  name: string;
  sgg: string;
  risk: number | null;
  slope_mean: number | null;
  slope_max: number | null;
  exceed_ratio: number | null;
  points: number | null;
  /** ── 참고 정보 (위험도 점수 미반영) ──
   * 폭·재질은 현장 기록 기반이라 결측이 많다. *_n 은 실제 기록된 지점 수로,
   * 이 값이 작으면 평균을 믿을 수 없어 화면에서 숫자를 감춘다. */
  width_n: number;
  width_mean: number | null;
  narrow_ratio: number | null;
  surface_n: number;
  surface_top: string | null;
  slippery_ratio: number | null;
  /** 가장 가파른 보행로 지점 — 로드뷰는 중심점 대신 여기를 가리킨다.
   * 중심점은 큰길 한복판이라 평지인 경우가 많아 현장 확인에 쓸 수 없다. */
  worst_lat: number | null;
  worst_lon: number | null;
  lat: number;
  lon: number;
}

/** GET /api/population/floating/citywide 응답 — 서울 전역 일평균 생활인구 */
export interface CitywideFloating {
  /** 실제로 자료를 가져온 날짜 (요청 날짜에 자료가 없으면 과거로 대체된다) */
  date: string;
  requested_date?: string;
  hours_used: number;
  dongs: Record<string, { avg: number; peak: number; peak_hour: number }>;
}
