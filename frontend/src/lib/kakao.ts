/** 카카오맵 URL 링크 — **키·앱 등록 없이** 쓸 수 있는 공식 링크 스킴.
 * (문서: apis.map.kakao.com > URL로 링크걸기)
 *
 * 배경지도는 티맵 SDK가 담당하고, 여기서는 "현장을 눈으로 확인"하는 용도로
 * 카카오 로드뷰를 새 탭에 연다 — 국내에서 키 없이 쓸 수 있는 유일한 로드뷰라
 * 지도 엔진과 무관하게 유지한다.
 */

/** 해당 좌표의 카카오 로드뷰 열기 */
export const kakaoRoadviewUrl = (lat: number, lon: number): string =>
  `https://map.kakao.com/link/roadview/${lat},${lon}`;

/** 해당 좌표를 카카오맵 지도로 열기 (라벨 표시) */
export const kakaoMapUrl = (name: string, lat: number, lon: number): string =>
  `https://map.kakao.com/link/map/${encodeURIComponent(name)},${lat},${lon}`;

/** 지도 클릭 팝업 HTML — 요약 + 로드뷰/지도 링크 (지도 엔진 공용) */
export function mapPopupHtml(title: string, lat: number, lon: number): string {
  const link = "font-weight:700;color:#0B5394;text-decoration:underline";
  return (
    `<div style="padding:8px 12px;font-size:13px;line-height:1.6;font-family:inherit;` +
    `white-space:nowrap;background:#fff;border:1px solid #D6DEEA;border-radius:8px;` +
    `box-shadow:0 2px 8px rgba(0,0,0,.15)">` +
    `<b>${title}</b><br/>` +
    `<a href="${kakaoRoadviewUrl(lat, lon)}" target="_blank" rel="noopener" style="${link}">로드뷰 보기 ↗</a>` +
    `&nbsp;·&nbsp;` +
    `<a href="${kakaoMapUrl(title, lat, lon)}" target="_blank" rel="noopener" style="${link}">지도 ↗</a>` +
    `</div>`
  );
}
