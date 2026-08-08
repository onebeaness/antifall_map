import React from "react";

export interface SignalBadgeProps {
  /** 신호등 등급 — danger(위험, 67점 이상) · warn(주의, 34–66) · good(양호, 0–33) */
  level: "danger" | "warn" | "good";
  /** 배지 문구 (기본: 위험/주의/양호) */
  label?: string;
  /** big=결과 히어로용(19px) · small=목록/카드용(13px, 기본) */
  size?: "small" | "big";
}

const META = {
  danger: { color: "var(--danger)", bg: "rgba(214,69,69,.12)", label: "위험" },
  warn: { color: "var(--warn)", bg: "rgba(224,168,0,.16)", label: "주의" },
  good: { color: "var(--good)", bg: "rgba(46,158,107,.12)", label: "양호" },
} as const;

/**
 * 신호등 등급 배지. 낙상 위험 3단계(위험·주의·양호)를 점 + 알약 형태로 표시한다.
 * 등급 기준: 0–33 양호 / 34–66 주의 / 67–100 위험.
 */
export function SignalBadge({ level, label, size = "small" }: SignalBadgeProps) {
  const m = META[level];
  const big = size === "big";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: big ? 8 : 6,
        fontSize: big ? 19 : 13,
        fontWeight: 800,
        padding: big ? "9px 20px" : "4px 11px",
        borderRadius: 30,
        color: m.color,
        background: m.bg,
      }}
    >
      <span style={{ width: big ? 12 : 9, height: big ? 12 : 9, borderRadius: "50%", background: m.color, flex: "none" }} />
      {label ?? m.label}
    </span>
  );
}
