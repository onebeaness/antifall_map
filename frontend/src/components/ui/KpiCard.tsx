import React from "react";

export interface KpiCardProps {
  /** 큰 숫자 값 (예: "12,480") */
  value: string;
  /** 값 아래 설명 라벨 (예: "고위험 추정 인구") */
  label: string;
  /** 값 색상 — navy(기본)/blue/danger/warn/good */
  tone?: "navy" | "blue" | "danger" | "warn" | "good";
}

const TONE = {
  navy: "var(--gov-navy)",
  blue: "var(--medical-blue)",
  danger: "var(--danger)",
  warn: "var(--warn)",
  good: "var(--good)",
} as const;

/** KPI 미니카드 — 대시보드·랜딩의 통계 요약(값 21px/800 + 라벨 12.5px). */
export function KpiCard({ value, label, tone = "navy" }: KpiCardProps) {
  return (
    <div
      style={{
        flex: 1,
        background: "#fff",
        border: "1px solid var(--line)",
        borderRadius: 12,
        padding: "14px 12px",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 21, fontWeight: 800, color: TONE[tone] }}>{value}</div>
      <div style={{ fontSize: 12.5, color: "var(--ink-muted)", marginTop: 2 }}>{label}</div>
    </div>
  );
}
