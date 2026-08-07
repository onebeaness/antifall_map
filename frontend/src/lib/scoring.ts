/** 점수·등급 산출 — 신호등 등급 + 예비 산식 + 6요소 서브스코어.
 *
 * ML 확률(대표 지표)은 백엔드 API가 담당하고, 이 모듈은
 * (1) 신호등 등급, (2) 백엔드 미연결 시 예비 산식(휴리스틱),
 * (3) 정밀 6요소 서브스코어(레이더용)와 요소별 안내 문구를 계산한다.
 * 문항 코드·척도는 ML 확정본(42문항, questions.ts)과 1:1.
 */
import { GDS, IADL_ITEMS, NSI } from "./questions";
import type { Answers, Level } from "./types";

// ── 신호등 등급: 0–33 양호 / 34–66 주의 / 67–100 위험 ────────────────
export function levelOf(score: number): Level {
  return score >= 67 ? "danger" : score >= 34 ? "warn" : "good";
}

export const LEVEL_COLOR: Record<Level, string> = {
  danger: "var(--danger)",
  warn: "var(--warn)",
  good: "var(--good)",
};

export function levelColor(score: number): string {
  return LEVEL_COLOR[levelOf(score)];
}

const num = (v: unknown, d = 0): number => (typeof v === "number" ? v : d);
const yes = (v: unknown): boolean => v === "Y";

/** GDS 위험 응답 수 (gds_1은 '아니오', 나머지는 '예'가 우울 방향) */
export function gdsScore(a: Answers): number {
  return (a.gds_1 === "N" ? 1 : 0)
    + [2, 3, 4, 5].filter((i) => a[`gds_${i}`] === "Y").length;
}

/** NSI DETERMINE 영양 위험 점수 (0~21) — 식품군 3문항은 하나로 묶어 가중 2 */
export function nsiScore(a: Answers): number {
  const foodGroupPoor = yes(a.nutri_3_1) || yes(a.nutri_3_2) || yes(a.nutri_3_3);
  return NSI.reduce((s, [code, , w]) =>
    code.startsWith("nutri_3_") ? s : s + (yes(a[code]) ? w : 0), 0)
    + (foodGroupPoor ? 2 : 0);
}

/** IADL 원점수 (10~33) — 미응답은 완전 자립(1)으로 간주 */
export function iadlTotal(a: Answers): number {
  return IADL_ITEMS.reduce((s, [code]) => s + num(a[code], 1), 0);
}

// ── 간편 확인 예비 산식 (ML 미연결 폴백) ─────────────────────────────
export function simpleHeuristic(a: Answers): [number, number] {
  const age = num(a.age);
  const meds = num(a.drug_count);
  const sh = num(a.subjective_health, 3);
  let A = 0;
  A += age >= 80 ? 22 : age >= 70 ? 12 : age >= 65 ? 6 : 0;
  A += a.sex === "F" ? 5 : 0;
  A += Math.min(meds * 4, 20);
  A += yes(a.hospitalized_1yr) ? 16 : 0;
  A += sh >= 4 ? 10 : sh === 3 ? 4 : 0;
  A += yes(a.mobility_aid) ? 26 : 0;
  A = Math.max(0, Math.min(100, Math.round(A)));
  let B = 0;
  B += yes(a.hospitalized_1yr) ? 22 : 0;
  B += yes(a.mobility_aid) ? 16 : 0;
  B += age >= 80 ? 12 : age >= 70 ? 6 : 0;
  B += Math.min(meds * 2, 10);
  return [A, Math.max(0, Math.min(100, Math.round(B)))];
}

/** 간편 확인 주요 위험요인 리스트 */
export function simpleFactors(a: Answers): { text: string; tone: number }[] {
  const out: { text: string; tone: number }[] = [];
  if (yes(a.mobility_aid)) out.push({ text: "이동보조기 사용 중", tone: 70 });
  if (yes(a.hospitalized_1yr)) out.push({ text: "최근 1년 내 입원 이력", tone: 70 });
  if (num(a.drug_count) >= 5) out.push({ text: `처방약 ${a.drug_count}종 (다약제)`, tone: 50 });
  else if (num(a.drug_count) >= 1) out.push({ text: `처방약 ${a.drug_count}종 복용`, tone: 50 });
  if (num(a.age) >= 80) out.push({ text: "만 80세 이상 고령", tone: 50 });
  if (num(a.subjective_health, 3) >= 4) out.push({ text: "주관적 건강상태 나쁨", tone: 50 });
  return out;
}

// ── 정밀 6요소 서브스코어 (레이더 세부 분석, 0–100 높을수록 위험) ────
export type FactorScores = Record<string, number>;

export function computeScores(a: Answers): { total: number; scores: FactorScores } {
  const meds = num(a.drug_count);
  const nDis = ((a.diseases as string[] | undefined) ?? []).length;
  const gds = gdsScore(a);
  const nsi = nsiScore(a); // 0~21
  const iadl = iadlTotal(a); // 10~33

  // 1~N 척도 → 0~100 정규화
  const scale = (v: unknown, min: number, max: number, d: number): number =>
    ((num(v, d) - min) / (max - min)) * 100;

  const physical = Math.round((
    scale(a.mobility_diff_general, 1, 3, 1) + scale(a.fatigue, 0, 4, 0)
    + (yes(a.stair_diff) ? 100 : 0) + (yes(a.walk_diff) ? 100 : 0)
    + scale(a.vision_diff, 1, 3, 1) * 0.5 + scale(a.hearing_diff, 1, 3, 1) * 0.5
  ) / 5);
  const disease = Math.min(100, nDis * 15
    + (yes(a.hospitalized_1yr) ? 10 : 0) + (yes(a.med_visit_1mo) ? 5 : 0));
  const drug = Math.min(100, meds * 12);
  const nutrition = Math.min(100, Math.round((nsi / 21) * 100));
  const mood = Math.min(100, gds * 18 + Math.round(scale(a.sleep_quality, 1, 5, 3) * 0.1));
  const daily = Math.min(100,
    Math.round(((iadl - 10) / 23) * 100) + (yes(a.mobility_aid) ? 15 : 0));

  const scores: FactorScores = {
    "신체 기능": physical, "질환 부담": disease, "약물 복용": drug,
    "영양 상태": nutrition, "정서 · 마음": mood, "일상생활 수행": daily,
  };
  const total = Math.round(Object.values(scores).reduce((s, v) => s + v, 0) / 6);
  return { total, scores };
}

// ── 요소별 안내 문구 ─────────────────────────────────────────────────
export function factorDesc(a: Answers, scores: FactorScores): Record<string, string> {
  const meds = num(a.drug_count);
  const nDis = ((a.diseases as string[] | undefined) ?? []).length;
  const gds = gdsScore(a);
  const nsi = nsiScore(a);
  const iadlHelp = IADL_ITEMS.filter(([code]) => num(a[code], 1) >= 2).length;
  return {
    "신체 기능": scores["신체 기능"] >= 34
      ? "계단·보행에 어려움이 확인됩니다 — 균형·근력 운동을 시작하세요."
      : "이동 능력이 양호합니다 — 지금처럼 활동량을 유지하세요.",
    "질환 부담": nDis
      ? `진단 질환 ${nDis}개 — 정기 진료로 관리 상태를 확인하세요.`
      : "진단받은 만성질환이 없습니다.",
    "약물 복용": meds >= 5
      ? `처방약 ${meds}종 복용 중 — 어지럼 유발 약물을 확인하세요.`
      : `처방약 ${meds}종 — 복용 약 변경 시 어지럼 여부를 살펴보세요.`,
    "영양 상태": nsi >= 6
      ? `영양 위험 점수 ${nsi}점(불량) — 균형 잡힌 식사와 체중 관리가 필요합니다.`
      : nsi >= 3
        ? `영양 위험 점수 ${nsi}점(주의) — 식사 횟수와 식품군을 살펴보세요.`
        : "식생활이 대체로 양호합니다.",
    "정서 · 마음": gds >= 2
      ? `우울 선별 ${gds}점 — 2점 이상은 보건소 마음건강 상담을 권합니다.`
      : "마음 상태가 안정적입니다.",
    "일상생활 수행": iadlHelp
      ? `도움이 필요한 활동 ${iadlHelp}개 — 생활환경 정비와 지원 서비스를 알아보세요.`
      : "일상생활을 스스로 수행하고 계십니다.",
  };
}

/** 결과 표제 — 등급별 한 줄.
 * 문구 톤은 팀원 배포본(senior_fall_service_v7_6)을 따른다.
 * 점수를 통보하는 말투 대신, 함께 살펴본다는 말투를 쓴다. */
export function headline(lv: Level): string {
  return {
    danger: "조금 더 세심하게 살펴볼 필요가 있습니다.",
    warn: "몇 가지만 함께 살펴보면 좋겠습니다.",
    good: "축하합니다!",
  }[lv];
}

/** 결과 요약 — 표제 아래 한 줄 */
export function summaryLead(lv: Level): string {
  return {
    danger: "입력하신 내용을 바탕으로 볼 때 낙상 위험 요인이 확인되었습니다.",
    warn: "입력하신 내용을 바탕으로 볼 때 살펴볼 만한 부분이 몇 가지 있습니다.",
    good: "현재 건강 상태는 비교적 안정적인 편으로 나타났습니다.",
  }[lv];
}

/** 결과 해석 문구 — 가장 점수가 높은 영역을 짚어 준다 */
export function interpretation(lv: Level, worst: string): string {
  return {
    danger: `걱정하기보다는 ${worst} 부분을 중심으로 이동 환경, 복용 약물, 보행 상태를 `
      + "보호자 또는 의료진과 함께 차근차근 점검해 주세요.",
    warn: `${worst} 부분을 조금 더 살펴보시면 좋겠습니다. `
      + "무리하지 마시고 균형·근력 운동부터 천천히 시작해 보세요.",
    good: `${worst} 부분만 가볍게 살펴보시고, 지금처럼 규칙적인 생활을 이어가 주세요. `
      + "6개월 뒤에 다시 확인해 보시면 좋겠습니다.",
  }[lv];
}

/** 간편 확인 결과 안내 문구 */
export function simpleMessage(lv: Level): string {
  return {
    danger: "걱정하기보다는 이동 환경, 복용 약물, 보행 상태를 보호자 또는 의료진과 "
      + "함께 차근차근 점검해 주세요.",
    warn: "무리하지 마시고, 균형·근력 운동과 생활환경 점검부터 천천히 시작해 보세요.",
    good: "지금처럼 규칙적인 생활을 이어가시되, 외출하거나 계단을 이용할 때에는 "
      + "항상 천천히 움직여 주세요.",
  }[lv];
}

/** 수치를 오해하지 않도록 덧붙이는 고지 — 배포본의 핵심 문구 */
export const SCORE_NOTE =
  "※ 이 수치는 시험 점수가 아니라, 입력하신 내용을 바탕으로 계산된 낙상 위험 확률입니다.";
