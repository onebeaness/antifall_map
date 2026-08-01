"""고도(표고) 조회 프로바이더.

V-World의 원본 DEM 3D 오픈 API가 폐쇄되어 점 단위 표고 REST 조회가
불가능하므로, 무료 공개 DEM API를 기본 프로바이더로 사용한다.

- OpenTopoData (기본): SRTM 30m. 키 불필요.
  공개 인스턴스 제한: 요청당 최대 100개 좌표, 초당 1회, 일 1000회.
- Open-Elevation (대체): 키 불필요, 제한 느슨하지만 응답이 느릴 수 있음.

필요 시 이 모듈에 프로바이더를 추가해 교체할 수 있다 (예: 자체 DEM 서버,
Google Elevation API 등).
"""

from __future__ import annotations

import time

import requests

TIMEOUT = 30
_BATCH = 100  # opentopodata 공개 인스턴스의 요청당 좌표 수 제한


class ElevationError(RuntimeError):
    pass


def _chunks(seq: list, n: int):
    for i in range(0, len(seq), n):
        yield seq[i : i + n]


def get_elevations_opentopodata(
    points: list[tuple[float, float]], dataset: str = "srtm30m"
) -> list[float]:
    """OpenTopoData 공개 API. points: [(lat, lon), ...] → 고도(m) 리스트."""
    elevations: list[float] = []
    for i, batch in enumerate(_chunks(points, _BATCH)):
        if i > 0:
            time.sleep(1.1)  # 공개 인스턴스 rate limit(1 call/sec) 준수
        locations = "|".join(f"{lat:.6f},{lon:.6f}" for lat, lon in batch)
        try:
            resp = requests.get(
                f"https://api.opentopodata.org/v1/{dataset}",
                params={"locations": locations},
                timeout=TIMEOUT,
            )
            resp.raise_for_status()
            data = resp.json()
        except (requests.RequestException, ValueError) as e:
            raise ElevationError(f"OpenTopoData 요청 실패: {e}") from e
        if data.get("status") != "OK":
            raise ElevationError(f"OpenTopoData 오류: {data.get('error', data)}")
        for r in data["results"]:
            elevations.append(float(r["elevation"] if r["elevation"] is not None else 0.0))
    return elevations


def get_elevations_open_elevation(points: list[tuple[float, float]]) -> list[float]:
    """Open-Elevation 공개 API (대체 수단)."""
    elevations: list[float] = []
    for batch in _chunks(points, _BATCH):
        try:
            resp = requests.post(
                "https://api.open-elevation.com/api/v1/lookup",
                json={"locations": [{"latitude": lat, "longitude": lon} for lat, lon in batch]},
                timeout=TIMEOUT,
            )
            resp.raise_for_status()
            data = resp.json()
        except (requests.RequestException, ValueError) as e:
            raise ElevationError(f"Open-Elevation 요청 실패: {e}") from e
        for r in data.get("results", []):
            elevations.append(float(r.get("elevation") or 0.0))
    if len(elevations) != len(points):
        raise ElevationError("Open-Elevation 응답 좌표 수가 요청과 다릅니다.")
    return elevations


PROVIDERS = {
    "OpenTopoData (SRTM 30m, 무료)": get_elevations_opentopodata,
    "Open-Elevation (무료, 느림)": get_elevations_open_elevation,
}


def get_elevations(points: list[tuple[float, float]], provider: str) -> list[float]:
    fn = PROVIDERS.get(provider)
    if fn is None:
        raise ElevationError(f"알 수 없는 고도 프로바이더: {provider}")
    return fn(points)
