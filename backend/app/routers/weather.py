"""날씨 API — 기상청 단기예보 우선(오늘~+3일), Open-Meteo 폴백."""
from __future__ import annotations

import datetime

from fastapi import APIRouter, HTTPException, Query

from app import config
from app.services import kma_warning
from app.services import weather as weather_svc

router = APIRouter()


@router.get("/weather/warnings")
def weather_warnings(
    region: str | None = Query(None, description="지역명 부분일치 필터 (예: 서울)"),
) -> dict:
    """현재 발효 중인 기상특보 (기상청 API허브 — 단기예보와 동일 키 사용).

    낙상 관점 관련도(relevance): 대설·한파=danger, 호우·강풍·폭염 등=warn.
    """
    if not config.KWEATHER_API_KEY:
        raise HTTPException(status_code=503, detail="KWEATHER_API_KEY가 설정되지 않았습니다.")
    try:
        return {"warnings": kma_warning.get_active_warnings(
            config.KWEATHER_API_KEY, region=region or None)}
    except kma_warning.WarningError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


@router.get("/weather")
def get_weather(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    date: datetime.date = Query(..., description="YYYY-MM-DD"),
) -> dict:
    """일별 날씨 + 보행(낙상) 위험 등급. 응답: IA.md 3절 스키마."""
    try:
        return weather_svc.get_daily_weather(
            lat, lon, date, kma_key=config.KWEATHER_API_KEY or None)
    except weather_svc.WeatherError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
