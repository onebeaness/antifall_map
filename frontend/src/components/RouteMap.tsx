"use client";

/** 경로 경사도 지도 — 구간별 색상 폴리라인 + 급경사 강조 + 출발/도착 마커 +
 * 카카오 로드뷰 링크(구간·마커·지도 클릭 팝업).
 *
 * 엔진 이중화: NEXT_PUBLIC_KAKAO_MAP_KEY가 있으면 카카오맵 SDK(국내 상세 지도),
 * 없거나 SDK 로드가 실패하면 Leaflet + OSM으로 자동 폴백한다.
 * dynamic import(ssr:false)로만 사용한다. */
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { slopeColor } from "@/lib/geo";
import { hasKakaoKey, loadKakaoMaps, mapPopupHtml, type KakaoMapsNs } from "@/lib/kakaoMaps";

export interface RouteMapProps {
  points: [number, number][];
  slopes: number[];
  elevations: number[];
  startName: string;
  endName: string;
  tileUrl: string;
  attribution: string;
  maxZoom: number;
}

const MAP_STYLE = { width: "100%", height: 520, borderRadius: 14, overflow: "hidden" } as const;

export default function RouteMap(props: RouteMapProps) {
  const [engine, setEngine] = useState<"kakao" | "leaflet">(hasKakaoKey ? "kakao" : "leaflet");
  return engine === "kakao"
    ? <KakaoRouteMap {...props} onFallback={() => setEngine("leaflet")} />
    : <LeafletRouteMap {...props} />;
}

// ── 카카오맵 엔진 ────────────────────────────────────────────────────
function KakaoRouteMap({
  points, slopes, elevations, startName, endName, onFallback,
}: RouteMapProps & { onFallback: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const fallbackRef = useRef(onFallback);
  fallbackRef.current = onFallback;

  useEffect(() => {
    if (!ref.current || points.length < 2) return;
    let cancelled = false;
    const container = ref.current;
    const overlays: { setMap: (m: unknown) => void }[] = [];

    loadKakaoMaps()
      .then((maps: KakaoMapsNs) => {
        if (cancelled || !container) return;
        const ll = (p: [number, number]) => new maps.LatLng(p[0], p[1]);
        const map = new maps.Map(container, { center: ll(points[0]), level: 5 });
        map.addControl(new maps.ZoomControl(), maps.ControlPosition.RIGHT);

        const info = new maps.InfoWindow({ removable: true, zIndex: 30 });
        // 카카오 SDK는 Polyline/Circle 클릭이 map click으로도 전파된다 —
        // 도형 팝업 직후 map click 핸들러가 '선택한 지점'으로 덮어쓰지 않게 시간 가드
        let shapeClickAt = 0;
        const openInfo = (title: string, lat: number, lon: number, fromShape = false) => {
          if (fromShape) shapeClickAt = performance.now();
          info.setContent(mapPopupHtml(title, lat, lon));
          info.setPosition(new maps.LatLng(lat, lon));
          info.open(map);
        };

        // 경사도 색상 구간 폴리라인 — 클릭 시 경사 요약 + 로드뷰 링크
        for (let i = 0; i < slopes.length; i++) {
          const line = new maps.Polyline({
            path: [ll(points[i]), ll(points[i + 1])],
            strokeWeight: 6,
            strokeColor: slopeColor(slopes[i]),
            strokeOpacity: 0.9,
            strokeStyle: "solid",
          });
          line.setMap(map);
          overlays.push(line);
          const label = `경사 ${slopes[i] >= 0 ? "+" : ""}${slopes[i].toFixed(1)}% · 고도 ${elevations[i].toFixed(0)}m`;
          maps.event.addListener(line, "click", () =>
            openInfo(label, points[i][0], points[i][1], true));
        }

        // 급경사(9% 이상) 위험 강조 — 반투명 원
        for (let i = 0; i < slopes.length; i++) {
          const s = Math.abs(slopes[i]);
          if (s < 9) continue;
          const circle = new maps.Circle({
            center: ll(points[i]),
            radius: 26 + s * 2,
            strokeWeight: 0,
            fillColor: "#d7191c",
            fillOpacity: Math.min(0.35, 0.12 + s / 60),
          });
          circle.setMap(map);
          overlays.push(circle);
          maps.event.addListener(circle, "click", () =>
            openInfo(`급경사 ${slopes[i].toFixed(1)}% 구간`, points[i][0], points[i][1], true));
        }

        // 출발/도착 점 마커 (CustomOverlay — 줌과 무관한 고정 크기)
        const dot = (p: [number, number], color: string, title: string) => {
          const el = document.createElement("div");
          el.style.cssText =
            `width:18px;height:18px;border-radius:50%;background:${color};` +
            `border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);cursor:pointer`;
          el.title = title;
          el.addEventListener("click", () => openInfo(title, p[0], p[1]));
          // clickable: 오버레이 클릭이 지도 click으로 전파되어 팝업을 덮어쓰는 것 방지
          const ov = new maps.CustomOverlay({ position: ll(p), content: el, zIndex: 20, clickable: true });
          ov.setMap(map);
          overlays.push(ov);
        };
        dot(points[0], "#2E9E6B", `출발: ${startName}`);
        dot(points[points.length - 1], "#D64545", `도착: ${endName}`);

        // 빈 지도 클릭 → 그 지점 로드뷰 링크 (도형 클릭 직후의 전파 클릭은 무시)
        maps.event.addListener(map, "click",
          (e: { latLng: { getLat(): number; getLng(): number } }) => {
            if (performance.now() - shapeClickAt < 400) return;
            openInfo("선택한 지점", e.latLng.getLat(), e.latLng.getLng());
          });

        const bounds = new maps.LatLngBounds();
        points.forEach((p) => bounds.extend(ll(p)));
        map.setBounds(bounds, 24, 24, 24, 24);
      })
      .catch(() => { if (!cancelled) fallbackRef.current(); });

    return () => {
      cancelled = true;
      overlays.forEach((o) => o.setMap(null));
      container.innerHTML = "";
    };
  }, [points, slopes, elevations, startName, endName]);

  return <div ref={ref} style={MAP_STYLE} />;
}

// ── Leaflet + OSM 엔진 (폴백) ────────────────────────────────────────
function LeafletRouteMap({
  points, slopes, elevations, startName, endName, tileUrl, attribution, maxZoom,
}: RouteMapProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || points.length < 2) return;

    const map = L.map(ref.current, { scrollWheelZoom: true });
    L.tileLayer(tileUrl, { attribution, maxZoom }).addTo(map);

    for (let i = 0; i < slopes.length; i++) {
      const [lat, lon] = points[i];
      const label = `경사 ${slopes[i] >= 0 ? "+" : ""}${slopes[i].toFixed(1)}% · 고도 ${elevations[i].toFixed(0)}m`;
      L.polyline([points[i], points[i + 1]], {
        color: slopeColor(slopes[i]),
        weight: 6,
        opacity: 0.9,
      }).bindTooltip(label)
        .bindPopup(mapPopupHtml(label, lat, lon))
        .addTo(map);
    }

    for (let i = 0; i < slopes.length; i++) {
      const s = Math.abs(slopes[i]);
      if (s >= 9) {
        const [lat, lon] = points[i];
        L.circle(points[i], {
          radius: 26 + s * 2,
          color: "transparent",
          fillColor: "#d7191c",
          fillOpacity: Math.min(0.35, 0.12 + s / 60),
        }).bindPopup(mapPopupHtml(`급경사 ${slopes[i].toFixed(1)}% 구간`, lat, lon))
          .addTo(map);
      }
    }

    const mk = (p: [number, number], color: string, label: string) =>
      L.circleMarker(p, {
        radius: 9, color: "#fff", weight: 2.5, fillColor: color, fillOpacity: 1,
      }).bindTooltip(label)
        .bindPopup(mapPopupHtml(label, p[0], p[1]))
        .addTo(map);
    mk(points[0], "#2E9E6B", `출발: ${startName}`);
    mk(points[points.length - 1], "#D64545", `도착: ${endName}`);

    map.on("click", (e: L.LeafletMouseEvent) => {
      L.popup()
        .setLatLng(e.latlng)
        .setContent(mapPopupHtml("선택한 지점", e.latlng.lat, e.latlng.lng))
        .openOn(map);
    });

    map.fitBounds(L.latLngBounds(points.map(([a, b]) => L.latLng(a, b))), { padding: [24, 24] });
    return () => { map.remove(); };
  }, [points, slopes, elevations, startName, endName, tileUrl, attribution, maxZoom]);

  return <div ref={ref} style={MAP_STYLE} />;
}
