import React from "react";

export interface RadarProps {
  /** 6요소 점수 (0–100, 높을수록 위험) — 키 순서대로 12시 방향부터 시계방향 */
  scores: Record<string, number>;
  /** 한 변 크기(px), 기본 250 */
  size?: number;
}

function levelColor(score: number): string {
  return score >= 67 ? "var(--danger)" : score >= 34 ? "var(--warn)" : "var(--good)";
}

/**
 * 6축 레이더 차트 — 정밀 진단 결과의 6요소 세부 분석.
 * 원본 precision_test._radar 스펙(그리드 0.33/0.66/1.0, 채움 rgba(11,83,148,.18),
 * 점 색은 신호등 등급)을 그대로 따른다. 각 점에 값 툴팁(<title>)을 제공한다.
 */
export function Radar({ scores, size = 250 }: RadarProps) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 34;
  const axes = Object.keys(scores);
  const n = axes.length || 1;

  const pt = (i: number, ratio: number): [number, number] => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [cx + r * ratio * Math.cos(ang), cy + r * ratio * Math.sin(ang)];
  };

  const gridPolys = [0.33, 0.66, 1.0].map((g) =>
    axes.map((_, i) => pt(i, g).map((v) => v.toFixed(1)).join(",")).join(" "));
  const dataPts = axes.map((k, i) => pt(i, Math.max(0.04, scores[k] / 100)));
  const poly = dataPts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
         role="img" aria-label={axes.map((k) => `${k} ${scores[k]}점`).join(", ")}
         style={{ fontFamily: "inherit", flex: "none" }}>
      {gridPolys.map((points, i) => (
        <polygon key={i} points={points} fill="none" stroke="var(--line)" strokeWidth={1} />
      ))}
      {axes.map((_, i) => {
        const [x, y] = pt(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={x.toFixed(1)} y2={y.toFixed(1)}
                     stroke="var(--line)" strokeWidth={1} />;
      })}
      <polygon points={poly} fill="rgba(11,83,148,.18)" stroke="var(--medical-blue)"
               strokeWidth={2.5} strokeLinejoin="round" />
      {dataPts.map(([x, y], i) => (
        <circle key={i} cx={x.toFixed(1)} cy={y.toFixed(1)} r={4}
                fill={levelColor(scores[axes[i]])} stroke="#fff" strokeWidth={2}>
          <title>{axes[i]} {scores[axes[i]]}점</title>
        </circle>
      ))}
      {axes.map((name, i) => {
        const [x, y] = pt(i, 1.24);
        const anchor = i === 0 || i === 3 ? "middle" : i === 1 || i === 2 ? "start" : "end";
        return (
          <text key={i} x={x.toFixed(1)} y={(y + 4).toFixed(1)} textAnchor={anchor}
                fontSize={12.5} fontWeight={700} fill="var(--ink-muted)">
            {name.replace(" · ", "·")}
          </text>
        );
      })}
    </svg>
  );
}
