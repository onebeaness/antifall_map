"use client";

/** 경로 경사도 지도 — 티맵(TMap) JS API v2 단독.
 * 구간별 색상 폴리라인 + 급경사 라벨(↑7.2°) + 출발/도착 마커 +
 * 클릭 팝업(카카오 로드뷰 링크). 키가 없거나 SDK 로드 실패 시 안내 패널 표시.
 * dynamic import(ssr:false)로만 사용한다. */
import { useEffect, useId, useRef, useState } from "react";
import { MapUnavailable } from "@/components/MapUnavailable";
import { percentToDegrees, slopeColor } from "@/lib/geo";
import { mapPopupHtml } from "@/lib/kakao";
import { dotIcon, eventLatLon, loadTmap, steepIcon, type TmapNs } from "@/lib/tmapMaps";

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
  // Tmapv2.Map은 컨테이너를 div id 문자열로 받는다 (엘리먼트 전달은 버전에 따라 실패)
  const mapId = `tmap-route-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0); // "다시 시도" 누를 때마다 재로드

  useEffect(() => {
    if (!ref.current || points.length < 2) return;
    let cancelled = false;
    const container = ref.current;
    // SDK 동적 객체 — 공식 타입 패키지가 없어 any로 다룬다
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let map: any = null;

    loadTmap()
      .then((T: TmapNs) => {
        if (cancelled || !container) return;
        const ll = (p: [number, number]) => new T.LatLng(p[0], p[1]);
        map = new T.Map(mapId, {
          center: ll(points[0]),
          width: "100%",
          height: `${HEIGHT}px`,
          zoom: 15,
          zoomControl: true,
          scrollwheel: true,
          httpsMode: true,  // HTTPS 페이지에서 타일이 혼합콘텐츠로 차단되는 것 방지
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
          const deg = percentToDegrees(slopes[i]);
          const label = `경사 ${deg >= 0 ? "오르막" : "내리막"} ${Math.abs(deg).toFixed(1)}°`
            + ` (기울기 ${Math.abs(slopes[i]).toFixed(1)}%) · 고도 ${elevations[i].toFixed(0)}m`;
          line.addListener?.("click", () =>
            openPopup(label, points[i][0], points[i][1], true));
        }

        // 급경사 강조 — 예전에는 반투명 원을 깔았는데 무슨 뜻인지 알 수 없다는
        // 지적이 있었다. 이어진 급경사 구간마다 가장 가파른 지점 하나에만
        // "↑12%" 같은 라벨을 세워 그 자리에서 읽히게 한다.
        // 장애인등편의법 별표1의 완화 한도(1/12 = 4.8°)를 넘는 구간을 짚는다
        const STEEP_DEG = 4.8;
        const degOf = (i: number) => percentToDegrees(slopes[i]);
        for (let i = 0; i < slopes.length; ) {
          if (Math.abs(degOf(i)) < STEEP_DEG) { i++; continue; }
          let peak = i;
          let j = i;
          while (j < slopes.length && Math.abs(degOf(j)) >= STEEP_DEG) {
            if (Math.abs(degOf(j)) > Math.abs(degOf(peak))) peak = j;
            j++;
          }
          const value = degOf(peak);
          const text = `${value >= 0 ? "↑" : "↓"}${Math.abs(value).toFixed(1)}°`;
          const icon = steepIcon(text);
          const marker = new T.Marker({
            position: ll(points[peak]),
            icon: icon.uri,
            iconSize: new T.Size(icon.width, icon.height),
            title: `${value >= 0 ? "오르막" : "내리막"} ${Math.abs(value).toFixed(1)}° 구간`,
            map,
          });
          marker.addListener?.("click", () =>
            openPopup(`${value >= 0 ? "오르막" : "내리막"} ${Math.abs(value).toFixed(1)}° 구간`,
                      points[peak][0], points[peak][1], true));
          i = j;
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
  }, [points, slopes, elevations, startName, endName, mapId, attempt]);

  if (error) {
    return <MapUnavailable height={HEIGHT} reason={error}
                           onRetry={() => { setError(null); setAttempt((n) => n + 1); }} />;
  }
  return <div id={mapId} ref={ref} style={{ width: "100%", height: HEIGHT, borderRadius: 14, overflow: "hidden" }} />;
}
