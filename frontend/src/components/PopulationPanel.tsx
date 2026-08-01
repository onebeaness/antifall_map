"use client";

/** 인구 · 유동인구 분석 패널 (B2G 대시보드).
 * - 인구밀도·평균나이·노령화지수: SGIS 총조사 주요지표 (전국)
 * - 시간대별 생활인구(유동인구): 서울 열린데이터광장 (서울 한정)
 * 백엔드에 키가 없으면(503) 시연용 목업으로 폴백하고 그 사실을 표시한다.
 */
import { useEffect, useState } from "react";
import { Button, Card, KpiCard, TextField } from "@/components/ui";
import { TrendLine } from "@/components/charts/TrendLine";
import { getDongPopulation, getFloatingPopulation } from "@/lib/api";
import type { DongPopulation, FloatingPopulation } from "@/lib/types";

/** 시연용 목업 — 도심 행정동의 전형적 생활인구 곡선(명) */
const MOCK_DONG: DongPopulation = {
  adm_cd: "-", adm_nm: "본오동 (시연용 목업)",
  tot_ppltn: 38420, ppltn_dnsty: 14980, avg_age: 47.2, aged_child_idx: 212.4, tot_house: 16750,
};
const MOCK_FLOATING = [
  9200, 8600, 8300, 8200, 8400, 9100, 10800, 13500, 15800, 16400, 16100, 16600,
  17100, 16800, 16300, 16100, 16500, 17400, 16900, 15200, 13400, 12100, 10900, 9800,
];

function weekAgoYYYYMMDD(): string {
  const d = new Date(Date.now() - 7 * 86400_000);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

export function PopulationPanel() {
  const [admCd, setAdmCd] = useState("");
  // 날짜 기본값은 클라이언트에서만 계산 (SSR 프리렌더와의 hydration 불일치 방지)
  const [date, setDate] = useState("");
  useEffect(() => { setDate((d) => d || weekAgoYYYYMMDD()); }, []);
  const [dong, setDong] = useState<DongPopulation | null>(null);
  const [floating, setFloating] = useState<FloatingPopulation | null>(null);
  const [mock, setMock] = useState(true); // 초기 상태는 목업 표시
  const [notice, setNotice] = useState<string | null>(
    "시연용 목업 데이터입니다 — 행정동 코드를 입력하고 조회하면 실데이터로 전환됩니다.");
  const [busy, setBusy] = useState(false);

  const lookup = async () => {
    if (!admCd.trim()) return;
    setBusy(true);
    setNotice(null);
    const msgs: string[] = [];

    try {
      const rows = await getDongPopulation(admCd.trim());
      if (rows.length > 0) { setDong(rows[0]); setMock(false); }
      else msgs.push("SGIS: 해당 코드의 인구 자료가 없습니다.");
    } catch (e) {
      msgs.push(`SGIS 인구지표: ${e instanceof Error ? e.message : e}`);
    }

    try {
      setFloating(await getFloatingPopulation(admCd.trim(), date));
      setMock(false);
    } catch (e) {
      setFloating(null);
      msgs.push(`생활인구(서울 한정): ${e instanceof Error ? e.message : e}`);
    }

    if (msgs.length) setNotice(msgs.join(" · "));
    setBusy(false);
  };

  const d = dong ?? MOCK_DONG;
  const values = floating?.values ?? MOCK_FLOATING;
  const isMockShown = mock || (!dong && !floating);
  const peak = Math.max(...values);
  const peakHour = values.indexOf(peak);

  return (
    <Card style={{ padding: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 14, fontWeight: 800 }}>인구 · 유동인구 분석</div>
        <div style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>
          인구밀도·고령화(SGIS, 전국) + 시간대별 생활인구(서울 열린데이터)
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ flex: 2, minWidth: 180 }}>
          <TextField label="행정동 코드" placeholder="예) 11110515 (서울 종로구 청운효자동)"
                     value={admCd} inputMode="numeric"
                     onChange={(e) => setAdmCd(e.target.value.replace(/\D/g, ""))} />
        </div>
        <div style={{ flex: 1, minWidth: 130 }}>
          <TextField label="기준일 (YYYYMMDD)" value={date} inputMode="numeric" maxLength={8}
                     onChange={(e) => setDate(e.target.value.replace(/\D/g, ""))} />
        </div>
        <Button onClick={lookup} disabled={busy || !admCd.trim()} style={{ minHeight: 56 }}>
          {busy ? "조회 중..." : "조회"}
        </Button>
      </div>

      {notice && (
        <div style={{
          fontSize: 12.5, color: "var(--ink-muted)", marginTop: 10,
          background: "var(--bg-slate)", borderRadius: 10, padding: "9px 12px",
        }}>
          {notice}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
        <KpiCard value={d.ppltn_dnsty != null ? `${Math.round(d.ppltn_dnsty).toLocaleString()}` : "—"}
                 label="인구밀도 (명/㎢)" tone="blue" />
        <KpiCard value={d.tot_ppltn != null ? d.tot_ppltn.toLocaleString() : "—"} label="총인구 (명)" />
        <KpiCard value={d.avg_age != null ? `${d.avg_age}` : "—"} label="평균나이 (세)" tone="warn" />
        <KpiCard value={d.aged_child_idx != null ? `${d.aged_child_idx}` : "—"}
                 label="노령화지수" tone={d.aged_child_idx != null && d.aged_child_idx >= 200 ? "danger" : "navy"} />
      </div>
      <div style={{ fontSize: 12.5, color: "var(--ink-muted)", marginTop: 6 }}>
        {d.adm_nm} 기준{isMockShown ? "" : ` · SGIS 총조사(${floating ? "생활인구 " + floating.date : "주요지표"})`}
      </div>

      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 6 }}>
          시간대별 생활인구 {isMockShown && <span style={{ fontWeight: 500, color: "var(--ink-muted)" }}>(시연용 목업)</span>}
        </div>
        <TrendLine labels={Array.from({ length: 24 }, (_, h) => `${h}시`)}
                   values={values} unit="명" ariaLabel="시간대별 생활인구" />
        <div style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>
          피크 {peakHour}시 · {Math.round(peak).toLocaleString()}명 —
          고위험 보행 시간대(결빙 새벽·피크 통행)의 안전 순찰 배치 근거
        </div>
      </div>
    </Card>
  );
}
