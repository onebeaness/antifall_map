#!/usr/bin/env python3
"""보행 경사위험도 geojson 생성 (자치구 + 행정동).

    python3 scripts/build_risk_geojson.py <seoul_total_*.geojson> \\
        <dong_final_polygon_v3.geojson> <gu_final_polygon.geojson>

원본 폴리곤에 들어 있는 집계값을 그대로 쓰지 않고, 보행로 지점 원본에서
직접 집계한다. 아래 두 가지를 바로잡아야 하기 때문이다.

## 1. 경사는 원본 값을 쓰지 않고 종단경사를 다시 계산한다

원본의 `경사도`는 그 자리 **지형의 경사**(DEM terrain slope)다. 길을 따라
올라가는 종단경사가 아니다. 산비탈을 사선으로 가로지르는 길은 지형이
16°여도 길 자체는 2°다. 관악구 난향동 way 1436650821이 그런 경우로,
2,796m를 141m→39m로 오르내려 종단경사가 2.1°인데 원본은 최대 16.2°를
붙여 놨다. 로드뷰로 열어 보면 완만한 도로에 오른쪽만 급한 절개지다.

낙상 위험과 관계있는 건 딛고 올라가는 기울기이므로 종단경사를 쓴다.
계산 방법은 scripts/longitudinal_slope.py 참고.

### 다리·터널 보정

DEM은 지표면 모델이라 다리 아래 지면과 터널 위 산을 읽는다. 그 위를 지나는
길에 없는 경사가 생긴다. data/osm_walkway_tags.json이 있으면 다리·터널 way의
표고를 양끝 선형보간으로 갈아끼운다 (GraphHopper·Valhalla와 같은 처리).
서울 생활 보행로 31,695개 중 1,605개(5.1%)가 해당한다.

## 2. 등산로 제외 (도로유형 path)

원본 지점 185,114개의 구성은 이렇다.

    footway     133,863   표고 중앙 22m   경사 평균  2.4°   대표: 화랑로·한강산책길
    path         47,309   표고 중앙 114m  경사 평균 10.9°   대표: 비법정탐방로·북한산둘레길·사당능선
    pedestrian    3,942   표고 중앙 23m   경사 평균  2.7°   대표: 광화문광장·서울로7017

path는 전부 등산로다. 전체의 25.6%를 차지하면서 경사 평균을 통째로 끌어올린다.
관악구 낙성대동이 대표적인데, 656개 지점 중 570개(87%)가 관악산 등산로
(표고 300~357m)라 평균 경사가 10.3°로 나왔다. 정작 시가지 보도는 5.2°이고
로드뷰로 보면 평평하다. 등산로 경사는 고령자의 생활 낙상 위험과 무관하므로
footway·pedestrian만 남긴다.

## 3. 협소 구간은 감점이 아니라 가산으로 넣는다

원본 산식은 경사 0.64 + 협소 0.26 + 재질 0.10의 가중 평균이었다.
그대로 되돌리면 위험도가 **내려간다**. 폭이 기록된 지점이 26.7%뿐이라
협소 비율의 중앙값이 0.0%이고, 그 0이 가중 평균에서 점수를 26% 희석하기
때문이다. 실제로 계산해 보면 306개 동 중 62개의 등급이 내려가는데 전부
협소가 0인 곳이다 — 성동구 사근동은 폭을 260개나 기록했는데도
69점(위험)에서 49점(주의)으로 떨어진다. "넓어서 안전"이 아니라
"협소 0이 경사 위험을 가린" 결과다.

그래서 가중 평균 대신 **가산**으로 넣는다.

    경사위험도 = min(100, 경사점수 + 협소비율 × 40)

협소가 확인된 곳은 위험도가 올라가고, 폭 자료가 없는 곳은 경사 점수
그대로 남는다. 계수 40은 원본 AHP의 경사:협소 비율을 유지한 값이다
(100 × 0.26/0.64 ≈ 41). 폭 기록이 MIN_RECORDED 미만이면 가산하지 않는다.

협소 판정은 원본 플래그를 그대로 쓴다 — 역산해 보면 **폭 1.5m 이하**에서
예외 없이 1이고 1.6m부터 0이다.

재질은 점수에 넣지 않는다. 재질위험점수가 측정값이 아니라 재질별 고정
매핑이라(아스콘 1 / 블록·아스콘블록 2 / 콘크리트 3 / 비포장 4) 미끄럼을
실제로 잰 값이 아니기 때문이다. 참고 정보로만 싣는다.

## 4. 기준 초과 비율 (구 '급경사 비율')

원본의 급경사 판정은 10° 이상인데, 이는 등산로 기준이다. 보도에서 10°는
거의 나오지 않아(생활 보행로 기준 2.9%) 지표가 무뎌진다. 장애인등편의법
시행규칙 별표1의 접근로 기울기 완화 한도 1/12(4.76°)를 넘는 지점의 비율로
바꾼다 — 법정 기준이고 정비 대상을 직접 가리키는 숫자이기도 하다.

## 산식

    상시부담   = min(1, 평균 경사 / 4.76)
    기준초과   = 4.76° 이상 지점의 비율
    경사점수   = 100 × (0.5 × 상시부담 + 0.5 × 기준초과)
    보행위험도 = min(100, 경사점수 + 협소비율 × 40)

등급 경계는 법정 기준에서 역산했다. 기준 초과가 0일 때
    양호 <33  = 평균 경사가 권장 1/18(3.18°) 미만
    주의 33~49 = 권장 초과, 완화 한도 이내
    위험 50+   = 평균 경사가 완화 한도 1/12(4.76°) 초과

지점이 MIN_POINTS 미만인 동은 표본이 부족해 값을 내지 않는다(지도에서 회색).
"""
from __future__ import annotations

import json
import statistics
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from longitudinal_slope import compute_by_way  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "frontend/public/geo"
#: OSM 태그 (scripts/fetch_osm_tags.py 산출) — 다리·터널 보정에 쓴다. 없어도 돈다.
OSM_TAGS = ROOT / "data/osm_walkway_tags.json"

WALKWAY_TYPES = {"footway", "pedestrian"}   # path(등산로) 제외
BF_MAX = 4.76        # 장애인등편의법 별표1 접근로 기울기 완화 한도 1/12 (도)
MIN_POINTS = 10      # 이보다 적으면 표본 부족으로 판단해 값을 내지 않는다 (하위 10%)
MIN_WIDTH_POINTS = 10   # 폭 기록이 이보다 적으면 협소 가산을 하지 않는다
NARROW_WEIGHT = 40      # 협소 가산 계수 — 원본 AHP의 경사:협소 비율 유지
COORD_DIGITS = 5     # 약 1m — 행정구역 경계에는 충분하고 용량을 크게 줄인다


def collect(points_path: str) -> dict[str, list[dict]]:
    """보행로 지점을 행정동 코드별 목록으로 모은다 (스트리밍).

    좌표까지 들고 있는 이유: 로드뷰 링크를 동 중심점이 아니라 **가장 가파른
    지점**으로 걸기 위해서다. 중심점은 큰길 한복판이라 평지인 경우가 많아,
    가파르다고 표시된 동을 로드뷰로 열면 평평해 보이는 문제가 있었다.
    """
    records: list[dict] = []
    kept = skipped = 0
    with open(points_path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip().rstrip(",")
            if not line.startswith('{"type":"Feature"'):
                continue
            p = json.loads(line)["properties"]
            if p.get("도로유형") not in WALKWAY_TYPES:
                skipped += 1
                continue
            code, elev = p.get("adm_cd"), p.get("표고")
            if elev is None or not code:
                continue
            lon, lat = json.loads(line)["geometry"]["coordinates"][:2]
            records.append({
                "osm_id": p.get("osm_id"), "coord": (lon, lat), "elev": float(elev),
                "adm_cd": code, "lat": lat, "lon": lon,
                "width": p.get("보행로폭"),          # 결측 많음 — 점수에 안 씀
                "narrow": p.get("협소여부"),
                "surface": p.get("노면재질"),
            })
            kept += 1

    # 원본 경사도(지형 경사) 대신 way를 따라간 종단경사를 채운다.
    # 다리·터널은 DEM이 아래 지면·위 산을 읽으므로 양끝 보간으로 갈아끼운다.
    tags: dict[str, dict] = {}
    if OSM_TAGS.exists():
        tags = json.loads(OSM_TAGS.read_text(encoding="utf-8"))
    else:
        print(f"[알림] {OSM_TAGS.name} 없음 — 다리·터널 보정을 건너뜁니다 "
              "(scripts/fetch_osm_tags.py 참고)")
    fixed = compute_by_way(records, tags)
    if fixed:
        print(f"다리·터널 {fixed:,}개 way의 표고를 양끝 보간으로 대체")
    by_dong: dict[str, list[dict]] = defaultdict(list)
    for r in records:
        if "slope" in r:
            by_dong[r["adm_cd"]].append(r)
    scored = sum(len(v) for v in by_dong.values())
    print(f"보행로 지점 {kept:,}개 (등산로 등 {skipped:,}개 제외) "
          f"→ 종단경사 산출 {scored:,}개 ({scored / kept * 100:.1f}%)")
    return by_dong


#: 미끄럼 위험이 있다고 보는 재질위험점수 (블록 2 / 콘크리트 3 / 비포장 4)
SLIPPERY_FROM = 2.0
SURFACE_RISK = {"아스콘": 1.0, "블록": 2.0, "아스콘/블록": 2.0, "콘크리트": 3.0, "비포장": 4.0}


def stats(points: list[dict]) -> dict:
    """지점 목록 → 지표. 경사만 점수에 넣고, 폭·재질은 참고 정보로 붙인다."""
    n = len(points)
    slopes = [q["slope"] for q in points]
    mean = statistics.fmean(slopes)
    exceed = sum(1 for s in slopes if s >= BF_MAX) / n
    # 로드뷰로 확인할 자리 — 최대값은 이상치 하나에 끌려가므로 상위 5% 지점을 쓴다
    ranked = sorted(points, key=lambda q: q["slope"])
    worst = ranked[max(0, int(len(ranked) * 0.95) - 1)]

    widths = [float(q["width"]) for q in points
              if q["width"] is not None and float(q["width"]) > 0]
    narrows = [q["narrow"] for q in points if q["narrow"] is not None]
    narrow_ratio = (sum(1 for x in narrows if x) / len(narrows)
                    if len(narrows) >= MIN_WIDTH_POINTS else None)

    if n < MIN_POINTS:
        risk = None
    else:
        slope_score = 100 * (0.5 * min(1.0, mean / BF_MAX) + 0.5 * exceed)
        # 협소는 가산만 — 폭 자료가 없다고 점수가 내려가면 안 된다
        risk = round(min(100.0, slope_score + (narrow_ratio or 0) * NARROW_WEIGHT))
    surfaces = [q["surface"] for q in points if q["surface"]]
    top_surface = Counter(surfaces).most_common(1)[0][0] if surfaces else None
    slippery = [s for s in surfaces if SURFACE_RISK.get(s, 0) >= SLIPPERY_FROM]

    return {
        "risk": risk, "slope_mean": round(mean, 1), "slope_max": round(worst["slope"], 1),  # 상위 5% 지점
        "exceed_ratio": round(exceed, 3), "points": n,
        # 화면은 비율 대신 **개수**로 보여준다. 세 비율의 분모가 서로 달라
        # (전체 / 폭 기록분 / 재질 기록분) 나란히 놓으면 잘못 읽히기 때문이다.
        "exceed_n": sum(1 for s in slopes if s >= BF_MAX),
        "worst_lat": round(worst["lat"], 5), "worst_lon": round(worst["lon"], 5),
        # ── 참고 정보 (점수 미반영). *_n 은 실제로 기록된 지점 수 ──
        "width_n": len(widths),
        "width_mean": round(statistics.fmean(widths), 1) if widths else None,
        "narrow_ratio": None if narrow_ratio is None else round(narrow_ratio, 3),
        "narrow_n": sum(1 for x in narrows if x),
        "surface_n": len(surfaces),
        "surface_top": top_surface,
        "slippery_ratio": round(len(slippery) / len(surfaces), 3) if surfaces else None,
        "slippery_n": len(slippery),
    }


EMPTY = {"risk": None, "slope_mean": None, "slope_max": None,
         "exceed_ratio": None, "exceed_n": 0, "points": 0,
         "worst_lat": None, "worst_lon": None,
         "width_n": 0, "width_mean": None, "narrow_ratio": None, "narrow_n": 0,
         "surface_n": 0, "surface_top": None, "slippery_ratio": None, "slippery_n": 0}


def round_coords(node):
    if isinstance(node, (int, float)):
        return round(node, COORD_DIGITS)
    return [round_coords(child) for child in node]


def centroid(geometry: dict) -> tuple[float, float]:
    """가장 큰 링의 꼭짓점 평균 — 라벨 위치용이라 정밀도는 중요하지 않다."""
    polys = (geometry["coordinates"] if geometry["type"] == "MultiPolygon"
             else [geometry["coordinates"]])
    ring = max((p[0] for p in polys), key=len)
    n = len(ring)
    return round(sum(c[1] for c in ring) / n, 5), round(sum(c[0] for c in ring) / n, 5)


def geom_of(feature: dict) -> dict:
    return {"type": feature["geometry"]["type"],
            "coordinates": round_coords(feature["geometry"]["coordinates"])}


def main(points_src: str, dong_src: str, gu_src: str) -> None:
    by_dong = collect(points_src)

    dongs = []
    by_sgg: dict[str, list[dict]] = defaultdict(list)
    for feature in json.loads(Path(dong_src).read_text(encoding="utf-8"))["features"]:
        p = feature["properties"]
        pts = by_dong.get(p["adm_cd"], [])
        geometry = geom_of(feature)
        lat, lon = centroid(geometry)
        dongs.append({"type": "Feature", "geometry": geometry, "properties": {
            "name": " ".join(p["adm_nm"].split()[1:]),  # "서울특별시 종로구 사직동" → "종로구 사직동"
            "sgg": p["sggnm"],
            "adm_cd": p["adm_cd"],      # 통계청(SGIS)
            "adm_cd2": p["adm_cd2"],    # 행자부 10자리
            **(stats(pts) if pts else EMPTY),
            "lat": lat, "lon": lon,
        }})
        by_sgg[p["sggnm"]].extend(pts)

    dongs.sort(key=lambda f: f["properties"]["name"])
    write(OUT / "seoul_dong_risk.geojson", dongs, "행정동")

    gus = []
    for feature in json.loads(Path(gu_src).read_text(encoding="utf-8"))["features"]:
        name = feature["properties"]["자치구"]
        pts = by_sgg.get(name, [])
        geometry = geom_of(feature)
        lat, lon = centroid(geometry)
        gus.append({"type": "Feature", "geometry": geometry, "properties": {
            "name": name,
            "sgg": feature["properties"]["sgg"],
            **(stats(pts) if pts else EMPTY),
            "lat": lat, "lon": lon,
        }})

    gus.sort(key=lambda f: f["properties"]["name"])
    write(OUT / "seoul_gu_risk.geojson", gus, "자치구")


def write(path: Path, features: list, label: str) -> None:
    path.write_text(json.dumps({"type": "FeatureCollection", "features": features},
                               ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    scored = sum(1 for f in features if f["properties"]["risk"] is not None)
    print(f"{label} {len(features)}개 (값 있음 {scored}개) "
          f"→ {path.name} ({path.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2], sys.argv[3])
