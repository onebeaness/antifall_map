"use client";

/** 기관·지자체 대시보드 B2G (IA.md 2.8).
 *
 * 구성 (위 → 아래):
 *  1. KPI — 서울 421개 행정동 보행 경사위험도 요약 (실데이터)
 *  2. 위험도 지도(choropleth) + 위험 상위 표
 *  3. 선택 행정동 상세 — 위험 프로필 + 보안등 + 인구·생활인구 (연계 조회)
 *  4. 투입 효과 기대 지역 — 위험도 × 유동인구 랭킹
 *
 * 전 구간 실데이터: 경사위험도는 자체 보행로 분석(public/geo/seoul_dong_risk.geojson),
 * 인구는 SGIS, 생활인구는 서울 열린데이터, 보안등은 공공데이터포털.
 */
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, KpiCard, NoticeStrip, SignalBadge } from "@/components/ui";
import { PopulationPanel, type SelectedDong } from "@/components/PopulationPanel";
import { getCitywideFloating, getLightsNear } from "@/lib/api";
import {
  RISK_DANGER, RISK_WARN, SLOPE_MAX, SLOPE_RECOMMENDED,
  riskColor, riskLevel, slopeNote, steepPercent,
} from "@/lib/dongRisk";
import { kakaoRoadviewUrl } from "@/lib/kakao";
import type { CitywideFloating, DongRiskProps, Level, LightsResult } from "@/lib/types";

const ChoroplethMap = dynamic(() => import("@/components/ChoroplethMap"), { ssr: false });

const GRADE_LABEL: Record<Level, string> = { danger: "위험", warn: "주의", good: "양호" };


function weekAgoYYYYMMDD(): string {
  return new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10).replace(/-/g, "");
}

export default function DashboardPage() {
  const router = useRouter();
  const [geojson, setGeojson] = useState<GeoJSON.FeatureCollection | null>(null);
  const [guGeojson, setGuGeojson] = useState<GeoJSON.FeatureCollection | null>(null);
  // 드릴다운 단계 — null이면 서울 전체(자치구), 값이 있으면 그 구의 행정동
  const [activeGu, setActiveGu] = useState<string | null>(null);
  const [filter, setFilter] = useState<"전체" | "위험" | "주의" | "양호">("전체");
  const [selectedDong, setSelectedDong] = useState<DongRiskProps | null>(null);
  const [panelSel, setPanelSel] = useState<SelectedDong | null>(null);
  const [lights, setLights] = useState<LightsResult | null>(null);
  const [lightsMsg, setLightsMsg] = useState<string | null>(null);
  const [geoError, setGeoError] = useState(false);
  const [mounted, setMounted] = useState(false);
  // 유동인구(서울 전역 일평균) — '투입 효과 기대 지역' 랭킹의 노출 지표
  const [flow, setFlow] = useState<CitywideFloating | null>(null);
  const [flowState, setFlowState] = useState<"loading" | "ready" | "error">("loading");
  const [flowMsg, setFlowMsg] = useState<string | null>(null);
  // 연속 동 선택 시 늦은 보안등 응답이 현재 선택에 표시되지 않도록 순번 관리
  const lightsSeqRef = useRef(0);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const load = (path: string) =>
      fetch(path).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<GeoJSON.FeatureCollection>;
      });
    Promise.all([load("/geo/seoul_gu_risk.geojson"), load("/geo/seoul_dong_risk.geojson")])
      .then(([gu, dong]) => { setGuGeojson(gu); setGeojson(dong); })
      .catch(() => { setGeojson(null); setGuGeojson(null); setGeoError(true); });
  }, []);

  useEffect(() => {
    getCitywideFloating(weekAgoYYYYMMDD())
      .then((f) => { setFlow(f); setFlowState("ready"); })
      .catch((e) => {
        setFlowState("error");
        setFlowMsg(e instanceof Error ? e.message : String(e));
      });
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

  /** 표는 지도의 드릴다운 단계를 따라간다 — 구를 열면 그 구의 동만 */
  const topRows = useMemo(() => {
    const scoped = activeGu ? dongs.filter((p) => p.sgg === activeGu) : dongs;
    const graded = filter === "전체"
      ? scoped : scoped.filter((p) => GRADE_LABEL[riskLevel(p.risk)] === filter);
    return graded.slice(0, activeGu ? 30 : 12);
  }, [dongs, filter, activeGu]);
  const tableTitle = `${activeGu ? `${activeGu} ` : "위험 상위 "}`
    + (filter === "전체" ? "행정동 (위험도순)" : `${filter} 등급 행정동 (위험도순)`);

  /** 투입 효과 기대 지수 = 위험도 × 일평균 생활인구 — 위험하면서 노출 인구가
   * 많은 동일수록 정비 투입 대비 낙상 감소 편익이 크다. */
  const effectRows = useMemo(() => {
    if (!flow) return [];
    return dongs
      .map((p) => {
        const pop = flow.dongs[p.adm_cd2.slice(0, 8)];
        if (!pop || p.risk == null) return null;
        return { ...p, avgPop: pop.avg, effect: Math.round((p.risk * pop.avg) / 1000) };
      })
      .filter((r): r is NonNullable<typeof r> => r != null)
      .sort((a, b) => b.effect - a.effect)
      .slice(0, 12);
  }, [dongs, flow]);

  /** 드릴다운 단계 전환 — 구를 바꾸면 이전 동 선택과 진행 중인 조회를 정리한다 */
  const onGuChange = (gu: string | null) => {
    setActiveGu(gu);
    setSelectedDong(null);
    setPanelSel(null);
    setLights(null);
    setLightsMsg(null);
    lightsSeqRef.current++; // 늦게 도착할 이전 보안등 응답을 버린다
  };

  const onSelectDong = async (p: DongRiskProps) => {
    setSelectedDong(p);
    // SGIS는 통계청 코드(자료 없으면 백엔드가 상위 행정구역으로 폴백),
    // 생활인구는 행자부 10자리의 앞 8자리
    setPanelSel({ name: p.name, sgisCd: p.adm_cd, floatCd: p.adm_cd2.slice(0, 8) });
    setLights(null);
    setLightsMsg(null);
    const seq = ++lightsSeqRef.current;
    try {
      const gu = p.sgg ? `서울특별시 ${p.sgg}` : undefined;
      const result = await getLightsNear(p.lat, p.lon, 500, gu);
      if (seq === lightsSeqRef.current) setLights(result);
    } catch (e) {
      if (seq === lightsSeqRef.current) setLightsMsg(e instanceof Error ? e.message : String(e));
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
          보행로 경사 자체 분석 × 통계청·서울시·공공데이터 실데이터
        </span>
      </div>

      {/* 제목 + 필터 + KPI */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>
            {activeGu ? `${activeGu} 행정동별 보행 경사위험도` : "자치구별 보행 경사위험도"}
          </div>
          <div style={{ fontSize: 13.5, color: "var(--ink-muted)", marginTop: 3 }}>
            보행로 지점 185,114개의 경사 분석(자치구 25개 · 행정동 {dongs.length || 421}개)
            — 자치구 → 행정동 순으로 좁혀 가며 인구·조명까지 연계 분석합니다
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
        <KpiCard value={`${counts.danger}`} label={`위험 (${RISK_DANGER}점 이상)`} tone="danger" />
        <KpiCard value={`${counts.warn}`} label={`주의 (${RISK_WARN}–${RISK_DANGER - 1}점)`} tone="warn" />
        <KpiCard value={`${counts.good}`} label={`양호 (${RISK_WARN}점 미만)`} tone="good" />
      </div>

      {/* 지도 + 위험 상위 표 */}
      <div className="dash-grid" style={{ marginTop: 18 }}>
        <Card style={{ padding: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 800, margin: "4px 4px 10px" }}>
            보행 경사위험도 지도
            <span style={{ fontWeight: 500, color: "var(--ink-muted)", marginLeft: 6 }}>
              {activeGu ? `${activeGu} · 행정동 단위` : "서울 전체 · 자치구 단위"}
            </span>
          </div>
          {mounted && geojson && guGeojson
            ? <ChoroplethMap guGeojson={guGeojson} dongGeojson={geojson}
                             activeGu={activeGu} onGuChange={onGuChange}
                             onSelectDong={onSelectDong} />
            : (
              <div style={{
                height: 460, borderRadius: 14, background: "var(--track)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, color: "var(--ink-muted)",
              }}>
                {geoError ? "행정동 데이터를 불러오지 못했습니다 — 새로고침해 주세요." : "행정동 데이터 로딩 중..."}
              </div>
            )}
          <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
            {(["danger", "warn", "good"] as Level[]).map((g) => (
              <span key={g} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: "var(--ink-muted)" }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: `var(--${g})` }} />
                {GRADE_LABEL[g]}
              </span>
            ))}
            <span style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>
              {activeGu
                ? "· 진할수록 가파름 · 자료 없음 = 회색 · 동을 클릭하면 아래에 상세가 열립니다"
                : "· 진할수록 가파름 · 자료 없음 = 회색 · 자치구를 클릭하면 행정동으로 들어갑니다"}
            </span>
          </div>
          {/* 산식 공개 — 등급 경계가 어디서 왔는지 화면에서 바로 확인되게 한다 */}
          <div style={{
            fontSize: 12, lineHeight: 1.65, color: "var(--ink-muted)",
            background: "var(--bg-slate)", borderRadius: 10, padding: "10px 12px", marginTop: 10,
          }}>
            <b style={{ color: "var(--ink)" }}>산식</b> 경사위험도 = 100 × (0.5 × 상시부담 + 0.5 × 급경사노출).
            상시부담 = min(1, 평균 경사 ÷ {SLOPE_MAX}°), 급경사노출 = 10° 이상 지점 비율.<br />
            등급 경계는 무장애 설계기준 종단경사와 맞췄습니다 —
            {" "}{RISK_WARN}점 = 권장 1/20({SLOPE_RECOMMENDED}°), {RISK_DANGER}점 = 최대 1/12({SLOPE_MAX}°).
            경사는 DEM으로 보행로 185,114개 지점 전부 계산해 결측이 없습니다.
          </div>
        </Card>

        <Card style={{ padding: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>
            {tableTitle}
            <span style={{ fontWeight: 500, color: "var(--ink-muted)", marginLeft: 6 }}>
              {topRows.length}곳 표시
            </span>
          </div>
          <div style={{ maxHeight: 470, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
              <thead>
                <tr style={{ color: "var(--ink-muted)", textAlign: "left" }}>
                  {["행정동", "위험도", "평균 경사", "급경사 구간", "현장"].map((h) => (
                    <th key={h} style={{ padding: "6px 8px", borderBottom: "1px solid var(--line)", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topRows.map((p) => (
                  <tr key={p.adm_cd2} style={{ borderBottom: "1px solid var(--track)" }}>
                    <td style={{ padding: "8px 8px", fontWeight: 700, whiteSpace: "nowrap" }}>{p.name}</td>
                    <td style={{ padding: "8px 8px", fontWeight: 800, color: `var(--${riskLevel(p.risk)})` }}>{p.risk}</td>
                    <td style={{ padding: "8px 8px", fontSize: 12.5, color: "var(--ink-muted)" }}>{p.slope_mean ?? "—"}°</td>
                    <td style={{ padding: "8px 8px", fontSize: 12.5, color: "var(--ink-muted)" }}>{steepPercent(p.steep_ratio)}</td>
                    <td style={{ padding: "8px 8px", whiteSpace: "nowrap" }}>
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

      {/* 선택 행정동 상세 — 위험 프로필 + 인구·생활인구 통합 */}
      <Card style={{ marginTop: 18, padding: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 15, fontWeight: 800 }}>선택 행정동 상세</span>
          {selectedDong ? (
            <>
              <b style={{ fontSize: 15 }}>{selectedDong.name}</b>
              <SignalBadge level={riskLevel(selectedDong.risk)} />
              <a href={kakaoRoadviewUrl(selectedDong.lat, selectedDong.lon)} target="_blank" rel="noopener noreferrer"
                 style={{ fontSize: 13, fontWeight: 700, color: "var(--medical-blue)", textDecoration: "underline" }}>
                현장 로드뷰 ↗
              </a>
            </>
          ) : (
            <span style={{ fontSize: 13.5, color: "var(--ink-muted)" }}>
              지도에서 동을 클릭하면 위험 프로필과 인구·조명 분석이 여기 나타납니다
            </span>
          )}
        </div>

        {selectedDong && (
          <div className="detail-grid" style={{ marginTop: 16 }}>
            {/* 좌: 보행 경사 프로필 */}
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: 40, fontWeight: 800, lineHeight: 1, color: riskColor(selectedDong.risk) }}>
                  {selectedDong.risk ?? "—"}
                </span>
                <span style={{ fontSize: 13, color: "var(--ink-muted)" }}>
                  보행 경사위험도 · 100점 만점
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "9px 14px",
                            alignItems: "baseline", fontSize: 13.5, marginTop: 16 }}>
                <span style={{ fontWeight: 700, color: "var(--ink-muted)" }}>평균 경사</span>
                <span><b style={{ fontSize: 15 }}>{selectedDong.slope_mean ?? "—"}°</b>
                  <span style={{ color: "var(--ink-muted)", marginLeft: 8, fontSize: 12.5 }}>
                    {slopeNote(selectedDong.slope_mean)}
                  </span>
                </span>
                <span style={{ fontWeight: 700, color: "var(--ink-muted)" }}>최대 경사</span>
                <span><b style={{ fontSize: 15 }}>{selectedDong.slope_max ?? "—"}°</b></span>
                <span style={{ fontWeight: 700, color: "var(--ink-muted)" }}>급경사 구간</span>
                <span><b style={{ fontSize: 15 }}>{steepPercent(selectedDong.steep_ratio)}</b>
                  <span style={{ color: "var(--ink-muted)", marginLeft: 8, fontSize: 12.5 }}>
                    10° 이상 지점 비율
                  </span>
                </span>
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-muted)", marginTop: 10 }}>
                보행로 {selectedDong.points?.toLocaleString() ?? "—"}개 지점 · DEM 전 지점 계산
              </div>
              <div style={{ fontSize: 13, color: "var(--ink-muted)", marginTop: 12 }}>
                {lights ? (
                  <>야간 조명: 반경 {lights.radius_m}m 내 보안등{" "}
                    <b style={{ color: "var(--ink)" }}>{lights.count}개</b>
                    {lights.truncated && " (일부 스캔 — 참고치)"}</>
                ) : lightsMsg ? (
                  <>보안등 데이터: {lightsMsg}</>
                ) : (
                  <>보안등 밀도 조회 중...</>
                )}
              </div>
            </div>

            {/* 우: 인구 · 생활인구 (SGIS + 서울 열린데이터) */}
            <div className="detail-side">
              <PopulationPanel selected={panelSel} />
            </div>
          </div>
        )}
      </Card>

      {/* 투입 효과 기대 지역 — 위험도 × 유동인구 (서울 생활인구 실데이터) */}
      <Card style={{ marginTop: 18, padding: 18 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, fontWeight: 800 }}>투입 효과 기대 지역</span>
          <span style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>
            위험도 × 일평균 유동인구 — 경사가 가파르면서 지나다니는 사람이 많은 동일수록
            정비 투입 대비 낙상 감소 효과가 큽니다
            {flow && ` · 생활인구 기준일 ${flow.date}`}
          </span>
        </div>

        {flowState === "loading" && (
          <div style={{ fontSize: 13.5, color: "var(--ink-muted)", padding: "18px 0" }}>
            서울 전역 생활인구 집계 중... (최초 조회는 수십 초 걸릴 수 있습니다)
          </div>
        )}
        {flowState === "error" && (
          <div style={{
            fontSize: 13, color: "var(--ink-muted)", marginTop: 12,
            background: "var(--bg-slate)", borderRadius: 10, padding: "12px 14px", lineHeight: 1.7,
          }}>
            유동인구 데이터를 불러오지 못해 이 랭킹을 표시할 수 없습니다.<br />
            {flowMsg}
          </div>
        )}
        {flowState === "ready" && effectRows.length > 0 && (
          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
              <thead>
                <tr style={{ color: "var(--ink-muted)", textAlign: "left" }}>
                  {["순위", "행정동", "위험도", "일평균 유동인구", "효과지수", "평균 경사", "현장"].map((h) => (
                    <th key={h} style={{ padding: "6px 8px", borderBottom: "1px solid var(--line)", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {effectRows.map((r, i) => (
                  <tr key={r.adm_cd2} style={{ borderBottom: "1px solid var(--track)" }}>
                    <td style={{ padding: "8px 8px", color: "var(--ink-muted)" }}>{i + 1}</td>
                    <td style={{ padding: "8px 8px", fontWeight: 700, whiteSpace: "nowrap" }}>{r.name}</td>
                    <td style={{ padding: "8px 8px", fontWeight: 800, color: `var(--${riskLevel(r.risk)})` }}>{r.risk}</td>
                    <td style={{ padding: "8px 8px" }}>{r.avgPop.toLocaleString()}명</td>
                    <td style={{ padding: "8px 8px", fontWeight: 800, color: "var(--medical-blue)" }}>{r.effect.toLocaleString()}</td>
                    <td style={{ padding: "8px 8px", fontSize: 12.5, color: "var(--ink-muted)" }}>{r.slope_mean ?? "—"}°</td>
                    <td style={{ padding: "8px 8px", whiteSpace: "nowrap" }}>
                      <a href={kakaoRoadviewUrl(r.lat, r.lon)} target="_blank" rel="noopener noreferrer"
                         style={{ fontSize: 12.5, fontWeight: 700, color: "var(--medical-blue)", textDecoration: "underline" }}>
                        로드뷰 ↗
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ fontSize: 12.5, color: "var(--ink-muted)", marginTop: 8 }}>
              효과지수 = 보행 경사위험도 × 일평균 생활인구 ÷ 1,000 · 위험 상위 표와 달리
              사람이 실제로 많이 다니는 곳을 우선한다는 점이 다릅니다
            </div>
          </div>
        )}
      </Card>

      <div style={{ marginTop: 18 }}>
        <Button variant="ghost" onClick={() => router.push("/")}>← 처음 화면으로</Button>
      </div>

      <div style={{ height: 20 }} />
      <NoticeStrip />
    </main>
  );
}
