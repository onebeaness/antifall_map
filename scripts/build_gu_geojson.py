#!/usr/bin/env python3
"""자치구 보행환경 위험도 geojson 생성 (대시보드 드릴다운의 1단계).

    python3 scripts/build_gu_geojson.py <원본 gu_final_polygon.geojson>

원본은 지수 대신 **기여도**만 담고 있다. 기여도 = 지수 × 가중치이므로
가중치로 나눠 지수를 복원한다 (경사 0.64 / 협소 0.26 / 재질 0.10 —
동 단위 원본에서 두 값이 정확히 이 비율로 맞아떨어지는 것을 확인했다).

좌표는 소수점 5자리(약 1m)로 반올림해 용량을 줄인다. 자치구 경계는
축척이 커서 이 정도 해상도로 충분하다.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

DEST = Path(__file__).resolve().parent.parent / "frontend/public/geo/seoul_gu_risk.geojson"

WEIGHTS = {"slope_idx": ("경사_기여도", 0.64),
           "narrow_idx": ("협소_기여도", 0.26),
           "surface_idx": ("재질_기여도", 0.10)}
COORD_DIGITS = 5


def round_coords(node):
    """중첩 좌표 배열을 재귀적으로 반올림한다."""
    if isinstance(node, (int, float)):
        return round(node, COORD_DIGITS)
    return [round_coords(child) for child in node]


def centroid(geometry: dict) -> tuple[float, float]:
    """가장 큰 링의 꼭짓점 평균 — 라벨 위치 용도라 정밀도는 중요하지 않다."""
    polys = (geometry["coordinates"] if geometry["type"] == "MultiPolygon"
             else [geometry["coordinates"]])
    ring = max((p[0] for p in polys), key=len)
    lon = sum(c[0] for c in ring) / len(ring)
    lat = sum(c[1] for c in ring) / len(ring)
    return round(lat, 5), round(lon, 5)


def pct(value) -> int | None:
    return None if value is None else round(float(value) * 100)


def main(src_path: str) -> None:
    src = json.loads(Path(src_path).read_text(encoding="utf-8"))
    features = []

    for feature in src["features"]:
        p = feature["properties"]
        geometry = {"type": feature["geometry"]["type"],
                    "coordinates": round_coords(feature["geometry"]["coordinates"])}
        lat, lon = centroid(geometry)

        props = {
            "name": p["자치구"],
            "sgg": p["sgg"],
            "risk": pct(p.get("보행위험도")),
            "factor": p.get("주요위험요인"),
            "points": int(p["조사지점수"]) if p.get("조사지점수") is not None else None,
            "width_complete": (None if p.get("폭데이터_확보율") is None
                               else round(float(p["폭데이터_확보율"]), 3)),
            "surface_complete": (None if p.get("재질데이터_확보율") is None
                                 else round(float(p["재질데이터_확보율"]), 3)),
            "lat": lat, "lon": lon,
        }
        for key, (column, weight) in WEIGHTS.items():
            value = p.get(column)
            props[key] = None if value is None else pct(float(value) / weight)

        features.append({"type": "Feature", "properties": props, "geometry": geometry})

    features.sort(key=lambda f: f["properties"]["name"])
    DEST.write_text(
        json.dumps({"type": "FeatureCollection", "features": features},
                   ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8")
    size_kb = DEST.stat().st_size // 1024
    print(f"자치구 {len(features)}개 → {DEST} ({size_kb} KB)")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
