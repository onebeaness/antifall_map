/** 카카오맵 URL 링크 — API 키 없이 쓸 수 있는 공식 링크 스킴.
 * (문서: apis.map.kakao.com > URL로 링크걸기)
 * 임베드형 로드뷰가 필요해지면 Kakao Maps JS SDK(appkey 필요)로 교체 지점.
 */

/** 해당 좌표의 카카오 로드뷰 열기 */
export const kakaoRoadviewUrl = (lat: number, lon: number): string =>
  `https://map.kakao.com/link/roadview/${lat},${lon}`;

/** 해당 좌표를 카카오맵 지도로 열기 (라벨 표시) */
export const kakaoMapUrl = (name: string, lat: number, lon: number): string =>
  `https://map.kakao.com/link/map/${encodeURIComponent(name)},${lat},${lon}`;
