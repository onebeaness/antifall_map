"""안심걸음 백엔드 API — FastAPI 진입점.

실행: uvicorn app.main:app --reload  (backend/ 디렉토리에서)
프론트엔드(Next.js PWA)는 이 서버의 /api/* 만 호출한다.
"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import config
from app.routers import assess, map_tile, poi, population, route, safety, weather
from app.services import fall_model

app = FastAPI(
    title="안심걸음 API",
    description="노인 낙상 위험 예측 서비스 백엔드 — ML 추론 + 외부 API 프록시",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(assess.router, prefix="/api/assess", tags=["assess"])
app.include_router(poi.router, prefix="/api", tags=["poi"])
app.include_router(route.router, prefix="/api", tags=["route"])
app.include_router(weather.router, prefix="/api", tags=["weather"])
app.include_router(map_tile.router, prefix="/api/map", tags=["map"])
app.include_router(population.router, prefix="/api", tags=["population"])
app.include_router(safety.router, prefix="/api", tags=["safety"])


@app.get("/api/health")
def health() -> dict:
    """상태 확인 — ML 모델 로드 여부와 외부 키 설정 상태를 함께 반환."""
    return {
        "status": "ok",
        "ml_available": fall_model.is_available(),
        "ml_error": fall_model.MODEL_IMPORT_ERROR,
        "tmap_configured": bool(config.TMAP_APP_KEY),
        "vworld_configured": bool(config.VWORLD_API_KEY),
        "kweather_configured": bool(config.KWEATHER_API_KEY),
        "sgis_configured": bool(config.SGIS_CONSUMER_KEY and config.SGIS_CONSUMER_SECRET),
        "seoul_configured": bool(config.SEOUL_OPENAPI_KEY),
        "datagokr_configured": bool(config.DATA_GO_KR_KEY),
    }
