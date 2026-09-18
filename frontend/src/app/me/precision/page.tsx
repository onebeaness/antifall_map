"use client";

/** 심층 확인 42문항 (IA.md 2.5, 정본: 심층 확인 화면.dc.html — 확정안 1a).
 * 좌측 스텝 내비 + 상단 도메인 분할 진행바 + 문항 카드.
 * 문항 구성은 ML 확정본(2026-07-15) 42문항: 공통 6 + 심층 36.
 * 간편 확인을 마친 경우 공통 6문항을 건너뛰고 36문항만 응답한다. */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button, Card, DomainProgress, Encouragement, NoticeStrip, OptionButton, Radar,
  SignalBadge, StepPanel,
} from "@/components/ui";
import type { StepItem } from "@/components/ui";
import { assessPrecision, assessSimple } from "@/lib/api";
import {
  ALL_CARDS, DOMAINS, PRECISION_RESUME_INDEX, STEP_NAMES, TOTAL_Q,
} from "@/lib/questions";
import {
  SCORE_NOTE, computeScores, factorDesc, headline, interpretation, levelColor, levelOf, summaryLead,
} from "@/lib/scoring";
import { storage } from "@/lib/storage";
import type { Answers, AssessResult, Profile } from "@/lib/types";

const DRAFT_KEY = "ansim.draft.precision";
const SIMPLE_CODES = ["sex", "age", "drug_count", "hospitalized_1yr", "subjective_health", "mobility_aid"];

function answeredCounts(ans: Answers): number[] {
  return DOMAINS.map((d) =>
    d.cards.filter((card) => card.code in ans && ans[card.code] !== undefined && ans[card.code] !== "").length);
}

export default function PrecisionTestPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [idx, setIdx] = useState(-1); // -1=인트로, 0..41=문항, 42=결과
  const [start, setStart] = useState(0);
  const [ans, setAns] = useState<Answers>({});
  const [result, setResult] = useState<AssessResult | null>(null);
  const [assessError, setAssessError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [resumeFromSimple, setResumeFromSimple] = useState(false);

  useEffect(() => {
    (async () => {
      const p = await storage.getProfile();
      if (!p) { router.replace("/register"); return; }
      setProfile(p);
      const simple = await storage.getSimple();
      // 진행 중 초안 복원
      try {
        const draft = JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? "null");
        if (draft?.ans) {
          setAns(draft.ans);
          setStart(draft.start ?? 0);
          setIdx(-1); // 인트로에서 이어서 시작
          setResumeFromSimple((draft.start ?? 0) > 0);
          setLoaded(true);
          return;
        }
      } catch { /* 초안 없음 */ }
      if (simple) {
        // 간편 확인 응답 자동 반영 — 공통 6문항 건너뛰기
        const pre: Answers = {};
        for (const code of SIMPLE_CODES) if (code in simple.answers) pre[code] = simple.answers[code];
        setAns(pre);
        setStart(PRECISION_RESUME_INDEX);
        setResumeFromSimple(true);
      } else {
        setAns({ sex: p.gender });
      }
      setLoaded(true);
    })();
  }, [router]);

  const saveDraft = useCallback((a: Answers, s: number) => {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ ans: a, start: s }));
  }, []);

  const setAnswer = (code: string, value: Answers[string]) => {
    const next = { ...ans, [code]: value };
    setAns(next);
    saveDraft(next, start);
  };

  const finish = async () => {
    if (!profile) return;
    setBusy(true);
    setAssessError(null);
    let res: AssessResult | null = null;
    try {
      res = await assessPrecision(ans, profile.fallExperience);
    } catch (e) {
      res = null;
      setAssessError(e instanceof Error ? e.message : String(e));
    }
    setResult(res);
    await storage.savePrecision({ answers: ans, result: res, savedAt: new Date().toISOString() });
    // 정밀이 간단을 포함 — 공통 6문항으로 간단 결과도 갱신 저장 (허브 카드 활성화)
    const simpleAns: Answers = {};
    for (const code of SIMPLE_CODES) if (code in ans) simpleAns[code] = ans[code];
    let simpleRes: AssessResult | null = null;
    try { simpleRes = await assessSimple(simpleAns, profile.fallExperience); } catch { simpleRes = null; }
    await storage.saveSimple({ answers: simpleAns, result: simpleRes, savedAt: new Date().toISOString() });
    window.localStorage.removeItem(DRAFT_KEY);
    setBusy(false);
    setIdx(ALL_CARDS.length);
  };

  if (!loaded || !profile) return null;

  const name = profile.name || "사용자";
  const counts = answeredCounts(ans);
  const done = idx >= ALL_CARDS.length;
  const remaining = TOTAL_Q - (resumeFromSimple ? PRECISION_RESUME_INDEX : 0);

  // ── 인트로 ──
  if (idx < 0) {
    return (
      <main className="container" style={{ display: "flex", justifyContent: "center", paddingTop: 60 }}>
        <Card variant="question">
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: ".4px", color: "var(--medical-blue)" }}>
            심층 확인 · {TOTAL_Q}문항
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.5px", margin: "10px 0 8px" }}>
            {name}님,<br />심층 확인을 시작할까요?
          </div>
          <div style={{ fontSize: 15, color: "var(--ink-muted)", lineHeight: 1.65, marginBottom: 12 }}>
            신체 기능·질환·영양·마음 상태까지 6개 요소를 AI가 종합 분석합니다.{" "}
            {resumeFromSimple
              ? <>간편 확인을 마치셨으므로 <b style={{ color: "var(--ink)" }}>남은 {remaining}문항</b>만 응답하면 됩니다.</>
              : <>약 10분 정도 걸립니다.</>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.8fr", gap: 10, marginTop: 8 }}>
            <Button variant="ghost" onClick={() => router.push("/me")}>← 돌아가기</Button>
            <Button onClick={() => setIdx(start)}>확인 시작하기 →</Button>
          </div>
        </Card>
      </main>
    );
  }

  const curDomain = done ? DOMAINS.length : ALL_CARDS[idx][0];
  const totalDone = counts.reduce((s, v) => s + v, 0);
  const steps: StepItem[] = STEP_NAMES.map((label, i) => {
    if (i >= DOMAINS.length) {
      return { label, sub: "완료 후 열람", state: done ? "current" : "todo" };
    }
    const complete = counts[i] >= DOMAINS[i].count;
    return {
      label,
      sub: complete && (i < curDomain || done) ? "완료" : `${counts[i]}/${DOMAINS[i].count}문항`,
      state: complete && (i < curDomain || done) ? "done" : i === curDomain ? "current" : "todo",
    };
  });

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <main className="container" style={{ flex: 1 }}>
        <div className="precision-layout">
          <div className="desktop-only">
            <StepPanel
              overline="심층 확인"
              title={`${name}님`}
              subtitle={`${TOTAL_Q}문항 중 ${totalDone}문항 완료`}
              steps={steps}
              progress={(totalDone / TOTAL_Q) * 100}
            />
          </div>

          <div>
            {done
              ? <Results name={name} ans={ans} result={result} assessError={assessError} router={router}
                         onRetry={() => {
                           setAns({ sex: profile.gender });
                           setResult(null);
                           setIdx(-1);
                           setStart(0);
                           setResumeFromSimple(false);
                           window.localStorage.removeItem(DRAFT_KEY);
                         }} />
              : (
                <>
                  <div style={{ marginBottom: 22 }}>
                    <DomainProgress segments={DOMAINS.map((d, i) => ({
                      label: d.name, done: counts[i], total: d.count,
                    }))} />
                  </div>
                  <Encouragement step={totalDone} total={TOTAL_Q} />
                  <Question idx={idx} ans={ans} start={start} busy={busy}
                            setAnswer={setAnswer}
                            onPrev={() => setIdx(idx - 1)}
                            onNext={() => (idx === ALL_CARDS.length - 1 ? finish() : setIdx(idx + 1))}
                            onQuit={() => router.push("/me")} />
                </>
              )}
          </div>
        </div>
      </main>
    </div>
  );
}

// ── 문항 카드 ──────────────────────────────────────────────────────
function Question({ idx, ans, start, busy, setAnswer, onPrev, onNext, onQuit }: {
  idx: number;
  ans: Answers;
  start: number;
  busy: boolean;
  setAnswer: (code: string, value: Answers[string]) => void;
  onPrev: () => void;
  onNext: () => void;
  onQuit: () => void;
}) {
  const [di, card] = ALL_CARDS[idx];
  const d = DOMAINS[di];
  const code = card.code;
  const answered = code in ans && ans[code] !== undefined && ans[code] !== "";
  const last = idx === ALL_CARDS.length - 1;

  return (
    <>
      <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: ".4px", color: "var(--medical-blue)", marginBottom: 6 }}>
        {d.name} · {di + 1}/5단계
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.5px", marginBottom: 16 }}>
        {d.lead}
      </div>

      <Card>
        <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.5 }}>
          <span style={{ wordBreak: "keep-all" }}>{card.title}</span>
          {card.section && (
            <span style={{
              fontSize: 12.5, fontWeight: 700, color: "var(--ink-muted)", background: "#f3f5fc",
              borderRadius: 12, padding: "3px 10px", marginLeft: 8, whiteSpace: "nowrap",
            }}>{card.section}</span>
          )}
        </div>
        {card.help && <div style={{ fontSize: 14, color: "var(--ink-muted)", marginTop: 8 }}>{card.help}</div>}
        <div style={{ height: 16 }} />

        {card.type === "choice" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {card.options!.map(([label, value]) => (
              <OptionButton key={String(value)} selected={ans[code] === value}
                            onClick={() => setAnswer(code, value)}>
                {label}
              </OptionButton>
            ))}
          </div>
        )}

        {card.type === "number" && (
          <div style={{ textAlign: "center" }}>
            <input
              type="number" inputMode="numeric" min={card.min} max={card.max}
              value={ans[code] === undefined ? "" : Number(ans[code])}
              placeholder={String(card.default ?? 0)}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "") { setAnswer(code, undefined as unknown as number); return; }
                setAnswer(code, Math.max(card.min ?? 0, Math.min(card.max ?? 999, Number(v))));
              }}
              style={{
                fontSize: 26, fontWeight: 800, textAlign: "center", height: 60, width: 220,
                border: "2px solid var(--line)", borderRadius: 12, fontFamily: "inherit",
              }}
            />
            <div style={{ fontSize: 14, color: "var(--ink-muted)", marginTop: 6 }}>{card.unit}</div>
          </div>
        )}

        {card.type === "multi" && (() => {
          const chosen = new Set((ans[code] as string[] | undefined) ?? []);
          const noneSelected = code in ans && chosen.size === 0;
          return (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {card.multiOptions!.map((dis) => {
                  const sel = chosen.has(dis);
                  return (
                    <OptionButton key={dis} selected={sel} style={{ minHeight: 52, fontSize: 15 }}
                                  onClick={() => {
                                    const next = new Set(chosen);
                                    if (sel) next.delete(dis); else next.add(dis);
                                    setAnswer(code, Array.from(next).sort());
                                  }}>
                      {dis}
                    </OptionButton>
                  );
                })}
              </div>
              <div style={{ marginTop: 10 }}>
                <OptionButton selected={noneSelected} onClick={() => setAnswer(code, [])}>
                  해당 없음 — 진단받은 질환이 없습니다
                </OptionButton>
              </div>
            </>
          );
        })()}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 10, marginTop: 20 }}>
          {idx <= start
            ? <Button variant="ghost" onClick={onQuit}>← 그만두기</Button>
            : <Button variant="ghost" onClick={onPrev}>← 이전</Button>}
          <Button disabled={!answered || busy} onClick={onNext}>
            {busy ? "AI 분석 중..." : last ? "결과 분석하기 →" : "다음 →"}
          </Button>
        </div>
      </Card>

      <div style={{ fontSize: 13.5, color: "#9aa3b2", marginTop: 12 }}>
        응답은 자동 저장됩니다 · 언제든 이어서 진행할 수 있어요
      </div>
    </>
  );
}

// ── 결과 화면 (AI 분석 결과 · 5/5단계) ─────────────────────────────
function Results({ name, ans, result, assessError, onRetry, router }: {
  name: string;
  ans: Answers;
  result: AssessResult | null;
  assessError: string | null;
  onRetry: () => void;
  router: ReturnType<typeof useRouter>;
}) {
  const { total: heur, scores } = computeScores(ans);
  const total = result?.pct_a ?? heur;
  const lv = levelOf(total);
  const color = levelColor(total);
  const worst = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
  const descs = factorDesc(ans, scores);

  return (
    <>
      {/* 히어로: 레이더 + 종합 점수 */}
      <Card style={{ display: "flex", gap: 28, alignItems: "center", flexWrap: "wrap", marginBottom: 16, padding: "22px 26px" }}>
        <Radar scores={scores} />
        <div style={{ flex: 1, minWidth: 280, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: ".4px", color: "var(--medical-blue)" }}>
            AI 분석 결과 · 5/5단계
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 52, fontWeight: 800, lineHeight: 1, color }}>{total}</span>
            <span style={{ fontSize: 16, color: "var(--ink-muted)" }}>점 / 100</span>
            <SignalBadge level={lv} />
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.45, color }}>
            {headline(lv)}
          </div>
          <div style={{ fontSize: 15.5, lineHeight: 1.6, maxWidth: 520 }}>
            {name}님, {summaryLead(lv)} {interpretation(lv, worst)}
          </div>
          <div style={{ fontSize: 12.5, color: "#9aa3b2", lineHeight: 1.6 }}>
            {SCORE_NOTE}<br />
            ※ 본 결과는 참고용 스크리닝이며 의료 진단을 대신하지 않습니다.
          </div>
        </div>
      </Card>

      {/* ML 모델 판정 · 재발 위험 */}
      {result ? (
        <Card style={{ padding: "16px 22px", marginBottom: 16, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: "var(--medical-blue)" }}>AI 모델 판정</span>
          <SignalBadge level={result.label_a === "위험군" ? "danger" : "good"} label={result.label_a} />
          <span style={{ fontSize: 14, color: "var(--ink-muted)" }}>
            낙상 위험 확률 <b style={{ color }}>{result.pct_a}%</b>
            {result.contributors.length > 0 &&
              <> · 주요 요인 {result.contributors.slice(0, 3).map((c) => c.label).join(", ")}</>}
          </span>
          {result.fall_experience && result.pct_b != null ? (
            <span style={{ marginLeft: "auto", fontSize: 14, color: "var(--ink-muted)" }}>
              재발 위험{" "}
              <b style={{ color: result.label_b === "위험군" ? "var(--danger)" : "var(--good)", fontSize: 18 }}>
                {result.pct_b}%
              </b>{" "}({result.label_b})
            </span>
          ) : (
            <span style={{ marginLeft: "auto", fontSize: 13, color: "#9aa3b2" }}>
              낙상 경험 없음 — 재발 위험 미산출
            </span>
          )}
        </Card>
      ) : (
        <Card style={{ padding: "14px 22px", marginBottom: 16 }}>
          <span style={{ fontSize: 13.5, color: "#9aa3b2" }}>
            ※ AI 서버에 연결하지 못해 6요소 평균(예비 산식)으로 계산된 참고 점수입니다.
            {assessError ? ` (${assessError})` : ""}
          </span>
        </Card>
      )}

      {/* 요소별 위험도와 안내 */}
      <Card style={{ padding: "22px 26px", marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 16 }}>요소별 위험도와 안내</div>
        <div style={{
          display: "grid", gridTemplateColumns: "96px 1fr 40px 1.2fr",
          rowGap: 13, columnGap: 12, alignItems: "center", fontSize: 13.5,
        }}>
          {Object.entries(scores).map(([k, v]) => (
            <FactorRow key={k} name={k} value={v} desc={descs[k]} />
          ))}
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr 1.4fr", gap: 10 }}>
        <Button variant="ghost" onClick={onRetry}>다시 확인하기</Button>
        <Button onClick={() => router.push("/me")}>종합 결과 보기 →</Button>
        <Button variant="blue" onClick={() => router.push("/me/report")}>심층 확인 결과지 →</Button>
      </div>
      <div style={{ height: 24 }} />
      <NoticeStrip />
    </>
  );
}

function FactorRow({ name, value, desc }: { name: string; value: number; desc: string }) {
  const c = levelColor(value);
  return (
    <>
      <span style={{ fontWeight: 700 }}>{name}</span>
      <div style={{ height: 12, borderRadius: 6, background: "var(--track)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${value}%`, background: c, borderRadius: 6 }} />
      </div>
      <b style={{ color: c, textAlign: "right" }}>{value}</b>
      <span style={{ color: "var(--ink-muted)" }}>{desc}</span>
    </>
  );
}
