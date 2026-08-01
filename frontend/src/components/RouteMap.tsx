"use client";

/** 경로 경사도 지도 — Leaflet. 구간별 색상 폴리라인 + 급경사 강조 원 +
 * 출발/도착 마커. dynamic import(ssr:false)로만 사용한다. */
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { slopeColor } from "@/lib/geo";

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

    // 경사도 색상 구간 폴리라인
    for (let i = 0; i < slopes.length; i++) {
      L.polyline([points[i], points[i + 1]], {
        color: slopeColor(slopes[i]),
        weight: 6,
        opacity: 0.9,
      }).bindTooltip(`경사 ${slopes[i] >= 0 ? "+" : ""}${slopes[i].toFixed(1)}% · 고도 ${elevations[i].toFixed(0)}m`)
        .addTo(map);
    }

    // 급경사(9% 이상) 위험 강조 — 히트맵 성격의 반투명 원
    for (let i = 0; i < slopes.length; i++) {
      const s = Math.abs(slopes[i]);
      if (s >= 9) {
        L.circle(points[i], {
          radius: 26 + s * 2,
          color: "transparent",
          fillColor: "#d7191c",
          fillOpacity: Math.min(0.35, 0.12 + s / 60),
        }).addTo(map);
      }
    }

    const mk = (p: [number, number], color: string, label: string) =>
      L.circleMarker(p, {
        radius: 9, color: "#fff", weight: 2.5, fillColor: color, fillOpacity: 1,
      }).bindTooltip(label, { permanent: false }).addTo(map);
    mk(points[0], "#2E9E6B", `출발: ${startName}`);
    mk(points[points.length - 1], "#D64545", `도착: ${endName}`);

    map.fitBounds(L.latLngBounds(points.map(([a, b]) => L.latLng(a, b))), { padding: [24, 24] });

    return () => { map.remove(); mapRef.current = null; };
  }, [points, slopes, elevations, startName, endName, tileUrl, attribution, maxZoom]);

  return <div ref={ref} style={{ width: "100%", height: 520, borderRadius: 14, overflow: "hidden" }} />;
}
