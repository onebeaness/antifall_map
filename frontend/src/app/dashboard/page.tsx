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
import { Button, Card, Disclosure, KpiCard, NoticeStrip, SignalBadge } from "@/components/ui";
import { PopulationPanel, type SelectedDong } from "@/components/PopulationPanel";
import { getCitywideFloating } from "@/lib/api";
import {
  RISK_DANGER, RISK_WARN, SLOPE_MAX_DEG, SLOPE_RECOMMENDED_DEG, hasEnough, ratioText, riskColor, riskLevel, slopeNote, slopePercent, slopeText,
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


/** YYYYMMDD → 2026-06-23 */
const fmtDate = (d: string) =>
  d?.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}` : d;

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
            생활 보행로 137,805개 지점의 경사 분석 · 자치구 25개 · 행정동 {dongs.length || 421}개
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
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: "var(--ink-muted)" }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: "#c9d2e0" }} />
              자료 없음
            </span>
            <span style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>
              {activeGu ? "동을 클릭하면 아래에 상세가 열립니다" : "자치구를 클릭하면 행정동으로 들어갑니다"}
            </span>
          </div>
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
                <span><b style={{ fontSize: 15 }}>{selectedDong.exceed_n.toLocaleString()}곳</b>
                  <span style={{ color: "var(--ink-muted)", marginLeft: 8, fontSize: 12.5 }}>
                    전체 {selectedDong.points?.toLocaleString()}곳 중 · 1/12({SLOPE_MAX_DEG}°) 초과
                  </span>
                </span>

                {/* 폭·재질은 기록된 지점에서만 알 수 있다. 경사(전체)와 분모가
                    달라 비율을 나란히 놓으면 잘못 읽히므로 개수로 적고
                    분모를 각 줄에 함께 밝힌다. */}
                <span style={{ fontWeight: 700, color: "var(--ink-muted)" }}>협소 구간</span>
                {hasEnough(selectedDong.width_n) ? (
                  <span><b style={{ fontSize: 15 }}>{selectedDong.narrow_n.toLocaleString()}곳</b>
                    <span style={{ color: "var(--ink-muted)", marginLeft: 8, fontSize: 12.5 }}>
                      폭 확인 {selectedDong.width_n.toLocaleString()}곳 중 · 1.5m 이하
                      {selectedDong.narrow_ratio
                        ? ` → 위험도 +${Math.round(selectedDong.narrow_ratio * 40)}점` : ""}
                    </span>
                  </span>
                ) : (
                  <span style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>폭 확인 자료 없음</span>
                )}

                <span style={{ fontWeight: 700, color: "var(--ink-muted)" }}>보도 폭</span>
                {hasEnough(selectedDong.width_n) ? (
                  <span><b style={{ fontSize: 15 }}>{selectedDong.width_mean}m</b>
                    <span style={{ color: "var(--ink-muted)", marginLeft: 8, fontSize: 12.5 }}>
                      폭 확인 {selectedDong.width_n.toLocaleString()}곳 평균
                    </span>
                  </span>
                ) : (
                  <span style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>—</span>
                )}

                <span style={{ fontWeight: 700, color: "var(--ink-muted)" }}>미끄러운 노면</span>
                {hasEnough(selectedDong.surface_n) ? (
                  <span><b style={{ fontSize: 15 }}>{selectedDong.slippery_n.toLocaleString()}곳</b>
                    <span style={{ color: "var(--ink-muted)", marginLeft: 8, fontSize: 12.5 }}>
                      재질 확인 {selectedDong.surface_n.toLocaleString()}곳 중 ·
                      주로 {selectedDong.surface_top}
                    </span>
                  </span>
                ) : (
                  <span style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>재질 확인 자료 없음</span>
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
          <span style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>효과지수 순 · 산출 방식은 아래 참고</span>
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
          </div>
        )}
      </Card>

      <div style={{ marginTop: 18 }}>
        <Button variant="ghost" onClick={() => router.push("/")}>← 처음 화면으로</Button>
      </div>

      <div style={{ height: 20 }} />
      <NoticeStrip />

      {/* 산출 방식과 자료 — 본문 카드에는 숫자만 남기고, 계산 근거와 자료 설명은
       * 전부 여기(맨 아래)에 모은다. 화면 곳곳에 설명 문구를 흩어 두면 어지럽고,
       * 근거를 찾는 사람은 어차피 한 곳에서 몰아 읽는 편이 낫다. */}
      <Card style={{ marginTop: 18, padding: 18 }}>
        <div style={{ fontSize: 14, fontWeight: 800 }}>산출 방식과 자료</div>
        <div style={{ fontSize: 12.5, color: "var(--ink-muted)", marginTop: 2 }}>
          위 지도와 표의 모든 숫자가 어떻게 계산됐는지 여기에 모았습니다
        </div>
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

            <dt style={NOTE_LABEL}>효과지수</dt>
            <dd style={NOTE_VALUE}>
              보행 경사위험도 × 일평균 생활인구 ÷ 1,000<br />
              <span style={{ opacity: 0.85 }}>
                · 경사가 가파를수록, 지나다니는 사람이 많을수록 같은 정비 예산으로
                막을 수 있는 낙상이 많다는 가정의 우선순위 지표<br />
                · 생활인구 = 서울 열린데이터 시간대별 집계의 하루 평균
                {flow && <> ({fmtDate(flow.date)} 기준)</>}<br />
                · 위험 상위 표와 달리 사람이 실제로 많이 다니는 곳을 앞세웁니다
              </span>
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
                · 등산로 47,309개 제외 (북한산둘레길·사당능선 등)<br />
                · 노면 재질은 참고 정보 (점수 미반영)<br />
                · 회색 구역 = 분석 대상 보행로 없음
              </span>
            </dd>

          </dl>

          {/* 자료에 대한 질문 — 접어 둔다.
           *
           * 근거를 화면에 늘어놓으면 아무도 안 읽고, 아예 빼면 물었을 때 답이
           * 없다. 실제로 나왔던 질문("로드뷰 열었더니 평지던데?", "폭이 왜
           * 자료 없음이냐")을 그대로 제목으로 달아 두면 궁금한 사람만 편다. */}
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--ink-muted)", marginBottom: 2 }}>
              자료에 대한 질문
            </div>

            <Disclosure question="경사를 어떻게 쟀나요?">
              <b>길을 따라 올라가는 기울기(종단경사)</b>를 씁니다. 딛고 오르는 기울기라야
              낙상과 관계있기 때문입니다.
              <ul>
                <li>원본 자료의 경사는 그 자리 <b>지형</b>의 경사라 다릅니다 — 산비탈을
                  비스듬히 가로지르는 길은 지형이 16°여도 길 자체는 2°입니다</li>
                <li>그래서 길의 지점 순서를 복원해 다시 계산했습니다</li>
                <li>표고모델 격자가 30m라 그 3배인 <b>90m 구간의 평균 기울기</b>를 씁니다.
                  더 짧게 끊으면 격자 경계에서 값이 튑니다</li>
              </ul>
            </Disclosure>

            <Disclosure question={`등급 기준 ${RISK_WARN}점·${RISK_DANGER}점은 어디서 나온 숫자인가요?`}>
              임의로 정하지 않았습니다. <b>장애인등편의법 시행규칙 별표1</b>의 접근로
              기울기 기준에서 역산한 값입니다.
              <ul>
                <li>권장 1/18 ({SLOPE_RECOMMENDED_DEG}°) → <b>{RISK_WARN}점</b></li>
                <li>완화 한도 1/12 ({SLOPE_MAX_DEG}°) → <b>{RISK_DANGER}점</b></li>
              </ul>
              {RISK_WARN}이라는 어중간한 숫자는 그래서 나옵니다.
            </Disclosure>

            <Disclosure question="로드뷰를 열었더니 평평한데요?">
              <ul>
                <li>링크는 동 중심이 아니라 <b>그 동에서 가장 가파른 지점</b>을 가리킵니다.
                  중심점은 큰길 한복판이라 대개 평지입니다</li>
                <li>최댓값 하나는 튈 수 있어 <b>상위 5% 지점</b>을 씁니다</li>
                <li>그래도 평지로 보이면 화면 밖 골목·계단을 봐 주세요. 표고모델이 30m
                  격자라 좁은 급경사가 큰길과 함께 읽히는 자리가 있습니다</li>
              </ul>
            </Disclosure>

            <Disclosure question="등산로는 왜 뺐나요?">
              어르신의 <b>생활 낙상</b>과 무관한데 평균을 통째로 끌어올리기 때문입니다.
              <ul>
                <li>원본 185,114개 지점 중 <b>47,309개(25.6%)</b>가 등산로였습니다
                  (북한산둘레길·사당능선 등)</li>
                <li>등산로 평균 경사 10.9° vs 생활 보행로 2.4°</li>
                <li>관악구 낙성대동은 87%가 관악산 등산로라 10.3°로 나왔는데,
                  시가지 보도만 보면 <b>5.2°</b>입니다</li>
              </ul>
            </Disclosure>

            <Disclosure question="회색으로 칠해진 구역은 뭔가요?">
              <b>분석 대상 보행로가 10개 지점 미만</b>인 곳입니다.
              공원·하천·산지가 대부분인 동이 여기 해당합니다.
              <br />
              <b>&ldquo;안전한 동&rdquo;이 아니라 &ldquo;판단할 자료가 없는 동&rdquo;</b>입니다.
              자료 없음을 0점으로 칠하면 위험이 없는 것처럼 보이므로 색을 뺐습니다.
            </Disclosure>

            <Disclosure question="보도 폭이 &lsquo;자료 없음&rsquo;인 동이 많은데요?">
              폭은 현장에서 직접 재야 하는 정보라 결측이 많습니다
              (전체 지점의 <b>26.7%</b>만 기록).
              <ul>
                <li>기록이 10곳 미만인 동은 <b>숫자를 감춥니다</b> — 두세 곳 평균은
                  크게 흔들립니다</li>
                <li>협소(1.5m 이하) 비율만 <b>가산</b>으로 넣습니다. 가중평균에 넣으면
                  자료 없는 동이 &ldquo;넓어서 안전&rdquo;으로 계산돼 경사 위험을 가립니다</li>
                <li>폭 자료가 없는 동은 <b>경사 점수 그대로</b> 둡니다</li>
              </ul>
            </Disclosure>

            <Disclosure question="노면 재질은 왜 점수에 안 들어가나요?">
              원본의 재질 위험 점수가 <b>측정값이 아니라 재질별 고정 매핑</b>이기
              때문입니다 (아스콘 1 / 블록 2 / 콘크리트 3 / 비포장 4).
              <br />
              미끄럼을 실제로 잰 값이 아니어서 <b>참고 정보로만</b> 싣습니다.
            </Disclosure>

            <Disclosure question="계단·다리·터널은 어떻게 되나요?">
              <ul>
                <li><b>계단</b> — 아직 포함하지 않습니다. 원본 자료에 계단이 없습니다
                  (서울에 3,125개 구간 존재). 계단 경사는 30°가 넘어 경사 지표에 섞으면
                  그 동이 곧바로 최고점이 됩니다. 성격이 다른 위험이라 별도 지표로
                  다룰 사안입니다</li>
                <li><b>다리·터널</b> — 보행로의 5.1%(1,605개 구간)입니다. 표고모델은
                  다리 아래 지면과 터널 위 산을 읽어 그 구간 경사가 실제보다 높게
                  나올 수 있습니다. 양끝 표고를 이어 일정 기울기로 바꾸는 보정
                  (경로엔진들의 표준 처리)을 준비해 뒀고, 자료 갱신 때 함께 반영합니다</li>
              </ul>
            </Disclosure>
          </div>
      </Card>
    </main>
  );
}
