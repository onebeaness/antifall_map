"""보행로 지점 스냅 — 경로 좌표에 실측 경사·표고를 붙인다.

경로 경사를 무료 DEM API(SRTM 30m)로 계산하면 도심에서 크게 틀어진다.
SRTM은 지표가 아니라 **표면**을 담아 건물 옥상이 셀 값에 섞이고, 격자와
리샘플링 간격이 둘 다 30m라 이웃 셀의 높이차가 그대로 경사가 된다.
충무로역 앞 평지가 21.9%로 나온 게 그 때문이다 — 길이 아니라 옆 건물을 읽었다.

대신 팀 GIS 산출물의 보행로 지점(137,805개, 등산로 제외)에 스냅한다.
그 값들은 보행로 **위**에서 뽑혀 옆 건물의 영향을 받지 않는다.
색인 생성: scripts/build_walkway_index.py

스냅 반경 밖(서울 경계 밖, 보행로 미등록 구간)은 값을 내지 않고 None을
돌려준다. 호출부에서 DEM으로 폴백한다.
"""

from __future__ import annotations

import math
from pathlib import Path

import numpy as np

DATA = Path(__file__).resolve().parent.parent.parent / "data/walkway_seoul.npz"

#: 이 거리 안의 보행로 지점만 같은 길로 본다. 배포용 원본 앱과 같은 값.
SNAP_RADIUS_M = 35.0

#: 위경도를 미터 평면으로 근사할 때 쓰는 서울 기준 위도
_REF_LAT = 37.55
_M_PER_DEG_LAT = 111_132.0
_M_PER_DEG_LON = _M_PER_DEG_LAT * math.cos(math.radians(_REF_LAT))

_tree = None
_slope_deg: np.ndarray
_elev: np.ndarray


def _load():
    """색인을 한 번만 만든다. 서울 한 도시라 평면 근사로 충분하고 KDTree가 빠르다."""
    global _tree, _slope_deg, _elev
    if _tree is not None:
        return _tree
    if not DATA.exists():
        return None
    from scipy.spatial import cKDTree

    data = np.load(DATA)
    xy = np.column_stack([
        data["lon"].astype(np.float64) * _M_PER_DEG_LON,
        data["lat"].astype(np.float64) * _M_PER_DEG_LAT,
    ])
    _slope_deg = data["slope_deg"]
    _elev = data["elev"]
    _tree = cKDTree(xy)
    return _tree


def is_available() -> bool:
    return _load() is not None


def point_count() -> int:
    return 0 if _load() is None else len(_slope_deg)


def snap(points: list[tuple[float, float]]) -> tuple[list[float | None], list[float | None]]:
    """경로 좌표를 가장 가까운 보행로 지점에 붙인다.

    points: [(lat, lon), ...]
    반환: (경사도(도) 리스트, 표고(m) 리스트) — 반경 밖은 None.
    """
    tree = _load()
    if tree is None or not points:
        return [None] * len(points), [None] * len(points)

    query = np.array([[lon * _M_PER_DEG_LON, lat * _M_PER_DEG_LAT] for lat, lon in points])
    dist, idx = tree.query(query, k=1)
    ok = dist <= SNAP_RADIUS_M
    slopes = [float(_slope_deg[i]) if hit else None for i, hit in zip(idx, ok)]
    elevs = [float(_elev[i]) if hit else None for i, hit in zip(idx, ok)]
    return slopes, elevs


def degrees_to_percent(deg: float) -> float:
    """경사각(도) → 기울기(%). 보행 경사 표기는 % 관례를 따른다."""
    return math.tan(math.radians(deg)) * 100.0
