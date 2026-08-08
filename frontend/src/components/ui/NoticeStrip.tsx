import React from "react";

export interface NoticeStripProps {
  /** 고지 문구 (기본: 의료 진단 대체 불가 고지) */
  children?: React.ReactNode;
}

/**
 * 하단 고지 스트립(필수 요소) — 파란 점 + 참고용 스크리닝 고지.
 * 확인 결과가 노출되는 모든 화면의 맨 아래에 배치한다.
 */
export function NoticeStrip({ children }: NoticeStripProps) {
  return (
    <div
      style={{
        background: "#fff",
        borderTop: "1px solid var(--line)",
        padding: 16,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
      }}
    >
      <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--medical-blue)", flex: "none" }} />
      <span style={{ fontSize: 14, color: "var(--ink-muted)" }}>
        {children ?? "본 서비스의 확인 결과는 참고용 스크리닝이며 의료 진단을 대신하지 않습니다."}
      </span>
    </div>
  );
}
