import React from "react";

export interface HeaderBarProps {
  /** 서비스명 (예: "안심걸음 — 노인 낙상 위험 예측 서비스") */
  title: string;
  /** 로고 마크 글자 (기본 "안") */
  mark?: string;
  /** 우측 끝 부가 요소 (예: "23 / 50 문항") */
  right?: React.ReactNode;
}

/**
 * 상단 64px 헤더 — 네이비 사각 로고(30×30, radius 8) + 서비스명 중앙 정렬.
 * 하단 1px 라인으로 본문과 구분한다.
 */
export function HeaderBar({ title, mark = "안", right }: HeaderBarProps) {
  return (
    <div
      style={{
        height: 64,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        background: "#fff",
        borderBottom: "1px solid var(--line)",
        position: "relative",
      }}
    >
      <span
        style={{
          width: 30, height: 30, borderRadius: 8, background: "var(--gov-navy)", color: "#fff",
          display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 800,
        }}
      >
        {mark}
      </span>
      <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-0.3px" }}>{title}</span>
      {right && (
        <span style={{ position: "absolute", right: 24, fontSize: 14, fontWeight: 700, color: "var(--ink-muted)" }}>{right}</span>
      )}
    </div>
  );
}
