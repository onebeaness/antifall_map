"""진단 API — ML 간략/정밀 모델 추론.

요청은 설문 화면이 모은 원시 응답(dict)을 그대로 받는다
(문항 코드 → 값, 예: {"S1": "F", "S2": 78, ...}).
설문 응답 → 33변수 스키마 변환(K-FRAIL·GDS·영양 파생 포함)은
services/fall_model.py 의 ui_from_simple / ui_from_precision 이 담당한다.

응답 구조는 IA.md 3절 제안과 동일:
  {prob_a, pct_a, label_a, threshold_a, contributors[], pct_b?, label_b?}
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services import fall_model

router = APIRouter()


class AssessRequest(BaseModel):
    """설문 응답 + 낙상 경험(등록 시 수집, Model B 게이트)."""

    answers: dict[str, Any] = Field(..., description="문항 코드 → 응답 값")
    fall_experience: bool = Field(False, description="최근 1년 낙상 경험 여부")


def _run(fn, req: AssessRequest) -> dict:
    if not fall_model.is_available():
        raise HTTPException(
            status_code=503,
            detail=f"ML 모델을 사용할 수 없습니다: {fall_model.MODEL_IMPORT_ERROR}",
        )
    try:
        return fn(req.answers, req.fall_experience)
    except fall_model.ModelUnavailable as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except (KeyError, ValueError, TypeError) as e:
        raise HTTPException(status_code=422, detail=f"입력 형식 오류: {e}") from e


@router.post("/simple")
def assess_simple(req: AssessRequest) -> dict:
    """간단 진단(6문항, S1~S6) → ML 간략 모델 A(+B)."""
    return _run(fall_model.assess_from_simple, req)


@router.post("/precision")
def assess_precision(req: AssessRequest) -> dict:
    """정밀 진단(50문항, S1~H6) → ML 정밀 모델 A(+B) + SHAP 기여요인."""
    return _run(fall_model.assess_from_precision, req)
