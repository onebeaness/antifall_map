"""낙지도 백엔드 API — FastAPI 진입점.

실행: uvicorn app.main:app --reload  (backend/ 디렉토리에서)
프론트엔드(Next.js PWA)는 이 서버의 /api/* 만 호출한다.
"""
from __future__ import annotations

import threading

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import config
from app.routers import assess, poi, population, route, safety, weather
from app.services import fall_model
from app.services import walkway

app = FastAPI(
    title="낙지도 API",
    description="어르신 낙상 위험 예측 서비스 백엔드 — ML 추론 + 외부 API 프록시",
    version="1.0.0",
)


@app.on_event("startup")
def warm_up() -> None:
    """모델·색인을 미리 올려 첫 사용자가 콜드 스타트를 떠안지 않게 한다.

    pkl 로딩과 SHAP explainer 생성에 1.4초가 걸리는데, 그 비용을 맨 처음
    요청한 사람이 전부 문다. 대개 간편 확인을 먼저 하므로 "간편이 심층보다
    느리다"는 현상이 생겼다 (예열 후에는 간편 2ms, 심층 166ms로 반대다).

    백그라운드 스레드로 돌려 기동 자체는 막지 않는다 — 예열 중에 들어온
    요청은 평소처럼 지연 로딩 경로를 타면 되고, 헬스체크도 바로 응답한다.
    """
    def _warm() -> None:
        try:
            walkway.is_available()      # npz 로드 + KDTree 구축
            fall_model.warm_up()        # 4개 모델 + explainer
        except Exception:               # 예열 실패가 서버를 죽이면 안 된다
            pass

    threading.Thread(target=_warm, name="warmup", daemon=True).start()

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
app.include_router(population.router, prefix="/api", tags=["population"])
app.include_router(safety.router, prefix="/api", tags=["safety"])


@app.get("/api/config/map")
def map_config() -> dict:
    """브라우저 지도(티맵 JS API v2)용 공개 설정.

    프론트는 정적 내보내기라 빌드 시점 환경변수를 바꾸려면 재배포가 필요하다.
    이 엔드포인트로 내려주면 서버 환경변수만 고쳐도 새로고침으로 반영된다.
    (지도 SDK 키는 어떤 방식이든 브라우저에 노출된다 — CORS로 오리진만 제한한다.)
    """
    return {"tmap_app_key": config.TMAP_JS_APP_KEY}


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
        # 경로 경사의 1순위 출처 — 없으면 DEM(SRTM)으로 폴백한다
        "walkway_index": walkway.point_count(),
    }
