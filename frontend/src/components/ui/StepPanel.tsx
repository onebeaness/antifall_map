import React from "react";

export interface StepItem {
  /** 단계 이름 (예: "기본 정보") */
  label: string;
  /** 보조 문구 (예: "10문항 완료") */
  sub?: string;
  /** done=초록 체크 · current=흰 원 + 행 하이라이트 · todo=반투명 */
  state: "done" | "current" | "todo";
}

export interface StepPanelProps {
  /** 상단 오버라인 (예: "심층 확인") */
  overline?: string;
  /** 큰 제목 (예: "김순자님\n50문항 중 23문항 완료") */
  title: string;
  steps: StepItem[];
  /** 하단 전체 진행률 0–100 (생략 시 진행률 바 없음) */
  progress?: number;
}

/**
 * 좌측 스텝 내비 패널(네이비) — 심층 확인의 단계 이동 현황.
 * 완료=초록 ✓, 진행 중=흰 원 + 하이라이트, 대기=45% 테두리 원 + 반투명.
 */
export function StepPanel({ overline, title, steps, progress }: StepPanelProps) {
  return (
    <div style={{ background: "var(--gov-navy)", color: "#fff", borderRadius: 16, padding: "26px 22px", display: "flex", flexDirection: "column", minHeight: 420 }}>
      {overline && <div style={{ fontSize: 13, fontWeight: 700, color: "#9fb0e6", marginBottom: 4 }}>{overline}</div>}
      <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.3px", marginBottom: 20, whiteSpace: "pre-line" }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {steps.map((s, i) => {
          const circle =
            s.state === "done" ? (
              <span style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--good)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, flex: "none" }}>✓</span>
            ) : s.state === "current" ? (
              <span style={{ width: 26, height: 26, borderRadius: "50%", background: "#fff", color: "var(--gov-navy)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, flex: "none" }}>{i + 1}</span>
            ) : (
              <span style={{ width: 26, height: 26, borderRadius: "50%", border: "2px solid rgba(255,255,255,.45)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, flex: "none" }}>{i + 1}</span>
            );
          return (
            <div
              key={i}
              style={{
                display: "flex", alignItems: "center", gap: 12, padding: 12, borderRadius: 10,
                background: s.state === "current" ? "rgba(255,255,255,.12)" : undefined,
                opacity: s.state === "todo" ? 0.65 : 1,
              }}
            >
              {circle}
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{s.label}</div>
                {s.sub && <div style={{ fontSize: 12, color: "#9fb0e6" }}>{s.sub}</div>}
              </div>
            </div>
          );
        })}
      </div>
      {progress !== undefined && (
        <div style={{ marginTop: "auto", paddingTop: 18 }}>
          <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,.18)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.max(0, Math.min(100, progress))}%`, background: "#fff", borderRadius: 4 }} />
          </div>
          <div style={{ fontSize: 13, color: "#9fb0e6", marginTop: 8 }}>전체 진행률 {Math.round(progress)}%</div>
        </div>
      )}
    </div>
  );
}
