"use client";

/** 간편 확인 6문항 (IA.md 2.4, 정본: 낙상 자가진단 설문앱.dc.html).
 * 한 문항 집중형 — 진행바 + 문항 카드 + 이전/다음. 결과는 ML 간략 모델 A(+B).
 * 응답은 로컬에 자동 저장되어 이어서 진행할 수 있다. */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Gauge, HeaderBar, NoticeStrip, OptionButton, SignalBadge } from "@/components/ui";
import { assessSimple } from "@/lib/api";
import { SIMPLE_QUESTIONS } from "@/lib/questions";
import { levelColor, levelOf, simpleFactors, simpleHeuristic, simpleMessage } from "@/lib/scoring";
import { storage } from "@/lib/storage";
import type { Answers, AssessResult, Profile } from "@/lib/types";

const TOTAL = SIMPLE_QUESTIONS.length;
const DRAFT_KEY = "ansim.draft.simple";

export default function SimpleTestPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [step, setStep] = useState(1); // 1..6=문항, 7=결과
  const [ans, setAns] = useState<Answers>({});
  const [result, setResult] = useState<AssessResult | null>(null);
  const [assessError, setAssessError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const p = await storage.getProfile();
      if (!p) { router.replace("/register"); return; }
      setProfile(p);
      // 진행 중 응답 복원 (없으면 성별만 프로필에서 프리필)
      try {
        const draft = JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? "null");
        if (draft?.ans) { setAns(draft.ans); setStep(Math.min(draft.step ?? 1, TOTAL)); }
        else setAns({ sex: p.gender });
      } catch { setAns({ sex: p.gender }); }
      setLoaded(true);
    })();
  }, [router]);

  const saveDraft = useCallback((a: Answers, s: number) => {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ ans: a, step: s }));
  }, []);

  const setAnswer = (code: string, value: Answers[string]) => {
    const next = { ...ans, [code]: value };
    setAns(next);
    saveDraft(next, step);
  };

  const finish = async () => {
    if (!profile) return;
    setBusy(true);
    setAssessError(null);
    let res: AssessResult | null = null;
    try {
      res = await assessSimple(ans, profile.fallExperience);
    } catch (e) {
      res = null; // ML 미연결 → 휴리스틱 폴백 표시
      setAssessError(e instanceof Error ? e.message : String(e));
    }
    setResult(res);
    await storage.saveSimple({ answers: ans, result: res, savedAt: new Date().toISOString() });
    window.localStorage.removeItem(DRAFT_KEY);
    setBusy(false);
    setStep(TOTAL + 1);
  };

  const retry = () => {
    setAns({ sex: profile?.gender ?? "" });
    setResult(null);
    setStep(1);
    window.localStorage.removeItem(DRAFT_KEY);
  };

  if (!loaded || !profile) return null;

  // ── 결과 화면 ──
  if (step > TOTAL) {
    const [hA, hB] = simpleHeuristic(ans);
    const A = result?.pct_a ?? hA;
    const B = profile.fallExperience && result?.pct_b != null ? result.pct_b : hB;
    const lv = levelOf(A);
    const factors = simpleFactors(ans);
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        <HeaderBar title="간편 확인" right={`${TOTAL} / ${TOTAL} 문항`} />
        <main className="container" style={{ flex: 1 }}>
          <div style={{ height: 20 }} />
          <Card variant="question" style={{ textAlign: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: ".4px", color: "var(--medical-blue)", marginBottom: 18 }}>
              확인 결과 · 낙상 위험
            </div>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <Gauge score={A} />
            </div>
            <div style={{ margin: "14px 0 6px" }}><SignalBadge level={lv} /></div>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14,
              color: "var(--ink-muted)", marginTop: 4,
            }}>
              재발 위험 <b style={{ color: levelColor(B) }}>{B}점</b> <SignalBadge level={levelOf(B)} />
            </div>
            <div style={{ fontSize: 15.5, lineHeight: 1.65, marginTop: 18, textAlign: "left" }}>
              {simpleMessage(lv)}
            </div>
            {result && (
              <div style={{ fontSize: 13, color: "var(--ink-muted)", marginTop: 10, textAlign: "left" }}>
                AI 판정: <b style={{ color: result.label_a === "위험군" ? "var(--danger)" : "var(--good)" }}>{result.label_a}</b>
                {" "}(낙상 위험 확률 {result.pct_a}%)
              </div>
            )}
            {!result && (
              <div style={{ fontSize: 13, color: "#9aa3b2", marginTop: 10, textAlign: "left" }}>
                ※ AI 서버에 연결하지 못해 예비 산식으로 계산된 참고 점수입니다.
                {assessError ? ` (${assessError})` : ""}
              </div>
            )}
            {factors.length > 0 && (
              <div style={{ borderTop: "1px solid var(--line)", marginTop: 24, paddingTop: 18, textAlign: "left" }}>
                <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>주요 위험요인</div>
                {factors.map((f) => (
                  <div key={f.text} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 15, padding: "7px 0" }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: levelColor(f.tone), flex: "none" }} />
                    {f.text}
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.8fr", gap: 10, marginTop: 22 }}>
              <Button variant="ghost" onClick={retry}>다시 확인하기</Button>
              <Button onClick={() => router.push("/me")}>종합 결과 보기 →</Button>
            </div>
          </Card>
          <div style={{ textAlign: "center", fontSize: 13.5, color: "#9aa3b2", marginTop: 16 }}>
            ※ 본 결과는 참고용 스크리닝이며 의료 진단을 대신하지 않습니다.
          </div>
        </main>
        <NoticeStrip />
      </div>
    );
  }

  // ── 문항 화면 ──
  const q = SIMPLE_QUESTIONS[step - 1];
  const answered = q.code in ans && ans[q.code] !== undefined && ans[q.code] !== "";
  const last = step === TOTAL;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <HeaderBar title="간편 확인" right={`${step} / ${TOTAL} 문항`} />
      <main className="container" style={{ flex: 1 }}>
        <div className="progress-track" style={{ margin: "18px 0 26px" }}>
          <div className="progress-fill" style={{ width: `${((step - 1) / TOTAL) * 100}%` }} />
        </div>

        <Card variant="question">
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: ".4px", color: "var(--medical-blue)" }}>
            {q.simpleSection} · 문항 {step}
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.4, letterSpacing: "-0.5px", margin: "10px 0 6px", whiteSpace: "pre-line" }}>
            {q.title}
          </div>
          {q.help && <div style={{ fontSize: 14.5, color: "var(--ink-muted)", marginTop: 10 }}>{q.help}</div>}
          <div style={{ height: 20 }} />

          {q.type === "choice" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {q.options!.map(([label, value]) => (
                <OptionButton key={String(value)} selected={ans[q.code] === value}
                              onClick={() => setAnswer(q.code, value)}>
                  {label}
                </OptionButton>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: "center" }}>
              <input
                type="number" inputMode="numeric" min={q.min} max={q.max}
                value={ans[q.code] === undefined ? "" : Number(ans[q.code])}
                placeholder={String(q.default ?? 0)}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "") { setAnswer(q.code, undefined as unknown as number); return; }
                  setAnswer(q.code, Math.max(q.min ?? 0, Math.min(q.max ?? 999, Number(v))));
                }}
                style={{
                  fontSize: 26, fontWeight: 800, textAlign: "center", height: 60, width: 220,
                  border: "2px solid var(--line)", borderRadius: 12, fontFamily: "inherit",
                }}
              />
              <div style={{ fontSize: 14, color: "var(--ink-muted)", marginTop: 6 }}>{q.unit}</div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.8fr", gap: 10, marginTop: 24 }}>
            {step === 1 ? (
              <Button variant="ghost" onClick={() => router.push("/me")}>← 그만두기</Button>
            ) : (
              <Button variant="ghost" onClick={() => { setStep(step - 1); saveDraft(ans, step - 1); }}>이전</Button>
            )}
            <Button disabled={!answered || busy}
                    onClick={() => {
                      if (last) { finish(); }
                      else { setStep(step + 1); saveDraft(ans, step + 1); }
                    }}>
              {busy ? "분석 중..." : last ? "결과 보기" : "다음"}
            </Button>
          </div>
        </Card>

        <div style={{ textAlign: "center", fontSize: 13.5, color: "#9aa3b2", marginTop: 14 }}>
          응답은 자동 저장됩니다 · 언제든 이어서 진행할 수 있어요
        </div>
      </main>
    </div>
  );
}
