"""POI 검색 API — Tmap 명칭검색 + V-World 지오코딩 폴백 (키는 서버에만)."""
from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, HTTPException, Query

from app import config
from app.services import tmap as tmap_svc
from app.services import vworld as vworld_svc

router = APIRouter()


@router.get("/poi")
def search_poi(q: str = Query(..., min_length=1, description="장소명 또는 주소")) -> list[dict]:
    """검색어 → [{name, address, lat, lon}]."""
    if not config.TMAP_APP_KEY:
        raise HTTPException(status_code=503, detail="TMAP_APP_KEY가 설정되지 않았습니다.")
    try:
        results = tmap_svc.search_poi(config.TMAP_APP_KEY, q)
    except tmap_svc.TmapError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    # Tmap 결과가 없으면 V-World 지오코딩으로 한 번 더 (원본 route_heatmap._poi_picker 동작)
    if not results and config.VWORLD_API_KEY:
        try:
            coord = vworld_svc.geocode(config.VWORLD_API_KEY, q)
        except vworld_svc.VWorldError:
            coord = None
        if coord:
            results = [tmap_svc.Poi(name=q, address="(V-World 지오코딩)",
                                    lat=coord[0], lon=coord[1])]
    return [asdict(p) for p in results]
