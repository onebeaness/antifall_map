"""V-World(공간정보 오픈플랫폼) API 클라이언트.

현재 이 앱에서 V-World가 담당하는 것:
- 배경지도 XYZ 타일 (folium TileLayer 로 사용)
- 지오코딩 (주소 → 좌표) — Tmap POI 검색 실패 시 보조 수단

참고: V-World의 원본 DEM(수치표고모형) 3D 오픈 API는 폐쇄되어
(보안 데이터로 전환) 점 단위 표고 REST 조회를 제공하지 않는다.
경사도 계산용 고도 조회는 services/elevation.py 의 프로바이더가 담당한다.
"""

from __future__ import annotations

import requests

from app.utils.secrets import mask_secrets as _safe

TIMEOUT = 10


class VWorldError(RuntimeError):
    pass


def tile_url(api_key: str, layer: str = "Base") -> str:
    """folium/leaflet 에서 쓸 수 있는 V-World XYZ 타일 URL 템플릿.

    layer: Base(일반), Satellite(위성), Hybrid(위성+라벨), midnight, gray 등
    """
    return f"https://api.vworld.kr/req/wmts/1.0.0/{api_key}/{layer}/{{z}}/{{y}}/{{x}}.png"


def geocode(api_key: str, address: str) -> tuple[float, float] | None:
    """주소 → (lat, lon). 실패 시 None."""
    try:
        resp = requests.get(
            "https://api.vworld.kr/req/address",
            params={
                "service": "address",
                "request": "getcoord",
                "version": "2.0",
                "crs": "epsg:4326",
                "address": address,
                "type": "road",
                "key": api_key,
            },
            timeout=TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
    except (requests.RequestException, ValueError) as e:
        raise VWorldError(f"V-World 지오코딩 요청 실패: {_safe(e)}") from e

    response = data.get("response", {})
    if response.get("status") != "OK":
        # 도로명 주소로 못 찾으면 지번(parcel)으로 한 번 더 시도
        try:
            resp = requests.get(
                "https://api.vworld.kr/req/address",
                params={
                    "service": "address",
                    "request": "getcoord",
                    "version": "2.0",
                    "crs": "epsg:4326",
                    "address": address,
                    "type": "parcel",
                    "key": api_key,
                },
                timeout=TIMEOUT,
            )
            response = resp.json().get("response", {})
        except (requests.RequestException, ValueError):
            return None
        if response.get("status") != "OK":
            return None
    point = response.get("result", {}).get("point", {})
    try:
        return float(point["y"]), float(point["x"])
    except (KeyError, TypeError, ValueError):
        return None
