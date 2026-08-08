"""환경변수 설정 — 모든 외부 API 키는 백엔드에만 존재한다 (HANDOFF 3절).

배포중립: .env 파일(python-dotenv) 또는 플랫폼 환경변수 어느 쪽이든 동작.
"""
from __future__ import annotations

import os

from dotenv import load_dotenv

load_dotenv()  # backend/.env 로드 (없으면 무시)

TMAP_APP_KEY = os.getenv("TMAP_APP_KEY", "")          # 필수 — POI 검색·경로 탐색
# 브라우저 지도(JS API v2)용 appKey. /api/config/map 으로 프론트에 내려간다.
# 비워두면 TMAP_APP_KEY로 폴백하지만, 지도 SDK 키는 브라우저에 노출되므로
# openapi.sk.com에서 JS 지도 전용 앱을 따로 만들어 넣는 편이 안전하다.
TMAP_JS_APP_KEY = os.getenv("TMAP_JS_APP_KEY", "") or TMAP_APP_KEY
# 선택 — POI 검색 실패 시 주소 지오코딩 보조용 (배경지도는 카카오맵 SDK가 담당)
VWORLD_API_KEY = os.getenv("VWORLD_API_KEY", "")
KWEATHER_API_KEY = os.getenv("KWEATHER_API_KEY", "")  # 선택 — 없으면 Open-Meteo 폴백

# 선택 — SGIS(통계청) 인구·인구밀도·고령화 지표 (없으면 프론트가 목업 표시)
SGIS_CONSUMER_KEY = os.getenv("SGIS_CONSUMER_KEY", "")
SGIS_CONSUMER_SECRET = os.getenv("SGIS_CONSUMER_SECRET", "")
# 선택 — 서울 열린데이터광장 생활인구(유동인구) (서울 지역 한정)
SEOUL_OPENAPI_KEY = os.getenv("SEOUL_OPENAPI_KEY", "")
# 선택 — 공공데이터포털 (전국보안등정보표준데이터 등)
DATA_GO_KR_KEY = os.getenv("DATA_GO_KR_KEY", "")

# CORS 허용 오리진 (쉼표 구분). 개발 기본값: Next.js dev 서버.
CORS_ORIGINS = [
    o.strip() for o in os.getenv(
        "CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
    ).split(",") if o.strip()
]
