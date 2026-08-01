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
        raise SgisError(f"SGIS 인증 실패: {e}") from e
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


def get_population(consumer_key: str, consumer_secret: str, adm_cd: str,
                   year: str = "2023", low_search: str = "0") -> list[dict]:
    """행정구역 인구 주요지표 조회.

    adm_cd: 행정구역 코드(시도 2자리 / 시군구 5자리 / 읍면동 7자리)
    low_search: "0"=해당 지역만, "1"=하위 지역 목록
    """
    token = _get_token(consumer_key, consumer_secret)
    params = {"accessToken": token, "year": year, "low_search": low_search}
    if adm_cd:
        params["adm_cd"] = adm_cd
    try:
        resp = requests.get(f"{BASE}/stats/population.json", params=params, timeout=TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
    except (requests.RequestException, ValueError) as e:
        raise SgisError(f"SGIS 인구 조회 실패: {e}") from e

    # 토큰 만료(-401) 시 1회 재인증 후 재시도
    if str(data.get("errCd")) == "-401":
        params["accessToken"] = _authenticate(consumer_key, consumer_secret)
        try:
            resp = requests.get(f"{BASE}/stats/population.json", params=params, timeout=TIMEOUT)
            resp.raise_for_status()
            data = resp.json()
        except (requests.RequestException, ValueError) as e:
            raise SgisError(f"SGIS 인구 조회 실패: {e}") from e

    if str(data.get("errCd")) != "0":
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
