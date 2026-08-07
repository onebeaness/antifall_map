#!/usr/bin/env python3
"""seoul_dong_risk.geojson 에 자료 완비율을 채워 넣는다.

    python3 scripts/add_completeness.py <원본 dong_final_polygon_v3.geojson>

왜 필요한가 — 협소 지수가 대부분 0으로 보이는 문제 때문이다.
원본의 협소·재질 지수는 "폭/재질이 **기록된** 보행로 지점"만으로 계산되는데,
그 기록률(완비율)이 중앙값 17% 수준이라 다음 두 가지가 동시에 일어난다.

  1) 대부분의 동은 좁은 지점이 하나도 안 잡혀 협소 지수가 0이 된다
     → "좁은 길이 없다"가 아니라 "폭 자료가 없다"는 뜻이다.
  2) 표본이 극소수인 동은 지수가 튄다. 실제로 협소 지수 상위 4개 동의
     폭 완비율은 0%, 3%, 3%, 1% 다 (성동구 금호1가동은 폭 자료가 0건인데 100).

그래서 지수만 보여주면 양쪽으로 오해를 부른다. 완비율을 함께 내려보내
화면에서 "자료 부족"과 "실제로 낮음"을 구분한다.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

DEST = Path(__file__).resolve().parent.parent / "frontend/public/geo/seoul_dong_risk.geojson"

# 원본 컬럼 → 내보낼 속성명
FIELDS = {
    "points": "포인트수",
    "width_complete": "폭_완비율",
    "surface_complete": "재질_완비율",
}


def main(src_path: str) -> None:
    src = json.loads(Path(src_path).read_text(encoding="utf-8"))
    by_code = {f["properties"]["adm_cd2"]: f["properties"] for f in src["features"]}

    dest = json.loads(DEST.read_text(encoding="utf-8"))
    filled = 0
    for feature in dest["features"]:
        props = feature["properties"]
        source = by_code.get(props.get("adm_cd2"))
        if not source:
            continue
        for key, column in FIELDS.items():
            value = source.get(column)
            if value is None:
                props[key] = None
            elif key == "points":
                props[key] = int(value)
            else:
                props[key] = round(float(value), 3)
        filled += 1

    DEST.write_text(json.dumps(dest, ensure_ascii=False, separators=(",", ":")),
                    encoding="utf-8")
    print(f"{filled}/{len(dest['features'])}개 행정동에 완비율 추가 → {DEST}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
