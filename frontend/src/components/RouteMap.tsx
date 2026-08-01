"use client";

/** 경로 경사도 지도 — Leaflet. 구간별 색상 폴리라인 + 급경사 강조 원 +
 * 출발/도착 마커 + 카카오 로드뷰 링크(구간·마커·지도 클릭 팝업).
 * dynamic import(ssr:false)로만 사용한다. */
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { slopeColor } from "@/lib/geo";
import { kakaoMapUrl, kakaoRoadviewUrl } from "@/lib/kakao";

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

/** 팝업 HTML: 요약 + 로드뷰/카카오맵 링크 (새 탭) */
function popupHtml(title: string, lat: number, lon: number): string {
  const linkStyle = "font-weight:700;color:#0B5394;text-decoration:underline";
  return (
    `<div style="font-size:13px;line-height:1.6">` +
    `<b>${title}</b><br/>` +
    `<a href="${kakaoRoadviewUrl(lat, lon)}" target="_blank" rel="noopener" style="${linkStyle}">로드뷰 보기 ↗</a>` +
    `&nbsp;·&nbsp;` +
    `<a href="${kakaoMapUrl(title, lat, lon)}" target="_blank" rel="noopener" style="${linkStyle}">카카오맵 ↗</a>` +
    `</div>`
  );
}

export default function RouteMap({
  points, slopes, elevations, startName, endName, tileUrl, attribution, maxZoom,
}: RouteMapProps) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!ref.current || points.length < 2) return;

    const map = L.map(ref.current, { scrollWheelZoom: true });
    mapRef.current = map;
    L.tileLayer(tileUrl, { attribution, maxZoom }).addTo(map);

    // 경사도 색상 구간 폴리라인 — 클릭 시 경사 요약 + 로드뷰 링크
    for (let i = 0; i < slopes.length; i++) {
      const [lat, lon] = points[i];
      const label = `경사 ${slopes[i] >= 0 ? "+" : ""}${slopes[i].toFixed(1)}% · 고도 ${elevations[i].toFixed(0)}m`;
      L.polyline([points[i], points[i + 1]], {
        color: slopeColor(slopes[i]),
        weight: 6,
        opacity: 0.9,
      }).bindTooltip(label)
        .bindPopup(popupHtml(label, lat, lon))
        .addTo(map);
    }

    // 급경사(9% 이상) 위험 강조 — 히트맵 성격의 반투명 원 (클릭 → 로드뷰)
    for (let i = 0; i < slopes.length; i++) {
      const s = Math.abs(slopes[i]);
      if (s >= 9) {
        const [lat, lon] = points[i];
        L.circle(points[i], {
          radius: 26 + s * 2,
          color: "transparent",
          fillColor: "#d7191c",
          fillOpacity: Math.min(0.35, 0.12 + s / 60),
        }).bindPopup(popupHtml(`급경사 ${slopes[i].toFixed(1)}% 구간`, lat, lon))
          .addTo(map);
      }
    }

    const mk = (p: [number, number], color: string, label: string) =>
      L.circleMarker(p, {
        radius: 9, color: "#fff", weight: 2.5, fillColor: color, fillOpacity: 1,
      }).bindTooltip(label)
        .bindPopup(popupHtml(label, p[0], p[1]))
        .addTo(map);
    mk(points[0], "#2E9E6B", `출발: ${startName}`);
    mk(points[points.length - 1], "#D64545", `도착: ${endName}`);

    // 빈 지도 클릭 → 그 지점 로드뷰 링크 팝업
    map.on("click", (e: L.LeafletMouseEvent) => {
      L.popup()
        .setLatLng(e.latlng)
        .setContent(popupHtml("선택한 지점", e.latlng.lat, e.latlng.lng))
        .openOn(map);
    });

    map.fitBounds(L.latLngBounds(points.map(([a, b]) => L.latLng(a, b))), { padding: [24, 24] });

    return () => { map.remove(); mapRef.current = null; };
  }, [points, slopes, elevations, startName, endName, tileUrl, attribution, maxZoom]);

  return <div ref={ref} style={{ width: "100%", height: 520, borderRadius: 14, overflow: "hidden" }} />;
}
