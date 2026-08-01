"""날씨 API — 기상청 단기예보 우선(오늘~+3일), Open-Meteo 폴백."""
from __future__ import annotations

import datetime

from fastapi import APIRouter, HTTPException, Query

from app import config
from app.services import weather as weather_svc

router = APIRouter()


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
