"""보행로 종단경사 계산 — 원본 `경사도`가 지형 경사라서 직접 다시 낸다.

## 왜 다시 계산하나

원본 지점의 `경사도`는 그 자리 **지형의 경사**(DEM terrain slope)다.
길을 따라 올라가는 **종단경사**가 아니다. 산비탈을 사선으로 가로지르는
길은 지형이 16°여도 길 자체는 3°인데, 원본은 16°를 준다.

    way 1436650821 (관악구 난향동)
      길이 2,796m, 표고 141m → 39m
      길을 따라간 종단경사   2.1°   ← 로드뷰와 일치 (완만한 오르막)
      원본 경사도            평균 7.5°, 최대 16.2°  ← 옆 절개지를 읽은 값

낙상 위험과 관계있는 건 **내가 딛고 올라가는 기울기**, 즉 종단경사다.

## 지점 순서 복원

원본은 선(way)에서 뽑은 점들인데 정점 순서가 남아 있지 않다. 파일 순서도
fid 순서도 길을 따라가지 않는다(100m 넘는 점프가 30%). gpkg도 POINT라
선형 geometry가 없다.

대신 **최근접 이웃으로 사슬을 잇는다.** 샘플 간격이 20m로 균일해서
바깥쪽 끝점에서 시작해 가장 가까운 점을 차례로 이으면 원래 선이 복원된다
(위 way에서 구간 거리 중앙 20m·최대 20m, 100m 넘는 점프 0개).

## 기준거리

DEM이 30m 격자라 표고가 계단처럼 양자화되어 있다. 인접 20m 구간의
표고차로 나누면 격자 경계에서 값이 튄다. 격자 3배인 90m를 기준거리로 잡아
그 구간의 평균 기울기를 쓴다.

## 다리·터널

DEM은 지표면 모델이라 **다리 아래 지면**과 **터널 위 산**을 읽는다. 그 위를
지나는 길의 표고가 통째로 틀어져 없는 경사가 생긴다. GraphHopper·Valhalla도
같은 문제를 겪고, 둘 다 다리·터널은 양끝 표고로 선형 보간해 해결한다.
같은 방식을 쓴다 — OSM에서 다리·터널은 별도 way로 잘려 있어 way 전체를
일정 기울기로 두면 된다. 실제로도 구조물은 일정 기울기로 짓는다.

서울 생활 보행로 31,695개 중 다리 1,091개(3.4%), 터널 515개(1.6%)다.
"""
from __future__ import annotations

import math
from collections import defaultdict

#: OSM에서 "구조물 아님"을 뜻하는 값들 — bridge=no 같은 태그가 실제로 있다
_NEGATIVE = {"no", "none", "false", "0"}


def is_structure(tags: dict | None) -> bool:
    """다리·터널이라 DEM 표고를 믿으면 안 되는 way인가."""
    if not tags:
        return False
    return any(str(tags.get(k, "no")).lower() not in _NEGATIVE
               for k in ("bridge", "tunnel"))

EARTH_R = 6_371_000.0
#: DEM 격자(30m)의 3배 — 이보다 짧은 구간의 표고차는 양자화 노이즈다
BASELINE_M = 90.0
#: 사슬에서 이만큼 벌어지면 같은 선이 아니다. 한 osm_id가 떨어진 여러 구간으로
#: 이루어진 경우가 있는데, 그 틈을 가로질러 경사를 내면 값이 크게 튄다
#: (여의도에 16°, 청담동에 40°가 찍히던 원인). 샘플 간격 20m의 3배로 잡는다.
MAX_GAP_M = 60.0


def haversine(a: tuple[float, float], b: tuple[float, float]) -> float:
    """(lon, lat) 두 점 사이 거리(m)."""
    dlat = math.radians(b[1] - a[1])
    dlon = math.radians(b[0] - a[0])
    x = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(a[1])) * math.cos(math.radians(b[1]))
         * math.sin(dlon / 2) ** 2)
    return 2 * EARTH_R * math.asin(math.sqrt(x))


def chain(points: list[dict]) -> list[dict]:
    """최근접 이웃으로 길을 따라간 순서를 복원한다.

    시작점은 '다른 점들로부터 가장 멀리 떨어진 점' — 선의 한쪽 끝이다.
    """
    if len(points) < 3:
        return points
    coords = [p["coord"] for p in points]
    start = max(range(len(points)),
                key=lambda i: max(haversine(coords[i], c) for c in coords))
    remaining = set(range(len(points)))
    remaining.discard(start)
    order = [start]
    while remaining:
        cur = coords[order[-1]]
        nxt = min(remaining, key=lambda i: haversine(cur, coords[i]))
        order.append(nxt)
        remaining.discard(nxt)
    return [points[i] for i in order]


def longitudinal_slopes(points: list[dict],
                        baseline_m: float = BASELINE_M,
                        structure: bool = False) -> list[float] | None:
    """way 하나의 지점별 종단경사(도). points는 {coord, elev} 목록.

    structure=True면 다리·터널로 보고 표고를 양끝 선형보간으로 갈아끼운다.
    반환 길이는 points와 같고 순서도 입력 순서 그대로다.
    지점이 2개 미만이면 None.
    """
    if len(points) < 2:
        return None
    ordered = chain(points)

    # 틈이 큰 곳에서 끊어 이어진 구간끼리만 계산한다
    parts: list[list[dict]] = [[ordered[0]]]
    for prev, cur in zip(ordered, ordered[1:]):
        if haversine(prev["coord"], cur["coord"]) > MAX_GAP_M:
            parts.append([])
        parts[-1].append(cur)

    by_id: dict[int, float] = {}
    for part in parts:
        if len(part) < 2:
            continue
        pos = [0.0]
        for a, b in zip(part, part[1:]):
            pos.append(pos[-1] + haversine(a["coord"], b["coord"]))
        if pos[-1] <= 0:
            continue
        n = len(part)
        elev = [p["elev"] for p in part]
        if structure:
            # 다리·터널: 중간 표고는 DEM이 읽은 아래 지면/위 산이라 버린다
            lo, hi = elev[0], elev[-1]
            elev = [lo + (hi - lo) * (d / pos[-1]) for d in pos]
        for i in range(n):
            lo = hi = i
            # 기준거리를 채울 때까지 양쪽으로 넓힌다 (끝에서는 가능한 만큼)
            while pos[hi] - pos[lo] < baseline_m and (lo > 0 or hi < n - 1):
                if hi < n - 1 and (pos[hi] - pos[i] <= pos[i] - pos[lo] or lo == 0):
                    hi += 1
                elif lo > 0:
                    lo -= 1
                else:
                    break
            run = pos[hi] - pos[lo]
            if run <= 0:
                continue
            rise = abs(elev[hi] - elev[lo])
            by_id[id(part[i])] = math.degrees(math.atan2(rise, run))

    if not by_id:
        return None
    return [by_id.get(id(p), 0.0) for p in points]


def compute_by_way(records: list[dict],
                   osm_tags: dict[str, dict] | None = None) -> int:
    """records를 way별로 묶어 각 항목에 'slope' 키를 채운다 (제자리 수정).

    records: [{osm_id, coord:(lon,lat), elev, ...}, ...]
    osm_tags: way id → OSM 태그 (data/osm_walkway_tags.json). 다리·터널 보정에 쓴다.

    종단경사를 낼 수 없는 way(지점 1개)의 항목에는 slope를 넣지 않는다.
    반환값은 구조물로 보정한 way 수.
    """
    ways: dict[str, list[dict]] = defaultdict(list)
    for r in records:
        ways[r["osm_id"]].append(r)
    fixed = 0
    for way_id, group in ways.items():
        structure = is_structure((osm_tags or {}).get(str(way_id)))
        slopes = longitudinal_slopes(group, structure=structure)
        if slopes is None:
            continue
        fixed += structure
        for record, slope in zip(group, slopes):
            record["slope"] = round(slope, 2)
    return fixed
