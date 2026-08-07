import React from "react";

/** 진행 중 격려 문구 — 25% / 50% / 75% / 마지막 세 문항 지점에서만 나타난다.
 *
 * 42문항은 고령 사용자에게 길다. 팀원 배포본(senior_fall_service_v7_6의
 * render_encouragement)이 같은 지점에서 같은 말을 건네는데, 문구와 시점을
 * 그대로 가져왔다. 매 문항마다 띄우면 소음이 되므로 네 번만 나온다.
 */
export function encouragementFor(step: number, total: number): string | null {
  if (total <= 0) return null;
  const at = (ratio: number) => Math.max(1, Math.round(total * ratio));
  const marks = new Map<number, string>([
    [at(0.25), "좋습니다. 편안하게 잘하고 계십니다."],
    [at(0.5), "벌써 절반을 지나셨습니다. 잠시 쉬었다 계속하셔도 괜찮습니다."],
    [at(0.75), "아주 잘하고 계십니다. 이제 얼마 남지 않았습니다."],
    [Math.max(1, total - 3), "마지막 부분입니다. 천천히 마무리해 주세요."],
  ]);
  return marks.get(step) ?? null;
}

export function Encouragement({ step, total }: { step: number; total: number }) {
  const message = encouragementFor(step, total);
  if (!message) return null;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      background: "rgba(46,158,107,.08)", border: "1px solid rgba(46,158,107,.22)",
      borderRadius: 12, padding: "12px 16px", marginBottom: 16,
      fontSize: 14.5, fontWeight: 700, color: "#1f6b4c",
    }}>
      <span aria-hidden="true">🌿</span>
      <span>{message}</span>
    </div>
  );
}
