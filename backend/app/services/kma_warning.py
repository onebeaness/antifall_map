"""기상청 API허브 — 기상특보 현황 조회 (typ01/url/wrn_now_data.php).

기존 KWEATHER_API_KEY(단기예보와 동일 키)를 재사용한다.
응답은 '#' 주석 헤더 + 쉼표 구분 텍스트 표 — 형식 변동에 대비해 관대하게 파싱한다.
낙상(보행) 관점 관련도: 대설·한파=danger / 호우·강풍·폭염·황사=warn / 그 외=info.
"""

from __future__ import annotations

import requests

URL = "https://apihub.kma.go.kr/api/typ01/url/wrn_now_data.php"
TIMEOUT = 15

# WRN 코드 → 한글명
WRN_NAME = {
    "W": "강풍", "R": "호우", "C": "한파", "D": "건조", "O": "해일",
    "V": "풍랑", "T": "태풍", "S": "대설", "Y": "황사", "H": "폭염", "F": "안개",
}
# 보행(낙상) 관련도
WRN_RELEVANCE = {
    "S": "danger", "C": "danger",              # 결빙·미끄럼 직접 위험
    "R": "warn", "W": "warn", "H": "warn", "Y": "warn", "T": "warn", "F": "warn",
}
LVL_NAME = {"1": "주의보", "2": "경보"}  # 특보수준 코드 — 미확인 값은 원문 유지


class WarningError(RuntimeError):
    pass


def _parse_line(line: str) -> dict | None:
    """데이터 행 파싱 — 열: REG_UP, REG_UP_KO, REG_ID, REG_KO, TM_FC, TM_EF, WRN, LVL, CMD ..."""
    parts = [p.strip() for p in line.split(",")]
    if len(parts) < 8:
        return None
    try:
        reg_up_ko, reg_ko = parts[1], parts[3]
        tm_ef = parts[5]
        wrn, lvl = parts[6].upper(), parts[7]
    except IndexError:
        return None
    if wrn not in WRN_NAME:
        return None
    return {
        "region_group": reg_up_ko,
        "region": reg_ko,
        "effective": tm_ef,
        "type_code": wrn,
        "type": WRN_NAME[wrn],
        "level": lvl,
        "level_name": LVL_NAME.get(lvl, lvl),
        "relevance": WRN_RELEVANCE.get(wrn, "info"),
    }


def get_active_warnings(api_key: str, region: str | None = None) -> list[dict]:
    """현재 발효 중인 특보 목록. region이 주어지면 지역명 부분일치 필터."""
    try:
        resp = requests.get(URL, params={"fe": "f", "authKey": api_key}, timeout=TIMEOUT)
        resp.raise_for_status()
        text = resp.text
    except requests.RequestException as e:
        raise WarningError(f"기상특보 조회 실패: {e}") from e

    if "auth" in text.lower() and "error" in text.lower():
        raise WarningError("기상청 API허브 인증 실패 — KWEATHER_API_KEY를 확인하세요.")

    out: list[dict] = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        item = _parse_line(line)
        if item is None:
            continue
        if region:
            hay = f"{item['region_group']} {item['region']}"
            if region not in hay and not any(tok and tok in hay for tok in region.split()):
                continue
        out.append(item)
    return out
