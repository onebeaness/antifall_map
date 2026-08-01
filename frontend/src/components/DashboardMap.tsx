"use client";

/** B2G 위험 구간 지도 — Leaflet 원형 마커 (원본 dashboard._risk_map 이식). */
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface DashRow {
  rank: number;
  block: string;
  dong: string;
  score: number;
  slopeDeg: number;
  elderlyPct: number;
  action: string;
  budget: number;
  lat: number;
  lon: number;
}

const GRADE_COLOR = (score: number) =>
  score >= 67 ? "#D64545" : score >= 34 ? "#E0A800" : "#2E9E6B";
const GRADE_LABEL = (score: number) =>
  score >= 67 ? "위험" : score >= 34 ? "주의" : "양호";

export default function DashboardMap({ rows }: { rows: DashRow[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const map = L.map(ref.current, { scrollWheelZoom: false }).setView([37.3162, 126.8590], 13);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution: "© OpenStreetMap contributors © CARTO",
      maxZoom: 19,
    }).addTo(map);

    for (const r of rows) {
      const color = GRADE_COLOR(r.score);
      L.circleMarker([r.lat, r.lon], {
        radius: 8 + r.score / 8,
        color, weight: 2, fillColor: color, fillOpacity: 0.55,
      }).bindTooltip(
        `<b>${r.dong} ${r.block}</b><br>위험점수 ${r.score} (${GRADE_LABEL(r.score)})<br>` +
        `경사 ${r.slopeDeg}° · 65세 이상 ${r.elderlyPct}%<br>권고: ${r.action} (약 ${r.budget}백만원)`,
      ).addTo(map);
    }

    return () => { map.remove(); };
  }, [rows]);

  return <div ref={ref} style={{ width: "100%", height: 420, borderRadius: 14, overflow: "hidden" }} />;
}
