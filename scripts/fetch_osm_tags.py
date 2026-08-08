#!/usr/bin/env python3
"""서울 보행로의 OSM 태그를 내려받는다 (Overpass API).

    python3 scripts/fetch_osm_tags.py                 # 전부
    python3 scripts/fetch_osm_tags.py --walk          # 보행 전용 길만 (가볍게)
    python3 scripts/fetch_osm_tags.py --bbox          # 행정경계 조회가 막힐 때

키도 설치도 필요 없다. 파이썬 표준 라이브러리만 쓴다.
결과는 data/osm_walkway_tags.json (way id → 태그).

## 왜 필요한가

팀 GIS 산출물은 OSM에서 뽑았지만 뽑을 때 빠진 게 있다.

1. **계단이 없다.** 담긴 도로유형은 footway·path·pedestrian 셋뿐이고
   highway=steps가 하나도 없다. 고령자 낙상이 가장 많이 나는 곳인데 빠졌다.

2. **다리·터널 표시가 없다.** DEM은 다리 아래 지면과 터널 위 산을 읽으므로
   그 구간의 경사가 크게 틀어진다. GraphHopper·Valhalla 모두 다리·터널은
   양끝 표고로 선형 보간해 이 문제를 피한다.

3. **주택가 골목이 없다.** residential·service·living_street는 보도가 따로
   없어 차도를 걷는 길인데 대상에서 빠졌다. 서울 산동네가 대부분 여기다.

4. **incline 태그를 안 썼다.** OSM에 경사가 명시된 길이 있다. 명시값이 있으면
   DEM 추정보다 정확하다.

5. **surface·width 커버리지**가 갱신됐을 수 있다. 현재 폭 26.7%, 재질 32.6%.

내려받은 파일은 아직 build_risk_geojson.py가 읽지 않는다. 먼저 받아서
태그가 실제로 얼마나 붙어 있는지 확인한 뒤 산식에 넣을 값을 정한다.

## 주의

Overpass 공개 서버는 무료지만 동시 요청과 총량에 제한이 있다. 실패하면
잠시 뒤 다시 실행하면 다른 서버로 넘어간다. 응답은 수십 MB 수준이다.
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

DEST = Path(__file__).resolve().parent.parent / "data/osm_walkway_tags.json"

MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.osm.jp/api/interpreter",
]

#: 사람이 걷는 길 전부. 기존 셋에 계단과 주택가 골목을 더한다.
HIGHWAYS_ALL = ("footway", "pedestrian", "path", "steps",
                "residential", "living_street", "service")
#: --walk: 보행 전용 길만. 응답이 1/3로 줄어 처음 시도할 때 좋다.
HIGHWAYS_WALK = ("footway", "pedestrian", "path", "steps")

#: 서울 bbox (남,서,북,동). 행정경계 조회가 막힐 때 쓰는 대안.
#: 경기도가 조금 딸려 오지만 우리 지점의 osm_id로 join하므로 무해하다.
SEOUL_BBOX = (37.41, 126.76, 37.71, 127.19)

#: 내려받은 태그 중 우리가 쓰는 것만 남긴다 (파일을 작게 유지)
KEEP = ("highway", "bridge", "tunnel", "layer", "incline",
        "surface", "width", "step_count", "handrail", "ramp", "name")


def build_query(highways: tuple[str, ...], use_bbox: bool) -> str:
    """Overpass QL. `out tags;`라 좌표는 안 받는다 — 태그만 필요하다."""
    pattern = f'"highway"~"^({"|".join(highways)})$"'
    if use_bbox:
        return f"[out:json][timeout:900];\nway[{pattern}]{SEOUL_BBOX};\nout tags;\n"
    return (
        "[out:json][timeout:900];\n"
        'area["name"="서울특별시"]["boundary"="administrative"]'
        '["admin_level"="4"]->.seoul;\n'
        f"way[{pattern}](area.seoul);\n"
        "out tags;\n"
    )


def fetch(query: str) -> dict:
    body = urllib.parse.urlencode({"data": query}).encode()
    last: Exception | None = None
    for url in MIRRORS:
        print(f"요청 중: {url} ...", flush=True)
        try:
            req = urllib.request.Request(
                url, data=body,
                headers={"User-Agent": "nakjido-walkway-tags/1.0"})
            with urllib.request.urlopen(req, timeout=1200) as resp:
                raw = resp.read()
            print(f"  받음: {len(raw) / 1e6:.1f} MB", flush=True)
            return json.loads(raw)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
            print(f"  실패: {e}", flush=True)
            last = e
    raise SystemExit(f"모든 서버에서 실패했습니다. 잠시 뒤 다시 시도해 주세요. ({last})")


def main(argv: list[str]) -> None:
    highways = HIGHWAYS_WALK if "--walk" in argv else HIGHWAYS_ALL
    use_bbox = "--bbox" in argv

    data = fetch(build_query(highways, use_bbox))
    elements = data.get("elements", [])
    if not elements and not use_bbox:
        # 행정경계를 못 찾은 경우다 (area 이름이 안 걸리면 조용히 0건이 온다)
        print("\n행정경계로 0건 — bbox로 다시 시도합니다.", flush=True)
        elements = fetch(build_query(highways, True)).get("elements", [])

    out: dict[str, dict] = {}
    for element in elements:
        if element.get("type") != "way":
            continue
        tags = {k: v for k, v in (element.get("tags") or {}).items() if k in KEEP}
        if tags:
            out[str(element["id"])] = tags

    if not out:
        raise SystemExit("받은 way가 0개입니다. --bbox 로 다시 시도해 보세요.")

    DEST.parent.mkdir(parents=True, exist_ok=True)
    DEST.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")),
                    encoding="utf-8")

    counts: dict[str, int] = {}
    for tags in out.values():
        key = tags.get("highway", "?")
        counts[key] = counts.get(key, 0) + 1
    print(f"\nway {len(out):,}개 → {DEST} ({DEST.stat().st_size // 1024:,} KB)")
    print("\n도로유형")
    for key, n in sorted(counts.items(), key=lambda kv: -kv[1]):
        print(f"  {key:16s} {n:>8,}")
    print("\n태그 커버리지")
    for key in ("bridge", "tunnel", "incline", "surface", "width", "step_count"):
        n = sum(1 for t in out.values() if key in t)
        print(f"  {key:16s} {n:>8,}  ({n / len(out) * 100:4.1f}%)")


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
