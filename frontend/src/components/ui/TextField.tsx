import React from "react";

export interface TextFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  /** 필드 라벨 (예: "생년월일") */
  label?: string;
  /** error=빨간 테두리+메시지 · success=초록 메시지 */
  status?: "error" | "success";
  /** 상태 메시지 (예: "생년월일이 일치하지 않습니다.") */
  message?: string;
}

/**
 * 입력 필드 — 높이 56px, 2px 테두리, 18px/600 텍스트(시니어 가독성).
 * 검증 상태(error/success)에 따라 테두리·메시지 색이 바뀐다.
 */
export function TextField({ label, status, message, style, ...rest }: TextFieldProps) {
  const border =
    status === "error" ? "2px solid var(--danger)" : "2px solid var(--line)";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      {label && <label style={{ fontSize: 15, fontWeight: 700 }}>{label}</label>}
      <input
        style={{
          width: "100%",
          minHeight: 56,
          border,
          borderRadius: 12,
          padding: "0 16px",
          fontSize: 18,
          fontWeight: 600,
          fontFamily: "inherit",
          color: "var(--ink)",
          boxSizing: "border-box",
          ...style,
        }}
        {...rest}
      />
      {message && (
        <div style={{ fontSize: 13.5, fontWeight: 600, color: status === "error" ? "var(--danger)" : "var(--good)" }}>
          {message}
        </div>
      )}
    </div>
  );
}
