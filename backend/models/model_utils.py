# -*- coding: utf-8 -*-
"""
model_utils.py — ML 담당(겨울) → Streamlit 담당 전달 모듈
=============================================================
Streamlit 쪽에서는 이 파일의 predict() / explain() 두 함수만 호출하면 됨.
내부 구현(어떤 모델, 어떤 전처리)은 몰라도 되도록 감싸둠.

사용 예시:
    from model_utils import predict, explain

    답변 = {"age": 78, "sex": 1, "mobility_aid": 0,
            "drug_count": 3, "hospitalized_1yr": 0, "subjective_health": 2}
    결과 = predict(답변, service="간략", model="A")
    # → {"probability": 0.34, "risk_label": "안전군", "threshold": 0.3}

    기여도 = explain(답변, service="간략", model="A")
    # → [{"변수": "drug_count", "기여도": 0.082}, ...]  (영향 큰 순)

⚠️ 이 파일과 같은 폴더(또는 MODEL_DIR 경로)에 4개 pkl 파일이 있어야 함:
    model_간략_A_LightGBM_best.pkl
    model_간략_B_RF_best.pkl
    model_정밀_A_RF_best.pkl
    model_정밀_B_RF_best.pkl
"""

import os
import warnings
import joblib
import numpy as np
import pandas as pd
import shap

warnings.filterwarnings("ignore", category=UserWarning, module="shap")

# ── 설정 ──────────────────────────────────────────────────────────────
MODEL_DIR = os.path.dirname(os.path.abspath(__file__))  # 이 파일과 같은 폴더 기준

FEATURES_SIMPLE = [
    "age", "sex", "mobility_aid", "drug_count", "hospitalized_1yr", "subjective_health",
]
# ⚠️ 2026-07-15 원본 주석: 간략은 med_visit_1mo -> subjective_health(1~5)로 교체 재학습.
#    정밀은 kfrail_cat(0/1/2) 통합본으로 재학습했다고 기재되어 있었으나,
#    배포용 zip에 실제 동봉된 정밀_A/B pkl은 feature_names_in_ 검증 결과
#    kfrail_prefrail+kfrail_frail(2변수, 총 33변수) 버전임 (2026-08-01 확인).
#    → 동봉된 pkl 실물과 dataset_v3_complex.csv 기준으로 아래 목록을 33변수로 유지한다.
#    kfrail_cat 통합본 pkl을 새로 받으면 이 목록의 kfrail 두 줄만 "kfrail_cat"으로 교체.
FEATURES_COMPLEX = [
    "drug_count", "subjective_health", "mobility_aid", "hospitalized_1yr",
    "age", "kfrail_prefrail", "kfrail_frail", "mobility_diff_general",
    "vision_diff", "hearing_diff", "med_visit_1mo", "sleep_quality",
    "sex", "gds5", "nutrition_cat", "IADL_total", "walk_safety",
    "htn", "stroke", "dm", "cancer", "copd", "mi", "heart_etc",
    "angina", "asthma", "arthritis", "ckd",
    "fracture_hx", "dementia", "back_pain", "incontinence", "osteoporosis",
]

# (service, model) → (pkl 파일명, 사용할 변수 리스트, 기본 threshold)
# threshold는 "위험군/주의군" 라벨을 나누는 기준일 뿐, probability 값 자체는 threshold와 무관하게 정확함.
# 2026.07.14 최종 확정 (2026.07.15 간략_A만 재검증 후 갱신):
#   간략_A: 07-14 확정치는 subjective_health 반영 전 모델(med_visit_1mo) 기준 리콜 59.8%용 0.4였음.
#           재학습 후 F2 곡선 자체가 바뀜(0.5:0.256→0.4:0.375→0.3:0.378→0.2:0.301, 예전엔 0.5가 최고였는데
#           지금은 0.3이 최고) — 0.4는 Recall 0.501·F2 0.375로 0.3(Recall 0.751·F2 0.378)에 두 지표 다 뒤짐.
#           통계적 최적점과 리콜 우선 방향이 이제 같은 쪽(0.3)을 가리켜서 0.3으로 변경.
#   간략_A 재확정(2026-07-15, 게이트 분석): 외부 의견은 0.35 권고했으나, 정밀_A(0.4)의 1차 게이트로
#           결합한 실측 교차표(독립가정 아닌 실제 predict_proba 교차표)에서 0.30이 0.35보다 게이트로
#           인한 순수 손실 인원이 적음(0.30=78명 vs 0.35=143명, 간략_A·정밀_A 예측 상관계수 0.69로
#           둘이 독립이 아님을 확인). 0.3으로 최종 확정.
#   간략_B 최종 확정(2026-07-15): 사회적 비용 관점에서 재발 누락(FN) 1건이 오탐(FP) 1건보다 비용이
#           크다고 판단, 0.30에서 낮춤. 단 0.20(FN 0·TN 0, 639명 전원 위험군)이 아니라 0.25(FN 3·TN 11)를
#           택함 — 0.30→0.25 전환의 손익분기 비율도 4.1배로 0.20 때(4.0배)와 거의 같으면서 TN이 0이
#           아니라 "안전군" 개념이 소폭 남기 때문. 0.25로 확정.
#   정밀_A: 0.05단위 재검증(0.20~0.50) 후에도 0.4 유지. F2 자체 최고점은 0.45~0.50(≈0.409, 거의 동률)이지만
#           정밀_A는 원래도 F2 최적화가 아니라 리콜 우선 설계 — 0.4의 Recall 0.784가 0.5의 0.642보다 훨씬
#           높아 그대로 0.4 고정.
#   정밀_B: 재발위험 고위험군(639명, 재발 양성 260명) 대상 최종 판정이라 "몇 명을 놓치는가"로 결정.
#           0.05단위 재검증 결과 F2 최고점은 0.25(0.7862)로 0.20(0.7812)보다 근소 우위지만, 그 차이가
#           놓치는 인원 0명(0.20, Recall 1.0000) vs 약 4명(0.25, Recall 0.9846=260명 중 4명 누락)에서 옴.
#           이미 낙상을 겪은 고위험군의 재발을 놓치는 비용이 오탐 비용보다 크다는 원래 설계 원칙을 그대로
#           적용해 0.2 유지.
REGISTRY = {
    ("간략", "A"): {
        "file": "model_간략_A_LightGBM_best.pkl",
        "features": FEATURES_SIMPLE,
        "threshold": 0.3,
    },
    ("간략", "B"): {
        "file": "model_간략_B_RF_best.pkl",
        "features": FEATURES_SIMPLE,
        "threshold": 0.25,
    },
    ("정밀", "A"): {
        "file": "model_정밀_A_RF_best.pkl",
        "features": FEATURES_COMPLEX,
        "threshold": 0.4,
    },
    ("정밀", "B"): {
        "file": "model_정밀_B_RF_best.pkl",
        "features": FEATURES_COMPLEX,
        "threshold": 0.2,  # 확정
    },
}

_model_cache = {}    # 매번 pkl을 다시 읽지 않도록 메모리에 보관
_explainer_cache = {}


def _get_model(service: str, model: str):
    key = (service, model)
    if key not in REGISTRY:
        raise ValueError(
            f"알 수 없는 조합입니다: service='{service}', model='{model}'. "
            f"service는 '간략'/'정밀', model은 'A'/'B' 중 하나여야 합니다."
        )
    if key not in _model_cache:
        path = os.path.join(MODEL_DIR, REGISTRY[key]["file"])
        _model_cache[key] = joblib.load(path)
    return _model_cache[key]


def _prepare_input(answers: dict, features: list) -> pd.DataFrame:
    """
    사용자 입력(dict)을 모델이 기대하는 컬럼 순서의 1행짜리 DataFrame으로 변환.
    누락된 변수가 있으면 어떤 변수가 빠졌는지 바로 알 수 있게 에러 메시지에 명시.
    """
    missing = [f for f in features if f not in answers]
    if missing:
        raise ValueError(f"입력에 다음 변수가 빠져 있습니다: {missing}")
    return pd.DataFrame([{f: answers[f] for f in features}])


def predict(answers: dict, service: str = "정밀", model: str = "A") -> dict:
    """
    answers : 변수명→값 딕셔너리 (간략=6개, 정밀=32개 키 필요)
    service : "간략" 또는 "정밀"
    model   : "A"(낙상위험, 전체 대상) 또는 "B"(재발위험, 낙상경험자 전용)

    반환값: {"probability": float, "risk_label": str, "threshold": float}
    """
    config = REGISTRY[(service, model)]
    clf = _get_model(service, model)
    X = _prepare_input(answers, config["features"])

    proba = clf.predict_proba(X)[0, 1]  # 클래스 1(위험)일 확률
    threshold = config["threshold"]

    # 2단계 구분 — Recall/Precision/F2로 검증한 threshold 하나만 기준으로 사용
    return {
        "probability": round(float(proba), 4),
        "risk_label": "위험군" if proba >= threshold else "안전군",
        "threshold": threshold,
    }


def explain(answers: dict, service: str = "정밀", model: str = "A", top_n: int = None) -> list:
    """
    같은 입력에 대해 "어떤 변수가 이 결과에 얼마나 기여했는지"를 SHAP으로 계산.
    RF와 LightGBM은 shap_values 반환 형태가 서로 달라서(3차원 vs 2차원)
    이 함수 안에서 자동으로 맞춰줌 — 호출하는 쪽은 신경 쓸 필요 없음.

    반환값: [{"변수": str, "기여도": float}, ...]  기여도 절댓값 큰 순으로 정렬
            기여도가 양수면 위험을 높이는 방향, 음수면 낮추는 방향.
    """
    config = REGISTRY[(service, model)]
    clf = _get_model(service, model)
    X = _prepare_input(answers, config["features"])

    cache_key = (service, model)
    if cache_key not in _explainer_cache:
        _explainer_cache[cache_key] = shap.TreeExplainer(clf)
    explainer = _explainer_cache[cache_key]

    raw = explainer.shap_values(X)

    # RF: (n_samples, n_features, n_classes) → 클래스 1(양성)만 추출
    # LightGBM: (n_samples, n_features) → 이미 양성 방향 기여도라 그대로 사용
    if isinstance(raw, list):          # 일부 모델·버전 조합은 리스트로 반환하기도 함
        values = raw[1][0]
    elif raw.ndim == 3:                # RF 계열
        values = raw[0, :, 1]
    else:                              # LightGBM 계열
        values = raw[0]

    result = sorted(
        [{"변수": f, "기여도": round(float(v), 4)} for f, v in zip(config["features"], values)],
        key=lambda d: abs(d["기여도"]), reverse=True,
    )
    return result[:top_n] if top_n else result


if __name__ == "__main__":
    # 간단 동작 확인용 — 실제 서비스 코드에서는 이 블록 필요 없음
    sample_simple = {
        "age": 78, "sex": 1, "mobility_aid": 0,
        "drug_count": 3, "hospitalized_1yr": 0, "subjective_health": 2,
    }
    print("=== predict() 테스트 (간략/A) ===")
    print(predict(sample_simple, service="간략", model="A"))
    print("\n=== explain() 테스트 (간략/A), 상위 3개 ===")
    for row in explain(sample_simple, service="간략", model="A", top_n=3):
        print(f"  {row['변수']:20s} {row['기여도']:+.4f}")
