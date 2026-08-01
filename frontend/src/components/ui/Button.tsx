import React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary=네이비 채움(기본) · ghost=흰 배경 아웃라인 · white=흰 배경 네이비 글자(네이비 패널 위) · blue=메디컬 블루 채움 */
  variant?: "primary" | "ghost" | "white" | "blue";
  /** md=52px(기본) · lg=60px — 시니어 터치 타겟 최소 52px */
  size?: "md" | "lg";
  /** 부모 폭 채움 */
  fullWidth?: boolean;
}

const VARIANT: Record<string, React.CSSProperties> = {
  primary: { background: "var(--gov-navy)", color: "#fff", border: "none" },
  ghost: { background: "#fff", color: "var(--gov-navy)", border: "1.5px solid var(--line)" },
  white: { background: "#fff", color: "var(--gov-navy)", border: "none" },
  blue: { background: "var(--medical-blue)", color: "#fff", border: "none" },
};

/**
 * 기본 버튼. 시니어 접근성 기준(터치 타겟 52px+, 16px+ 텍스트)을 따르며,
 * 네이비(주 행동)·고스트(보조)·화이트(네이비 패널 위)·블루(기관용) 4변형을 제공한다.
 */
export function Button({ variant = "primary", size = "md", fullWidth, style, children, ...rest }: ButtonProps) {
  return (
    <button
      style={{
        minHeight: size === "lg" ? 60 : 52,
        borderRadius: 12,
        fontSize: size === "lg" ? 19 : 16,
        fontWeight: 700,
        padding: "0 22px",
        cursor: "pointer",
        fontFamily: "inherit",
        letterSpacing: "-0.2px",
        width: fullWidth ? "100%" : undefined,
        ...VARIANT[variant],
        ...(rest.disabled ? { background: "#c3ccda", color: "#fff", border: "none" } : {}),
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
