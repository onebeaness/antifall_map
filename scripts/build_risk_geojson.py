#!/usr/bin/env python3
"""보행 경사위험도 geojson 생성 (자치구 + 행정동).

    python3 scripts/build_risk_geojson.py <dong_final_polygon_v3.geojson> <gu_final_polygon.geojson>

## 왜 경사만 쓰는가

원본은 경사(64%)·협소(26%)·재질(10%)을 합산한 '환경위험도'를 담고 있다.
그런데 세 축의 자료 확보율이 전혀 다르다 (보행로 지점 185,114개 기준):

    경사   185,114 (100.0%)   ← DEM에서 전 지점 계산
    재질    45,430 ( 24.5%)   ← OSM surface 태그
    폭      37,080 ( 20.0%)   ← OSM width 태그

폭·재질은 OSM에서 누군가 직접 입력해야 하는 선택 태그라 대부분 비어 있다.
그 결과 협소 지수는 표본 한두 개로 계산돼 0과 100 사이를 튄다
(성동구 금호1가동: 210개 지점 중 폭 기록 1개 → 협소 100).
2026-08 기준 이를 메울 수 있는 공개 API는 없다. 서울시 보도통계자료가
노선별 폭을 갖고 있으나 공간 좌표가 없어 지점 단위 결합이 불가능하다.

그래서 결측이 없는 경사 축만으로 지표를 다시 세운다. 원래도 가중치가
가장 큰 축이고, 없는 자료를 추정으로 메우는 것보다 정직하다.

## 산식

두 축 모두 100% 확보된 자료에서 나오며, 동등 가중한다.

    상시부담 = min(1, 경사도_평균 / 4.76)   무장애 설계기준 최대 종단경사 1/12
    급경사노출 = 급경사_비율                 10° 이상 지점의 비율
    경사위험도 = 100 × (0.5 × 상시부담 + 0.5 × 급경사노출)

두 축을 함께 쓰는 이유: 평균 경사가 같아도 급경사 노출은 크게 갈린다
(평균 8°인 동들의 급경사 비율은 10.5%~62.5%). Spearman 상관 0.709로
서로 다른 정보를 담는다.

등급 경계는 설계기준 지점과 일치시켰다. 급경사 노출이 0일 때
    양호 <30  = 평균 경사가 권장기준 1/20(2.86°) 미만
    주의 30~49 = 권장기준 초과, 최대기준 이내
    위험 50+   = 평균 경사가 최대기준 1/12(4.76°)를 넘음
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "frontend/public/geo"
V2 = "dong_final_clean — final v2_"   # 원본의 접두사 붙은 컬럼들
BF_MAX = 4.76        # 무장애 설계기준 최대 종단경사 1/12 (도)
COORD_DIGITS = 5     # 약 1m — 행정구역 경계에는 충분하고 용량을 크게 줄인다


def risk_score(slope_mean: float | None, steep_ratio: float | None) -> int | None:
    if slope_mean is None:
        return None
    sustained = min(1.0, slope_mean / BF_MAX)
    return round(100 * (0.5 * sustained + 0.5 * (steep_ratio or 0.0)))


def round_coords(node):
    if isinstance(node, (int, float)):
        return round(node, COORD_DIGITS)
    return [round_coords(child) for child in node]


def centroid(geometry: dict) -> tuple[float, float]:
    """가장 큰 링의 꼭짓점 평균 — 라벨 위치용이라 정밀도는 중요하지 않다."""
    polys = (geometry["coordinates"] if geometry["type"] == "MultiPolygon"
             else [geometry["coordinates"]])
    ring = max((p[0] for p in polys), key=len)
    n = len(ring)
    return round(sum(c[1] for c in ring) / n, 5), round(sum(c[0] for c in ring) / n, 5)


def geom_of(feature: dict) -> dict:
    return {"type": feature["geometry"]["type"],
            "coordinates": round_coords(feature["geometry"]["coordinates"])}


def num(value, digits=1):
    return None if value is None else round(float(value), digits)


def main(dong_src: str, gu_src: str) -> None:
    dong_raw = json.loads(Path(dong_src).read_text(encoding="utf-8"))

    dongs, by_sgg = [], {}
    for feature in dong_raw["features"]:
        p = feature["properties"]
        slope_mean = p.get(V2 + "경사도_평균")
        steep_ratio = p.get(V2 + "급경사_비율")
        points = p.get(V2 + "포인트수") or p.get("포인트수")
        geometry = geom_of(feature)
        lat, lon = centroid(geometry)

        props = {
            "name": " ".join(p["adm_nm"].split()[1:]),   # "서울특별시 종로구 사직동" → "종로구 사직동"
            "sgg": p["sggnm"],
            "adm_cd": p["adm_cd"],      # 통계청(SGIS)
            "adm_cd2": p["adm_cd2"],    # 행자부 10자리
            "risk": risk_score(slope_mean, steep_ratio),
            "slope_mean": num(slope_mean),
            "slope_max": num(p.get(V2 + "경사도_최대값")),
            "steep_ratio": num(steep_ratio, 3),
            "points": int(points) if points is not None else None,
            "lat": lat, "lon": lon,
        }
        dongs.append({"type": "Feature", "properties": props, "geometry": geometry})

        # 자치구 집계용 — 지점 수로 가중해야 큰 동에 끌려가지 않는다
        if slope_mean is not None and points:
            acc = by_sgg.setdefault(p["sggnm"], {"n": 0, "slope": 0.0, "steep": 0.0})
            acc["n"] += points
            acc["slope"] += slope_mean * points
            acc["steep"] += (steep_ratio or 0.0) * points

    dongs.sort(key=lambda f: f["properties"]["name"])
    write(OUT / "seoul_dong_risk.geojson", dongs, "행정동")

    gu_raw = json.loads(Path(gu_src).read_text(encoding="utf-8"))
    gus = []
    for feature in gu_raw["features"]:
        p = feature["properties"]
        name = p["자치구"]
        acc = by_sgg.get(name)
        slope_mean = acc["slope"] / acc["n"] if acc else None
        steep_ratio = acc["steep"] / acc["n"] if acc else None
        geometry = geom_of(feature)
        lat, lon = centroid(geometry)
        gus.append({"type": "Feature", "geometry": geometry, "properties": {
            "name": name,
            "sgg": p["sgg"],
            "risk": risk_score(slope_mean, steep_ratio),
            "slope_mean": num(slope_mean),
            "steep_ratio": num(steep_ratio, 3),
            "points": acc["n"] if acc else None,
            "lat": lat, "lon": lon,
        }})

    gus.sort(key=lambda f: f["properties"]["name"])
    write(OUT / "seoul_gu_risk.geojson", gus, "자치구")


def write(path: Path, features: list, label: str) -> None:
    path.write_text(json.dumps({"type": "FeatureCollection", "features": features},
                               ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{label} {len(features)}개 → {path.name} ({path.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
