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

from app.utils.secrets import mask_secrets as _safe

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
    except requests.RequestException as e:
        raise SeoulPopError(f"서울 생활인구 조회 실패: {_safe(e)}") from e
    try:
        data = resp.json()
    except ValueError as e:
        # 인증키 오류·요청형식 오류 시 XML/HTML이 내려온다 — 원문을 그대로 노출해 진단을 돕는다
        raise SeoulPopError(
            f"서울 생활인구 응답이 JSON이 아닙니다 (인증키·요청 형식 확인 필요): "
            f"{_safe(resp.text)[:300]}") from e

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


# ── 서울 전역 일괄 조회 (효과 기대 지역 랭킹용) ─────────────────────
# 한 시간대 호출(/1/1000/{date}/{HH})이 서울 전체 ~424개 동을 반환하므로
# 24회 호출로 전시(全市) × 24시간을 얻는다. 과거 확정 자료라 날짜별로 캐시.
_citywide_cache: dict[str, dict] = {}
_CITYWIDE_CACHE_MAX = 4


def _fetch_hour_all(api_key: str, date: str, hour: int) -> list[tuple[str, float]]:
    url = f"{BASE}/{api_key}/json/{SERVICE}/1/1000/{date}/{hour:02d}"
    try:
        resp = requests.get(url, timeout=TIMEOUT * 2)
        resp.raise_for_status()
        data = resp.json()
    except (requests.RequestException, ValueError):
        return []  # 개별 시간대 실패는 건너뛰고 나머지로 평균
    rows = (data.get(SERVICE) or {}).get("row") or []
    out = []
    for row in rows:
        try:
            out.append((str(row["ADSTRD_CODE_SE"]), float(row["TOT_LVPOP_CO"])))
        except (KeyError, TypeError, ValueError):
            continue
    return out


def get_citywide_daily(api_key: str, date: str) -> dict:
    """서울 전 행정동의 일평균·피크 생활인구. 반환:
    {date, hours_used, dongs: {행정동코드8: {avg, peak, peak_hour}}}"""
    if date in _citywide_cache:
        return _citywide_cache[date]

    with ThreadPoolExecutor(max_workers=8) as pool:
        hourly = list(pool.map(lambda h: _fetch_hour_all(api_key, date, h), range(24)))

    hours_used = sum(1 for rows in hourly if rows)
    if hours_used == 0:
        raise SeoulPopError(
            "서울 생활인구 전역 자료를 가져오지 못했습니다. "
            "인증키와 날짜(약 1주 전까지 공개)를 확인하세요.")

    acc: dict[str, dict] = {}
    for hour, rows in enumerate(hourly):
        for adm, pop in rows:
            slot = acc.setdefault(adm, {"sum": 0.0, "n": 0, "peak": 0.0, "peak_hour": 0})
            slot["sum"] += pop
            slot["n"] += 1
            if pop > slot["peak"]:
                slot["peak"] = pop
                slot["peak_hour"] = hour

    result = {
        "date": date,
        "hours_used": hours_used,
        "dongs": {
            adm: {
                "avg": round(s["sum"] / s["n"]),
                "peak": round(s["peak"]),
                "peak_hour": s["peak_hour"],
            }
            for adm, s in acc.items() if s["n"] > 0
        },
    }
    if len(_citywide_cache) >= _CITYWIDE_CACHE_MAX:
        _citywide_cache.pop(next(iter(_citywide_cache)))
    _citywide_cache[date] = result
    return result
