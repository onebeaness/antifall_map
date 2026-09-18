"""낙상 위험 ML 모델 래퍼 — 2026-07-15 확정본(ML 담당 전달) 기준.

ML 확정 사항 (배포용 zip / model_utils.py 참고):
- 4개 pkl 전부 재학습(2026-07-15), threshold 확정:
  간략_A 0.3 · 간략_B 0.25 · 정밀_A 0.4 · 정밀_B 0.2
- 성별 인코딩 확정: 남성=0, 여성=1
- 간략 6변수: age, sex, mobility_aid, drug_count, hospitalized_1yr, subjective_health(1~5)
- 정밀 32변수: kfrail_prefrail/frail 2변수 → kfrail_cat(0=정상/1=전노쇠/2=노쇠) 통합

Hurdle 구조:
- Model A(낙상위험, 전체 대상): 항상 실행
- Model B(재발위험, 낙상 경험자 전용): 최근 1년 낙상 경험이 있을 때만 실행

프론트가 보내는 응답 값 규약 (routers/assess.py 참고):
- sex: "M"/"F" · 예/아니오형: "Y"/"N"
- subjective_health, sleep_quality: 1~5 (1=매우 건강/매우 잘 잠)
- vision_diff, hearing_diff, mobility_diff_general: 1~3 (1=불편하지 않다)
- fatigue: 0~4 (4=항상 그렇다) — K-FRAIL 위험 판정은 3 이상
- iadl_1~7: 1~3, iadl_8~10: 1~4 (완전 자립=1)
- diseases: 질환 한글 라벨 배열 · gds_1~5, nutri_*: "Y"/"N"
"""

from __future__ import annotations

import os
import sys

# backend/models/ (app 패키지 밖) — MODELS_DIR 환경변수로 재지정 가능
_DEFAULT_MODELS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "models")
_MODELS_DIR = os.environ.get("MODELS_DIR", _DEFAULT_MODELS_DIR)
if _MODELS_DIR not in sys.path:
    sys.path.insert(0, _MODELS_DIR)

MODEL_IMPORT_ERROR: str | None = None
try:
    import model_utils as _mu  # noqa: E402
except Exception as e:  # joblib/sklearn/lightgbm/shap 미설치 등
    _mu = None
    MODEL_IMPORT_ERROR = f"{type(e).__name__}: {e}"


def is_available() -> bool:
    return _mu is not None


# ---------------------------------------------------------------- 상수 (확정 인코딩)
SEX_MALE, SEX_FEMALE = 0, 1  # 2026-07 확정

# 질환 라벨 → 모델 변수 키 (ML 확정본과 동일한 16종)
DISEASE_TO_KEY = {
    "고혈압": "htn", "당뇨병": "dm", "뇌졸중(중풍·뇌경색)": "stroke", "협심증": "angina",
    "심근경색": "mi", "심부전·부정맥 등 심장 질환": "heart_etc", "천식": "asthma",
    "만성폐질환(기관지염·폐기종)": "copd", "골관절염·류머티즘 관절염": "arthritis",
    "골다공증": "osteoporosis", "요통·좌골신경통": "back_pain",
    "골절·탈골·사고 후유증": "fracture_hx", "치매": "dementia", "요실금": "incontinence",
    "만성 신장 질환": "ckd", "암(악성신생물)": "cancer",
}
DISEASE_KEYS = list(DISEASE_TO_KEY.values())

# K-FRAIL 질환 부담 판정에 포함되는 11종 (ML 확정본 kfrail_disease_names)
KFRAIL_DISEASE_KEYS = {"htn", "dm", "stroke", "cancer", "copd", "mi",
                       "heart_etc", "angina", "asthma", "arthritis", "ckd"}

# 변수명 → 한글 라벨 (explain 결과 표시용, ML 확정본 FEATURE_LABEL)
FEATURE_LABEL = {
    "age": "나이", "sex": "성별", "mobility_aid": "이동보조기 사용",
    "drug_count": "복용 처방약 수", "hospitalized_1yr": "최근 1년 입원",
    "med_visit_1mo": "최근 1개월 외래 이용", "subjective_health": "주관적 건강상태",
    "kfrail_prefrail": "허약 전단계", "kfrail_frail": "허약 단계",
    "kfrail_cat": "노쇠 상태", "mobility_diff_general": "이동 불편",
    "vision_diff": "시력 불편", "hearing_diff": "청력 불편",
    "sleep_quality": "수면상태", "gds5": "정서 상태", "nutrition_cat": "영양 상태",
    "IADL_total": "일상생활 수행", "walk_safety": "보행환경",
    "htn": "고혈압", "stroke": "뇌졸중", "dm": "당뇨병", "cancer": "암",
    "copd": "만성폐질환", "mi": "심근경색", "heart_etc": "심부전·부정맥",
    "angina": "협심증", "asthma": "천식", "arthritis": "관절염", "ckd": "만성신장",
    "fracture_hx": "골절이력", "dementia": "치매", "back_pain": "요통",
    "incontinence": "요실금", "osteoporosis": "골다공증",
}


class ModelUnavailable(RuntimeError):
    pass


def _require():
    if _mu is None:
        raise ModelUnavailable(
            "낙상 예측 모델을 불러오지 못했습니다. requirements 설치(joblib·"
            f"scikit-learn·lightgbm·shap)와 models/ pkl 파일을 확인하세요. ({MODEL_IMPORT_ERROR})")


def _yn(v) -> int:
    """'Y'/'N', 불리언, 0/1 어느 쪽이든 1/0으로."""
    if isinstance(v, str):
        return int(v.strip().upper().startswith(("Y", "예")) or v.strip() == "그렇다")
    return int(bool(v))


def _num(v, default: int = 0) -> int:
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


# ---------------------------------------------------------------- 인코딩 함수
def encode_simple(a: dict) -> dict:
    """간략 6변수 — ML 확정본 encode_answers()의 simple 경로와 동일."""
    return {
        "age": _num(a.get("age")),
        "sex": SEX_FEMALE if a.get("sex") == "F" else SEX_MALE,
        "mobility_aid": _yn(a.get("mobility_aid")),
        "drug_count": _num(a.get("drug_count")),
        "hospitalized_1yr": _yn(a.get("hospitalized_1yr")),
        "subjective_health": min(5, max(1, _num(a.get("subjective_health"), 3))),
    }


def encode_complex(a: dict) -> dict:
    """정밀 32변수 — ML 확정본 encode_answers()의 complex 경로와 동일."""
    feat = encode_simple(a)
    feat["med_visit_1mo"] = _yn(a.get("med_visit_1mo"))

    # GDS-5: 1번은 '아니오', 2~5번은 '예'가 우울 방향. 절단점 2점 이진화.
    gds_score = int(_yn(a.get("gds_1")) == 0)
    gds_score += sum(_yn(a.get(f"gds_{i}")) for i in range(2, 6))
    feat["gds5"] = int(gds_score >= 2)

    # IADL 원점수: 1~7번(3점 척도) + 8~10번(4점 척도), 범위 10~33
    feat["IADL_total"] = (
        sum(min(3, max(1, _num(a.get(f"iadl_{i}"), 1))) for i in range(1, 8))
        + sum(min(4, max(1, _num(a.get(f"iadl_{i}"), 1))) for i in range(8, 11))
    )

    # NSI DETERMINE 가중치: 질병2, 2끼미만3, 식품군2, 술2, 구강2, 경제4,
    # 혼밥1, 다약제1, 체중변화2, 식사수행2 → 0~2 양호 / 3~5 주의 / 6+ 불량
    food_group_poor = int(any(_yn(a.get(k)) for k in ("nutri_3_1", "nutri_3_2", "nutri_3_3")))
    nutrition_score = (
        2 * _yn(a.get("nutri_1")) + 3 * _yn(a.get("nutri_2")) + 2 * food_group_poor
        + 2 * _yn(a.get("nutri_4")) + 2 * _yn(a.get("nutri_5")) + 4 * _yn(a.get("nutri_6"))
        + 1 * _yn(a.get("nutri_7")) + 1 * _yn(a.get("nutri_8"))
        + 2 * _yn(a.get("nutri_9")) + 2 * _yn(a.get("nutri_10"))
    )
    feat["nutrition_cat"] = 0 if nutrition_score <= 2 else (1 if nutrition_score <= 5 else 2)

    # 질환 16종 더미
    diseases = {DISEASE_TO_KEY[d] for d in (a.get("diseases") or []) if d in DISEASE_TO_KEY}
    for key in DISEASE_KEYS:
        feat[key] = int(key in diseases)

    # K-FRAIL 5항목 (ML 확정 로직) → 배포 pkl은 2변수(전노쇠/노쇠) 버전이라 플래그로 변환
    # (0=정상 / 1~2=전노쇠 / 3+=노쇠 — kfrail_cat 통합본 pkl을 받으면 cat 하나로 교체)
    fatigue_risk = int(_num(a.get("fatigue")) >= 3)  # 항상/거의 대부분
    stair_risk = _yn(a.get("stair_diff"))
    walk_risk = _yn(a.get("walk_diff"))
    disease_burden = int(len(diseases & KFRAIL_DISEASE_KEYS) >= 5)
    weight_change = _yn(a.get("nutri_9"))
    kfrail_total = fatigue_risk + stair_risk + walk_risk + disease_burden + weight_change
    feat["kfrail_prefrail"] = int(1 <= kfrail_total <= 2)
    feat["kfrail_frail"] = int(kfrail_total >= 3)

    feat["mobility_diff_general"] = min(3, max(1, _num(a.get("mobility_diff_general"), 1)))
    feat["vision_diff"] = min(3, max(1, _num(a.get("vision_diff"), 1)))
    feat["hearing_diff"] = min(3, max(1, _num(a.get("hearing_diff"), 1)))
    feat["sleep_quality"] = min(5, max(1, _num(a.get("sleep_quality"), 3)))
    # ML 확정본 로직 그대로 — 단, 학습 데이터의 walk_safety는 1~5 척도라
    # 0/1 매핑은 저위험 쪽으로 치우친다. 설문에 보행환경 문항 추가 시 교체 지점.
    feat["walk_safety"] = walk_risk
    return feat


# ---------------------------------------------------------------- 예측 실행
def _run(features: dict, service: str, fall_experience: bool) -> dict:
    """Model A 항상, Model B는 낙상 경험 시에만. 확률(%)·등급 반환."""
    _require()
    a = _mu.predict(features, service, "A")
    contrib = _mu.explain(features, service, "A", top_n=5)
    out = {
        "prob_a": a["probability"],
        "pct_a": round(a["probability"] * 100),
        "label_a": a["risk_label"],
        "threshold_a": a["threshold"],
        "contributors": [
            {"feature": c["변수"], "label": FEATURE_LABEL.get(c["변수"], c["변수"]),
             "value": round(c["기여도"], 4), "direction": "up" if c["기여도"] > 0 else "down"}
            for c in contrib
        ],
        "fall_experience": bool(fall_experience),
    }
    if fall_experience:
        b = _mu.predict(features, service, "B")
        out.update({
            "prob_b": b["probability"],
            "pct_b": round(b["probability"] * 100),
            "label_b": b["risk_label"],
            "threshold_b": b["threshold"],
        })
    return out


def warm_up() -> None:
    """모델 4개와 SHAP explainer를 미리 캐시에 올린다 (서버 기동 시 1회).

    실제 추론과 같은 경로를 타야 explainer까지 캐시되므로 더미 입력으로
    한 번씩 돌린다. 모델이 없으면 조용히 넘어간다.
    """
    if not is_available():
        return
    # 인코더를 그대로 태워야 실제 요청과 같은 변수 구성이 된다
    answers = {"sex": "F", "age": 75, "drug_count": 2, "hospitalized_1yr": "N",
               "subjective_health": 3, "mobility_aid": "N"}
    for service, features in (("간략", encode_simple(answers)),
                              ("정밀", encode_complex(answers))):
        for model in ("A", "B"):
            try:
                _mu.predict(features, service, model)
                _mu.explain(features, service, model, top_n=1)
            except Exception:  # 예열 실패는 무시 — 실제 요청 때 다시 시도한다
                pass


def assess_from_simple(answers: dict, fall_experience: bool) -> dict:
    return _run(encode_simple(answers), "간략", bool(fall_experience))


def assess_from_precision(answers: dict, fall_experience: bool) -> dict:
    return _run(encode_complex(answers), "정밀", bool(fall_experience))
