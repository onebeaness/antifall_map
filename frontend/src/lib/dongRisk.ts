/** 보행 경사위험도 구간·색·표기 — choropleth와 대시보드 공용.
 * (지도 SDK 의존 없는 순수 유틸 — SSR 번들 안전) */
import type { Level } from "./types";

/* ── 단위: 도(°)로 통일 ──────────────────────────────────────────
 * 원본 GIS가 경사를 도로 담고, 팀 산출물·기존 앱도 도로 표기한다.
 * 화면마다 도와 %를 섞어 쓰면 "10도 기준인데 18%로 나온다"가 된다.
 * 설계기준은 1/18·1/12 같은 비율로 쓰여 있으므로, 기준을 도로 환산해
 * 비교하고 원 비율을 함께 적어 근거가 보이게 한다.
 *
 * 참고 환산:  1/18 = 5.6% = 3.2°   1/12 = 8.3% = 4.8°
 */

/** 장애인등편의법 시행규칙 별표1 — 접근로 기울기 1/18 이하(권장) */
export const SLOPE_RECOMMENDED_DEG = 3.2;
/** 같은 기준의 완화 한도 — 지형상 부득이한 경우 1/12까지 */
export const SLOPE_MAX_DEG = 4.8;

export function slopeText(deg: number | null): string {
  return deg == null ? "—" : `${deg.toFixed(1)}°`;
}

/** 도 → 기울기(%). 도로 표기가 익숙지 않은 쪽을 위해 괄호로 병기할 때 쓴다. */
export function slopePercent(deg: number | null): number | null {
  return deg == null ? null : Math.round(Math.tan((deg * Math.PI) / 180) * 1000) / 10;
}

/** 등급 경계.
 *
 * 기준 초과 비율이 0일 때 평균 경사가 설계기준에 닿는 지점과 같도록 잡았다.
 * 점수 = 100 × (0.5 × 평균경사/4.8° + 0.5 × 기준초과비율) 이므로
 *   평균 3.2°(1/18) → 33점,  평균 4.8°(1/12) → 50점.
 * 33이라는 어중간한 값은 그래서다 — 기준에서 역산한 수치다. */
export const RISK_WARN = 33;
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
export function slopeNote(deg: number | null): string {
  if (deg == null) return "경사 자료 없음";
  if (deg >= SLOPE_MAX_DEG) return `완화 한도(1/12, ${SLOPE_MAX_DEG}°) 초과`;
  if (deg >= SLOPE_RECOMMENDED_DEG) return `권장기준(1/18, ${SLOPE_RECOMMENDED_DEG}°) 초과`;
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

/** "991개 중 55개 기록 (6%)" */
export function coverageText(recorded: number | null, total: number | null): string {
  if (!total) return "기록 없음";
  const n = recorded ?? 0;
  return `${total.toLocaleString()}개 중 ${n.toLocaleString()}개 기록 (${((n / total) * 100).toFixed(0)}%)`;
}
