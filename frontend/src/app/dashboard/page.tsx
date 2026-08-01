"use client";

/** 기관·지자체 대시보드 B2G (IA.md 2.8) — 시연용 목업 데이터.
 * 실데이터 연동 지점: ROWS(경사도 분석), MONTHLY(신고 통계), AGE_POP(인구 통계).
 * 팀원 배포용 zip의 gis/*.geojson(행정동 폴리곤)이 향후 연동 자산이다. */
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, KpiCard, NoticeStrip, SignalBadge } from "@/components/ui";
import { AgeBars } from "@/components/charts/AgeBars";
import { TrendLine } from "@/components/charts/TrendLine";
import type { DashRow } from "@/components/DashboardMap";
import { PopulationPanel } from "@/components/PopulationPanel";
import { kakaoRoadviewUrl } from "@/lib/kakao";
import { levelOf } from "@/lib/scoring";
import type { Level } from "@/lib/types";

const DashboardMap = dynamic(() => import("@/components/DashboardMap"), { ssr: false });

// ── 목업 데이터 (원본 views/dashboard.py — 안산시 가정 좌표) ─────────
const ROWS: DashRow[] = [
  { rank: 1, block: "3-2블록", dong: "본오동", score: 78, slopeDeg: 9.2, elderlyPct: 27, action: "안전난간·제설함·조명", budget: 42, lat: 37.2951, lon: 126.8734 },
  { rank: 2, block: "1-5블록", dong: "부곡동", score: 74, slopeDeg: 8.8, elderlyPct: 25, action: "단차 개선·보안등", budget: 35, lat: 37.3273, lon: 126.8622 },
  { rank: 3, block: "2-1블록", dong: "중앙동", score: 71, slopeDeg: 10.1, elderlyPct: 22, action: "안전난간·미끄럼방지", budget: 38, lat: 37.3183, lon: 126.8391 },
  { rank: 4, block: "4-3블록", dong: "본오동", score: 63, slopeDeg: 7.4, elderlyPct: 24, action: "제설함·열선", budget: 27, lat: 37.2899, lon: 126.8801 },
  { rank: 5, block: "2-4블록", dong: "부곡동", score: 59, slopeDeg: 6.9, elderlyPct: 20, action: "보안등 증설", budget: 18, lat: 37.3311, lon: 126.8710 },
  { rank: 6, block: "5-1블록", dong: "중앙동", score: 56, slopeDeg: 6.2, elderlyPct: 19, action: "보행환경 정비", budget: 22, lat: 37.3129, lon: 126.8452 },
  { rank: 7, block: "1-2블록", dong: "사동", score: 52, slopeDeg: 5.8, elderlyPct: 21, action: "미끄럼방지 포장", budget: 16, lat: 37.3062, lon: 126.8570 },
  { rank: 8, block: "3-6블록", dong: "월피동", score: 47, slopeDeg: 5.1, elderlyPct: 18, action: "조명 개선", budget: 12, lat: 37.3346, lon: 126.8493 },
  { rank: 9, block: "6-2블록", dong: "사동", score: 41, slopeDeg: 4.6, elderlyPct: 17, action: "보도 정비", budget: 10, lat: 37.3018, lon: 126.8654 },
  { rank: 10, block: "2-7블록", dong: "월피동", score: 33, slopeDeg: 3.9, elderlyPct: 15, action: "정기 점검", budget: 6, lat: 37.3390, lon: 126.8562 },
];

const MONTHS = ["25.08", "25.09", "25.10", "25.11", "25.12", "26.01",
  "26.02", "26.03", "26.04", "26.05", "26.06", "26.07"];
const MONTHLY = [96, 88, 102, 121, 143, 158, 139, 118, 104, 97, 97, 92];
const AGE_BANDS = ["65–69세", "70–74세", "75–79세", "80–84세", "85세 이상"];
const AGE_POP = [1860, 2540, 3180, 2910, 1990]; // 합 12,480 — 랜딩 KPI 정합

const GRADE_LABEL: Record<Level, string> = { danger: "위험", warn: "주의", good: "양호" };

export default function DashboardPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<"전체" | "위험" | "주의" | "양호">("전체");
  const [picked, setPicked] = useState<Set<string>>(new Set(ROWS.slice(0, 3).map((r) => r.block)));
  // Leaflet은 브라우저 전용 — hydration 완료 후에만 마운트 (SSR HTML 불일치 방지)
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const view = filter === "전체" ? ROWS : ROWS.filter((r) => GRADE_LABEL[levelOf(r.score)] === filter);
  const pickedRows = ROWS.filter((r) => picked.has(r.block));
  const budget = pickedRows.reduce((s, r) => s + r.budget, 0);
  const popCover = pickedRows.length
    ? (pickedRows.reduce((s, r) => s + r.elderlyPct, 0) / pickedRows.length).toFixed(1)
    : "0";

  return (
    <main className="container">
      {/* 관공서 네이비 헤더 */}
      <div style={{
        background: "var(--gov-navy)", color: "#fff", padding: "14px 22px", borderRadius: 10,
        display: "flex", alignItems: "center", gap: 14, marginBottom: 18, flexWrap: "wrap",
      }}>
        <span style={{
          width: 30, height: 30, border: "1.5px solid rgba(255,255,255,.5)", borderRadius: 6,
          display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800,
        }}>政</span>
        <div style={{ fontSize: 15, fontWeight: 700 }}>
          ○○시 보건소
          <span style={{ opacity: 0.6, fontWeight: 500, marginLeft: 8, fontSize: 13 }}>
            지역 낙상위험 통합관리 시스템
          </span>
        </div>
        <span style={{ marginLeft: "auto", fontSize: 12.5, opacity: 0.6 }}>
          시연용 목업 데이터
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>구간별 낙상위험 현황</div>
          <div style={{ fontSize: 13.5, color: "var(--ink-muted)", marginTop: 3 }}>
            지역 고령특성 × 경사도 분석 결합 · 신호등 등급으로 표시
          </div>
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}
                style={{
                  minHeight: 46, border: "1.5px solid var(--line)", borderRadius: 12,
                  padding: "0 14px", fontFamily: "inherit", fontSize: 15, fontWeight: 700,
                  background: "#fff",
                }}>
          {["전체", "위험", "주의", "양호"].map((g) => <option key={g}>{g}</option>)}
        </select>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
        <KpiCard value="247" label="분석 구간" />
        <KpiCard value="31" label="위험 구간 (주의 요망)" tone="danger" />
        <KpiCard value="₩ 2.4억" label="권고 예산" tone="blue" />
        <KpiCard value="-38%" label="예상 위험 저감" tone="good" />
      </div>

      {/* 위험 지도 + 상위 구간 표 */}
      <div className="dash-grid" style={{ marginTop: 18 }}>
        <Card style={{ padding: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 800, margin: "4px 4px 10px" }}>
            위험 구간 지도 <span style={{ fontWeight: 500, color: "var(--ink-muted)" }}>(경사도 히트맵 연동)</span>
          </div>
          {mounted ? <DashboardMap rows={view} /> : <div style={{ height: 420, borderRadius: 14, background: "var(--track)" }} />}
          <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
            {(["danger", "warn", "good"] as Level[]).map((g) => (
              <span key={g} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: "var(--ink-muted)" }}>
                <span style={{
                  width: 10, height: 10, borderRadius: "50%",
                  background: `var(--${g})`,
                }} />
                {GRADE_LABEL[g]} ({g === "danger" ? "67점 이상" : g === "warn" ? "34–66점" : "33점 이하"})
              </span>
            ))}
            <span style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>· 원 크기 = 위험점수 · 시연용 목업 좌표</span>
          </div>
        </Card>

        <Card style={{ padding: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>위험 상위 구간 (위험도순)</div>
          <div style={{ maxHeight: 430, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
              <thead>
                <tr style={{ color: "var(--ink-muted)", textAlign: "left" }}>
                  {["순위", "구간", "행정동", "위험점수", "경사(°)", "65세↑", "권고 보강", "현장"].map((h) => (
                    <th key={h} style={{ padding: "6px 8px", borderBottom: "1px solid var(--line)", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {view.map((r) => (
                  <tr key={r.block} style={{ borderBottom: "1px solid var(--track)" }}>
                    <td style={{ padding: "7px 8px" }}>{r.rank}</td>
                    <td style={{ padding: "7px 8px", fontWeight: 700 }}>{r.block}</td>
                    <td style={{ padding: "7px 8px" }}>{r.dong}</td>
                    <td style={{ padding: "7px 8px", fontWeight: 800, color: `var(--${levelOf(r.score)})` }}>{r.score}</td>
                    <td style={{ padding: "7px 8px" }}>{r.slopeDeg.toFixed(1)}</td>
                    <td style={{ padding: "7px 8px" }}>{r.elderlyPct}%</td>
                    <td style={{ padding: "7px 8px", fontSize: 12.5, color: "var(--ink-muted)" }}>{r.action}</td>
                    <td style={{ padding: "7px 8px", whiteSpace: "nowrap" }}>
                      <a href={kakaoRoadviewUrl(r.lat, r.lon)} target="_blank" rel="noopener noreferrer"
                         style={{ fontSize: 12.5, fontWeight: 700, color: "var(--medical-blue)", textDecoration: "underline" }}>
                        로드뷰 ↗
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* 인구 · 유동인구 분석 (SGIS + 서울 생활인구) */}
      <div style={{ marginTop: 18 }}>
        <PopulationPanel />
      </div>

      {/* 추이 차트 */}
      <div className="dash-grid-2" style={{ marginTop: 18 }}>
        <Card style={{ padding: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>월별 낙상 신고 추이 (최근 12개월)</div>
          <TrendLine labels={MONTHS} values={MONTHLY} unit="건" ariaLabel="월별 낙상 신고 추이" />
          <div style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>
            겨울철(25.11–26.01) 결빙기 신고가 연중 최고 — 제설함·열선 보강 근거
          </div>
        </Card>
        <Card style={{ padding: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>연령대별 고위험 추정 인구</div>
          <AgeBars labels={AGE_BANDS} values={AGE_POP} />
          <div style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>
            75–84세 구간이 고위험 인구의 49% — 방문 점검 우선 연령대
          </div>
        </Card>
      </div>

      {/* 등급 분포 + 정책 의사결정 */}
      <div className="dash-grid" style={{ marginTop: 18, gridTemplateColumns: "1fr 1.6fr" }}>
        <Card style={{ padding: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 12 }}>등급 분포</div>
          {([["danger", 31], ["warn", 64], ["good", 152]] as [Level, number][]).map(([g, n]) => (
            <div key={g} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <SignalBadge level={g} /> <span style={{ fontSize: 14, fontWeight: 700 }}>{n}구간</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${(n / 247) * 100}%`, background: `var(--${g})` }} />
              </div>
            </div>
          ))}
        </Card>

        <Card style={{ padding: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>정책 의사결정</div>
          <div style={{ fontSize: 13, color: "var(--ink-muted)", marginBottom: 12 }}>
            사업 등록할 구간을 고르면 예산이 합산됩니다
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
            {ROWS.map((r) => {
              const sel = picked.has(r.block);
              return (
                <button key={r.block}
                        onClick={() => {
                          const next = new Set(picked);
                          if (sel) next.delete(r.block); else next.add(r.block);
                          setPicked(next);
                        }}
                        style={{
                          minHeight: 42, padding: "0 14px", borderRadius: 21, cursor: "pointer",
                          fontFamily: "inherit", fontSize: 13.5, fontWeight: 700,
                          border: sel ? "2px solid var(--gov-navy)" : "1.5px solid var(--line)",
                          background: sel ? "#f3f5fc" : "#fff",
                          color: sel ? "var(--gov-navy)" : "var(--ink-muted)",
                        }}>
                  {sel ? "✓ " : ""}{r.dong} {r.block}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
            <KpiCard value={`${pickedRows.length}곳`} label="선택 구간" />
            <KpiCard value={`${budget.toLocaleString()}백만원`} label="소요 예산" tone="blue" />
            <KpiCard value={`${popCover}%`} label="평균 고령비율" tone="warn" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2.2fr", gap: 10 }}>
            <Button variant="ghost" onClick={() => router.push("/")}>← 처음 화면으로</Button>
            <Button onClick={() => alert(`${pickedRows.length}개 구간이 사업 목록에 등록되었습니다. (시연)`)}>
              선택 {pickedRows.length}개 구간 사업 일괄 등록
            </Button>
          </div>
        </Card>
      </div>

      <div style={{ height: 20 }} />
      <NoticeStrip />
    </main>
  );
}
