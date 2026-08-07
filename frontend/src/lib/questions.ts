/** 설문 문항 데이터 — ML 확정본(2026-07-15, 팀원 배포용)의 42문항 구조.
 *
 * 간편 확인 6문항 + 심층 추가 36문항 = 정밀 42문항.
 * 간편 확인을 먼저 마치면 심층 확인은 남은 36문항만 응답한다.
 * 문항·선택지·인코딩 값은 ML 학습 데이터(dataset_v3)와 1:1 대응:
 *  - subjective_health/sleep_quality 1~5, 불편도 1~3, IADL 1~3(1~7번)·1~4(8~10번)
 *  - 성별 M/F, 예·아니오형 Y/N, 질환은 한글 라벨 배열
 *
 * 문항은 앱 번들에 포함되므로 오프라인에서도 응답 가능하다 (IA.md 6절).
 * 결과 산출(ML)만 온라인이 필요하다.
 */

export type CardType = "choice" | "number" | "multi";

export interface QuestionCard {
  code: string;
  type: CardType;
  title: string;
  options?: [string, string | number][]; // [라벨, 값]
  multiOptions?: string[]; // multi 전용
  help?: string;
  section?: string;
  unit?: string;
  min?: number;
  max?: number;
  default?: number;
}

// ── 공통 선택지 ──────────────────────────────────────────────────────
const YN: [string, string][] = [["예, 있습니다", "Y"], ["아니오, 없습니다", "N"]];
const HARD: [string, string][] = [["예, 힘들다", "Y"], ["아니오, 힘들지 않다", "N"]];
const YES_NO: [string, string][] = [["예", "Y"], ["아니오", "N"]];
const APPLY: [string, string][] = [["그렇다", "Y"], ["아니다", "N"]];
const DIFF3: [string, number][] = [["불편하지 않다", 1], ["불편한 편이다", 2], ["매우 불편하다", 3]];
const IADL3: [string, number][] = [["완전 자립", 1], ["부분 도움", 2], ["완전 도움", 3]];
const IADL4: [string, number][] = [["완전 자립", 1], ["적은 부분 도움", 2], ["많은 부분 도움", 3], ["완전 도움", 4]];

// ── 간편 확인 6문항 (ML 간략 6변수와 1:1) ────────────────────────────
export const SIMPLE_QUESTIONS: (QuestionCard & { simpleSection: string })[] = [
  { code: "sex", simpleSection: "기본 정보", type: "choice", title: "성별을 선택해 주세요.",
    options: [["남성", "M"], ["여성", "F"]] },
  { code: "age", simpleSection: "기본 정보", type: "number",
    title: "연령이 어떻게 되시나요?", help: "만 나이를 숫자로 입력해 주세요.",
    unit: "세", min: 50, max: 110, default: 70 },
  { code: "drug_count", simpleSection: "약물 복용", type: "number",
    title: "3개월 이상 복용 중인\n의사 처방약은 몇 종류인가요?",
    help: "영양제·건강보조식품은 제외하고, 의사 처방약만 세어 주세요.",
    unit: "종류", min: 0, max: 30, default: 0 },
  { code: "hospitalized_1yr", simpleSection: "의료 이용", type: "choice",
    title: "지난 1년간 아프거나 다쳐서\n병원에 입원한 적이 있나요?",
    help: "요양병원과 일반 병·의원 입원을 모두 포함합니다.",
    options: YN },
  { code: "subjective_health", simpleSection: "건강 상태", type: "choice",
    title: "자신의 평소 건강 상태가\n어떻다고 생각하십니까?",
    options: [["매우 건강하다", 1], ["건강한 편이다", 2], ["보통이다", 3],
              ["건강하지 않은 편이다", 4], ["매우 건강하지 않다", 5]] },
  { code: "mobility_aid", simpleSection: "이동 능력", type: "choice",
    title: "집 안팎 이동 시 보조기를\n사용하나요?",
    help: "워커, 휠체어, 지팡이 등을 포함합니다.",
    options: [["예, 사용합니다", "Y"], ["아니오, 사용하지 않습니다", "N"]] },
];

// ── 질환·IADL·GDS·영양 정의 (ML 확정본 원문) ─────────────────────────
export const DISEASES = ["고혈압", "당뇨병", "뇌졸중(중풍·뇌경색)", "협심증", "심근경색",
  "심부전·부정맥 등 심장 질환", "천식", "만성폐질환(기관지염·폐기종)",
  "골관절염·류머티즘 관절염", "골다공증", "요통·좌골신경통",
  "골절·탈골·사고 후유증", "치매", "요실금", "만성 신장 질환", "암(악성신생물)"];

/** [코드, 문항, 척도(3 또는 4)] — IADL 원점수 범위 10~33 */
export const IADL_ITEMS: [string, string, 3 | 4][] = [
  ["iadl_1", "몸단장 (빗질·화장·면도·손톱 깎기)", 3],
  ["iadl_2", "집안일 (실내 청소·설거지·정리 정돈)", 3],
  ["iadl_3", "식사 준비 (재료 준비·요리·상 차리기)", 3],
  ["iadl_4", "빨래 (세탁 후 널어 말리기 포함)", 3],
  ["iadl_5", "제시간에 정해진 양의 약 챙겨 먹기", 3],
  ["iadl_6", "금전 관리 (용돈·통장·재산 관리)", 3],
  ["iadl_7", "근거리 외출하기 (가까운 거리 걸어서)", 3],
  ["iadl_8", "물건 구매 결정·돈 지불·거스름돈 받기", 4],
  ["iadl_9", "전화 걸고 받기", 4],
  ["iadl_10", "교통수단 이용하기 (대중교통·개인 차)", 4],
];

/** [코드, 문항] — 1번은 '아니오', 2~5번은 '예'가 우울 방향. 절단점 2점. */
export const GDS: [string, string][] = [
  ["gds_1", "현재 생활에 대체로 만족하십니까?"],
  ["gds_2", "생활이 지루하게 느껴질 때가 많습니까?"],
  ["gds_3", "절망적이라는 느낌이 자주 드십니까?"],
  ["gds_4", "바깥에 나가기 싫고 집에만 있고 싶습니까?"],
  ["gds_5", "지금의 내 자신이 아무 쓸모없는 사람이라고 느끼십니까?"],
];

/** [코드, 문항, NSI DETERMINE 가중치] — 총점 0~21, 0~2 양호/3~5 주의/6+ 불량.
 * nutri_3_x 3개는 '식품군 부족' 한 항목(가중치 2)으로 묶여 계산된다. */
export const NSI: [string, string, number][] = [
  ["nutri_1", "질병(건강) 때문에 먹는 음식의 양이나 종류를 바꾸고 있다", 2],
  ["nutri_2", "하루에 채 두 끼를 못 먹는다", 3],
  ["nutri_3_1", "과일을 거의 먹지 않는다", 2],
  ["nutri_3_2", "채소를 거의 먹지 않는다", 2],
  ["nutri_3_3", "유제품(우유 등)을 거의 먹지 않는다", 2],
  ["nutri_4", "거의 매일 3잔 이상의 술을 마신다", 2],
  ["nutri_5", "치아가 좋지 않거나 입안이 헐어서 음식 먹기가 힘들다", 2],
  ["nutri_6", "돈이 부족해 필요한 음식을 구입 못할 때도 있다", 4],
  ["nutri_7", "거의 매번 혼자서 식사한다", 1],
  ["nutri_8", "하루에 세 가지 이상의 서로 다른 약(처방·비처방)을 복용한다", 1],
  ["nutri_9", "지난 6개월 사이 일부러 조절하지 않았는데도 몸무게가 5kg 이상 줄거나 늘었다", 2],
  ["nutri_10", "장보고, 음식 만들고, 식사하는 것이 감당하기 힘들 때도 있다", 2],
];

const c = (code: string, title: string, options: [string, string | number][],
           help?: string, section?: string): QuestionCard =>
  ({ code, type: "choice", title, options, help, section });

export interface Domain {
  name: string;
  count: number;
  lead: string;
  cards: QuestionCard[];
}

/** 심층 확인 42문항 — 도메인 4개(10:14:6:12) + 5단계(AI 분석 결과).
 * 처음 6문항은 간편 확인과 동일(공통) — 간단 완료 시 건너뛴다. */
export const DOMAINS: Domain[] = [
  { name: "기본 정보", count: 10, lead: "기본 정보와 건강 상태를 여쭤봅니다", cards: [
    ...SIMPLE_QUESTIONS.map(({ simpleSection: _s, ...card }) => card),
    c("med_visit_1mo", "지난 1개월간 병·의원 외래 진료를 이용했나요?", YN),
    c("sleep_quality", "지난 3개월 동안 잠을 잘 주무셨습니까?",
      [["매우 그렇다", 1], ["그렇다", 2], ["보통이다", 3], ["그렇지 않다", 4], ["전혀 그렇지 않다", 5]]),
    c("vision_diff", "시력 때문에 일상생활(TV 보기·신문 읽기 등)에 불편함이 있으십니까?", DIFF3,
      "안경 등 보조기 착용 없이 기준으로 답해 주세요."),
    c("hearing_diff", "청력 때문에 일상생활(전화 통화·대화)에 불편함이 있으십니까?", DIFF3,
      "보청기 등 보조기 착용 없이 기준으로 답해 주세요."),
  ]},
  { name: "신체 기능", count: 14, lead: "이동과 일상생활 능력을 여쭤봅니다", cards: [
    c("mobility_diff_general", "이동(집 안팎에서의 이동)에 불편함이 있으십니까?", DIFF3,
      "보조기 착용 없이 기준으로 답해 주세요."),
    c("fatigue", "지난 한 달 동안 피곤하다고 느낀 적이 있습니까?",
      [["항상 그렇다", 4], ["거의 대부분 그렇다", 3], ["종종 그렇다", 2],
       ["가끔씩 그렇다", 1], ["전혀 그렇지 않다", 0]]),
    c("stair_diff", "도움 없이 혼자서 쉬지 않고 10개의 계단을 오르는 데 힘이 듭니까?", HARD),
    c("walk_diff", "도움 없이 혼자서 300m를 이동하는 데 힘이 듭니까?", HARD),
    ...IADL_ITEMS.map(([code, title, levels]) =>
      c(code, `다음 활동을 도움 없이 혼자 하실 수 있습니까?\n${title}`,
        levels === 3 ? IADL3 : IADL4,
        "지난 일주일 동안의 활동을 기준으로 답해 주세요.", "일상생활 수행 능력")),
  ]},
  { name: "질환 · 마음", count: 6, lead: "진단받은 질환과 마음 상태를 여쭤봅니다", cards: [
    { code: "diseases", type: "multi",
      title: "현재 의사에게 진단받아 앓고 계신 질환을 모두 골라 주세요.",
      help: "해당되는 질환을 모두 선택하세요. 없으면 '해당 없음'을 선택하세요.",
      multiOptions: DISEASES },
    ...GDS.map(([code, title]) =>
      c(code, title, YES_NO, "지난 일주일간 느끼신 것과 가장 가까운 답을 골라 주세요.", "최근 마음 상태")),
  ]},
  { name: "영양 상태", count: 12, lead: "최근 식생활을 여쭤봅니다", cards:
    NSI.map(([code, title]) =>
      c(code, `최근 식생활에서, 다음이 해당되십니까?\n${title}`, APPLY,
        "지난 1개월간의 영양 관리 상태에 대한 질문입니다.", "영양 상태")),
  },
];

/** 도메인 인덱스와 카드를 평탄화 — 심층 확인 진행 순서 */
export const ALL_CARDS: [number, QuestionCard][] =
  DOMAINS.flatMap((d, di) => d.cards.map((card) => [di, card] as [number, QuestionCard]));

export const TOTAL_Q = DOMAINS.reduce((s, d) => s + d.count, 0); // 42
export const STEP_NAMES = [...DOMAINS.map((d) => `${d.name}(${d.count}문항)`), "AI 분석 결과"];

/** 간편 확인 완료 시 심층 확인 시작 인덱스 — 공통 6문항 건너뛰기 */
export const PRECISION_RESUME_INDEX = SIMPLE_QUESTIONS.length; // 6
