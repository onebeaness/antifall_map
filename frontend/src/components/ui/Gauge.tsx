import React from "react";

export interface GaugeProps {
  /** 0–100 위험 점수. 색은 신호등 등급 자동(0–33 good / 34–66 warn / 67–100 danger) */
  score: number;
  /** 지름(px), 기본 200 */
  size?: number;
  /** 점수 아래 캡션 (기본 "100점 만점") */
  caption?: string;
}

function levelColor(score: number): string {
  return score >= 67 ? "var(--danger)" : score >= 34 ? "var(--warn)" : "var(--good)";
}

/**
 * 원형 위험도 게이지 — 디자인 정본 스펙(r=52, stroke 15, dasharray=score/100×326.7).
 * 진단 결과 히어로에 사용하며 점수 색은 신호등 등급을 따른다.
 */
export function Gauge({ score, size = 200, caption = "100점 만점" }: GaugeProps) {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  const color = levelColor(s);
  const dash = (s / 100) * 326.7;
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="52" fill="none" stroke="var(--track)" strokeWidth="15" />
        <circle
          cx="60" cy="60" r="52" fill="none"
          stroke={color} strokeWidth="15" strokeLinecap="round"
          strokeDasharray={`${dash.toFixed(1)} 326.7`}
          transform="rotate(-90 60 60)"
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: Math.round(size * 0.28), fontWeight: 800, lineHeight: 1, color }}>{s}</div>
        <div style={{ fontSize: 13, color: "var(--ink-muted)", marginTop: 2 }}>{caption}</div>
      </div>
    </div>
  );
}
