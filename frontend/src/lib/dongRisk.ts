/** 보행 경사위험도 구간·색 — choropleth와 대시보드 공용.
 * (지도 SDK 의존 없는 순수 유틸 — SSR 번들 안전) */
import type { Level } from "./types";

/** 무장애 설계기준 종단경사 — 등급 경계의 근거 (도) */
export const SLOPE_RECOMMENDED = 2.86; // 1/20 권장
export const SLOPE_MAX = 4.76;         // 1/12 최대

/** 등급 경계. 급경사 노출이 0일 때 평균 경사가 설계기준에 닿는 지점과 일치한다.
 *  양호 <30  = 권장기준(1/20) 미만
 *  주의 30~49 = 권장기준 초과, 최대기준 이내
 *  위험 50+   = 최대기준(1/12) 초과 */
export const RISK_WARN = 30;
export const RISK_DANGER = 50;

export function riskLevel(risk: number | null): Level {
  if (risk == null) return "good";
  return risk >= RISK_DANGER ? "danger" : risk >= RISK_WARN ? "warn" : "good";
}

export function riskColor(risk: number | null): string {
  if (risk == null) return "#c9d2e0";
  return risk >= RISK_DANGER ? "#D64545" : risk >= RISK_WARN ? "#E0A800" : "#2E9E6B";
}

/** 평균 경사를 설계기준에 견준 한 줄 설명 */
export function slopeNote(slopeMean: number | null): string {
  if (slopeMean == null) return "경사 자료 없음";
  if (slopeMean >= SLOPE_MAX) return `설계기준 최대(1/12, ${SLOPE_MAX}°) 초과`;
  if (slopeMean >= SLOPE_RECOMMENDED) return `권장기준(1/20, ${SLOPE_RECOMMENDED}°) 초과`;
  return "권장기준 이내";
}

/** 기준 초과 비율(0~1)을 퍼센트 문자열로 */
export function exceedPercent(ratio: number | null): string {
  return ratio == null ? "—" : `${(ratio * 100).toFixed(1)}%`;
}
