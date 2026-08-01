"""배경지도 설정/타일 프록시 — V-World 키를 프론트에 노출하지 않는다.

- GET /api/map/config          : 프론트가 쓸 타일 소스 결정 (vworld 프록시 or OSM)
- GET /api/map/tile/{layer}/{z}/{y}/{x}.png : V-World WMTS 타일 프록시
"""
from __future__ import annotations

import requests
from fastapi import APIRouter, HTTPException, Response

from app import config
from app.services import vworld as vworld_svc

router = APIRouter()

_ALLOWED_LAYERS = {"Base", "Satellite", "Hybrid", "midnight", "gray"}
_TILE_TIMEOUT = 10


@router.get("/config")
def map_config() -> dict:
    """V-World 키가 있으면 백엔드 프록시 타일, 없으면 OSM 직접 사용."""
    if config.VWORLD_API_KEY:
        return {
            "provider": "vworld",
            "tile_url": "/api/map/tile/Base/{z}/{y}/{x}.png",
            "attribution": "© V-World",
            "max_zoom": 19,
        }
    return {
        "provider": "osm",
        "tile_url": "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        "attribution": "© OpenStreetMap contributors",
        "max_zoom": 19,
    }


@router.get("/tile/{layer}/{z}/{y}/{x}.png")
def proxy_tile(layer: str, z: int, y: int, x: int) -> Response:
    if not config.VWORLD_API_KEY:
        raise HTTPException(status_code=503, detail="VWORLD_API_KEY가 설정되지 않았습니다.")
    if layer not in _ALLOWED_LAYERS:
        raise HTTPException(status_code=404, detail=f"지원하지 않는 레이어: {layer}")
    url = vworld_svc.tile_url(config.VWORLD_API_KEY, layer) \
        .replace("{z}", str(z)).replace("{y}", str(y)).replace("{x}", str(x))
    try:
        resp = requests.get(url, timeout=_TILE_TIMEOUT)
        resp.raise_for_status()
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"타일 조회 실패: {e}") from e
    return Response(
        content=resp.content,
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=86400"},
    )
