"""배경지도 설정/타일 프록시 — V-World 키를 프론트에 노출하지 않는다.

- GET /api/map/config : 프론트가 쓸 타일 소스 결정
- GET /api/map/tile/{layer}/{z}/{y}/{x}.png : V-World WMTS 타일 프록시
- GET /api/map/diag   : V-World 타일 요청 진단 (키·Referer 문제 확인용)

V-World는 인증키에 등록된 도메인에서 온 요청인지 Referer로 검증한다.
이 프록시는 서버에서 호출하므로 브라우저 Referer가 없다 → VWORLD_REFERER
환경변수에 등록한 도메인을 넣어 헤더로 직접 보낸다.

타일 조회가 실패하면 OSM 타일로 폴백해 지도가 비어 보이지 않게 한다.
"""
from __future__ import annotations

import requests
from fastapi import APIRouter, Response
from fastapi.responses import RedirectResponse

from app import config
from app.services import vworld as vworld_svc
from app.utils.secrets import mask_secrets

router = APIRouter()

_ALLOWED_LAYERS = {"Base", "Satellite", "Hybrid", "midnight", "gray"}
_TILE_TIMEOUT = 10
_OSM_TILE = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"


@router.get("/config")
def map_config() -> dict:
    """프론트가 쓸 타일 소스.

    기본은 OSM을 브라우저에서 직접 받는다 — 지도 한 화면에 타일이 20장 이상
    필요해, 무료 인스턴스로 중계하면 지연·유실이 커진다. 국내 상세 지도가
    필요하면 VWORLD_TILE_PROXY=true 로 프록시 경로를 켠다.
    """
    if config.VWORLD_API_KEY and config.VWORLD_TILE_PROXY:
        return {
            "provider": "vworld",
            "tile_url": "/api/map/tile/Base/{z}/{y}/{x}.png",
            "attribution": "© V-World · © OpenStreetMap",
            "max_zoom": 19,
        }
    return {
        "provider": "osm",
        "tile_url": _OSM_TILE,
        "attribution": "© OpenStreetMap contributors",
        "max_zoom": 19,
    }


def _fetch_vworld_tile(layer: str, z: int, y: int, x: int) -> requests.Response:
    url = (vworld_svc.tile_url(config.VWORLD_API_KEY, layer)
           .replace("{z}", str(z)).replace("{y}", str(y)).replace("{x}", str(x)))
    headers = {}
    if config.VWORLD_REFERER:
        # V-World 인증키에 등록한 사용URL과 같은 값이어야 통과한다
        headers["Referer"] = config.VWORLD_REFERER
    return requests.get(url, headers=headers, timeout=_TILE_TIMEOUT)


@router.get("/tile/{layer}/{z}/{y}/{x}.png")
def proxy_tile(layer: str, z: int, y: int, x: int):
    """V-World 타일 프록시. 실패 시 OSM 타일로 폴백(302)."""
    if config.VWORLD_API_KEY and layer in _ALLOWED_LAYERS:
        try:
            resp = _fetch_vworld_tile(layer, z, y, x)
            content_type = resp.headers.get("content-type", "")
            if resp.ok and content_type.startswith("image/"):
                return Response(
                    content=resp.content,
                    media_type=content_type,
                    headers={"Cache-Control": "public, max-age=86400"},
                )
        except requests.RequestException:
            pass  # 아래 OSM 폴백으로

    # 키가 없거나 V-World가 이미지를 주지 않은 경우 — 지도가 비지 않도록 OSM 사용
    return RedirectResponse(
        _OSM_TILE.format(z=z, x=x, y=y),
        status_code=302,
        headers={"Cache-Control": "public, max-age=3600"},
    )


@router.get("/diag")
def diag() -> dict:
    """V-World 타일이 왜 안 나오는지 확인 (서울 도심 z12 타일 1장 시험 요청)."""
    if not config.VWORLD_API_KEY:
        return {"vworld_configured": False, "using": "osm",
                "hint": "VWORLD_API_KEY를 설정하면 국내 상세 지도를 씁니다."}
    try:
        resp = _fetch_vworld_tile("Base", 12, 1586, 3492)
    except requests.RequestException as e:
        return {"vworld_configured": True, "ok": False,
                "error": mask_secrets(e), "using": "osm(폴백)"}

    content_type = resp.headers.get("content-type", "")
    ok = resp.ok and content_type.startswith("image/")
    out: dict = {
        "vworld_configured": True,
        "ok": ok,
        "status": resp.status_code,
        "content_type": content_type,
        "referer_sent": config.VWORLD_REFERER or "(설정 안 됨)",
        "using": "vworld" if ok else "osm(폴백)",
    }
    if not ok:
        out["body_head"] = mask_secrets(resp.text)[:400]
        out["hint"] = (
            "V-World 인증키의 '사용URL'에 등록한 도메인을 VWORLD_REFERER 환경변수에 "
            "넣어야 합니다. 예: https://antifall-map.pages.dev")
    return out
