import React from "react";

export interface DomainSegment {
  /** 도메인 이름 (예: "신체 기능") */
  label: string;
  /** 완료 문항 수 */
  done: number;
  /** 전체 문항 수 — 세그먼트 폭 비율로도 쓰인다 */
  total: number;
}

export interface DomainProgressProps {
  /** 도메인별 진행 세그먼트 (폭 비율 = total, 예: 10:13:16:11) */
  segments: DomainSegment[];
}

/**
 * 도메인별 분할 진행 바 — 심층 확인 상단. 완료=초록, 진행 중=네이비 부분 채움,
 * 미시작=회색. 아래 라벨 줄에 "이름 N/M" 카운트가 붙는다.
 */
export function DomainProgress({ segments }: DomainProgressProps) {
  return (
    <div>
      <div style={{ display: "flex", gap: 4 }}>
        {segments.map((s, i) => {
          const pct = s.total > 0 ? Math.round((s.done / s.total) * 100) : 0;
          const bg =
            s.done >= s.total && s.total > 0
              ? "var(--good)"
              : s.done > 0
                ? `linear-gradient(90deg, var(--gov-navy) ${pct}%, #e6ebf2 ${pct}%)`
                : "#e6ebf2";
          return <div key={i} style={{ flex: s.total, height: 8, borderRadius: 4, background: bg }} />;
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700, color: "var(--ink-muted)", marginTop: 6 }}>
        {segments.map((s, i) => {
          const color = s.done >= s.total && s.total > 0 ? "var(--good)" : s.done > 0 ? "var(--gov-navy)" : "var(--ink-muted)";
          return (
            <span key={i} style={{ color }}>
              {s.label} {s.done}/{s.total}
            </span>
          );
        })}
      </div>
    </div>
  );
}
