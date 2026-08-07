"""안전 인프라 API — 보안등 밀도 (전국보안등정보표준데이터)."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app import config
from app.services import safety_lights

router = APIRouter()


@router.get("/safety/lights")
def lights_near(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    radius_m: float = Query(500, ge=50, le=2000),
    instt_nm: str | None = Query(None, description="제공기관명 필터 (예: 서울특별시 종로구)"),
) -> dict:
    """중심 좌표 반경 내 보안등 수 — 야간 조명 밀도 분석용."""
    if not config.DATA_GO_KR_KEY:
        raise HTTPException(
            status_code=503,
            detail="보안등 자료가 아직 연결되지 않았습니다 (공공데이터포털 키 미설정).")
    try:
        return safety_lights.count_lights_near(
            config.DATA_GO_KR_KEY, lat, lon, radius_m, instt_nm=instt_nm)
    except safety_lights.LightsError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
