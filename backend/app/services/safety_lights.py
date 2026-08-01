"""전국보안등정보표준데이터 클라이언트 (공공데이터포털 표준데이터 API).

엔드포인트: http://api.data.go.kr/openapi/tn_pubr_public_scrty_lmp_api
키 발급: https://www.data.go.kr/data/15017320/standard.do 에서 활용신청
공통 파라미터: serviceKey, pageNo, numOfRows, type=json + 응답 컬럼 동등 필터.

⚠️ 지역 필터 컬럼명(insttNm 등)은 포털 명세 페이지에서 발급 후 1회 확인 권장 —
표준데이터 API는 알 수 없는 파라미터를 무시하므로, 필터가 무시되면 전국 데이터의
첫 페이지들만 스캔하게 되어 카운트가 과소평가될 수 있다. 응답의 scanned/total을
함께 반환해 프론트에서 판별할 수 있게 한다.
"""

from __future__ import annotations

import math

import requests

URL = "http://api.data.go.kr/openapi/tn_pubr_public_scrty_lmp_api"
TIMEOUT = 15
_PER_PAGE = 1000
_MAX_PAGES = 10  # 스캔 상한 (요청 폭주 방지)


class LightsError(RuntimeError):
    pass


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6_371_000.0
    a = (math.sin(math.radians(lat2 - lat1) / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(math.radians(lon2 - lon1) / 2) ** 2)
    return 2 * r * math.asin(math.sqrt(a))


def count_lights_near(service_key: str, lat: float, lon: float, radius_m: float,
                      instt_nm: str | None = None) -> dict:
    """중심 좌표 반경 내 보안등 수 조회.

    instt_nm: 제공기관명 필터 (예: "서울특별시 종로구") — 스캔 범위 축소용.
    """
    total_count = None
    scanned = 0
    hits = 0
    sample: list[dict] = []

    for page in range(1, _MAX_PAGES + 1):
        params: dict = {
            "serviceKey": service_key,
            "pageNo": page,
            "numOfRows": _PER_PAGE,
            "type": "json",
        }
        if instt_nm:
            params["insttNm"] = instt_nm
        try:
            resp = requests.get(URL, params=params, timeout=TIMEOUT)
            resp.raise_for_status()
            data = resp.json()
        except requests.RequestException as e:
            raise LightsError(f"보안등 API 요청 실패: {e}") from e
        except ValueError as e:
            # 키 오류 시 XML 에러 메시지가 내려오는 경우
            raise LightsError(f"보안등 API 응답 형식 오류(인증키 확인): {resp.text[:200]}") from e

        body = ((data.get("response") or {}).get("body") or {})
        header = ((data.get("response") or {}).get("header") or {})
        if header.get("resultCode") not in (None, "00", "0"):
            raise LightsError(
                f"보안등 API 오류: {header.get('resultMsg')} (코드 {header.get('resultCode')})")
        rows = body.get("items") or []
        if isinstance(rows, dict):  # 단일 항목이 dict로 오는 케이스
            rows = rows.get("item") or []
        if total_count is None:
            try:
                total_count = int(body.get("totalCount"))
            except (TypeError, ValueError):
                total_count = None

        for row in rows:
            scanned += 1
            try:
                rlat = float(row.get("latitude"))
                rlon = float(row.get("longitude"))
            except (TypeError, ValueError):
                continue
            if _haversine_m(lat, lon, rlat, rlon) <= radius_m:
                hits += 1
                if len(sample) < 50:
                    sample.append({
                        "lat": rlat, "lon": rlon,
                        "addr": row.get("rdnmadr") or row.get("lnmadr") or "",
                    })

        if not rows or (total_count is not None and page * _PER_PAGE >= total_count):
            break

    return {
        "count": hits,
        "radius_m": radius_m,
        "scanned": scanned,
        "total_in_filter": total_count,
        "truncated": total_count is not None and scanned < total_count,
        "sample": sample,
    }
