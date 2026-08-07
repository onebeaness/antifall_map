#!/usr/bin/env python3
"""보행 경사위험도 geojson 생성 (자치구 + 행정동).

    python3 scripts/build_risk_geojson.py <seoul_total_*.geojson> \\
        <dong_final_polygon_v3.geojson> <gu_final_polygon.geojson>

원본 폴리곤에 들어 있는 집계값을 그대로 쓰지 않고, 보행로 지점 원본에서
직접 집계한다. 아래 두 가지를 바로잡아야 하기 때문이다.

## 1. 등산로 제외 (도로유형 path)

원본 지점 185,114개의 구성은 이렇다.

    footway     133,863   표고 중앙 22m   경사 평균  2.4°   대표: 화랑로·한강산책길
    path         47,309   표고 중앙 114m  경사 평균 10.9°   대표: 비법정탐방로·북한산둘레길·사당능선
    pedestrian    3,942   표고 중앙 23m   경사 평균  2.7°   대표: 광화문광장·서울로7017

path는 전부 등산로다. 전체의 25.6%를 차지하면서 경사 평균을 통째로 끌어올린다.
관악구 낙성대동이 대표적인데, 656개 지점 중 570개(87%)가 관악산 등산로
(표고 300~357m)라 평균 경사가 10.3°로 나왔다. 정작 시가지 보도는 5.2°이고
로드뷰로 보면 평평하다. 등산로 경사는 고령자의 생활 낙상 위험과 무관하므로
footway·pedestrian만 남긴다.

## 2. 기준 초과 비율 (구 '급경사 비율')

원본의 급경사 판정은 10° 이상인데, 이는 등산로 기준이다. 보도에서 10°는
거의 나오지 않아(생활 보행로 기준 2.9%) 지표가 무뎌진다. 무장애 설계기준
최대 종단경사 1/12(4.76°)를 넘는 지점의 비율로 바꾼다 — 정비 대상을
직접 가리키는 숫자이기도 하다.

## 산식

    상시부담   = min(1, 평균 경사 / 4.76)
    기준초과   = 4.76° 이상 지점의 비율
    경사위험도 = 100 × (0.5 × 상시부담 + 0.5 × 기준초과)

등급 경계는 설계기준 지점과 맞췄다. 기준 초과가 0일 때
    양호 <30  = 평균 경사가 권장 1/20(2.86°) 미만
    주의 30~49 = 권장 초과, 최대 이내
    위험 50+   = 평균 경사가 최대 1/12(4.76°) 초과

지점이 MIN_POINTS 미만인 동은 표본이 부족해 값을 내지 않는다(지도에서 회색).
"""
from __future__ import annotations

import json
import statistics
import sys
from collections import defaultdict
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "frontend/public/geo"

WALKWAY_TYPES = {"footway", "pedestrian"}   # path(등산로) 제외
BF_MAX = 4.76        # 무장애 설계기준 최대 종단경사 1/12 (도)
MIN_POINTS = 10      # 이보다 적으면 표본 부족으로 판단해 값을 내지 않는다 (하위 10%)
COORD_DIGITS = 5     # 약 1m — 행정구역 경계에는 충분하고 용량을 크게 줄인다


def collect(points_path: str) -> dict[str, list[tuple[float, float, float]]]:
    """보행로 지점을 행정동 코드별 (경사, 위도, 경도) 목록으로 모은다 (스트리밍).

    좌표까지 들고 있는 이유: 로드뷰 링크를 동 중심점이 아니라 **가장 가파른
    지점**으로 걸기 위해서다. 중심점은 큰길 한복판이라 평지인 경우가 많아,
    가파르다고 표시된 동을 로드뷰로 열면 평평해 보이는 문제가 있었다.
    """
    by_dong: dict[str, list[tuple[float, float, float]]] = defaultdict(list)
    kept = skipped = 0
    with open(points_path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip().rstrip(",")
            if not line.startswith('{"type":"Feature"'):
                continue
            p = json.loads(line)["properties"]
            if p.get("도로유형") not in WALKWAY_TYPES:
                skipped += 1
                continue
            slope, code = p.get("경사도"), p.get("adm_cd")
            if slope is None or not code:
                continue
            lon, lat = json.loads(line)["geometry"]["coordinates"][:2]
            by_dong[code].append((float(slope), lat, lon))
            kept += 1
    print(f"보행로 지점 {kept:,}개 집계 (등산로 등 {skipped:,}개 제외)")
    return by_dong


def stats(points: list[tuple[float, float, float]]) -> dict:
    """(경사, 위도, 경도) 목록 → 지표. 표본이 적으면 risk를 내지 않는다."""
    n = len(points)
    slopes = [s for s, _, _ in points]
    mean = statistics.fmean(slopes)
    exceed = sum(1 for s in slopes if s >= BF_MAX) / n
    risk = (None if n < MIN_POINTS
            else round(100 * (0.5 * min(1.0, mean / BF_MAX) + 0.5 * exceed)))
    worst = max(points)  # 경사가 가장 큰 지점 — 로드뷰로 바로 확인할 자리
    return {"risk": risk, "slope_mean": round(mean, 1), "slope_max": round(worst[0], 1),
            "exceed_ratio": round(exceed, 3), "points": n,
            "worst_lat": round(worst[1], 5), "worst_lon": round(worst[2], 5)}


EMPTY = {"risk": None, "slope_mean": None, "slope_max": None,
         "exceed_ratio": None, "points": 0, "worst_lat": None, "worst_lon": None}


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


def main(points_src: str, dong_src: str, gu_src: str) -> None:
    by_dong = collect(points_src)

    dongs = []
    by_sgg: dict[str, list[tuple[float, float, float]]] = defaultdict(list)
    for feature in json.loads(Path(dong_src).read_text(encoding="utf-8"))["features"]:
        p = feature["properties"]
        pts = by_dong.get(p["adm_cd"], [])
        geometry = geom_of(feature)
        lat, lon = centroid(geometry)
        dongs.append({"type": "Feature", "geometry": geometry, "properties": {
            "name": " ".join(p["adm_nm"].split()[1:]),  # "서울특별시 종로구 사직동" → "종로구 사직동"
            "sgg": p["sggnm"],
            "adm_cd": p["adm_cd"],      # 통계청(SGIS)
            "adm_cd2": p["adm_cd2"],    # 행자부 10자리
            **(stats(pts) if pts else EMPTY),
            "lat": lat, "lon": lon,
        }})
        by_sgg[p["sggnm"]].extend(pts)

    dongs.sort(key=lambda f: f["properties"]["name"])
    write(OUT / "seoul_dong_risk.geojson", dongs, "행정동")

    gus = []
    for feature in json.loads(Path(gu_src).read_text(encoding="utf-8"))["features"]:
        name = feature["properties"]["자치구"]
        pts = by_sgg.get(name, [])
        geometry = geom_of(feature)
        lat, lon = centroid(geometry)
        gus.append({"type": "Feature", "geometry": geometry, "properties": {
            "name": name,
            "sgg": feature["properties"]["sgg"],
            **(stats(pts) if pts else EMPTY),
            "lat": lat, "lon": lon,
        }})

    gus.sort(key=lambda f: f["properties"]["name"])
    write(OUT / "seoul_gu_risk.geojson", gus, "자치구")


def write(path: Path, features: list, label: str) -> None:
    path.write_text(json.dumps({"type": "FeatureCollection", "features": features},
                               ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    scored = sum(1 for f in features if f["properties"]["risk"] is not None)
    print(f"{label} {len(features)}개 (값 있음 {scored}개) "
          f"→ {path.name} ({path.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2], sys.argv[3])
