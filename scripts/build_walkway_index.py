#!/usr/bin/env python3
"""경로 경사 조회용 보행로 색인 생성.

    python3 scripts/build_walkway_index.py <seoul_total_*.geojson>

## 왜 필요한가

경로 경사를 무료 DEM API(OpenTopoData, SRTM 30m)로 계산해 왔는데 도심에서
값이 크게 틀어졌다. SRTM은 지표가 아니라 **표면**을 담아서 건물 옥상 높이가
셀 값에 섞이고, 격자(30m)와 리샘플링 간격(30m)이 같아 이웃 셀의 높이차가
그대로 경사로 잡힌다. 실제로 충무로역 앞 평지가 21.9%, 평지 교차로가 12.2%
급경사로 표시됐다 — 내가 갈 길이 아니라 옆 건물·비탈을 읽은 것이다.

대신 팀 GIS 산출물의 보행로 지점을 쓴다. 지점마다 표고와 경사도가 이미
계산되어 있고, 보행로 **위**에서 뽑힌 값이라 옆 건물의 영향을 받지 않는다.
경로의 각 좌표를 가장 가까운 보행로 지점에 붙여(스냅) 그 값을 읽는다.

덤으로 OpenTopoData 공개 인스턴스 제한(초당 1회, 일 1,000회)에서 벗어나고,
네트워크 왕복이 사라져 응답이 훨씬 빨라진다.

## 산출물

backend/data/walkway_seoul.npz — lat, lon, slope_deg, elev (float32).
등산로(도로유형 path)는 제외한다. 생활 보행로만 대상이다.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

DEST = Path(__file__).resolve().parent.parent / "backend/data/walkway_seoul.npz"
WALKWAY_TYPES = {"footway", "pedestrian"}   # path(등산로) 제외


def main(points_src: str) -> None:
    lat, lon, slope, elev = [], [], [], []
    skipped = 0
    with open(points_src, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip().rstrip(",")
            if not line.startswith('{"type":"Feature"'):
                continue
            feature = json.loads(line)
            p = feature["properties"]
            if p.get("도로유형") not in WALKWAY_TYPES:
                skipped += 1
                continue
            s, z = p.get("경사도"), p.get("표고")
            if s is None or z is None:
                continue
            c = feature["geometry"]["coordinates"]
            lon.append(c[0]); lat.append(c[1]); slope.append(s); elev.append(z)

    DEST.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        DEST,
        lat=np.asarray(lat, dtype=np.float32),
        lon=np.asarray(lon, dtype=np.float32),
        slope_deg=np.asarray(slope, dtype=np.float32),
        elev=np.asarray(elev, dtype=np.float32),
    )
    size_kb = DEST.stat().st_size // 1024
    print(f"보행로 지점 {len(lat):,}개 색인 (등산로 등 {skipped:,}개 제외) "
          f"→ {DEST.relative_to(DEST.parent.parent.parent)} ({size_kb} KB)")
    print(f"  경사(도)  min={min(slope):.2f} max={max(slope):.2f}")
    print(f"  표고(m)   min={min(elev):.1f} max={max(elev):.1f}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
