/** 행정동 보행환경 위험도 구간·색 — choropleth와 대시보드 공용.
 * (Leaflet 의존 없는 순수 유틸 — SSR 번들 안전) */
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
