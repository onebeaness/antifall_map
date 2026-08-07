/** 보행환경 위험도 구간·색·자료 신뢰도 — choropleth와 대시보드 공용.
 * (지도 SDK 의존 없는 순수 유틸 — SSR 번들 안전) */
import type { Level } from "./types";

/** 0–9 양호 / 10–24 주의 / 25+ 위험 (분포 p50=10, p75=20 기준) */
export function riskLevel(risk: number | null): Level {
  if (risk == null) return "good";
  return risk >= 25 ? "danger" : risk >= 10 ? "warn" : "good";
}

export function riskColor(risk: number | null): string {
  if (risk == null) return "#c9d2e0";
  return risk >= 25 ? "#D64545" : risk >= 10 ? "#E0A800" : "#2E9E6B";
}

/** 협소·재질 지수를 믿을 수 있는 최소 자료 확보율.
 *
 * 원본의 협소/재질 지수는 폭·재질이 **기록된** 지점만으로 계산된다.
 * 그 기록률이 중앙값 17%라, 확보율이 낮은 동에서는 지수가 두 방향 모두로 튄다.
 *  - 좁은 지점이 한 개도 안 잡혀 0이 된다 → "좁은 길이 없다"로 오해
 *  - 표본 몇 개 중 하나가 걸려 100이 된다 → 실제로는 성동구 금호1가동처럼
 *    폭 자료가 0건인데 협소 100으로 나오는 경우가 있다
 * 그래서 이 값 미만이면 숫자 대신 "자료 부족"으로 표시한다. */
export const MIN_COMPLETENESS = 0.1;

export function isReliable(completeness: number | null | undefined): boolean {
  return completeness != null && completeness >= MIN_COMPLETENESS;
}

/** 지수 표시용 — 자료가 부족하면 숫자 대신 null을 돌려준다. */
export function reliableIndex(
  index: number | null, completeness: number | null | undefined,
): number | null {
  return isReliable(completeness) ? index : null;
}

/** 확보율을 사람이 읽는 문구로 */
export function completenessLabel(completeness: number | null | undefined): string {
  if (completeness == null) return "자료 없음";
  return `${Math.round(completeness * 100)}% 기록`;
}
