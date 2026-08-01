import React from "react";

export interface CardProps {
  /** default=일반 카드(radius 16, padding 24) · question=문항 카드(radius 20, padding 38, max 640px 중앙) · panel=네이비 패널(radius 16, 흰 글자) */
  variant?: "default" | "question" | "panel";
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

/**
 * 흰 배경 카드 컨테이너. 문항 카드(question)는 640px 중앙 정렬,
 * 패널(panel)은 거버먼트 네이비 배경으로 스텝 내비·브랜드 영역에 쓴다.
 */
export function Card({ variant = "default", children, style }: CardProps) {
  const base: React.CSSProperties =
    variant === "question"
      ? { background: "#fff", border: "1px solid var(--line)", borderRadius: 20, padding: 38, maxWidth: 640, margin: "0 auto" }
      : variant === "panel"
        ? { background: "var(--gov-navy)", color: "#fff", borderRadius: 16, padding: "26px 22px" }
        : { background: "#fff", border: "1px solid var(--line)", borderRadius: 16, padding: 24 };
  return <div style={{ ...base, ...style }}>{children}</div>;
}
