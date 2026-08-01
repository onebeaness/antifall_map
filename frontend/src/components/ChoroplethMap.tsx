"use client";

/** 서울 행정동 보행환경 위험도 choropleth — 팀 분석 산출물(geojson) 기반.
 * 색: 환경위험도 0–9 양호 / 10–24 주의 / 25+ 위험 (분포 p50=10, p75=20 기준).
 * 동 클릭 → onSelect(속성) — 대시보드에서 인구·생활인구·보안등 조회로 연결.
 * dynamic import(ssr:false)로만 사용한다. */
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { riskColor } from "@/lib/dongRisk";
import type { DongRiskProps } from "@/lib/types";

export interface ChoroplethMapProps {
  geojson: GeoJSON.FeatureCollection;
  onSelect?: (props: DongRiskProps) => void;
}

export default function ChoroplethMap({ geojson, onSelect }: ChoroplethMapProps) {
  const ref = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!ref.current) return;
    const map = L.map(ref.current, { scrollWheelZoom: false }).setView([37.5642, 126.9976], 11);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution: "© OpenStreetMap contributors © CARTO",
      maxZoom: 19,
    }).addTo(map);

    let selected: L.Path | null = null;

    const layer = L.geoJSON(geojson, {
      style: (feature) => {
        const p = feature?.properties as DongRiskProps;
        return {
          color: "#ffffff",
          weight: 0.8,
          fillColor: riskColor(p?.risk ?? null),
          fillOpacity: p?.risk == null ? 0.25 : Math.min(0.78, 0.35 + p.risk / 120),
        };
      },
      onEachFeature: (feature, lyr) => {
        const p = feature.properties as DongRiskProps;
        lyr.bindTooltip(
          `<b>${p.name}</b><br/>보행환경 위험도 ${p.risk ?? "자료 없음"}` +
          (p.factor ? ` · 주요요인 ${p.factor}` : ""),
          { sticky: true },
        );
        lyr.on("click", () => {
          if (selected) selected.setStyle({ weight: 0.8, color: "#ffffff" });
          (lyr as L.Path).setStyle({ weight: 2.5, color: "#1E2761" });
          (lyr as L.Path).bringToFront();
          selected = lyr as L.Path;
          onSelectRef.current?.(p);
        });
      },
    }).addTo(map);

    map.fitBounds(layer.getBounds(), { padding: [8, 8] });
    return () => { map.remove(); };
  }, [geojson]);

  return <div ref={ref} style={{ width: "100%", height: 460, borderRadius: 14, overflow: "hidden" }} />;
}
