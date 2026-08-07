"use client";

/** 서울 보행 경사위험도 choropleth — 자치구 → 행정동 드릴다운.
 *
 * 1단계: 자치구 25개. 이름 라벨을 상시 표시한다.
 * 2단계: 구를 클릭하면 그 구의 행정동만 남기고 확대 — 동 이름도 상시 표시.
 * 서울 421개 동을 한 번에 그리면 라벨이 서로 겹쳐 읽을 수 없어 이렇게 나눴다.
 *
 * 색 구간은 lib/dongRisk.ts (무장애 설계기준 종단경사 기준). 자료 없는 구역은 회색.
 * 티맵(TMap) JS API v2 단독. dynamic import(ssr:false)로만 사용한다.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { MapUnavailable } from "@/components/MapUnavailable";
import { riskColor } from "@/lib/dongRisk";
import { loadTmap, textIcon, type TmapNs } from "@/lib/tmapMaps";
import type { DongRiskProps, GuRiskProps } from "@/lib/types";

export interface ChoroplethMapProps {
  /** 자치구 경계 (seoul_gu_risk.geojson) */
  guGeojson: GeoJSON.FeatureCollection;
  /** 행정동 경계 (seoul_dong_risk.geojson) */
  dongGeojson: GeoJSON.FeatureCollection;
  /** 선택한 자치구 — null이면 서울 전체 */
  activeGu: string | null;
  onGuChange: (gu: string | null) => void;
  onSelectDong?: (props: DongRiskProps) => void;
}

const HEIGHT = 460;
const SEOUL_CENTER: [number, number] = [37.5642, 126.9976];

const fillOpacityOf = (risk: number | null) =>
  risk == null ? 0.25 : Math.min(0.72, 0.34 + risk / 130);

/** SDK 동적 객체 — 공식 타입 패키지가 없어 any로 다룬다 */
/* eslint-disable @typescript-eslint/no-explicit-any */

export default function ChoroplethMap({
  guGeojson, dongGeojson, activeGu, onGuChange, onSelectDong,
}: ChoroplethMapProps) {
  const ref = useRef<HTMLDivElement>(null);
  // Tmapv2.Map은 컨테이너를 div id 문자열로 받는다 (엘리먼트 전달은 버전에 따라 실패)
  const mapId = `tmap-choro-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0); // "다시 시도" 누를 때마다 재로드

  const mapRef = useRef<any>(null);
  const nsRef = useRef<TmapNs>(null);
  /** 현재 레이어의 도형·라벨 — 단계가 바뀔 때 전부 지운다 */
  const overlaysRef = useRef<any[]>([]);
  // 콜백은 ref로 — 지도를 다시 만들지 않고 최신 핸들러를 쓴다
  const onGuChangeRef = useRef(onGuChange);
  onGuChangeRef.current = onGuChange;
  const onSelectDongRef = useRef(onSelectDong);
  onSelectDongRef.current = onSelectDong;

  /** 지도 생성 — 한 번만. 레이어 교체는 아래 별도 effect가 담당한다. */
  useEffect(() => {
    if (!ref.current) return;
    let cancelled = false;
    const container = ref.current;

    loadTmap()
      .then((T: TmapNs) => {
        if (cancelled || !container) return;
        nsRef.current = T;
        mapRef.current = new T.Map(mapId, {
          center: new T.LatLng(SEOUL_CENTER[0], SEOUL_CENTER[1]),
          width: "100%",
          height: `${HEIGHT}px`,
          zoom: 11,
          zoomControl: true,
          scrollwheel: false,
          httpsMode: true, // HTTPS 페이지에서 타일이 혼합콘텐츠로 차단되는 것 방지
        });
        setError(null);
        setAttempt((n) => n); // 레이어 effect를 깨우기 위한 no-op 재렌더 방지용
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });

    return () => {
      cancelled = true;
      overlaysRef.current = [];
      try { mapRef.current?.destroy?.(); } catch { /* 정리 실패는 무시 */ }
      mapRef.current = null;
      container.innerHTML = "";
    };
  }, [mapId, attempt]);

  /** 폴리곤 + 이름 라벨을 그린다 */
  const draw = useCallback(() => {
    const T = nsRef.current;
    const map = mapRef.current;
    if (!T || !map) return;

    overlaysRef.current.forEach((o) => { try { o.setMap(null); } catch { /* 무시 */ } });
    overlaysRef.current = [];

    const features = activeGu
      ? dongGeojson.features.filter((f) => (f.properties as DongRiskProps).sgg === activeGu)
      : guGeojson.features;

    let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;

    for (const feature of features) {
      const p = feature.properties as DongRiskProps | GuRiskProps;
      const geom = feature.geometry;
      if (!geom || (geom.type !== "MultiPolygon" && geom.type !== "Polygon")) continue;
      const polys = geom.type === "MultiPolygon" ? geom.coordinates : [geom.coordinates];

      for (const poly of polys) {
        // 외곽 링만 사용 (서울 행정구역에는 구멍이 없다)
        const path = poly[0].map(([lon, lat]) => {
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
          if (lon < minLon) minLon = lon;
          if (lon > maxLon) maxLon = lon;
          return new T.LatLng(lat, lon);
        });
        const polygon = new T.Polygon({
          paths: path,
          fillColor: riskColor(p.risk),
          fillOpacity: fillOpacityOf(p.risk),
          strokeColor: "#ffffff",
          strokeWeight: activeGu ? 1.2 : 1.8,
          map,
        });
        polygon.addListener?.("click", () => {
          if (activeGu) onSelectDongRef.current?.(p as DongRiskProps);
          else onGuChangeRef.current((p as GuRiskProps).name);
        });
        overlaysRef.current.push(polygon);
      }

      // 이름 라벨 — 구는 그대로, 동은 앞의 자치구명을 떼고 표시
      const label = activeGu ? p.name.split(" ").pop() ?? p.name : p.name;
      const icon = textIcon(label, activeGu ? 11.5 : 13);
      const marker = new T.Marker({
        position: new T.LatLng(p.lat, p.lon),
        icon: icon.uri,
        iconSize: new T.Size(icon.width, icon.height),
        title: `${p.name} · 위험도 ${p.risk ?? "자료 없음"}`,
        map,
      });
      marker.addListener?.("click", () => {
        if (activeGu) onSelectDongRef.current?.(p as DongRiskProps);
        else onGuChangeRef.current((p as GuRiskProps).name);
      });
      overlaysRef.current.push(marker);
    }

    // 그린 범위에 맞춰 화면 이동
    if (minLat <= maxLat) {
      try {
        const bounds = new T.LatLngBounds(
          new T.LatLng(minLat, minLon), new T.LatLng(maxLat, maxLon));
        map.fitBounds(bounds);
      } catch {
        map.setCenter(new T.LatLng((minLat + maxLat) / 2, (minLon + maxLon) / 2));
        map.setZoom?.(activeGu ? 13 : 11);
      }
    }
  }, [activeGu, guGeojson, dongGeojson]);

  /** 단계·데이터가 바뀌면 다시 그린다. 지도 생성 직후에도 한 번 돈다. */
  useEffect(() => {
    if (error) return;
    let raf = 0;
    const tryDraw = () => {
      if (mapRef.current) draw();
      else raf = requestAnimationFrame(tryDraw); // 지도 생성 완료를 기다린다
    };
    tryDraw();
    return () => cancelAnimationFrame(raf);
  }, [draw, error, attempt]);

  if (error) {
    return <MapUnavailable height={HEIGHT} reason={error}
                           onRetry={() => { setError(null); setAttempt((n) => n + 1); }} />;
  }
  return (
    <div style={{ position: "relative" }}>
      <div id={mapId} ref={ref}
           style={{ width: "100%", height: HEIGHT, borderRadius: 14, overflow: "hidden" }} />
      {activeGu && (
        <button type="button" onClick={() => onGuChange(null)}
                style={{
                  position: "absolute", top: 12, left: 12, zIndex: 10,
                  padding: "8px 14px", borderRadius: 10, cursor: "pointer",
                  border: "1px solid var(--line)", background: "rgba(255,255,255,.95)",
                  fontFamily: "inherit", fontSize: 13.5, fontWeight: 700,
                  boxShadow: "0 2px 8px rgba(0,0,0,.12)",
                }}>
          ← 서울 전체
        </button>
      )}
    </div>
  );
}
