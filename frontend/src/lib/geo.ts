/** 경사도 색상 매핑 — 원본 utils/geo.py 의 구간·색상과 동일. */

/* 경사 표기는 도(°)로 통일한다 — 대시보드·원본 GIS와 같은 단위.
 * 구간 경계는 장애인등편의법 시행규칙 별표1의 접근로 기울기에서 가져왔다.
 *   1/18 = 3.2°(권장)   1/12 = 4.8°(완화 한도)
 * 그보다 가파른 구간은 8°·12°로 한 번 더 나눠 실제 언덕을 구분한다. */
export const SLOPE_BINS = [3.2, 4.8, 8.0, 12.0];
export const SLOPE_COLORS = ["#2b83ba", "#abdda4", "#ffffbf", "#fdae61", "#d7191c"];
export const SLOPE_LABELS = [
  "0~3.2° 권장기준 이내",
  "3.2~4.8° 권장 초과",
  "4.8~8° 완화 한도 초과",
  "8~12° 가파름",
  "12°~ 매우 가파름",
];

/** 기울기(%) → 경사각(도). 백엔드는 %로 내려주고 화면은 도로 보여준다. */
export function percentToDegrees(pct: number): number {
  return (Math.atan(pct / 100) * 180) / Math.PI;
}

/** 구간 색 — 인자는 백엔드가 주는 기울기(%). 내부에서 도로 바꿔 비교한다. */
export function slopeColor(slopePct: number): string {
  const s = Math.abs(percentToDegrees(slopePct));
  for (let i = 0; i < SLOPE_BINS.length; i++) {
    if (s < SLOPE_BINS[i]) return SLOPE_COLORS[i];
  }
  return SLOPE_COLORS[SLOPE_COLORS.length - 1];
}
