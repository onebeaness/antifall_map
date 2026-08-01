"use client";

/** 기관·지자체 대시보드 B2G (IA.md 2.8).
 *
 * 지도·위험 순위·등급 분포는 팀 분석 산출물(서울 427개 행정동 보행환경 위험도,
 * public/geo/seoul_dong_risk.geojson)의 실데이터.
 * 동 클릭 → 인구지표(SGIS)·생활인구(서울)·보안등 밀도(공공데이터포털) 연계 조회.
 * 월별 신고 추이·연령 인구·정책 예산은 아직 시연용 목업(라벨 표기).
 */
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, KpiCard, NoticeStrip, SignalBadge } from "@/components/ui";
import { AgeBars } from "@/components/charts/AgeBars";
import { TrendLine } from "@/components/charts/TrendLine";
import { PopulationPanel, type SelectedDong } from "@/components/PopulationPanel";
import { getLightsNear } from "@/lib/api";
import { riskColor, riskLevel } from "@/lib/dongRisk";
import { kakaoRoadviewUrl } from "@/lib/kakao";
import type { DongRiskProps, Level, LightsResult } from "@/lib/types";

const ChoroplethMap = dynamic(() => import("@/components/ChoroplethMap"), { ssr: false });

// ── 시연용 목업 (실데이터 연동 전 구간) ──────────────────────────────
const MONTHS = ["25.08", "25.09", "25.10", "25.11", "25.12", "26.01",
  "26.02", "26.03", "26.04", "26.05", "26.06", "26.07"];
const MONTHLY = [96, 88, 102, 121, 143, 158, 139, 118, 104, 97, 97, 92];
const AGE_BANDS = ["65–69세", "70–74세", "75–79세", "80–84세", "85세 이상"];
const AGE_POP = [1860, 2540, 3180, 2910, 1990];

const GRADE_LABEL: Record<Level, string> = { danger: "위험", warn: "주의", good: "양호" };

export default function DashboardPage() {
  const router = useRouter();
  const [geojson, setGeojson] = useState<GeoJSON.FeatureCollection | null>(null);
  const [filter, setFilter] = useState<"전체" | "위험" | "주의" | "양호">("전체");
  const [selectedDong, setSelectedDong] = useState<DongRiskProps | null>(null);
  const [panelSel, setPanelSel] = useState<SelectedDong | null>(null);
  const [lights, setLights] = useState<LightsResult | null>(null);
  const [lightsMsg, setLightsMsg] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    fetch("/geo/seoul_dong_risk.geojson")
      .then((r) => r.json())
      .then((gj: GeoJSON.FeatureCollection) => {
        setGeojson(gj);
        const top = (gj.features.map((f) => f.properties) as DongRiskProps[])
          .filter((p) => p.risk != null)
          .sort((a, b) => (b.risk ?? 0) - (a.risk ?? 0))
          .slice(0, 3)
          .map((p) => p.name);
        setPicked(new Set(top));
      })
      .catch(() => setGeojson(null));
  }, []);

  const dongs = useMemo(() =>
    ((geojson?.features.map((f) => f.properties) ?? []) as DongRiskProps[])
      .filter((p) => p.risk != null)
      .sort((a, b) => (b.risk ?? 0) - (a.risk ?? 0)),
    [geojson]);

  const counts = useMemo(() => ({
    danger: dongs.filter((p) => riskLevel(p.risk) === "danger").length,
    warn: dongs.filter((p) => riskLevel(p.risk) === "warn").length,
    good: dongs.filter((p) => riskLevel(p.risk) === "good").length,
  }), [dongs]);

  const topRows = useMemo(() => {
    const rows = dongs.slice(0, 30);
    if (filter === "전체") return rows.slice(0, 12);
    return dongs.filter((p) => GRADE_LABEL[riskLevel(p.risk)] === filter).slice(0, 12);
  }, [dongs, filter]);

  /** 정책 시연용: 상위 10개 동 + 위험도 비례 가상 예산(백만) */
  const policyRows = useMemo(() =>
    dongs.slice(0, 10).map((p) => ({ ...p, budget: Math.round((p.risk ?? 0) * 0.8 + 8) })),
    [dongs]);
  const pickedRows = policyRows.filter((p) => picked.has(p.name));
  const budget = pickedRows.reduce((s, r) => s + r.budget, 0);
  const avgRisk = pickedRows.length
    ? Math.round(pickedRows.reduce((s, r) => s + (r.risk ?? 0), 0) / pickedRows.length)
    : 0;

  const onSelectDong = async (p: DongRiskProps) => {
    setSelectedDong(p);
    // SGIS는 7자리(통계청), 생활인구는 행자부 10자리의 앞 8자리
    setPanelSel({ name: p.name, sgisCd: p.adm_cd.slice(0, 7), floatCd: p.adm_cd2.slice(0, 8) });
    setLights(null);
    setLightsMsg(null);
    try {
      const gu = p.sgg ? `서울특별시 ${p.sgg}` : undefined;
      setLights(await getLightsNear(p.lat, p.lon, 500, gu));
    } catch (e) {
      setLightsMsg(e instanceof Error ? e.message : String(e));
    }
  };

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
          서울특별시 보건정책과
          <span style={{ opacity: 0.6, fontWeight: 500, marginLeft: 8, fontSize: 13 }}>
            지역 낙상위험 통합관리 시스템
          </span>
        </div>
        <span style={{ marginLeft: "auto", fontSize: 12.5, opacity: 0.6 }}>
          보행환경 위험도: 자체 분석 실데이터 · 신고/예산: 시연용 목업
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>행정동별 보행환경 위험도</div>
          <div style={{ fontSize: 13.5, color: "var(--ink-muted)", marginTop: 3 }}>
            보도 경사·폭·재질 분석(서울 427개 행정동) × 인구·유동인구 연계 · 신호등 등급
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
        <KpiCard value={`${dongs.length || "—"}`} label="분석 행정동" />
        <KpiCard value={`${counts.danger}`} label="위험 (25점 이상)" tone="danger" />
        <KpiCard value={`${counts.warn}`} label="주의 (10–24점)" tone="warn" />
        <KpiCard value={`${counts.good}`} label="양호 (10점 미만)" tone="good" />
      </div>

      {/* choropleth 지도 + 위험 상위 동 표 */}
      <div className="dash-grid" style={{ marginTop: 18 }}>
        <Card style={{ padding: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 800, margin: "4px 4px 10px" }}>
            보행환경 위험도 지도 <span style={{ fontWeight: 500, color: "var(--ink-muted)" }}>(동 클릭 → 상세·인구 연계)</span>
          </div>
          {mounted && geojson
            ? <ChoroplethMap geojson={geojson} onSelect={onSelectDong} />
            : <div style={{ height: 460, borderRadius: 14, background: "var(--track)" }} />}
          <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
            {(["danger", "warn", "good"] as Level[]).map((g) => (
              <span key={g} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: "var(--ink-muted)" }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: `var(--${g})` }} />
                {GRADE_LABEL[g]} ({g === "danger" ? "25점 이상" : g === "warn" ? "10–24점" : "10점 미만"})
              </span>
            ))}
            <span style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>· 진할수록 위험 · 자료 없음 = 회색</span>
          </div>

          {/* 선택 동 상세 */}
          {selectedDong && (
            <div style={{ borderTop: "1px solid var(--line)", marginTop: 12, paddingTop: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <b style={{ fontSize: 15 }}>{selectedDong.name}</b>
                <SignalBadge level={riskLevel(selectedDong.risk)} />
                <span style={{ fontSize: 13.5, color: "var(--ink-muted)" }}>
                  위험도 <b style={{ color: riskColor(selectedDong.risk) }}>{selectedDong.risk}</b>
                  {selectedDong.factor && <> · 주요요인 <b>{selectedDong.factor}</b></>}
                </span>
                <a href={kakaoRoadviewUrl(selectedDong.lat, selectedDong.lon)} target="_blank" rel="noopener noreferrer"
                   style={{ fontSize: 13, fontWeight: 700, color: "var(--medical-blue)", textDecoration: "underline" }}>
                  현장 로드뷰 ↗
                </a>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "56px 1fr 34px", gap: "8px 10px", alignItems: "center", fontSize: 13, marginTop: 10 }}>
                {([["경사", selectedDong.slope_idx], ["협소", selectedDong.narrow_idx], ["재질", selectedDong.surface_idx]] as [string, number | null][]).map(([k, v]) => (
                  <span key={k} style={{ display: "contents" }}>
                    <span style={{ fontWeight: 700 }}>{k}</span>
                    <div style={{ height: 9, borderRadius: 5, background: "var(--track)", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${v ?? 0}%`, background: riskColor(v), borderRadius: 5 }} />
                    </div>
                    <b style={{ textAlign: "right", color: riskColor(v) }}>{v ?? "—"}</b>
                  </span>
                ))}
              </div>
              <div style={{ fontSize: 13, color: "var(--ink-muted)", marginTop: 10 }}>
                {lights ? (
                  <>야간 조명: 반경 {lights.radius_m}m 내 보안등 <b style={{ color: "var(--ink)" }}>{lights.count}개</b>
                    {lights.truncated && " (일부 스캔 — 참고치)"}</>
                ) : lightsMsg ? (
                  <>보안등 데이터: {lightsMsg}</>
                ) : (
                  <>보안등 밀도 조회 중...</>
                )}
              </div>
            </div>
          )}
        </Card>

        <Card style={{ padding: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>위험 상위 행정동 (위험도순)</div>
          <div style={{ maxHeight: 470, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
              <thead>
                <tr style={{ color: "var(--ink-muted)", textAlign: "left" }}>
                  {["행정동", "위험도", "경사", "협소", "재질", "주요요인", "현장"].map((h) => (
                    <th key={h} style={{ padding: "6px 8px", borderBottom: "1px solid var(--line)", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topRows.map((p) => (
                  <tr key={p.adm_cd2} style={{ borderBottom: "1px solid var(--track)" }}>
                    <td style={{ padding: "7px 8px", fontWeight: 700, whiteSpace: "nowrap" }}>{p.name}</td>
                    <td style={{ padding: "7px 8px", fontWeight: 800, color: `var(--${riskLevel(p.risk)})` }}>{p.risk}</td>
                    <td style={{ padding: "7px 8px" }}>{p.slope_idx ?? "—"}</td>
                    <td style={{ padding: "7px 8px" }}>{p.narrow_idx ?? "—"}</td>
                    <td style={{ padding: "7px 8px" }}>{p.surface_idx ?? "—"}</td>
                    <td style={{ padding: "7px 8px", fontSize: 12.5, color: "var(--ink-muted)" }}>{p.factor ?? "—"}</td>
                    <td style={{ padding: "7px 8px", whiteSpace: "nowrap" }}>
                      <a href={kakaoRoadviewUrl(p.lat, p.lon)} target="_blank" rel="noopener noreferrer"
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

      {/* 인구 · 유동인구 분석 (SGIS + 서울 생활인구) — 동 클릭 시 자동 조회 */}
      <div style={{ marginTop: 18 }}>
        <PopulationPanel selected={panelSel} />
      </div>

      {/* 추이 차트 (시연용 목업) */}
      <div className="dash-grid-2" style={{ marginTop: 18 }}>
        <Card style={{ padding: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>
            월별 낙상 신고 추이 (최근 12개월) <span style={{ fontWeight: 500, color: "var(--ink-muted)" }}>· 시연용 목업</span>
          </div>
          <TrendLine labels={MONTHS} values={MONTHLY} unit="건" ariaLabel="월별 낙상 신고 추이" />
          <div style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>
            겨울철(25.11–26.01) 결빙기 신고가 연중 최고 — 제설함·열선 보강 근거
          </div>
        </Card>
        <Card style={{ padding: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>
            연령대별 고위험 추정 인구 <span style={{ fontWeight: 500, color: "var(--ink-muted)" }}>· 시연용 목업</span>
          </div>
          <AgeBars labels={AGE_BANDS} values={AGE_POP} />
          <div style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>
            75–84세 구간이 고위험 인구의 49% — 방문 점검 우선 연령대
          </div>
        </Card>
      </div>

      {/* 등급 분포(실데이터) + 정책 의사결정(시연용) */}
      <div className="dash-grid" style={{ marginTop: 18, gridTemplateColumns: "1fr 1.6fr" }}>
        <Card style={{ padding: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 12 }}>등급 분포 (427개 행정동)</div>
          {(Object.entries(counts) as [Level, number][]).map(([g, n]) => (
            <div key={g} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <SignalBadge level={g} /> <span style={{ fontSize: 14, fontWeight: 700 }}>{n}개 동</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${dongs.length ? (n / dongs.length) * 100 : 0}%`, background: `var(--${g})` }} />
              </div>
            </div>
          ))}
        </Card>

        <Card style={{ padding: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>
            정책 의사결정 <span style={{ fontWeight: 500, color: "var(--ink-muted)" }}>· 예산은 시연용 추정치</span>
          </div>
          <div style={{ fontSize: 13, color: "var(--ink-muted)", marginBottom: 12 }}>
            위험 상위 동 중 사업 등록할 곳을 고르면 예산이 합산됩니다
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
            {policyRows.map((r) => {
              const sel = picked.has(r.name);
              return (
                <button key={r.name}
                        onClick={() => {
                          const next = new Set(picked);
                          if (sel) next.delete(r.name); else next.add(r.name);
                          setPicked(next);
                        }}
                        style={{
                          minHeight: 42, padding: "0 14px", borderRadius: 21, cursor: "pointer",
                          fontFamily: "inherit", fontSize: 13.5, fontWeight: 700,
                          border: sel ? "2px solid var(--gov-navy)" : "1.5px solid var(--line)",
                          background: sel ? "#f3f5fc" : "#fff",
                          color: sel ? "var(--gov-navy)" : "var(--ink-muted)",
                        }}>
                  {sel ? "✓ " : ""}{r.name}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
            <KpiCard value={`${pickedRows.length}곳`} label="선택 행정동" />
            <KpiCard value={`${budget.toLocaleString()}백만원`} label="소요 예산 (추정)" tone="blue" />
            <KpiCard value={`${avgRisk}`} label="평균 위험도" tone="warn" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2.2fr", gap: 10 }}>
            <Button variant="ghost" onClick={() => router.push("/")}>← 처음 화면으로</Button>
            <Button onClick={() => alert(`${pickedRows.length}개 행정동이 사업 목록에 등록되었습니다. (시연)`)}>
              선택 {pickedRows.length}개 동 사업 일괄 등록
            </Button>
          </div>
        </Card>
      </div>

      <div style={{ height: 20 }} />
      <NoticeStrip />
    </main>
  );
}
