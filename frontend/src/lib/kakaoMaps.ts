/** 카카오맵 JS SDK 로더.
 *
 * 배경지도는 카카오맵 단독이다. NEXT_PUBLIC_KAKAO_MAP_KEY(JavaScript 키)가
 * 없거나 SDK 로드에 실패하면 각 지도 컴포넌트가 안내 패널을 대신 표시한다.
 *
 * ⚠️ 여기 넣는 값은 반드시 **JavaScript 키**다. 어드민 키는 서버 전용이며
 * 프론트에 노출되면 계정 전체가 위험해진다.
 * JS 키는 도메인 잠금(플랫폼 Web 등록)으로 보호되는 클라이언트용 키라
 * 노출을 전제로 설계돼 있다 — 등록: developers.kakao.com → 내 애플리케이션
 * → 플랫폼 Web에 http://localhost:3000 과 배포 도메인 추가.
 */

export const KAKAO_MAP_KEY = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY ?? "";
export const hasKakaoKey = KAKAO_MAP_KEY.length > 0;

/* SDK 전역 타입 — 공식 타입 패키지가 없어 최소한으로 선언 */
declare global {
  interface Window {
    kakao?: { maps?: KakaoMapsNs };
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type KakaoMapsNs = any;

let loading: Promise<KakaoMapsNs> | null = null;

/** SDK를 1회만 로드. 실패(키 오류·네트워크)하면 reject — 호출부가 Leaflet 폴백. */
export function loadKakaoMaps(timeoutMs = 8000): Promise<KakaoMapsNs> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  if (!hasKakaoKey) return Promise.reject(new Error("NEXT_PUBLIC_KAKAO_MAP_KEY 미설정"));
  if (window.kakao?.maps?.Map) return Promise.resolve(window.kakao.maps);
  if (loading) return loading;

  loading = new Promise<KakaoMapsNs>((resolve, reject) => {
    let settled = false;
    const script = document.createElement("script");

    const fail = (why: string) => {
      if (settled) return;
      settled = true;
      script.remove();   // 실패한 스크립트 태그 정리 — 재시도 시 중복 삽입 방지
      loading = null;    // 다음 시도에서 재로드할 수 있게
      reject(new Error(why));
    };
    const ok = (maps: KakaoMapsNs) => {
      if (settled) return;
      settled = true;
      resolve(maps);
    };
    const timer = setTimeout(() => fail("카카오맵 SDK 로드 시간 초과"), timeoutMs);

    // autoload=false: 스크립트 로드 후 kakao.maps.load()로 초기화를 명시 제어
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_MAP_KEY}&autoload=false`;
    script.async = true;
    script.onerror = () => { clearTimeout(timer); fail("카카오맵 SDK 스크립트 로드 실패"); };
    script.onload = () => {
      const maps = window.kakao?.maps;
      if (!maps?.load) { clearTimeout(timer); fail("카카오맵 SDK 초기화 객체 없음"); return; }
      maps.load(() => {
        clearTimeout(timer);
        if (window.kakao?.maps?.Map) ok(window.kakao.maps);
        else fail("카카오맵 SDK 초기화 실패(키·도메인 등록 확인)");
      });
    };
    document.head.appendChild(script);
  });
  return loading;
}

/** 클릭 팝업(로드뷰·카카오맵 링크) 공용 HTML — Leaflet 팝업과 동일한 내용 */
export function mapPopupHtml(title: string, lat: number, lon: number): string {
  const link = "font-weight:700;color:#0B5394;text-decoration:underline";
  return (
    `<div style="padding:8px 12px;font-size:13px;line-height:1.6;font-family:inherit;white-space:nowrap">` +
    `<b>${title}</b><br/>` +
    `<a href="https://map.kakao.com/link/roadview/${lat},${lon}" target="_blank" rel="noopener" style="${link}">로드뷰 보기 ↗</a>` +
    `&nbsp;·&nbsp;` +
    `<a href="https://map.kakao.com/link/map/${encodeURIComponent(title)},${lat},${lon}" target="_blank" rel="noopener" style="${link}">카카오맵 ↗</a>` +
    `</div>`
  );
}
