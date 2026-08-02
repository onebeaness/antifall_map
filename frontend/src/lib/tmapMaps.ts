/** 티맵(TMap) JavaScript API v2 로더.
 *
 * 배경지도는 티맵 단독이다. NEXT_PUBLIC_TMAP_APP_KEY가 없거나 SDK 로드에
 * 실패하면 각 지도 컴포넌트가 안내 패널(MapUnavailable)을 대신 표시한다.
 *
 * ⚠️ 백엔드의 TMAP_APP_KEY(POI·경로 REST 호출용)와 **다른 키**를 써야 한다.
 * 이 값은 브라우저 번들에 노출되므로, 백엔드 키를 그대로 넣으면 제3자가
 * 그 키로 경로 API를 호출해 할당량을 소진시킬 수 있다.
 * openapi.sk.com에서 앱을 하나 더 만들어 JS API 전용 appKey를 발급하고,
 * 해당 앱에 서비스 도메인을 등록한 뒤 그 키를 여기에 넣는다.
 */

export const TMAP_APP_KEY = process.env.NEXT_PUBLIC_TMAP_APP_KEY ?? "";
export const hasTmapKey = TMAP_APP_KEY.length > 0;

/* SDK 전역 타입 — 공식 타입 패키지가 없어 최소한으로 선언 */
declare global {
  interface Window {
    Tmapv2?: TmapNs;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TmapNs = any;

let loading: Promise<TmapNs> | null = null;

/** SDK를 1회만 로드. 실패(키 오류·도메인 미등록·네트워크)하면 reject. */
export function loadTmap(timeoutMs = 8000): Promise<TmapNs> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  if (!hasTmapKey) return Promise.reject(new Error("NEXT_PUBLIC_TMAP_APP_KEY 미설정"));
  if (window.Tmapv2?.Map) return Promise.resolve(window.Tmapv2);
  if (loading) return loading;

  loading = new Promise<TmapNs>((resolve, reject) => {
    let settled = false;
    const script = document.createElement("script");

    const fail = (why: string) => {
      if (settled) return;
      settled = true;
      script.remove();  // 실패한 스크립트 태그 정리 — 재시도 시 중복 삽입 방지
      loading = null;   // 다음 시도에서 재로드할 수 있게
      reject(new Error(why));
    };
    const timer = setTimeout(() => fail("티맵 SDK 로드 시간 초과"), timeoutMs);

    script.src = `https://apis.openapi.sk.com/tmap/jsv2?version=1&appKey=${TMAP_APP_KEY}`;
    script.async = true;
    script.onerror = () => { clearTimeout(timer); fail("티맵 SDK 스크립트 로드 실패"); };
    script.onload = () => {
      clearTimeout(timer);
      // jsv2는 스크립트 로드 시점에 전역 Tmapv2가 준비된다(별도 init 콜백 없음).
      // 키가 거부되면 전역이 만들어지지 않거나 Map 생성자가 없다.
      if (window.Tmapv2?.Map && settled === false) {
        settled = true;
        resolve(window.Tmapv2);
      } else {
        fail("티맵 SDK 초기화 실패(appKey·서비스 도메인 등록 확인)");
      }
    };
    document.head.appendChild(script);
  });
  return loading;
}

/** 지도 클릭 이벤트에서 좌표 추출 — jsv2는 이벤트 형태가 버전에 따라 달라
 * latLng / _lonlat 두 형태를 모두 받는다. */
export function eventLatLon(evt: unknown): { lat: number; lon: number } | null {
  const e = evt as {
    latLng?: { lat?: unknown; lng?: unknown; _lat?: number; _lng?: number };
    _lonlat?: { lat?: number; lon?: number };
  };
  const ll = e?.latLng;
  if (ll) {
    const lat = typeof ll.lat === "function" ? (ll.lat as () => number)() : ll._lat;
    const lng = typeof ll.lng === "function" ? (ll.lng as () => number)() : ll._lng;
    if (typeof lat === "number" && typeof lng === "number") return { lat, lon: lng };
  }
  const p = e?._lonlat;
  if (p && typeof p.lat === "number" && typeof p.lon === "number") {
    return { lat: p.lat, lon: p.lon };
  }
  return null;
}

/** 색 점 마커 아이콘 — 외부 이미지 없이 data URI SVG로 생성 */
export function dotIcon(color: string, size = 18): string {
  const r = size / 2;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<circle cx="${r}" cy="${r}" r="${r - 2.5}" fill="${color}" stroke="#fff" stroke-width="2.5"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
