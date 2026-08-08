#!/usr/bin/env python3
"""서울 보행로의 OSM 태그를 내려받는다 (Overpass API).

    python3 scripts/fetch_osm_tags.py

인터넷만 되면 되고 키·설치가 필요 없다. 결과는 data/osm_walkway_tags.json
(way id → 태그)로 저장되며, build_risk_geojson.py가 있으면 자동으로 쓴다.

## 왜 필요한가

팀 GIS 산출물은 OSM에서 뽑았지만 일부 정보가 빠져 있다.

1. **계단이 없다.** 담긴 도로유형은 footway·path·pedestrian 셋뿐이고
   highway=steps가 하나도 없다. 고령자 낙상이 가장 많이 나는 곳인데 빠졌다.

2. **다리·터널 표시가 없다.** DEM은 다리 아래 지면과 터널 위 산을 읽으므로
   그 구간의 경사가 크게 틀어진다. GraphHopper·Valhalla 모두 다리·터널은
   양끝 표고로 선형 보간해 이 문제를 피한다.

3. **주택가 골목이 없다.** residential·service·living_street는 보도가 따로
   없어 차도를 걷는 길인데 대상에서 빠졌다. 서울 산동네가 대부분 여기다.

4. **incline 태그를 안 썼다.** OSM에 경사가 명시된 길이 있다. 명시값이 있으면
   DEM 추정보다 정확하다.

5. **surface·width 커버리지**를 다시 받으면 개선될 수 있다. 현재 폭 26.7%,
   재질 32.6%인데, 원본 추출 시점(2026-07) 이후 갱신분이 있을 수 있다.

## 주의

Overpass 공개 서버는 무료지만 동시 요청과 총량에 제한이 있다. 실패하면
잠시 뒤 다시 실행하거나 MIRRORS의 다른 서버를 쓰면 된다.
서울 전역 태그만 받으므로 응답은 수십 MB 수준이다.
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

#: 사람이 걷는 길. 기존 셋(footway·path·pedestrian)에 계단과 주택가 골목을 더한다.
HIGHWAYS = ("footway", "pedestrian", "path", "steps",
            "residential", "living_street", "service")

QUERY = f"""
[out:json][timeout:600];
area["name"="서울특별시"]["boundary"="administrative"]->.seoul;
way["highway"~"^({'|'.join(HIGHWAYS)})$"](area.seoul);
out tags;
"""

#: 내려받은 태그 중 우리가 쓰는 것만 남긴다 (파일을 작게 유지)
KEEP = ("highway", "bridge", "tunnel", "layer", "incline",
        "surface", "width", "step_count", "handrail", "ramp", "name")


def fetch() -> dict:
    body = urllib.parse.urlencode({"data": QUERY}).encode()
    last = None
    for url in MIRRORS:
        print(f"요청 중: {url} ...", flush=True)
        try:
            req = urllib.request.Request(
                url, data=body,
                headers={"User-Agent": "nakjido-walkway-tags/1.0"})
            with urllib.request.urlopen(req, timeout=900) as resp:
                return json.load(resp)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
            print(f"  실패: {e}", flush=True)
            last = e
    raise SystemExit(f"모든 서버에서 실패했습니다. 잠시 뒤 다시 시도해 주세요. ({last})")


def main() -> None:
    data = fetch()
    out: dict[str, dict] = {}
    for element in data.get("elements", []):
        if element.get("type") != "way":
            continue
        tags = {k: v for k, v in (element.get("tags") or {}).items() if k in KEEP}
        if tags:
            out[str(element["id"])] = tags

    DEST.parent.mkdir(parents=True, exist_ok=True)
    DEST.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")),
                    encoding="utf-8")

    counts: dict[str, int] = {}
    for tags in out.values():
        counts[tags.get("highway", "?")] = counts.get(tags.get("highway", "?"), 0) + 1
    print(f"\nway {len(out):,}개 → {DEST} ({DEST.stat().st_size // 1024:,} KB)")
    for key, n in sorted(counts.items(), key=lambda kv: -kv[1]):
        print(f"  {key:16s} {n:>8,}")
    for key in ("bridge", "tunnel", "incline", "surface", "width", "step_count"):
        n = sum(1 for t in out.values() if key in t)
        print(f"  [{key}] 태그 있는 way: {n:,}")


if __name__ == "__main__":
    sys.exit(main())
