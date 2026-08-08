/** 보행 경사위험도 구간·색·표기 — choropleth와 대시보드 공용.
 * (지도 SDK 의존 없는 순수 유틸 — SSR 번들 안전) */
import type { Level } from "./types";

/** 경사각(도) → 기울기(%).
 *
 * 원본 GIS는 경사를 도(°)로 담지만 화면 표기는 전부 %로 통일한다.
 * 무장애 설계기준이 1/12·1/20 같은 비율로 쓰여 있어 %가 바로 대응되고
 * (1/12 = 8.3%), 경로 화면도 %를 쓴다. 도와 %를 섞어 쓰면
 * "10도 기준인데 18%로 나온다"처럼 읽는 사람이 혼란스럽다. */
export function slopePercent(deg: number | null): number | null {
  return deg == null ? null : Math.round(Math.tan((deg * Math.PI) / 180) * 1000) / 10;
}

export function slopeText(deg: number | null): string {
  const pct = slopePercent(deg);
  return pct == null ? "—" : `${pct.toFixed(1)}%`;
}

/** 무장애 설계기준 종단경사 — 등급 경계의 근거 */
export const SLOPE_RECOMMENDED_PCT = 5.0; // 1/20 권장
export const SLOPE_MAX_PCT = 8.3;         // 1/12 최대

/** 등급 경계. 기준 초과 비율이 0일 때 평균 경사가 설계기준에 닿는 지점과 같다.
 *  양호 <30  = 권장 1/20 미만
 *  주의 30~49 = 권장 초과, 최대 이내
 *  위험 50+   = 최대 1/12 초과 */
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
export function slopeNote(slopeMeanDeg: number | null): string {
  const pct = slopePercent(slopeMeanDeg);
  if (pct == null) return "경사 자료 없음";
  if (pct >= SLOPE_MAX_PCT) return `설계기준 최대(1/12, ${SLOPE_MAX_PCT}%) 초과`;
  if (pct >= SLOPE_RECOMMENDED_PCT) return `권장기준(1/20, ${SLOPE_RECOMMENDED_PCT}%) 초과`;
  return "권장기준 이내";
}

/** 비율(0~1)을 퍼센트 문자열로 */
export function ratioText(ratio: number | null): string {
  return ratio == null ? "—" : `${(ratio * 100).toFixed(1)}%`;
}

/** 폭·재질을 믿고 보여줄 최소 기록 지점 수.
 *
 * 두 값은 현장에서 직접 기록해야 하는 정보라 결측이 많다(생활 보행로 기준
 * 폭 26.7%, 재질 32.6%). 몇 개뿐인 표본으로 낸 평균은 크게 흔들리므로
 * 이 수 미만이면 숫자 대신 표본이 부족하다는 사실을 알린다.
 * 같은 이유로 두 값은 위험도 점수에 넣지 않는다 — 참고 정보다. */
export const MIN_RECORDED = 10;

export function hasEnough(recorded: number | null | undefined): boolean {
  return (recorded ?? 0) >= MIN_RECORDED;
}

/** "991개 중 55개 기록 (5.5%)" */
export function coverageText(recorded: number | null, total: number | null): string {
  if (!total) return "기록 없음";
  const n = recorded ?? 0;
  return `${total.toLocaleString()}개 중 ${n.toLocaleString()}개 기록 (${((n / total) * 100).toFixed(0)}%)`;
}
