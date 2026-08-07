/** 티맵(TMap) JavaScript API v2 로더.
 *
 * 배경지도는 티맵 단독이다. 키를 얻지 못하거나 SDK 로드에 실패하면
 * 각 지도 컴포넌트가 안내 패널(MapUnavailable)에 실패 사유를 그대로 띄운다.
 *
 * ── 키를 얻는 순서 ────────────────────────────────────────────────
 *  1) 빌드 환경변수 NEXT_PUBLIC_TMAP_APP_KEY (있으면 즉시 사용)
 *  2) 백엔드 GET /api/config/map 의 tmap_app_key (런타임 조회)
 *
 * 2)가 있는 이유: 이 앱은 정적 내보내기(output:"export")라 빌드 환경변수는
 * HTML/JS에 그대로 구워진다. 즉 키를 바꿀 때마다 프론트 재배포가 필요하고,
 * 잘못 넣으면 재배포 전까지 지도가 통째로 죽는다. 백엔드에서 받아오면
 * Render 환경변수만 고쳐도 새로고침으로 반영되고, 키가 정적 산출물과
 * 저장소에 남지 않는다(브라우저 devtools에서는 여전히 보인다 — 지도 SDK
 * 키는 어떤 방식이든 클라이언트에 노출된다는 점은 동일하다).
 *
 * 백엔드는 TMAP_JS_APP_KEY를 우선 쓰고 없으면 TMAP_APP_KEY로 폴백한다.
 * 가능하면 openapi.sk.com에서 JS 지도 전용 앱을 따로 만들어
 * TMAP_JS_APP_KEY에 넣는 편이 안전하다(REST 경로 API 할당량 분리).
 */
import { API_BASE } from "./api";

/** 빌드 시점 키 — 없으면 런타임에 백엔드에서 받아온다. */
const BUILD_TIME_KEY = process.env.NEXT_PUBLIC_TMAP_APP_KEY ?? "";

/* SDK 전역 타입 — 공식 타입 패키지가 없어 최소한으로 선언 */
declare global {
  interface Window {
    Tmapv2?: TmapNs;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TmapNs = any;

let keyPromise: Promise<string> | null = null;

/** 사용할 appKey 확보 — 빌드 환경변수 → 백엔드 순. */
function resolveKey(): Promise<string> {
  if (BUILD_TIME_KEY) return Promise.resolve(BUILD_TIME_KEY);
  if (keyPromise) return keyPromise;

  keyPromise = fetch(`${API_BASE}/api/config/map`)
    .catch(() => { throw new Error("지도 키 조회 실패 — 백엔드 서버에 연결할 수 없습니다"); })
    .then((res) => {
      if (!res.ok) throw new Error(`지도 키 조회 실패 (HTTP ${res.status})`);
      return res.json() as Promise<{ tmap_app_key?: string }>;
    })
    .then((body) => {
      const key = body?.tmap_app_key ?? "";
      if (!key) {
        throw new Error(
          "지도 키가 서버에 설정되지 않았습니다 (TMAP_JS_APP_KEY 또는 TMAP_APP_KEY)");
      }
      return key;
    })
    .catch((e: unknown) => {
      keyPromise = null; // 다음 시도에서 다시 조회
      throw e instanceof Error ? e : new Error(String(e));
    });
  return keyPromise;
}

let loading: Promise<TmapNs> | null = null;

/** jsv2는 스크립트 onload 직후 전역이 준비되는 게 보통이지만, 일부 버전은
 * 내부 모듈을 이어서 붙이느라 한 박자 늦는다. onload 후 잠깐 폴링한다. */
function waitForGlobal(deadline: number): Promise<TmapNs> {
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (window.Tmapv2?.Map) return resolve(window.Tmapv2);
      if (performance.now() >= deadline) {
        return reject(new Error("SDK는 받았지만 Tmapv2 전역이 준비되지 않음 (appKey 거부 가능성)"));
      }
      setTimeout(tick, 60);
    };
    tick();
  });
}

/** SDK를 1회만 로드. 실패(키 오류·도메인 미등록·네트워크)하면 reject. */
export function loadTmap(timeoutMs = 12000): Promise<TmapNs> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  if (window.Tmapv2?.Map) return Promise.resolve(window.Tmapv2);
  if (loading) return loading;

  loading = resolveKey().then((appKey) => new Promise<TmapNs>((resolve, reject) => {
    let settled = false;
    const script = document.createElement("script");
    const deadline = performance.now() + timeoutMs;

    const fail = (why: string) => {
      if (settled) return;
      settled = true;
      script.remove(); // 실패한 스크립트 태그 정리 — 재시도 시 중복 삽입 방지
      loading = null;  // 다음 시도에서 재로드할 수 있게
      reject(new Error(why));
    };
    const timer = setTimeout(() => fail("티맵 SDK 로드 시간 초과"), timeoutMs);

    script.src = `https://apis.openapi.sk.com/tmap/jsv2?version=1&appKey=${encodeURIComponent(appKey)}`;
    script.async = true;
    script.onerror = () => { clearTimeout(timer); fail("티맵 SDK 스크립트 로드 실패 (네트워크·차단)"); };
    script.onload = () => {
      clearTimeout(timer);
      waitForGlobal(deadline).then(
        (T) => { if (!settled) { settled = true; resolve(T); } },
        (e: Error) => fail(e.message),
      );
    };
    document.head.appendChild(script);
  })).catch((e: unknown) => {
    loading = null;
    throw e instanceof Error ? e : new Error(String(e));
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
