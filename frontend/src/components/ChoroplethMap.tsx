"use client";

/** 서울 행정동 보행환경 위험도 choropleth — 티맵(TMap) JS API v2 단독.
 * 색: 환경위험도 0–9 양호 / 10–24 주의 / 25+ 위험 (분포 p50=10, p75=20 기준).
 * 동 클릭 → onSelect(속성) — 대시보드에서 인구·생활인구·보안등 조회로 연결.
 * 키가 없거나 SDK 로드 실패 시 안내 패널 표시.
 * dynamic import(ssr:false)로만 사용한다. */
import { useEffect, useRef, useState } from "react";
import { MapUnavailable } from "@/components/MapUnavailable";
import { riskColor } from "@/lib/dongRisk";
import { hasTmapKey, loadTmap, type TmapNs } from "@/lib/tmapMaps";
import type { DongRiskProps } from "@/lib/types";

export interface ChoroplethMapProps {
  geojson: GeoJSON.FeatureCollection;
  onSelect?: (props: DongRiskProps) => void;
}

const HEIGHT = 460;
const SEOUL_CENTER: [number, number] = [37.5642, 126.9976];

const fillOpacityOf = (risk: number | null) =>
  risk == null ? 0.25 : Math.min(0.78, 0.35 + risk / 120);

export default function ChoroplethMap({ geojson, onSelect }: ChoroplethMapProps) {
  const ref = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const [error, setError] = useState<string | null>(hasTmapKey ? null : "키 미설정");

  useEffect(() => {
    if (!hasTmapKey || !ref.current) return;
    let cancelled = false;
    const container = ref.current;
    // SDK 동적 객체 — 공식 타입 패키지가 없어 any로 다룬다
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let map: any = null;

    loadTmap()
      .then((T: TmapNs) => {
        if (cancelled || !container) return;
        map = new T.Map(container, {
          center: new T.LatLng(SEOUL_CENTER[0], SEOUL_CENTER[1]),
          width: "100%",
          height: `${HEIGHT}px`,
          zoom: 11,
          zoomControl: true,
          scrollwheel: false,
        });

        let selected: { setOptions?: (o: object) => void } | null = null;

        for (const feature of geojson.features) {
          const p = feature.properties as DongRiskProps;
          const geom = feature.geometry;
          if (!geom || (geom.type !== "MultiPolygon" && geom.type !== "Polygon")) continue;
          const polys = geom.type === "MultiPolygon" ? geom.coordinates : [geom.coordinates];

          for (const poly of polys) {
            // 외곽 링만 사용 (서울 행정동에는 구멍이 없다)
            const path = poly[0].map(([lon, lat]) => new T.LatLng(lat, lon));
            const polygon = new T.Polygon({
              paths: path,
              fillColor: riskColor(p.risk),
              fillOpacity: fillOpacityOf(p.risk),
              strokeColor: "#ffffff",
              strokeWeight: 1,
              map,
            });

            polygon.addListener?.("click", () => {
              // 선택 강조 — setOptions 미지원 버전에서는 강조 없이 선택만 동작
              selected?.setOptions?.({ strokeColor: "#ffffff", strokeWeight: 1 });
              polygon.setOptions?.({ strokeColor: "#1E2761", strokeWeight: 3 });
              selected = polygon;
              onSelectRef.current?.(p);
            });
          }
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });

    return () => {
      cancelled = true;
      try { map?.destroy?.(); } catch { /* 정리 실패는 무시 */ }
      container.innerHTML = "";
    };
  }, [geojson]);

  if (error) return <MapUnavailable height={HEIGHT} reason={hasTmapKey ? error : undefined} />;
  return <div ref={ref} style={{ width: "100%", height: HEIGHT, borderRadius: 14, overflow: "hidden" }} />;
}
