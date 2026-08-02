"use client";

/** 서울 행정동 보행환경 위험도 choropleth — 팀 분석 산출물(geojson) 기반.
 * 색: 환경위험도 0–9 양호 / 10–24 주의 / 25+ 위험 (분포 p50=10, p75=20 기준).
 * 동 클릭 → onSelect(속성) — 대시보드에서 인구·생활인구·보안등 조회로 연결.
 *
 * 엔진 이중화: NEXT_PUBLIC_KAKAO_MAP_KEY가 있으면 카카오맵 SDK,
 * 없거나 로드 실패 시 Leaflet + CARTO 타일로 자동 폴백.
 * dynamic import(ssr:false)로만 사용한다. */
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { riskColor } from "@/lib/dongRisk";
import { hasKakaoKey, loadKakaoMaps, type KakaoMapsNs } from "@/lib/kakaoMaps";
import type { DongRiskProps } from "@/lib/types";

export interface ChoroplethMapProps {
  geojson: GeoJSON.FeatureCollection;
  onSelect?: (props: DongRiskProps) => void;
}

const MAP_STYLE = { width: "100%", height: 460, borderRadius: 14, overflow: "hidden" } as const;
const SEOUL_CENTER: [number, number] = [37.5642, 126.9976];

const fillOpacityOf = (risk: number | null) =>
  risk == null ? 0.25 : Math.min(0.78, 0.35 + risk / 120);

export default function ChoroplethMap(props: ChoroplethMapProps) {
  const [engine, setEngine] = useState<"kakao" | "leaflet">(hasKakaoKey ? "kakao" : "leaflet");
  return engine === "kakao"
    ? <KakaoChoropleth {...props} onFallback={() => setEngine("leaflet")} />
    : <LeafletChoropleth {...props} />;
}

// ── 카카오맵 엔진 ────────────────────────────────────────────────────
function KakaoChoropleth({ geojson, onSelect, onFallback }: ChoroplethMapProps & { onFallback: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const fallbackRef = useRef(onFallback);
  fallbackRef.current = onFallback;

  useEffect(() => {
    if (!ref.current) return;
    let cancelled = false;
    const container = ref.current;
    const overlays: { setMap: (m: unknown) => void }[] = [];

    loadKakaoMaps()
      .then((maps: KakaoMapsNs) => {
        if (cancelled || !container) return;
        const map = new maps.Map(container, {
          center: new maps.LatLng(SEOUL_CENTER[0], SEOUL_CENTER[1]),
          level: 9,
          scrollwheel: false,
        });
        map.addControl(new maps.ZoomControl(), maps.ControlPosition.RIGHT);

        // 호버 툴팁 — CustomOverlay 하나를 재사용
        const tipEl = document.createElement("div");
        tipEl.style.cssText =
          "background:#fff;border:1px solid #D6DEEA;border-radius:8px;padding:6px 10px;" +
          "font-size:12.5px;line-height:1.5;box-shadow:0 2px 8px rgba(0,0,0,.15);" +
          "pointer-events:none;white-space:nowrap;transform:translateY(-8px)";
        const tip = new maps.CustomOverlay({ content: tipEl, yAnchor: 1, zIndex: 40 });

        const bounds = new maps.LatLngBounds();
        // eslint-disable-next-line prefer-const
        let selected: { setOptions: (o: object) => void } | null = null;

        for (const feature of geojson.features) {
          const p = feature.properties as DongRiskProps;
          const geom = feature.geometry;
          if (!geom || (geom.type !== "MultiPolygon" && geom.type !== "Polygon")) continue;
          const polys = geom.type === "MultiPolygon" ? geom.coordinates : [geom.coordinates];

          for (const poly of polys) {
            // 외곽 링만 사용 (서울 행정동에는 구멍이 없다)
            const path = poly[0].map(([lon, lat]) => {
              const pt = new maps.LatLng(lat, lon);
              bounds.extend(pt);
              return pt;
            });
            const polygon = new maps.Polygon({
              path,
              strokeWeight: 0.8,
              strokeColor: "#ffffff",
              strokeOpacity: 1,
              fillColor: riskColor(p.risk),
              fillOpacity: fillOpacityOf(p.risk),
            });
            polygon.setMap(map);
            overlays.push(polygon);

            maps.event.addListener(polygon, "mouseover", (e: { latLng?: unknown }) => {
              polygon.setOptions({ fillOpacity: Math.min(0.9, fillOpacityOf(p.risk) + 0.15) });
              tipEl.innerHTML =
                `<b>${p.name}</b><br/>보행환경 위험도 ${p.risk ?? "자료 없음"}` +
                (p.factor ? ` · 주요요인 ${p.factor}` : "");
              // mousemove가 오기 전에도 유효한 좌표에서 표시되도록 진입 좌표를 먼저 지정
              tip.setPosition(e?.latLng ?? new maps.LatLng(p.lat, p.lon));
              tip.setMap(map);
            });
            maps.event.addListener(polygon, "mousemove",
              (e: { latLng: unknown }) => tip.setPosition(e.latLng));
            maps.event.addListener(polygon, "mouseout", () => {
              polygon.setOptions({ fillOpacity: fillOpacityOf(p.risk) });
              tip.setMap(null);
            });
            maps.event.addListener(polygon, "click", () => {
              if (selected) selected.setOptions({ strokeWeight: 0.8, strokeColor: "#ffffff" });
              polygon.setOptions({ strokeWeight: 2.5, strokeColor: "#1E2761" });
              selected = polygon;
              onSelectRef.current?.(p);
            });
          }
        }
        map.setBounds(bounds, 8, 8, 8, 8);
      })
      .catch(() => { if (!cancelled) fallbackRef.current(); });

    return () => {
      cancelled = true;
      overlays.forEach((o) => o.setMap(null));
      container.innerHTML = "";
    };
  }, [geojson]);

  return <div ref={ref} style={MAP_STYLE} />;
}

// ── Leaflet + CARTO 엔진 (폴백) ──────────────────────────────────────
function LeafletChoropleth({ geojson, onSelect }: ChoroplethMapProps) {
  const ref = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!ref.current) return;
    const map = L.map(ref.current, { scrollWheelZoom: false }).setView(SEOUL_CENTER, 11);
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
          fillOpacity: fillOpacityOf(p?.risk ?? null),
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

  return <div ref={ref} style={MAP_STYLE} />;
}
