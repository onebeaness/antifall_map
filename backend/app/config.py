"""환경변수 설정 — 모든 외부 API 키는 백엔드에만 존재한다 (HANDOFF 3절).

배포중립: .env 파일(python-dotenv) 또는 플랫폼 환경변수 어느 쪽이든 동작.
"""
from __future__ import annotations

import os

from dotenv import load_dotenv

load_dotenv()  # backend/.env 로드 (없으면 무시)

TMAP_APP_KEY = os.getenv("TMAP_APP_KEY", "")          # 필수 — POI 검색·경로 탐색
VWORLD_API_KEY = os.getenv("VWORLD_API_KEY", "")      # 선택 — 없으면 OSM 폴백
# V-World는 인증키에 등록된 도메인을 Referer로 검증한다. 타일 프록시는 서버에서
# 호출하므로 브라우저 Referer가 없어, 등록한 사용URL을 여기에 넣어 헤더로 보낸다.
VWORLD_REFERER = os.getenv("VWORLD_REFERER", "")
# 배경지도 타일을 백엔드로 중계할지 여부. 지도 한 화면에 타일이 20장 이상 필요해
# 무료 인스턴스에서 중계하면 지연·유실이 크다. 기본은 OSM 직접 사용(빠르고 안정적),
# V-World 상세 지도가 필요할 때만 켠다.
VWORLD_TILE_PROXY = os.getenv("VWORLD_TILE_PROXY", "").strip().lower() in ("1", "true", "yes", "on")
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
