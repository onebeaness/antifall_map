"use client";

/** 심층 확인 결과지 (IA.md 2.6) — 정밀 완료 시에만 접근. */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, NoticeStrip, Radar, SignalBadge } from "@/components/ui";
import {
  SCORE_NOTE, computeScores, factorDesc, headline, interpretation, levelColor, levelOf, summaryLead,
} from "@/lib/scoring";
import { storage } from "@/lib/storage";
import type { AssessmentRecord, Profile } from "@/lib/types";

export default function ReportPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [precision, setPrecision] = useState<AssessmentRecord | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const p = await storage.getProfile();
      if (!p) { router.replace("/register"); return; }
      setProfile(p);
      setPrecision(await storage.getPrecision());
      setLoaded(true);
    })();
  }, [router]);

  if (!loaded || !profile) return null;

  // 미완료 시 허브로 유도
  if (!precision) {
    return (
      <main className="container" style={{ display: "flex", justifyContent: "center", paddingTop: 80 }}>
        <Card variant="question" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 10 }}>
            심층 확인을 먼저 완료해 주세요
          </div>
          <p style={{ fontSize: 15, color: "var(--ink-muted)", margin: "0 0 18px" }}>
            보고서는 심층 확인(42문항)을 마친 뒤에 열람할 수 있습니다.
          </p>
          <Button fullWidth onClick={() => router.push("/me")}>← 종합 확인으로</Button>
        </Card>
      </main>
    );
  }

  const ans = precision.answers;
  const { total: heur, scores } = computeScores(ans);
  const total = precision.result?.pct_a ?? heur;
  const lv = levelOf(total);
  const color = levelColor(total);
  const worst = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
  const descs = factorDesc(ans, scores);
  const savedDate = new Date(precision.savedAt).toLocaleDateString("ko-KR");

  return (
    <main className="container">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.3px" }}>
          심층 확인 결과지 · {profile.name}님
          <span style={{ fontSize: 13.5, fontWeight: 500, color: "var(--ink-muted)", marginLeft: 10 }}>
            {savedDate} 확인
          </span>
        </div>
        <Button variant="ghost" onClick={() => router.push("/me")} style={{ minHeight: 44, fontSize: 14 }}>
          ← 종합 확인
        </Button>
      </div>

      <div style={{ height: 14 }} />

      {/* 히어로: 레이더 + 종합 점수 + 해석 */}
      <Card style={{ borderRadius: 18, padding: "28px 32px", display: "flex", gap: 36, alignItems: "center", flexWrap: "wrap" }}>
        <Radar scores={scores} size={240} />
        <div style={{ flex: 1, minWidth: 300, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: ".4px", color: "var(--medical-blue)" }}>
            AI 분석 결과 · 5/5단계
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 54, fontWeight: 800, lineHeight: 1, color }}>{total}</span>
            <span style={{ fontSize: 16, color: "var(--ink-muted)" }}>점 / 100</span>
            <SignalBadge level={lv} />
          </div>
          {precision.result && (
            <div style={{ fontSize: 14, color: "var(--ink-muted)" }}>
              AI 판정 <b style={{ color: precision.result.label_a === "위험군" ? "var(--danger)" : "var(--good)" }}>
                {precision.result.label_a}
              </b>
              {precision.result.fall_experience && precision.result.pct_b != null && (
                <> · 재발 위험 <b style={{ color: precision.result.label_b === "위험군" ? "var(--danger)" : "var(--good)" }}>
                  {precision.result.pct_b}%
                </b> ({precision.result.label_b})</>
              )}
            </div>
          )}
          <div style={{ fontSize: 19, fontWeight: 800, lineHeight: 1.45 }}>
            {headline(lv)}
          </div>
          <div style={{ fontSize: 15.5, lineHeight: 1.65, maxWidth: 560 }}>
            {profile.name}님, {summaryLead(lv)} {interpretation(lv, worst)}
          </div>
          <div style={{ fontSize: 12.5, color: "#9aa3b2", lineHeight: 1.6 }}>
            {SCORE_NOTE}<br />
            ※ 본 결과는 참고용 스크리닝이며 의료 진단을 대신하지 않습니다.
          </div>
        </div>
      </Card>

      <div style={{ height: 16 }} />

      {/* 요소별 위험도와 안내 */}
      <Card style={{ borderRadius: 18, padding: "24px 30px" }}>
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 18 }}>요소별 위험도와 안내</div>
        <div style={{
          display: "grid", gridTemplateColumns: "110px 1fr 44px 1.4fr",
          rowGap: 14, columnGap: 14, alignItems: "center", fontSize: 14,
        }}>
          {Object.entries(scores).map(([k, v]) => {
            const c = levelColor(v);
            return (
              <span key={k} style={{ display: "contents" }}>
                <span style={{ fontWeight: 700 }}>{k}</span>
                <div style={{ height: 12, borderRadius: 6, background: "var(--track)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${v}%`, background: c, borderRadius: 6 }} />
                </div>
                <b style={{ color: c, textAlign: "right" }}>{v}</b>
                <span style={{ color: "var(--ink-muted)" }}>{descs[k]}</span>
              </span>
            );
          })}
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr 1.4fr", gap: 10, marginTop: 16 }}>
        <Button variant="ghost" onClick={() => router.push("/me")}>종합 확인으로</Button>
        <Button onClick={() => window.print()}>보고서 인쇄 · PDF 저장</Button>
        <Button variant="blue" onClick={() => router.push("/me/route")}>경사도 안전 경로 →</Button>
      </div>

      <div style={{ height: 24 }} />
      <NoticeStrip />
    </main>
  );
}
