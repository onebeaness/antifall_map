"use client";

/** 경로 경사도 지도 — 티맵(TMap) JS API v2 단독.
 * 구간별 색상 폴리라인 + 급경사 강조 원 + 출발/도착 마커 +
 * 클릭 팝업(카카오 로드뷰 링크). 키가 없거나 SDK 로드 실패 시 안내 패널 표시.
 * dynamic import(ssr:false)로만 사용한다. */
import { useEffect, useRef, useState } from "react";
import { MapUnavailable } from "@/components/MapUnavailable";
import { slopeColor } from "@/lib/geo";
import { mapPopupHtml } from "@/lib/kakao";
import { dotIcon, eventLatLon, hasTmapKey, loadTmap, type TmapNs } from "@/lib/tmapMaps";

export interface RouteMapProps {
  points: [number, number][];
  slopes: number[];
  elevations: number[];
  startName: string;
  endName: string;
}

const HEIGHT = 520;

export default function RouteMap({
  points, slopes, elevations, startName, endName,
}: RouteMapProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(hasTmapKey ? null : "키 미설정");

  useEffect(() => {
    if (!hasTmapKey || !ref.current || points.length < 2) return;
    let cancelled = false;
    const container = ref.current;
    // SDK 동적 객체 — 공식 타입 패키지가 없어 any로 다룬다
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let map: any = null;

    loadTmap()
      .then((T: TmapNs) => {
        if (cancelled || !container) return;
        const ll = (p: [number, number]) => new T.LatLng(p[0], p[1]);
        map = new T.Map(container, {
          center: ll(points[0]),
          width: "100%",
          height: `${HEIGHT}px`,
          zoom: 15,
          zoomControl: true,
          scrollwheel: true,
        });

        // 팝업은 하나만 유지 — 새로 열 때 이전 것을 지운다
        let popup: { setMap: (m: unknown) => void } | null = null;
        // 도형 클릭이 지도 click으로도 전파될 수 있어 직후 전파는 무시
        let shapeClickAt = 0;
        const openPopup = (title: string, lat: number, lon: number, fromShape = false) => {
          if (fromShape) shapeClickAt = performance.now();
          popup?.setMap(null);
          popup = new T.InfoWindow({
            position: new T.LatLng(lat, lon),
            content: mapPopupHtml(title, lat, lon),
            type: 2,          // HTML 콘텐츠
            background: false, // 기본 말풍선 배경 없이 우리 스타일 사용
            border: "0px",
            map,
          });
        };

        // 경사도 색상 구간 폴리라인
        for (let i = 0; i < slopes.length; i++) {
          const line = new T.Polyline({
            path: [ll(points[i]), ll(points[i + 1])],
            strokeColor: slopeColor(slopes[i]),
            strokeWeight: 6,
            map,
          });
          const label = `경사 ${slopes[i] >= 0 ? "+" : ""}${slopes[i].toFixed(1)}% · 고도 ${elevations[i].toFixed(0)}m`;
          line.addListener?.("click", () =>
            openPopup(label, points[i][0], points[i][1], true));
        }

        // 급경사(9% 이상) 위험 강조 — 반투명 원
        for (let i = 0; i < slopes.length; i++) {
          const s = Math.abs(slopes[i]);
          if (s < 9) continue;
          const circle = new T.Circle({
            center: ll(points[i]),
            radius: 26 + s * 2,
            strokeWeight: 0,
            fillColor: "#d7191c",
            fillOpacity: Math.min(0.35, 0.12 + s / 60),
            map,
          });
          circle.addListener?.("click", () =>
            openPopup(`급경사 ${slopes[i].toFixed(1)}% 구간`, points[i][0], points[i][1], true));
        }

        // 출발/도착 마커 (data URI SVG 점 아이콘 — 외부 이미지 불필요)
        const mark = (p: [number, number], color: string, title: string) => {
          const m = new T.Marker({
            position: ll(p),
            icon: dotIcon(color),
            iconSize: new T.Size(18, 18),
            title,
            map,
          });
          m.addListener?.("click", () => openPopup(title, p[0], p[1], true));
        };
        mark(points[0], "#2E9E6B", `출발: ${startName}`);
        mark(points[points.length - 1], "#D64545", `도착: ${endName}`);

        // 빈 지도 클릭 → 그 지점 로드뷰 링크 (도형 클릭 직후 전파는 무시)
        map.addListener?.("click", (evt: unknown) => {
          if (performance.now() - shapeClickAt < 400) return;
          const pos = eventLatLon(evt);
          if (pos) openPopup("선택한 지점", pos.lat, pos.lon);
        });

        // 경로 전체가 보이도록 범위 맞춤
        try {
          const bounds = new T.LatLngBounds();
          points.forEach((p) => bounds.extend(ll(p)));
          map.fitBounds(bounds);
        } catch {
          // fitBounds 미지원 시 중앙 정렬로 대체
          const mid = points[Math.floor(points.length / 2)];
          map.setCenter(ll(mid));
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
  }, [points, slopes, elevations, startName, endName]);

  if (error) return <MapUnavailable height={HEIGHT} reason={hasTmapKey ? error : undefined} />;
  return <div ref={ref} style={{ width: "100%", height: HEIGHT, borderRadius: 14, overflow: "hidden" }} />;
}
