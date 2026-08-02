"use client";

/** 선택한 행정동의 인구 지표 + 시간대별 생활인구.
 *
 * - 인구밀도·평균나이·노령화지수: SGIS 총조사 (전국)
 * - 시간대별 생활인구: 서울 열린데이터광장 (서울 한정)
 *
 * 대시보드의 '선택 행정동 상세' 카드 안에 들어가는 조각이라 자체 제목을 두지
 * 않는다. 키가 없거나 조회에 실패하면 시연용 목업으로 대체하고 그 사실을 밝힌다.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { TrendLine } from "@/components/charts/TrendLine";
import { getDongPopulation, getFloatingPopulation } from "@/lib/api";
import type { DongPopulation, FloatingPopulation } from "@/lib/types";

const HOUR_LABELS = Array.from({ length: 24 }, (_, h) => `${h}시`);

function weekAgoYYYYMMDD(): string {
  const d = new Date(Date.now() - 7 * 86400_000);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

export interface SelectedDong {
  name: string;
  /** SGIS(통계청) 행정구역 코드 */
  sgisCd: string;
  /** 생활인구용 행자부 행정동코드 (8자리) */
  floatCd: string;
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--ink-muted)" }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 800, color: tone ?? "var(--ink)", marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}

export function PopulationPanel({ selected }: { selected?: SelectedDong | null }) {
  const [manualCd, setManualCd] = useState("");
  // 날짜 기본값은 클라이언트에서만 계산 (정적 HTML에 빌드 날짜가 박히지 않도록).
  // 자동 조회는 ref로 읽어, 날짜 타이핑이 재조회를 유발하지 않게 한다.
  const [date, setDate] = useState("");
  const dateRef = useRef("");
  useEffect(() => { setDate((d) => d || weekAgoYYYYMMDD()); }, []);
  useEffect(() => { dateRef.current = date; }, [date]);

  const [dong, setDong] = useState<DongPopulation | null>(null);
  const [floating, setFloating] = useState<FloatingPopulation | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // 연속 선택 시 늦게 도착한 이전 요청이 최신 결과를 덮지 않도록 요청 순번 관리
  const seqRef = useRef(0);

  const lookup = useCallback(async (sgisCd: string | null, floatCd: string, dateStr: string) => {
    const seq = ++seqRef.current;
    setBusy(true);
    setNotice(null);
    const msgs: string[] = [];

    // SGIS는 통계청 자체 코드 체계라 행자부 코드를 넘기면 "엉뚱한 지역"이 조회된다
    // (예: 행자부 11110=종로 vs SGIS 11110=노원). 코드 출처가 확실한
    // 지도 클릭 경로에서만 조회하고, 수동 입력(행자부 코드)에서는 건너뛴다.
    let nextDong: DongPopulation | null = null;
    if (sgisCd) {
      try {
        const rows = await getDongPopulation(sgisCd);
        if (rows.length > 0) nextDong = rows[0];
        else msgs.push("인구지표: 해당 코드의 자료가 없습니다.");
      } catch (e) {
        msgs.push(`인구지표(SGIS): ${e instanceof Error ? e.message : e}`);
      }
    } else {
      msgs.push("인구지표(SGIS)는 코드 체계가 달라 지도에서 동을 클릭할 때만 조회됩니다.");
    }

    let nextFloating: FloatingPopulation | null = null;
    try {
      nextFloating = await getFloatingPopulation(floatCd, dateStr);
    } catch (e) {
      msgs.push(`생활인구(서울 한정): ${e instanceof Error ? e.message : e}`);
    }

    if (seq !== seqRef.current) return; // 더 새로운 요청이 이미 나감 — 이 응답은 폐기
    setDong(nextDong);
    setFloating(nextFloating);
    setNotice(msgs.length ? msgs.join(" · ") : null);
    setBusy(false);
  }, []);

  // 지도에서 동을 선택하면 자동 조회 (날짜 변경은 재조회 트리거가 아님)
  useEffect(() => {
    if (!selected) return;
    setManualCd(selected.floatCd);
    lookup(selected.sgisCd, selected.floatCd, dateRef.current || weekAgoYYYYMMDD());
  }, [selected, lookup]);

  const values = floating?.values;
  const peak = values ? Math.max(...values) : 0;
  const peakHour = values ? values.indexOf(peak) : 0;

  return (
    <div>
      {/* 인구 지표 */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 800 }}>인구 지표</span>
        <span style={{ fontSize: 12, color: "var(--ink-muted)" }}>
          {busy ? "조회 중..." : dong ? `SGIS · ${dong.adm_nm}` : "자료 없음"}
        </span>
      </div>
      {dong ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          <Metric label="인구밀도 (명/㎢)"
                  value={dong.ppltn_dnsty != null ? Math.round(dong.ppltn_dnsty).toLocaleString() : "—"}
                  tone="var(--medical-blue)" />
          <Metric label="총인구 (명)"
                  value={dong.tot_ppltn != null ? dong.tot_ppltn.toLocaleString() : "—"} />
          <Metric label="평균나이 (세)" value={dong.avg_age != null ? `${dong.avg_age}` : "—"}
                  tone="var(--warn)" />
          <Metric label="노령화지수" value={dong.aged_child_idx != null ? `${dong.aged_child_idx}` : "—"}
                  tone={dong.aged_child_idx != null && dong.aged_child_idx >= 200 ? "var(--danger)" : undefined} />
        </div>
      ) : (
        <div style={{ fontSize: 13, color: "var(--ink-muted)", padding: "10px 0" }}>
          {busy ? "인구 지표 조회 중..." : "인구 지표를 불러오지 못했습니다."}
        </div>
      )}

      {/* 시간대별 생활인구 */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "18px 0 6px" }}>
        <span style={{ fontSize: 13, fontWeight: 800 }}>시간대별 생활인구</span>
        <span style={{ fontSize: 12, color: "var(--ink-muted)" }}>
          {floating ? `서울 열린데이터 · ${floating.date}` : busy ? "조회 중..." : "자료 없음"}
        </span>
      </div>
      {values ? (
        <>
          <TrendLine labels={HOUR_LABELS} values={values} unit="명" ariaLabel="시간대별 생활인구" />
          <div style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>
            피크 {peakHour}시 · {Math.round(peak).toLocaleString()}명 —
            결빙 새벽·피크 통행 시간대의 안전 순찰 배치 근거
          </div>
        </>
      ) : (
        <div style={{ fontSize: 13, color: "var(--ink-muted)", padding: "10px 0" }}>
          {busy ? "생활인구 조회 중..." : "생활인구 자료를 불러오지 못했습니다 (서울 지역 한정)."}
        </div>
      )}

      {notice && (
        <div style={{
          fontSize: 12, color: "var(--ink-muted)", marginTop: 10,
          background: "var(--bg-slate)", borderRadius: 8, padding: "8px 11px",
        }}>
          {notice}
        </div>
      )}

      {/* 고급: 코드로 직접 조회 */}
      <details style={{ marginTop: 12 }}>
        <summary style={{ fontSize: 12.5, color: "var(--ink-muted)", cursor: "pointer" }}>
          행정동 코드로 생활인구 직접 조회 (행자부 8자리)
        </summary>
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input placeholder="행정동 코드 (예: 11110515)" value={manualCd} inputMode="numeric"
                 onChange={(e) => setManualCd(e.target.value.replace(/\D/g, ""))}
                 style={{ flex: 2, minWidth: 150, height: 42, border: "1.5px solid var(--line)",
                          borderRadius: 10, padding: "0 12px", fontFamily: "inherit", fontSize: 14 }} />
          <input placeholder="YYYYMMDD" value={date} inputMode="numeric" maxLength={8}
                 onChange={(e) => setDate(e.target.value.replace(/\D/g, ""))}
                 style={{ flex: 1, minWidth: 110, height: 42, border: "1.5px solid var(--line)",
                          borderRadius: 10, padding: "0 12px", fontFamily: "inherit", fontSize: 14 }} />
          <button onClick={() => manualCd && lookup(null, manualCd, date || weekAgoYYYYMMDD())}
                  disabled={busy || !manualCd}
                  style={{ height: 42, padding: "0 16px", borderRadius: 10, cursor: "pointer",
                           fontFamily: "inherit", fontSize: 14, fontWeight: 700,
                           border: "none", background: "var(--gov-navy)", color: "#fff" }}>
            조회
          </button>
        </div>
      </details>
    </div>
  );
}
