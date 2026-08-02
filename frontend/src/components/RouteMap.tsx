"use client";

/** 경로 경사도 지도 — 카카오맵 단독(OSM 미사용).
 * 구간별 색상 폴리라인 + 급경사 강조 원 + 출발/도착 마커 +
 * 클릭 팝업(카카오 로드뷰 링크). 키가 없거나 SDK 로드 실패 시 안내 패널 표시.
 * dynamic import(ssr:false)로만 사용한다. */
import { useEffect, useRef, useState } from "react";
import { MapUnavailable } from "@/components/MapUnavailable";
import { slopeColor } from "@/lib/geo";
import { hasKakaoKey, loadKakaoMaps, mapPopupHtml, type KakaoMapsNs } from "@/lib/kakaoMaps";

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
  const [error, setError] = useState<string | null>(hasKakaoKey ? null : "키 미설정");

  useEffect(() => {
    if (!hasKakaoKey || !ref.current || points.length < 2) return;
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
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });

    return () => {
      cancelled = true;
      overlays.forEach((o) => o.setMap(null));
      container.innerHTML = "";
    };
  }, [points, slopes, elevations, startName, endName]);

  if (error) return <MapUnavailable height={HEIGHT} reason={hasKakaoKey ? error : undefined} />;
  return <div ref={ref} style={{ width: "100%", height: HEIGHT, borderRadius: 14, overflow: "hidden" }} />;
}
