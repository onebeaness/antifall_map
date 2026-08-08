"""인구·유동인구 API — SGIS(전국 인구·밀도·고령화) + 서울 생활인구(유동인구).

키가 없으면 503을 반환하고, 프론트는 시연용 목업으로 폴백해 표시한다.
"""
from __future__ import annotations

import re

from fastapi import APIRouter, HTTPException, Query

from app import config
from app.services import seoul_pop, sgis

router = APIRouter()

_ADM_CD = re.compile(r"^\d{2,10}$")


@router.get("/population/dong")
def dong_population(
    adm_cd: str = Query(..., description="행정구역 코드 (시도 2 / 시군구 5 / 읍면동 7자리)"),
    year: str = Query("2023", pattern=r"^\d{4}$"),
    low_search: str = Query("0", pattern=r"^[01]$", description="1이면 하위 지역 목록"),
) -> list[dict]:
    """SGIS 총조사 주요지표 — 총인구·인구밀도·평균나이·노령화지수."""
    if not (config.SGIS_CONSUMER_KEY and config.SGIS_CONSUMER_SECRET):
        raise HTTPException(status_code=503, detail="SGIS_CONSUMER_KEY/SECRET이 설정되지 않았습니다.")
    if not _ADM_CD.match(adm_cd):
        raise HTTPException(status_code=422, detail="adm_cd는 숫자 코드여야 합니다.")
    try:
        return sgis.get_population(
            config.SGIS_CONSUMER_KEY, config.SGIS_CONSUMER_SECRET,
            adm_cd, year=year, low_search=low_search)
    except sgis.SgisError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


@router.get("/population/floating/citywide")
def citywide_floating(
    date: str = Query(..., pattern=r"^\d{8}$", description="기준일 YYYYMMDD (약 1주 전까지 공개)"),
) -> dict:
    """서울 전 행정동의 일평균·피크 생활인구 — '투입 효과 기대 지역' 랭킹용.

    시간대별 전역 조회 24회를 병렬 수행하고 날짜별로 캐시한다(과거 확정 자료).
    """
    if not config.SEOUL_OPENAPI_KEY:
        raise HTTPException(status_code=503, detail="SEOUL_OPENAPI_KEY가 설정되지 않았습니다.")
    try:
        return seoul_pop.get_citywide_daily(config.SEOUL_OPENAPI_KEY, date)
    except seoul_pop.SeoulPopError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


@router.get("/population/floating")
def floating_population(
    adm_cd: str = Query(..., description="서울 행정동코드 (예: 11110515)"),
    date: str = Query(..., pattern=r"^\d{8}$", description="기준일 YYYYMMDD (약 1주 전까지 공개)"),
) -> dict:
    """서울 생활인구(유동인구) — 지정 날짜의 시간대별(0~23시) 총생활인구."""
    if not config.SEOUL_OPENAPI_KEY:
        raise HTTPException(status_code=503, detail="SEOUL_OPENAPI_KEY가 설정되지 않았습니다.")
    if not _ADM_CD.match(adm_cd):
        raise HTTPException(status_code=422, detail="adm_cd는 숫자 코드여야 합니다.")
    try:
        return seoul_pop.get_hourly_floating(config.SEOUL_OPENAPI_KEY, adm_cd, date)
    except seoul_pop.SeoulPopError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
