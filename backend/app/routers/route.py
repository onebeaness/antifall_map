"""경로 경사도 분석 API.

Tmap 경로 조회 → 리샘플링(기본 30m) → DEM 고도 조회 → 이동평균 스무딩 →
구간별 경사도(%) 계산. 원본 route_heatmap._analyze_route 와 동일한 파이프라인.
"""
from __future__ import annotations


from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app import config
from app.services import elevation as elev_svc
from app.services import walkway as walkway_svc
from app.services import tmap as tmap_svc
from app.utils import geo

router = APIRouter()


class RoutePoint(BaseModel):
    name: str = ""
    lat: float
    lon: float


class RouteRequest(BaseModel):
    start: RoutePoint
    end: RoutePoint
    interval_m: float = Field(30.0, ge=10, le=100, description="리샘플링 간격(m)")


@router.post("/route")
def analyze_route(req: RouteRequest) -> dict:
    """보행자 경로 + 구간별 경사도. 응답: IA.md 3절 스키마.

    이 서비스는 고령자 보행 안전이 목적이라 자동차 경로는 다루지 않는다.
    """
    if not config.TMAP_APP_KEY:
        raise HTTPException(status_code=503, detail="TMAP_APP_KEY가 설정되지 않았습니다.")

    s = tmap_svc.Poi(name=req.start.name or "출발지", address="",
                     lat=req.start.lat, lon=req.start.lon)
    e = tmap_svc.Poi(name=req.end.name or "도착지", address="",
                     lat=req.end.lat, lon=req.end.lon)
    try:
        route = tmap_svc.pedestrian_route(config.TMAP_APP_KEY, s, e)
    except tmap_svc.TmapError as ex:
        raise HTTPException(status_code=502, detail=str(ex)) from ex

    try:
        points, distances = geo.resample_route(route.points, interval_m=req.interval_m)
    except ValueError as ex:
        raise HTTPException(status_code=422, detail=str(ex)) from ex

    # 1순위: 보행로 실측 경사. 무료 DEM(SRTM 30m)은 지표가 아니라 표면을 담아
    # 도심에서 옆 건물 높이를 경사로 읽는다(충무로역 앞 평지가 21.9%로 나왔다).
    snapped_deg, snapped_elev = walkway_svc.snap(points)
    matched = sum(1 for d in snapped_deg if d is not None)
    source = "walkway"

    if matched >= len(points) * 0.6:
        # 크기는 보행로 실측값에서, 오르막·내리막 방향은 표고 흐름에서 가져온다.
        # 스냅 실패 구간은 양옆 값으로 메운다(서울 안에서는 드물다).
        elevations = geo.smooth(_fill_gaps(snapped_elev), window=3)
        degrees = _fill_gaps(snapped_deg)
        slopes = []
        for i in range(len(points) - 1):
            magnitude = walkway_svc.degrees_to_percent((degrees[i] + degrees[i + 1]) / 2)
            rise = elevations[i + 1] - elevations[i]
            slopes.append(magnitude if rise >= 0 else -magnitude)
    else:
        # 서울 밖이거나 보행로가 등록되지 않은 구간 — DEM으로 폴백
        source = "dem"
        try:
            elevations = elev_svc.get_elevations_opentopodata(points)
        except elev_svc.ElevationError:
            try:
                elevations = elev_svc.get_elevations_open_elevation(points)
            except elev_svc.ElevationError as ex:
                raise HTTPException(status_code=502, detail=str(ex)) from ex
        elevations = geo.smooth(elevations)
        slopes = geo.compute_slopes(distances, elevations)

    return {
        "route_points": [[lat, lon] for lat, lon in route.points],
        "points": [[lat, lon] for lat, lon in points],
        "distances": distances,
        "elevations": elevations,
        "slopes": slopes,
        "total_distance_m": route.total_distance_m,
        "total_time_s": route.total_time_s,
        "slope_source": source,          # walkway=보행로 실측 / dem=위성 고도모델
        "matched_points": matched,
    }


def _fill_gaps(values: list[float | None]) -> list[float]:
    """스냅 실패 구간을 앞뒤 값으로 메운다. 전부 비어 있으면 0."""
    known = [v for v in values if v is not None]
    if not known:
        return [0.0] * len(values)
    out, last = [], known[0]
    for v in values:
        if v is not None:
            last = v
        out.append(last)
    # 앞쪽 결측은 뒤에서 한 번 더 훑어 채운다
    nxt = known[-1]
    for i in range(len(out) - 1, -1, -1):
        if values[i] is not None:
            nxt = values[i]
        elif i < len(out):
            out[i] = nxt
    return out
