/** 경사도 색상 매핑 — 원본 utils/geo.py 의 구간·색상과 동일. */

export const SLOPE_BINS = [3.0, 6.0, 9.0, 12.0];
export const SLOPE_COLORS = ["#2b83ba", "#abdda4", "#ffffbf", "#fdae61", "#d7191c"];
export const SLOPE_LABELS = ["0~3% (평지)", "3~6% (완만)", "6~9% (보통)", "9~12% (가파름)", "12%~ (매우 가파름)"];

export function slopeColor(slopePct: number): string {
  const s = Math.abs(slopePct);
  for (let i = 0; i < SLOPE_BINS.length; i++) {
    if (s < SLOPE_BINS[i]) return SLOPE_COLORS[i];
  }
  return SLOPE_COLORS[SLOPE_COLORS.length - 1];
}
