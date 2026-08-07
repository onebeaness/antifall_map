import React from "react";

export interface OptionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** 선택 여부 — 선택 시 네이비 테두리 + 옅은 남색 배경 + 채워진 라디오 점 */
  selected?: boolean;
  children?: React.ReactNode;
}

/**
 * 설문 선택지 버튼(라디오형). 미선택=회색 테두리·빈 점, 선택=네이비 강조·채워진 점.
 * 높이 54px+, 좌측 정렬 — 간단/심층 확인의 모든 선택형 문항에 사용한다.
 */
export function OptionButton({ selected, children, style, ...rest }: OptionButtonProps) {
  return (
    <button
      style={{
        display: "flex",
        alignItems: "center",
        gap: 13,
        width: "100%",
        minHeight: 56,
        borderRadius: 13,
        padding: "0 18px",
        fontSize: 17,
        fontFamily: "inherit",
        cursor: "pointer",
        textAlign: "left",
        fontWeight: selected ? 700 : 600,
        background: selected ? "#f3f5fc" : "#fff",
        border: `2px solid ${selected ? "var(--gov-navy)" : "var(--line)"}`,
        color: selected ? "var(--gov-navy)" : "var(--ink)",
        ...style,
      }}
      {...rest}
    >
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          flex: "none",
          border: selected ? "2px solid var(--gov-navy)" : "2px solid #b7c0cf",
          background: selected ? "var(--gov-navy)" : "#fff",
          boxShadow: selected ? "inset 0 0 0 4px #fff" : "none",
        }}
      />
      {children}
    </button>
  );
}
