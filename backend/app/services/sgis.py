"""SGIS(통계청 통계지리정보서비스) 클라이언트 — 인구·인구밀도·고령화 지표.

사용 API: 총조사 주요지표 stats/population.json
  응답 필드: adm_cd, adm_nm, tot_ppltn(총인구), ppltn_dnsty(인구밀도),
             avg_age(평균나이), aged_child_idx(노령화지수), tot_house(총가구) 등
인증: auth/authentication.json?consumer_key&consumer_secret → accessToken
키 발급: https://sgis.kostat.go.kr/developer (서비스 ID 신청)
"""

from __future__ import annotations

import time

import requests

from app.utils.secrets import mask_secrets as _safe

BASE = "https://sgisapi.kostat.go.kr/OpenAPI3"
TIMEOUT = 10

_token: dict = {"value": None, "expires": 0.0}


class SgisError(RuntimeError):
    pass


def _authenticate(consumer_key: str, consumer_secret: str) -> str:
    try:
        resp = requests.get(f"{BASE}/auth/authentication.json", params={
            "consumer_key": consumer_key,
            "consumer_secret": consumer_secret,
        }, timeout=TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
    except (requests.RequestException, ValueError) as e:
        raise SgisError(f"SGIS 인증 실패: {_safe(e)}") from e
    if str(data.get("errCd")) != "0":
        raise SgisError(f"SGIS 인증 오류: {data.get('errMsg')} (코드 {data.get('errCd')})")
    token = (data.get("result") or {}).get("accessToken")
    if not token:
        raise SgisError("SGIS 인증 응답에 accessToken이 없습니다.")
    # 토큰 유효기간은 발급 후 약 4시간 — 여유를 두고 3시간 캐시
    _token["value"] = token
    _token["expires"] = time.time() + 3 * 3600
    return token


def _get_token(consumer_key: str, consumer_secret: str) -> str:
    if _token["value"] and time.time() < _token["expires"]:
        return _token["value"]
    return _authenticate(consumer_key, consumer_secret)


def _query(consumer_key: str, consumer_secret: str, adm_cd: str,
           year: str, low_search: str) -> list[dict]:
    """단일 코드로 조회. 결과 없음(-100)이면 빈 리스트, 그 외 오류는 예외."""
    token = _get_token(consumer_key, consumer_secret)
    params = {"accessToken": token, "year": year, "low_search": low_search}
    if adm_cd:
        params["adm_cd"] = adm_cd

    def call() -> dict:
        try:
            resp = requests.get(f"{BASE}/stats/population.json", params=params, timeout=TIMEOUT)
            resp.raise_for_status()
            return resp.json()
        except (requests.RequestException, ValueError) as e:
            raise SgisError(f"SGIS 인구 조회 실패: {_safe(e)}") from e

    data = call()
    # 토큰 만료(-401) 시 1회 재인증 후 재시도
    if str(data.get("errCd")) == "-401":
        params["accessToken"] = _authenticate(consumer_key, consumer_secret)
        data = call()

    err = str(data.get("errCd"))
    if err == "-100":  # 해당 코드의 자료 없음 — 상위 행정구역으로 폴백할 수 있게 빈 결과
        return []
    if err != "0":
        raise SgisError(f"SGIS 오류: {data.get('errMsg')} (코드 {data.get('errCd')})")

    out = []
    for row in data.get("result") or []:
        def num(key):
            try:
                return float(row.get(key))
            except (TypeError, ValueError):
                return None
        out.append({
            "adm_cd": row.get("adm_cd"),
            "adm_nm": row.get("adm_nm"),
            "tot_ppltn": num("tot_ppltn"),
            "ppltn_dnsty": num("ppltn_dnsty"),      # 인구밀도(명/㎢)
            "avg_age": num("avg_age"),
            "aged_child_idx": num("aged_child_idx"),  # 노령화지수(고령/유소년×100)
            "tot_house": num("tot_house"),
        })
    return out


def get_population(consumer_key: str, consumer_secret: str, adm_cd: str,
                   year: str = "2023", low_search: str = "0") -> list[dict]:
    """행정구역 인구 주요지표 조회.

    adm_cd: 행정구역 코드. SGIS는 읍면동 자료가 없는 경우가 있어,
    자료를 못 찾으면 상위 행정구역(시군구 5자리 → 시도 2자리)으로 단계적 폴백한다.
    반환 항목의 adm_nm이 실제로 조회된 지역을 알려준다.
    low_search: "0"=해당 지역만, "1"=하위 지역 목록
    """
    codes = [adm_cd]
    for n in (7, 5, 2):  # 읍면동 → 시군구 → 시도
        trimmed = adm_cd[:n]
        if len(adm_cd) > n and trimmed not in codes:
            codes.append(trimmed)

    for code in codes:
        rows = _query(consumer_key, consumer_secret, code, year, low_search)
        if rows:
            return rows
    return []
