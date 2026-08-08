"use client";

/** 기관·지자체 대시보드 B2G (IA.md 2.8).
 *
 * 구성 (위 → 아래):
 *  1. KPI — 서울 421개 행정동 보행 경사위험도 요약 (실데이터)
 *  2. 위험도 지도(choropleth) + 위험 상위 표
 *  3. 선택 행정동 상세 — 경사 프로필 + 보도 폭·재질 + 인구·생활인구
 *  4. 투입 효과 기대 지역 — 위험도 × 유동인구 랭킹
 *
 * 전 구간 실데이터: 경사위험도는 자체 보행로 분석(public/geo/seoul_dong_risk.geojson),
 * 인구는 SGIS, 생활인구는 서울 열린데이터.
 */
import dynamic from "next/dynamic";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, KpiCard, NoticeStrip, SignalBadge } from "@/components/ui";
import { PopulationPanel, type SelectedDong } from "@/components/PopulationPanel";
import { getCitywideFloating } from "@/lib/api";
import {
  RISK_DANGER, RISK_WARN, SLOPE_MAX_DEG, SLOPE_RECOMMENDED_DEG,
  coverageText, hasEnough, ratioText, riskColor, riskLevel, slopeNote,
  slopePercent, slopeText,
} from "@/lib/dongRisk";
import { kakaoRoadviewUrl } from "@/lib/kakao";
import type { CitywideFloating, DongRiskProps, GuRiskProps, Level } from "@/lib/types";

const ChoroplethMap = dynamic(() => import("@/components/ChoroplethMap"), { ssr: false });

const GRADE_LABEL: Record<Level, string> = { danger: "위험", warn: "주의", good: "양호" };

/** 산출 근거 블록의 라벨/값 — dt/dt 기본 여백을 지우고 라벨만 강조한다 */
const NOTE_LABEL: React.CSSProperties = {
  fontWeight: 800, color: "var(--ink)", whiteSpace: "nowrap",
};
const NOTE_VALUE: React.CSSProperties = { margin: 0 };


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
  const [geoError, setGeoError] = useState(false);
  const [mounted, setMounted] = useState(false);
  // 유동인구(서울 전역 일평균) — '투입 효과 기대 지역' 랭킹의 노출 지표
  const [flow, setFlow] = useState<CitywideFloating | null>(null);
  const [flowState, setFlowState] = useState<"loading" | "ready" | "error">("loading");
  const [flowMsg, setFlowMsg] = useState<string | null>(null);
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

  const gus = useMemo(() =>
    ((guGeojson?.features.map((f) => f.properties) ?? []) as GuRiskProps[])
      .filter((p) => p.risk != null)
      .sort((a, b) => (b.risk ?? 0) - (a.risk ?? 0)),
    [guGeojson]);

  /** 표·KPI는 지도의 드릴다운 단계를 따라간다.
   *  서울 전체 → 자치구 순위 / 구를 열면 → 그 구의 행정동 순위 */
  const rankRows = useMemo(() => {
    const scoped: (DongRiskProps | GuRiskProps)[] =
      activeGu ? dongs.filter((p) => p.sgg === activeGu) : gus;
    const graded = filter === "전체"
      ? scoped : scoped.filter((p) => GRADE_LABEL[riskLevel(p.risk)] === filter);
    return graded.slice(0, activeGu ? 30 : 25);
  }, [dongs, gus, filter, activeGu]);

  const counts = useMemo(() => {
    const scope: (DongRiskProps | GuRiskProps)[] =
      activeGu ? dongs.filter((p) => p.sgg === activeGu) : gus;
    return {
      total: scope.length,
      danger: scope.filter((p) => riskLevel(p.risk) === "danger").length,
      warn: scope.filter((p) => riskLevel(p.risk) === "warn").length,
      good: scope.filter((p) => riskLevel(p.risk) === "good").length,
    };
  }, [dongs, gus, activeGu]);

  const unit = activeGu ? "행정동" : "자치구";
  const tableTitle = (activeGu ? `${activeGu} ` : "서울 ")
    + (filter === "전체" ? `${unit} 순위 (위험도순)` : `${filter} 등급 ${unit} (위험도순)`);

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
  };

  const onSelectDong = (p: DongRiskProps) => {
    setSelectedDong(p);
    // SGIS는 통계청 코드(자료 없으면 백엔드가 상위 행정구역으로 폴백),
    // 생활인구는 행자부 10자리의 앞 8자리
    setPanelSel({ name: p.name, sgisCd: p.adm_cd, floatCd: p.adm_cd2.slice(0, 8) });
  };

  /* 보안등(야간 조명)은 화면에서 내렸다.
   * 전국보안등정보표준데이터는 지자체가 각자 올리는 구조라 서울 커버리지가
   * 고르지 않다. 관악구 대학동처럼 0개로 나오면 "어두운 동네"가 아니라
   * "자료가 없는 동네"인데, 화면에서는 구분이 안 된다. 폭·재질과 같은 이유다.
   * 백엔드 /api/safety/lights 와 api.ts getLightsNear 는 그대로 두었으니,
   * 커버리지를 확인한 뒤 이 파일에서만 다시 붙이면 된다. */

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
            생활 보행로 137,805개 지점의 경사 분석(자치구 25개 · 행정동 {dongs.length || 421}개)
            — 자치구 → 행정동 순으로 좁혀 가며 인구·유동인구까지 연계 분석합니다
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
        <KpiCard value={`${counts.total || "—"}`} label={`분석 ${unit}`} />
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
                             onSelectDong={onSelectDong}
                             selectedKey={selectedDong?.adm_cd2 ?? null} />
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
          {/* 산출 근거 — 줄글로 쓰면 아무도 안 읽는다. 라벨 + 짧은 항목으로 쪼갠다. */}
          <dl style={{
            display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px",
            fontSize: 12, lineHeight: 1.6, color: "var(--ink-muted)",
            background: "var(--bg-slate)", borderRadius: 10,
            padding: "12px 14px", margin: "10px 0 0",
          }}>
            <dt style={NOTE_LABEL}>산식</dt>
            <dd style={NOTE_VALUE}>
              경사점수 = 100 × (0.5 × 상시부담 + 0.5 × 기준초과)<br />
              <span style={{ opacity: 0.85 }}>
                · 상시부담 = min(1, 평균 경사 ÷ {SLOPE_MAX_DEG}°)<br />
                · 기준초과 = {SLOPE_MAX_DEG}° 넘는 지점 비율
              </span><br />
              <b style={{ color: "var(--ink)" }}>+ 협소 가산</b> = 폭 1.5m 이하 지점 비율 × 40
            </dd>

            <dt style={NOTE_LABEL}>등급</dt>
            <dd style={NOTE_VALUE}>
              양호 {RISK_WARN}점 미만 · 주의 {RISK_WARN}~{RISK_DANGER - 1} · 위험 {RISK_DANGER} 이상<br />
              <span style={{ opacity: 0.85 }}>
                장애인등편의법 시행규칙 별표1 접근로 기울기 기준<br />
                · {RISK_WARN}점 = 권장 1/18 ({SLOPE_RECOMMENDED_DEG}°)
                · {RISK_DANGER}점 = 완화 한도 1/12 ({SLOPE_MAX_DEG}°)
              </span>
            </dd>

            <dt style={NOTE_LABEL}>자료</dt>
            <dd style={NOTE_VALUE}>
              보도·보행자전용도로 137,805개 지점 DEM 전수 계산<br />
              <span style={{ opacity: 0.85 }}>
                · 등산로 47,309개 제외 (북한산둘레길·사당능선 등)
              </span>
            </dd>

            <dt style={NOTE_LABEL}>유의</dt>
            <dd style={NOTE_VALUE}>
              · 협소를 평균이 아니라 <b style={{ color: "var(--ink)" }}>가산</b>으로 넣습니다 —
              폭 기록이 26.7%뿐이라 평균에 넣으면 자료 없는 동까지 점수가 내려갑니다<br />
              · 폭 기록 10개 미만 → 협소 가산 없음<br />
              · 보행로 10개 미만 → 값 없음 (지도에서 회색)<br />
              · 노면 재질은 점수 제외 — 재질별 고정 매핑(아스콘 1 · 블록 2 ·
              콘크리트 3 · 비포장 4)이라 미끄럼 실측값이 아닙니다
            </dd>
          </dl>
        </Card>

        <Card style={{ padding: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>
            {tableTitle}
            <span style={{ fontWeight: 500, color: "var(--ink-muted)", marginLeft: 6 }}>
              {rankRows.length}곳 · {activeGu ? "행을 누르면 상세" : "행을 누르면 행정동으로"}
            </span>
          </div>
          <div style={{ maxHeight: 470, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
              <thead>
                <tr style={{ color: "var(--ink-muted)", textAlign: "left" }}>
                  {["순위", unit, "위험도", "평균 경사", "기준 초과", "최급경사 지점"].map((h) => (
                    <th key={h} style={{ padding: "6px 8px", borderBottom: "1px solid var(--line)", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rankRows.map((p, i) => {
                  const dong = activeGu ? (p as DongRiskProps) : null;
                  const picked = dong != null && selectedDong?.adm_cd2 === dong.adm_cd2;
                  return (
                    <tr key={dong ? dong.adm_cd2 : (p as GuRiskProps).sgg}
                        onClick={() => (dong ? onSelectDong(dong) : onGuChange(p.name))}
                        style={{
                          borderBottom: "1px solid var(--track)", cursor: "pointer",
                          background: picked ? "var(--bg-slate)" : undefined,
                        }}>
                      <td style={{ padding: "8px 8px", color: "var(--ink-muted)" }}>{i + 1}</td>
                      <td style={{ padding: "8px 8px", fontWeight: 700, whiteSpace: "nowrap" }}>
                        {activeGu ? p.name.split(" ").pop() : p.name}
                      </td>
                      <td style={{ padding: "8px 8px", fontWeight: 800, color: `var(--${riskLevel(p.risk)})` }}>{p.risk}</td>
                      <td style={{ padding: "8px 8px", fontSize: 12.5, color: "var(--ink-muted)" }}>{slopeText(p.slope_mean)}</td>
                      <td style={{ padding: "8px 8px", fontSize: 12.5, color: "var(--ink-muted)" }}>{ratioText(p.exceed_ratio)}</td>
                      <td style={{ padding: "8px 8px", whiteSpace: "nowrap" }}>
                        <a href={kakaoRoadviewUrl(p.worst_lat ?? p.lat, p.worst_lon ?? p.lon)} target="_blank" rel="noopener noreferrer"
                           onClick={(e) => e.stopPropagation()}
                           style={{ fontSize: 12.5, fontWeight: 700, color: "var(--medical-blue)", textDecoration: "underline" }}>
                          로드뷰 ↗
                        </a>
                      </td>
                    </tr>
                  );
                })}
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
              <a href={kakaoRoadviewUrl(selectedDong.worst_lat ?? selectedDong.lat,
                                     selectedDong.worst_lon ?? selectedDong.lon)} target="_blank" rel="noopener noreferrer"
                 style={{ fontSize: 13, fontWeight: 700, color: "var(--medical-blue)", textDecoration: "underline" }}>
                최급경사 지점 로드뷰 ↗
              </a>
            </>
          ) : (
            <span style={{ fontSize: 13.5, color: "var(--ink-muted)" }}>
              지도에서 동을 클릭하면 경사 프로필과 인구 분석이 여기 나타납니다
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
                <span><b style={{ fontSize: 15 }}>{slopeText(selectedDong.slope_mean)}</b>
                  <span style={{ color: "var(--ink-muted)", marginLeft: 8, fontSize: 12.5 }}>
                    기울기 {slopePercent(selectedDong.slope_mean)}% · {slopeNote(selectedDong.slope_mean)}
                  </span>
                </span>
                <span style={{ fontWeight: 700, color: "var(--ink-muted)" }}>최대 경사</span>
                <span><b style={{ fontSize: 15 }}>{slopeText(selectedDong.slope_max)}</b>
                  <span style={{ color: "var(--ink-muted)", marginLeft: 8, fontSize: 12.5 }}>
                    기울기 {slopePercent(selectedDong.slope_max)}%
                  </span>
                </span>
                <span style={{ fontWeight: 700, color: "var(--ink-muted)" }}>기준 초과</span>
                <span><b style={{ fontSize: 15 }}>{ratioText(selectedDong.exceed_ratio)}</b>
                  <span style={{ color: "var(--ink-muted)", marginLeft: 8, fontSize: 12.5 }}>
                    1/12({SLOPE_MAX_DEG}°)를 넘는 지점 비율
                  </span>
                </span>

                {/* 폭·재질은 현장 기록 기반이라 결측이 많다 — 점수에 넣지 않고
                    참고로만 보여주되, 기록 지점 수를 반드시 함께 적는다. */}
                <span style={{ fontWeight: 700, color: "var(--ink-muted)" }}>보도 폭</span>
                {hasEnough(selectedDong.width_n) ? (
                  <span><b style={{ fontSize: 15 }}>{selectedDong.width_mean}m</b>
                    <span style={{ color: "var(--ink-muted)", marginLeft: 8, fontSize: 12.5 }}>
                      협소(1.5m 이하) {ratioText(selectedDong.narrow_ratio)}
                      {selectedDong.narrow_ratio
                        ? ` → 위험도 +${Math.round(selectedDong.narrow_ratio * 40)}점`
                        : ""} ·{" "}
                      {coverageText(selectedDong.width_n, selectedDong.points)}
                    </span>
                  </span>
                ) : (
                  <span style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>
                    표본 부족 — {coverageText(selectedDong.width_n, selectedDong.points)}
                  </span>
                )}
                <span style={{ fontWeight: 700, color: "var(--ink-muted)" }}>노면 재질</span>
                {hasEnough(selectedDong.surface_n) ? (
                  <span><b style={{ fontSize: 15 }}>{selectedDong.surface_top}</b>
                    <span style={{ color: "var(--ink-muted)", marginLeft: 8, fontSize: 12.5 }}>
                      미끄러운 재질 {ratioText(selectedDong.slippery_ratio)} ·{" "}
                      {coverageText(selectedDong.surface_n, selectedDong.points)}
                    </span>
                  </span>
                ) : (
                  <span style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>
                    표본 부족 — {coverageText(selectedDong.surface_n, selectedDong.points)}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-muted)", marginTop: 10 }}>
                생활 보행로 {selectedDong.points?.toLocaleString() ?? "—"}개 지점 · DEM 전 지점 계산 · 등산로 제외
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
                  {["순위", "행정동", "위험도", "일평균 유동인구", "효과지수", "평균 경사", "최급경사 지점"].map((h) => (
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
                    <td style={{ padding: "8px 8px", fontSize: 12.5, color: "var(--ink-muted)" }}>{slopeText(r.slope_mean)}</td>
                    <td style={{ padding: "8px 8px", whiteSpace: "nowrap" }}>
                      <a href={kakaoRoadviewUrl(r.worst_lat ?? r.lat, r.worst_lon ?? r.lon)} target="_blank" rel="noopener noreferrer"
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
