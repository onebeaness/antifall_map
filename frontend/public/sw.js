/* 안심걸음 서비스 워커 — 앱 셸 캐싱 + 오프라인 폴백 (HANDOFF 6절).
 *
 * 전략:
 * - 내비게이션(HTML): 네트워크 우선 → 실패 시 캐시 → /offline 폴백
 * - 정적 자산(_next/static, 아이콘, 매니페스트): 캐시 우선 (불변 해시 자산)
 * - API 요청은 캐시하지 않는다 (진단 결과는 항상 온라인 산출)
 */
// 캐시 이름을 바꾸면 activate에서 이전 캐시를 모두 지운다.
// 배포 구조가 바뀌었을 때(예: 정적 내보내기 전환) 옛 자산이 남지 않도록 올린다.
const CACHE = "ansim-shell-v2";
const SHELL = ["/", "/offline", "/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // 외부(API·타일)는 그대로

  // 내비게이션: 네트워크 우선, 오프라인 시 캐시 → /offline
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return res;
        })
        .catch(() =>
          caches.match(request).then((hit) => hit || caches.match("/offline")))
    );
    return;
  }

  // 정적 자산: 캐시 우선
  if (url.pathname.startsWith("/_next/static/") ||
      url.pathname.startsWith("/icons/") ||
      url.pathname === "/manifest.json") {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
            return res;
          })
      )
    );
  }
});
