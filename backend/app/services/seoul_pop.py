"""서울 열린데이터광장 — 행정동별 생활인구(유동인구) 클라이언트.

데이터셋: SPOP_LOCAL_RESD_DONG (내국인 행정동별 시간대별 생활인구)
  호출: http://openapi.seoul.go.kr:8088/{KEY}/json/SPOP_LOCAL_RESD_DONG/{start}/{end}/{기준일}/{시간대}/{행정동코드}
  필드: STDR_DE_ID(기준일), TMZON_PD_SE(시간대 00~23), ADSTRD_CODE_SE(행정동코드),
        TOT_LVPOP_CO(총생활인구수)
키 발급: https://data.seoul.go.kr (인증키 신청) — 서울시 데이터만 제공된다.
생활인구는 보통 5일 전후 지연 공개되므로 date는 1주 전 날짜를 권장.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

import requests

BASE = "http://openapi.seoul.go.kr:8088"
SERVICE = "SPOP_LOCAL_RESD_DONG"
TIMEOUT = 10


class SeoulPopError(RuntimeError):
    pass


def _fetch_hour(api_key: str, date: str, hour: int, adm_cd: str) -> float | None:
    url = f"{BASE}/{api_key}/json/{SERVICE}/1/5/{date}/{hour:02d}/{adm_cd}"
    try:
        resp = requests.get(url, timeout=TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
    except (requests.RequestException, ValueError) as e:
        raise SeoulPopError(f"서울 생활인구 조회 실패: {e}") from e

    svc = data.get(SERVICE)
    if not svc:
        # 인증 오류 등은 RESULT 루트로 내려온다
        result = data.get("RESULT") or {}
        raise SeoulPopError(
            f"서울 생활인구 오류: {result.get('MESSAGE', '응답 형식 오류')} "
            f"(코드 {result.get('CODE')})")
    rows = svc.get("row") or []
    if not rows:
        return None
    try:
        return float(rows[0].get("TOT_LVPOP_CO"))
    except (TypeError, ValueError):
        return None


def get_hourly_floating(api_key: str, adm_cd: str, date: str) -> dict:
    """지정 날짜·행정동의 0~23시 생활인구. 반환: {hours, values, date, adm_cd}."""
    with ThreadPoolExecutor(max_workers=8) as pool:
        values = list(pool.map(
            lambda h: _fetch_hour(api_key, date, h, adm_cd), range(24)))
    if all(v is None for v in values):
        raise SeoulPopError(
            "해당 날짜·행정동의 생활인구 자료가 없습니다. "
            "행정동코드(예: 11110515)와 날짜(약 1주 전까지 공개)를 확인하세요.")
    return {
        "adm_cd": adm_cd,
        "date": date,
        "hours": list(range(24)),
        "values": [v if v is not None else 0.0 for v in values],
    }
