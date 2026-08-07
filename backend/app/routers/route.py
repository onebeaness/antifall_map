"""경로 경사도 분석 API.

Tmap 경로 조회 → 리샘플링(기본 30m) → DEM 고도 조회 → 이동평균 스무딩 →
구간별 경사도(%) 계산. 원본 route_heatmap._analyze_route 와 동일한 파이프라인.
"""
from __future__ import annotations


from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app import config
from app.services import elevation as elev_svc
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

    # 고도: OpenTopoData 우선, 실패 시 Open-Elevation 폴백
    try:
        elevations = elev_svc.get_elevations_opentopodata(points)
    except elev_svc.ElevationError:
        try:
            elevations = elev_svc.get_elevations_open_elevation(points)
        except elev_svc.ElevationError as ex:
            raise HTTPException(status_code=502, detail=str(ex)) from ex

    elevations = geo.smooth(elevations, window=3)
    slopes = geo.compute_slopes(distances, elevations)

    return {
        "route_points": [[lat, lon] for lat, lon in route.points],
        "points": [[lat, lon] for lat, lon in points],
        "distances": distances,
        "elevations": elevations,
        "slopes": slopes,
        "total_distance_m": route.total_distance_m,
        "total_time_s": route.total_time_s,
    }
