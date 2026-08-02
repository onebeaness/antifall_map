"""날씨 조회.

- 기상청 API 허브(apihub.kma.go.kr) 동네예보(단기예보): KWEATHER_API_KEY 가
  있고 날짜가 오늘~+3일이면 우선 사용
- Open-Meteo (무료, 키 불필요): 과거 날짜, +4일 이후, 기상청 실패 시 폴백

낙상 위험 관점의 보행 주의 등급(미끄럼 위험)을 함께 계산한다.
"""

from __future__ import annotations

import datetime
import math

import requests

from app.utils.secrets import mask_secrets as _safe

TIMEOUT = 15
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
KMA_VILAGE_URL = "https://apihub.kma.go.kr/api/typ02/openApi/VilageFcstInfoService_2.0/getVilageFcst"

DAILY_VARS = ("weather_code,temperature_2m_max,temperature_2m_min,"
              "precipitation_sum,wind_speed_10m_max")


class WeatherError(RuntimeError):
    pass


# WMO weather code → (설명, 아이콘 문자)
WMO_CODES = {
    0: "맑음", 1: "대체로 맑음", 2: "구름 조금", 3: "흐림",
    45: "안개", 48: "착빙 안개",
    51: "약한 이슬비", 53: "이슬비", 55: "강한 이슬비",
    56: "어는 이슬비", 57: "강한 어는 이슬비",
    61: "약한 비", 63: "비", 65: "강한 비",
    66: "어는 비", 67: "강한 어는 비",
    71: "약한 눈", 73: "눈", 75: "강한 눈", 77: "싸락눈",
    80: "약한 소나기", 81: "소나기", 82: "강한 소나기",
    85: "약한 소낙눈", 86: "강한 소낙눈",
    95: "뇌우", 96: "뇌우(우박)", 99: "강한 뇌우(우박)",
}

SNOW_CODES = {71, 73, 75, 77, 85, 86}
ICE_CODES = {48, 56, 57, 66, 67}
RAIN_CODES = {51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99}


def walk_risk(code: int, t_min: float, precipitation: float) -> tuple[str, str]:
    """보행(낙상) 관점 주의 등급. 반환: (등급 danger/warn/good, 안내 문구)."""
    if code in SNOW_CODES or code in ICE_CODES:
        return "danger", "눈·결빙이 예상됩니다. 보행 시 미끄럼·낙상 위험이 매우 높아요."
    if code in RAIN_CODES and (precipitation or 0) >= 10:
        return "danger", "강한 비가 예상됩니다. 급경사 구간 보행을 피하세요."
    if code in RAIN_CODES:
        return "warn", "비가 예상됩니다. 미끄럼 방지 신발을 착용하세요."
    if t_min is not None and t_min <= 0:
        return "warn", "기온이 영하로 내려갑니다. 이른 아침 결빙 구간을 주의하세요."
    if code in (45,):
        return "warn", "안개로 시야가 좋지 않을 수 있어요. 야간·새벽 보행을 주의하세요."
    return "good", "보행하기 무난한 날씨입니다."


# ================================================================ 기상청 단기예보
def dfs_grid(lat: float, lon: float) -> tuple[int, int]:
    """위경도 → 기상청 동네예보 격자 좌표(nx, ny). 기상청 공식 DFS 변환."""
    RE, GRID = 6371.00877, 5.0
    SLAT1, SLAT2 = math.radians(30.0), math.radians(60.0)
    OLON, OLAT = math.radians(126.0), math.radians(38.0)
    XO, YO = 43, 136

    re = RE / GRID
    sn = math.log(math.cos(SLAT1) / math.cos(SLAT2)) / math.log(
        math.tan(math.pi / 4 + SLAT2 / 2) / math.tan(math.pi / 4 + SLAT1 / 2))
    sf = (math.tan(math.pi / 4 + SLAT1 / 2) ** sn) * math.cos(SLAT1) / sn
    ro = re * sf / (math.tan(math.pi / 4 + OLAT / 2) ** sn)

    ra = re * sf / (math.tan(math.pi / 4 + math.radians(lat) / 2) ** sn)
    theta = math.radians(lon) - OLON
    if theta > math.pi:
        theta -= 2 * math.pi
    if theta < -math.pi:
        theta += 2 * math.pi
    theta *= sn
    nx = int(ra * math.sin(theta) + XO + 0.5)
    ny = int(ro - ra * math.cos(theta) + YO + 0.5)
    return nx, ny


def _kma_base_datetime(now: datetime.datetime) -> tuple[str, str]:
    """가장 최근 단기예보 발표 시각(base_date, base_time). 발표 후 15분 여유."""
    issue_hours = [2, 5, 8, 11, 14, 17, 20, 23]
    candidates = [h for h in issue_hours
                  if now >= now.replace(hour=h, minute=15, second=0, microsecond=0)]
    if candidates:
        base = now.replace(hour=candidates[-1])
        return base.strftime("%Y%m%d"), f"{candidates[-1]:02d}00"
    yesterday = now - datetime.timedelta(days=1)
    return yesterday.strftime("%Y%m%d"), "2300"


def _parse_pcp(value: str) -> float:
    """단기예보 PCP 문자열 → mm. 예: '강수없음', '1mm 미만', '30.0~50.0mm', '5.0mm'."""
    if not value or "없음" in value:
        return 0.0
    if "미만" in value:
        return 0.5
    value = value.replace("mm", "").strip()
    if "~" in value:
        value = value.split("~")[0]
    try:
        return float(value)
    except ValueError:
        return 0.0


# PTY(강수형태): 0 없음, 1 비, 2 비/눈, 3 눈, 4 소나기
_PTY_LABEL = {1: "비", 2: "비/눈", 3: "눈", 4: "소나기"}
# SKY(하늘상태): 1 맑음, 3 구름많음, 4 흐림
_SKY_LABEL = {1: "맑음", 3: "구름많음", 4: "흐림"}


def _kma_walk_risk(ptys: set[int], t_min: float, pcp: float) -> tuple[str, str]:
    if 3 in ptys or 2 in ptys:
        return "danger", "눈·결빙이 예상됩니다. 보행 시 미끄럼·낙상 위험이 매우 높아요."
    if (1 in ptys or 4 in ptys) and pcp >= 10:
        return "danger", "강한 비가 예상됩니다. 급경사 구간 보행을 피하세요."
    if 1 in ptys or 4 in ptys:
        return "warn", "비가 예상됩니다. 미끄럼 방지 신발을 착용하세요."
    if t_min is not None and t_min <= 0:
        return "warn", "기온이 영하로 내려갑니다. 이른 아침 결빙 구간을 주의하세요."
    return "good", "보행하기 무난한 날씨입니다."


def get_kma_daily(api_key: str, lat: float, lon: float, date: datetime.date) -> dict:
    """기상청 단기예보(동네예보)에서 지정 날짜의 일별 요약을 만든다.

    커버 범위: 오늘 ~ +3일(글피, 발표 시각에 따라 일부 항목 제한).
    """
    nx, ny = dfs_grid(lat, lon)
    base_date, base_time = _kma_base_datetime(datetime.datetime.now())
    try:
        resp = requests.get(KMA_VILAGE_URL, params={
            "authKey": api_key,
            "numOfRows": 1000,
            "pageNo": 1,
            "dataType": "JSON",
            "base_date": base_date,
            "base_time": base_time,
            "nx": nx,
            "ny": ny,
        }, timeout=TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
    except (requests.RequestException, ValueError) as e:
        raise WeatherError(f"기상청 단기예보 조회 실패: {_safe(e)}") from e

    header = (data.get("response") or {}).get("header") or {}
    if header.get("resultCode") != "00":
        raise WeatherError(
            f"기상청 API 오류: {header.get('resultMsg', '알 수 없는 오류')} "
            f"(코드 {header.get('resultCode')})")

    items = ((((data.get("response") or {}).get("body") or {})
              .get("items") or {}).get("item") or [])
    target = date.strftime("%Y%m%d")
    temps, pops, wsds, ptys, skys = [], [], [], set(), []
    t_min = t_max = None
    pcp_total = 0.0
    for it in items:
        if it.get("fcstDate") != target:
            continue
        cat, val = it.get("category"), it.get("fcstValue")
        if cat == "TMP":
            temps.append(float(val))
        elif cat == "TMN":
            t_min = float(val)
        elif cat == "TMX":
            t_max = float(val)
        elif cat == "POP":
            pops.append(float(val))
        elif cat == "WSD":
            wsds.append(float(val))
        elif cat == "PTY" and int(val) != 0:
            ptys.add(int(val))
        elif cat == "SKY":
            skys.append(int(val))
        elif cat == "PCP":
            pcp_total += _parse_pcp(str(val))

    if not temps and t_min is None:
        raise WeatherError("기상청 단기예보에 해당 날짜 자료가 없습니다.")

    if t_min is None and temps:
        t_min = min(temps)
    if t_max is None and temps:
        t_max = max(temps)

    if ptys:
        severity = [3, 2, 1, 4]  # 눈 > 비/눈 > 비 > 소나기
        desc = _PTY_LABEL[next(p for p in severity if p in ptys)]
    elif skys:
        desc = _SKY_LABEL.get(max(skys, key=skys.count), "맑음")
    else:
        desc = "맑음"

    level, advice = _kma_walk_risk(ptys, t_min, pcp_total)
    return {
        "date": date.isoformat(),
        "description": desc,
        "code": None,
        "t_max": t_max,
        "t_min": t_min,
        "precipitation_mm": round(pcp_total, 1),
        "precipitation_prob": max(pops) if pops else None,
        "wind_max_kmh": round(max(wsds) * 3.6, 1) if wsds else None,  # m/s → km/h
        "is_past": False,
        "risk_level": level,
        "advice": advice,
        "source": "기상청 단기예보",
    }


# ================================================================ Open-Meteo
def get_open_meteo_daily(lat: float, lon: float, date: datetime.date) -> dict:
    """지정 좌표·날짜의 일별 날씨. 과거/미래를 자동 판별해 조회한다."""
    today = datetime.date.today()
    if date > today + datetime.timedelta(days=16):
        raise WeatherError("예보는 오늘부터 16일 이내 날짜만 조회할 수 있습니다.")

    is_past = date < today
    url = ARCHIVE_URL if is_past else FORECAST_URL
    daily = DAILY_VARS + ("" if is_past else ",precipitation_probability_max")
    try:
        resp = requests.get(url, params={
            "latitude": f"{lat:.4f}",
            "longitude": f"{lon:.4f}",
            "daily": daily,
            "timezone": "Asia/Seoul",
            "start_date": date.isoformat(),
            "end_date": date.isoformat(),
        }, timeout=TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
    except (requests.RequestException, ValueError) as e:
        raise WeatherError(f"날씨 조회 실패: {_safe(e)}") from e

    d = data.get("daily") or {}
    try:
        code = int(d["weather_code"][0])
        t_max = d["temperature_2m_max"][0]
        t_min = d["temperature_2m_min"][0]
        precip = d["precipitation_sum"][0]
        wind = d["wind_speed_10m_max"][0]
    except (KeyError, IndexError, TypeError) as e:
        raise WeatherError(f"날씨 응답 형식 오류: {data}") from e

    prob = None
    if not is_past:
        probs = d.get("precipitation_probability_max") or []
        prob = probs[0] if probs else None

    level, advice = walk_risk(code, t_min, precip)
    return {
        "date": date.isoformat(),
        "description": WMO_CODES.get(code, f"코드 {code}"),
        "code": code,
        "t_max": t_max,
        "t_min": t_min,
        "precipitation_mm": precip,
        "precipitation_prob": prob,
        "wind_max_kmh": wind,
        "is_past": is_past,
        "risk_level": level,
        "advice": advice,
        "source": "Open-Meteo",
    }


# ================================================================ 통합 진입점
def get_daily_weather(lat: float, lon: float, date: datetime.date,
                      kma_key: str | None = None) -> dict:
    """날씨 조회 통합 진입점.

    KWEATHER_API_KEY(기상청 API 허브)가 있고 날짜가 오늘~+3일이면
    기상청 단기예보를 우선 사용하고, 그 외(과거·+4일 이후)나
    기상청 조회 실패 시 Open-Meteo 로 폴백한다.
    """
    today = datetime.date.today()
    if kma_key and today <= date <= today + datetime.timedelta(days=3):
        try:
            return get_kma_daily(kma_key, lat, lon, date)
        except WeatherError:
            pass  # 기상청 실패 → Open-Meteo 폴백
    return get_open_meteo_daily(lat, lon, date)
