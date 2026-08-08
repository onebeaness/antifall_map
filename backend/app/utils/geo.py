"""경로 좌표 처리: 거리 계산, 리샘플링, 경사도 계산, 색상 매핑."""

from __future__ import annotations

from bisect import bisect_left, bisect_right

import math

import numpy as np

EARTH_RADIUS_M = 6_371_000.0


def haversine_m(p1: tuple[float, float], p2: tuple[float, float]) -> float:
    """두 (lat, lon) 좌표 사이 거리(m)."""
    lat1, lon1, lat2, lon2 = map(math.radians, (*p1, *p2))
    dlat, dlon = lat2 - lat1, lon2 - lon1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a))


def resample_route(
    points: list[tuple[float, float]], interval_m: float = 30.0, max_points: int = 300
) -> tuple[list[tuple[float, float]], list[float]]:
    """경로를 interval_m 간격으로 리샘플링.

    고도 API 호출 수를 제한하기 위해 max_points를 넘으면 간격을 늘린다.
    반환: (리샘플링된 좌표 리스트, 각 점의 누적거리(m) 리스트)
    """
    if len(points) < 2:
        raise ValueError("경로에 좌표가 2개 이상 필요합니다.")

    seg_len = [haversine_m(points[i], points[i + 1]) for i in range(len(points) - 1)]
    total = sum(seg_len)
    if total <= 0:
        raise ValueError("경로 길이가 0입니다.")

    n_target = int(total / interval_m) + 1
    if n_target > max_points:
        interval_m = total / (max_points - 1)

    resampled = [points[0]]
    distances = [0.0]
    next_d = interval_m
    acc = 0.0
    for i, L in enumerate(seg_len):
        if L == 0:
            continue
        while next_d <= acc + L:
            t = (next_d - acc) / L
            lat = points[i][0] + t * (points[i + 1][0] - points[i][0])
            lon = points[i][1] + t * (points[i + 1][1] - points[i][1])
            resampled.append((lat, lon))
            distances.append(next_d)
            next_d += interval_m
        acc += L
    if distances[-1] < total - 1.0:
        resampled.append(points[-1])
        distances.append(total)
    return resampled, distances


#: 경사 계산 기준거리(m). DEM 한 셀(SRTM 30m)의 3배.
SLOPE_BASELINE_M = 90.0


def compute_slopes(distances: list[float], elevations: list[float],
                   baseline_m: float = SLOPE_BASELINE_M) -> list[float]:
    """구간별 경사도(%) 계산. 반환 길이는 len(distances) - 1.

    ⚠️ 이웃한 두 샘플의 고도차로 바로 나누면 안 된다. 우리가 쓰는 SRTM은
    30m 격자이고 리샘플링 간격도 30m라, 연속한 두 점이 같은 셀이나 바로
    옆 셀에 걸린다. 게다가 SRTM은 지표가 아니라 **표면**을 담아서 도심에서는
    옆 건물·비탈 높이가 셀 값에 섞인다. 그래서 평지 교차로가 12% 급경사로
    잡히는 일이 생겼다 — 내가 갈 길이 아니라 길 옆 언덕을 읽은 것이다.

    격자 하나로 분해할 수 없는 것을 억지로 읽지 않도록, 셀 크기의 3배
    (기본 90m)를 기준거리로 잡아 그 구간의 평균 기울기를 쓴다. 보행자에게도
    이쪽이 더 맞는 정보다 — 30m 단위 요철보다 "이 언덕을 오르는가"가 중요하다.
    """
    n = len(distances)
    if n < 2:
        return []
    half = baseline_m / 2
    slopes = []
    for i in range(n - 1):
        mid = (distances[i] + distances[i + 1]) / 2
        lo = bisect_left(distances, mid - half)
        hi = bisect_right(distances, mid + half) - 1
        # 기준거리를 못 채우면(경로 끝) 가능한 만큼 넓힌다
        lo = min(lo, i)
        hi = max(hi, i + 1)
        run = distances[hi] - distances[lo]
        rise = elevations[hi] - elevations[lo]
        slopes.append((rise / run) * 100.0 if run > 0 else 0.0)
    return slopes


def smooth(values: list[float], window: int = 5) -> list[float]:
    """이동평균으로 노이즈 완화 (DEM 해상도 대비 촘촘한 샘플링 보정).

    30m 격자 DEM을 30m 간격으로 읽으면 셀 경계에서 값이 계단처럼 튄다.
    5점 평균이면 약 150m를 보므로 그 계단이 눌린다.
    """
    if window <= 1 or len(values) < window:
        return list(values)
    arr = np.asarray(values, dtype=float)
    kernel = np.ones(window) / window
    padded = np.pad(arr, (window // 2, window - 1 - window // 2), mode="edge")
    return np.convolve(padded, kernel, mode="valid").tolist()


# 경사도(%) 구간별 색 (오르막/내리막 공통, 절대값 기준)
SLOPE_BINS = [3.0, 6.0, 9.0, 12.0]
SLOPE_COLORS = ["#2b83ba", "#abdda4", "#ffffbf", "#fdae61", "#d7191c"]
SLOPE_LABELS = ["0~3% (평지)", "3~6% (완만)", "6~9% (보통)", "9~12% (가파름)", "12%~ (매우 가파름)"]


def slope_color(slope_pct: float) -> str:
    s = abs(slope_pct)
    for threshold, color in zip(SLOPE_BINS, SLOPE_COLORS):
        if s < threshold:
            return color
    return SLOPE_COLORS[-1]
