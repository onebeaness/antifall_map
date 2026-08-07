"use client";

/** 개인 종합 확인 허브 (IA.md 2.3, 정본: 종합 확인 화면.dc.html).
 * 간단·정밀 결과 카드 + 다음 행동. 정밀 완료 시 두 카드 모두 활성(정밀이 간단 포함). */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Gauge, NoticeStrip, Radar, SignalBadge } from "@/components/ui";
import {
  computeScores, levelColor, levelOf, simpleFactors, simpleHeuristic,
} from "@/lib/scoring";
import { storage } from "@/lib/storage";
import type { AssessmentRecord, Profile } from "@/lib/types";

function CardHead({ overline, title, done }: { overline: string; title: string; done: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: ".4px", color: "var(--medical-blue)" }}>{overline}</div>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.3px", marginTop: 4 }}>{title}</div>
      </div>
      {done && <SignalBadge level="good" label="완료" />}
    </div>
  );
}

/** 간단 결과: ML 결과 우선, 미연결 저장분은 휴리스틱 (원본 compute() 동작) */
function simpleAB(rec: AssessmentRecord, fallExperience: boolean): [number, number] {
  const [hA, hB] = simpleHeuristic(rec.answers);
  const A = rec.result?.pct_a ?? hA;
  const B = fallExperience && rec.result?.pct_b != null ? rec.result.pct_b : hB;
  return [A, B];
}

export default function HubPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [simple, setSimple] = useState<AssessmentRecord | null>(null);
  const [precision, setPrecision] = useState<AssessmentRecord | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const p = await storage.getProfile();
      if (!p) { router.replace("/register"); return; }
      setProfile(p);
      setSimple(await storage.getSimple());
      setPrecision(await storage.getPrecision());
      setLoaded(true);
    })();
  }, [router]);

  if (!loaded || !profile) return null;

  // 정밀은 간단을 포함 — 정밀 완료 시 간단 카드도 활성 (첫 6문항 코드 동일)
  const simpleRec = simple ?? precision;
  const simpleActive = simpleRec != null;
  const precisionActive = precision != null;

  const resetAll = async () => {
    await storage.clearAssessments();
    setSimple(null);
    setPrecision(null);
  };

  return (
    <main className="container">
      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 9, background: "var(--gov-navy)", color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 800,
          }}>낙</div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.3px" }}>
              {profile.name}님의 낙상 위험 종합 확인
            </div>
            <div style={{ fontSize: 13.5, color: "var(--ink-muted)", marginTop: 2 }}>
              간편 확인과 심층 확인 결과를 한곳에서 확인합니다
            </div>
          </div>
        </div>
        {simpleActive && (
          <Button variant="ghost" onClick={resetAll} style={{ minHeight: 44, fontSize: 14 }}>
            기록 지우기
          </Button>
        )}
      </div>

      {/* 안내 카드 */}
      <Card style={{ marginTop: 20, display: "flex", gap: 20, alignItems: "flex-start" }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12, background: "rgba(11,83,148,.08)", color: "var(--medical-blue)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 800, flex: "none",
        }}>i</div>
        <div>
          <div style={{ fontSize: 16.5, fontWeight: 800, marginBottom: 8 }}>
            두 가지를 함께 하실수록 정확해집니다
          </div>
          <div style={{ fontSize: 15, lineHeight: 1.7, color: "var(--ink-muted)" }}>
            <b style={{ color: "var(--ink)" }}>간편 확인</b>은 6개 질문으로 1분 만에 낙상 위험도를 알려드립니다.{" "}
            <b style={{ color: "var(--ink)" }}>심층 확인</b>은 신체 기능·질환·영양·마음 상태까지 6개 요소를
            종합 분석합니다. 두 가지는 서로를 대체하지 않으며,{" "}
            <b style={{ color: "var(--ink)" }}>간편 확인을 먼저 마치면 심층 확인은 36문항만</b> 응답하면 됩니다.
          </div>
        </div>
      </Card>

      {/* 결과 카드 2개 */}
      <div className="hub-grid" style={{ marginTop: 20 }}>
        {/* 간편 확인 카드 */}
        <Card style={{ padding: 26 }}>
          {simpleActive && simpleRec ? (() => {
            const [A, B] = simpleAB(simpleRec, profile.fallExperience);
            const factors = simpleFactors(simpleRec.answers);
            return (
              <>
                <CardHead overline="간편 스크리닝 · 6문항" title="간편 확인" done />
                <div style={{ height: 16 }} />
                <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
                  <Gauge score={A} size={132} caption="/ 100" />
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
                    <div><SignalBadge level={levelOf(A)} /></div>
                    <div style={{ fontSize: 14, color: "var(--ink-muted)" }}>
                      재발 위험 <b style={{ color: levelColor(B), fontSize: 16 }}>{B}</b> / 100
                    </div>
                  </div>
                </div>
                {factors.length > 0 && (
                  <div style={{ background: "var(--bg-slate)", borderRadius: 14, padding: "16px 18px", marginTop: 16 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 10 }}>주요 위험요인</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                      {factors.map((f) => (
                        <div key={f.text} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14.5 }}>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", flex: "none", background: levelColor(f.tone) }} />
                          {f.text}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div style={{ height: 16 }} />
                <Button variant="ghost" fullWidth onClick={() => router.push("/me/simple")}>
                  간편 확인 다시 하기
                </Button>
              </>
            );
          })() : (
            <>
              <CardHead overline="간편 스크리닝 · 6문항" title="간편 확인" done={false} />
              <div style={{ height: 16 }} />
              <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
                <div className="shimmer" style={{
                  width: 132, height: 132, borderRadius: "50%", border: "15px solid var(--track)", flex: "none",
                }} />
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
                  <div className="shimmer" style={{ height: 34, width: 120, borderRadius: 22, background: "var(--track)" }} />
                  <div className="shimmer" style={{ height: 16, width: 150, borderRadius: 6, background: "var(--track)" }} />
                </div>
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.6, color: "var(--ink-muted)", margin: "16px 0" }}>
                아직 아직 확인하지 않았습니다. 6개의 간단한 질문으로 지금 바로 위험도를 확인해 보세요.
              </div>
              <Button fullWidth onClick={() => router.push("/me/simple")}>간편 확인 시작하기 →</Button>
            </>
          )}
        </Card>

        {/* 심층 확인 카드 */}
        <Card style={{ padding: 26 }}>
          {precisionActive && precision ? (() => {
            const { total: heur, scores } = computeScores(precision.answers);
            const total = precision.result?.pct_a ?? heur;
            return (
              <>
                <CardHead overline="정밀 분석 · 6요소" title="심층 확인" done />
                <div style={{ height: 16 }} />
                <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
                  <Radar scores={scores} size={124} />
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                      <span style={{ fontSize: 44, fontWeight: 800, lineHeight: 1, color: levelColor(total) }}>{total}</span>
                      <span style={{ fontSize: 14, color: "var(--ink-muted)" }}>점 / 100</span>
                    </div>
                    <div><SignalBadge level={levelOf(total)} /></div>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
                  {Object.entries(scores).map(([k, v]) => (
                    <div key={k} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ width: 84, fontSize: 13, fontWeight: 700, flex: "none" }}>{k}</span>
                      <div style={{ flex: 1, height: 10, borderRadius: 5, background: "var(--track)", overflow: "hidden" }}>
                        <div style={{ height: "100%", borderRadius: 5, width: `${v}%`, background: levelColor(v) }} />
                      </div>
                      <span style={{ width: 26, textAlign: "right", fontSize: 13, fontWeight: 800, color: levelColor(v) }}>{v}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10, marginTop: 16 }}>
                  <Button variant="ghost" onClick={() => router.push("/me/precision")}>다시 하기</Button>
                  <Button onClick={() => router.push("/me/report")}>심층 확인 결과지 조회하기 →</Button>
                </div>
              </>
            );
          })() : (
            <>
              <CardHead overline="정밀 분석 · 6요소" title="심층 확인" done={false} />
              <div style={{ height: 16 }} />
              <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
                <svg width="128" height="128" viewBox="0 0 128 128" className="shimmer" style={{ flex: "none" }}>
                  <polygon points="64,14 107,39 107,89 64,114 21,89 21,39" fill="#f1f4f9" stroke="#e2e8f2" strokeWidth="1.5" />
                  <polygon points="64,39 85.5,51.5 85.5,76.5 64,89 42.5,76.5 42.5,51.5" fill="none" stroke="#e2e8f2" strokeWidth="1.5" />
                </svg>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 11 }}>
                  <div style={{ height: 30, width: 110, borderRadius: 8, background: "var(--track)" }} />
                  <div style={{ height: 26, width: 90, borderRadius: 20, background: "var(--track)" }} />
                </div>
              </div>
              <div style={{ height: 14 }} />
              {simpleActive ? (
                <div style={{
                  background: "rgba(11,83,148,.06)", border: "1px solid rgba(11,83,148,.22)",
                  borderRadius: 12, padding: "13px 15px", display: "flex", gap: 11, alignItems: "center",
                }}>
                  <span style={{
                    width: 26, height: 26, borderRadius: "50%", background: "var(--good)", color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, flex: "none",
                  }}>✓</span>
                  <div style={{ fontSize: 14, lineHeight: 1.5 }}>
                    간편 확인을 마치셨어요 — 심층 확인은 <b>남은 36문항</b>만 응답하면 됩니다.
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 14, lineHeight: 1.6, color: "var(--ink-muted)" }}>
                  신체 기능·질환·영양·마음 상태까지 6개 요소를 종합 분석합니다. 약 10분이 걸립니다.
                </div>
              )}
              <div style={{ height: 12 }} />
              <Button fullWidth onClick={() => router.push("/me/precision")}>
                {simpleActive ? "심층 확인 이어서 (36문항) →" : "심층 확인 시작하기 →"}
              </Button>
            </>
          )}
        </Card>
      </div>

      {/* 경사도 지도 배너 */}
      <div style={{ display: "grid", gridTemplateColumns: "2.4fr 1fr", gap: 14, marginTop: 16, alignItems: "center" }}>
        <Card style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{
            width: 36, height: 36, borderRadius: 10, background: "rgba(11,83,148,.08)", color: "var(--medical-blue)",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 800, flex: "none",
          }}>↗</span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800 }}>우리 동네 경사도 안전 경로</div>
            <div style={{ fontSize: 13, color: "var(--ink-muted)", marginTop: 2 }}>
              출발·도착지를 검색하면 경로 경사와 날씨 기반 보행 위험을 지도로 안내합니다.
            </div>
          </div>
        </Card>
        <Button variant="blue" onClick={() => router.push("/me/route")}>경사도 지도 열기 →</Button>
      </div>

      <div style={{ height: 24 }} />
      <NoticeStrip />
    </main>
  );
}
