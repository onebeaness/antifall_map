"""Tmap API 클라이언트.

- POI 통합검색: 출발지/도착지 이름 검색 → 좌표
- 경로안내: 보행자 경로 → 경로 좌표열(폴리라인)

공식 문서: https://openapi.sk.com/ (TMAP > 명칭검색, 보행자 경로안내)
모든 요청은 헤더 `appKey`로 인증한다.
"""

from __future__ import annotations

from dataclasses import dataclass

import requests

from app.utils.secrets import mask_secrets as _safe

BASE_URL = "https://apis.openapi.sk.com"
TIMEOUT = 10


class TmapError(RuntimeError):
    pass


@dataclass
class Poi:
    name: str
    address: str
    lat: float
    lon: float


@dataclass
class Route:
    """경로 좌표열과 요약 정보."""

    points: list[tuple[float, float]]  # (lat, lon)
    total_distance_m: float
    total_time_s: float


def _request(method: str, path: str, app_key: str, **kwargs) -> dict:
    headers = kwargs.pop("headers", {})
    headers.update({"appKey": app_key, "Accept": "application/json"})
    try:
        resp = requests.request(
            method, f"{BASE_URL}{path}", headers=headers, timeout=TIMEOUT, **kwargs
        )
    except requests.RequestException as e:
        raise TmapError(f"Tmap API 요청 실패: {_safe(e)}") from e
    if resp.status_code == 401 or resp.status_code == 403:
        raise TmapError("Tmap appKey 인증에 실패했습니다. appKey를 확인하세요.")
    if not resp.ok:
        raise TmapError(f"Tmap API 오류 (HTTP {resp.status_code}): {_safe(resp.text)[:300]}")
    return resp.json()


def search_poi(app_key: str, keyword: str, count: int = 5) -> list[Poi]:
    """명칭(POI) 통합검색."""
    if not keyword.strip():
        return []
    data = _request(
        "GET",
        "/tmap/pois",
        app_key,
        params={
            "version": 1,
            "searchKeyword": keyword,
            "count": count,
            "resCoordType": "WGS84GEO",
            "reqCoordType": "WGS84GEO",
        },
    )
    pois = (
        data.get("searchPoiInfo", {})
        .get("pois", {})
        .get("poi", [])
    )
    results = []
    for p in pois:
        addr = " ".join(
            filter(None, [p.get("upperAddrName"), p.get("middleAddrName"), p.get("lowerAddrName")])
        )
        results.append(
            Poi(
                name=p.get("name", ""),
                address=addr,
                lat=float(p["frontLat"]),
                lon=float(p["frontLon"]),
            )
        )
    return results


def _parse_route_features(data: dict) -> Route:
    points: list[tuple[float, float]] = []
    total_distance = 0.0
    total_time = 0.0
    for feature in data.get("features", []):
        props = feature.get("properties", {})
        if "totalDistance" in props:
            total_distance = float(props["totalDistance"])
        if "totalTime" in props:
            total_time = float(props["totalTime"])
        geom = feature.get("geometry", {})
        if geom.get("type") == "LineString":
            for lon, lat in geom.get("coordinates", []):
                pt = (float(lat), float(lon))
                if not points or points[-1] != pt:
                    points.append(pt)
    if len(points) < 2:
        raise TmapError("경로 좌표를 찾지 못했습니다. 출발지/도착지를 다시 확인하세요.")
    return Route(points=points, total_distance_m=total_distance, total_time_s=total_time)


def pedestrian_route(
    app_key: str, start: Poi, end: Poi
) -> Route:
    """보행자 경로안내."""
    data = _request(
        "POST",
        "/tmap/routes/pedestrian?version=1",
        app_key,
        json={
            "startX": str(start.lon),
            "startY": str(start.lat),
            "endX": str(end.lon),
            "endY": str(end.lat),
            "startName": start.name or "출발지",
            "endName": end.name or "도착지",
            "reqCoordType": "WGS84GEO",
            "resCoordType": "WGS84GEO",
        },
    )
    return _parse_route_features(data)
