"use client";

/** 월별 낙상 신고 추이 — 단일 시리즈 영역 라인 (원본 plotly 이식, 네이비). */
import React from "react";

const W = 520;
const H = 240;
const PAD = { top: 18, right: 14, bottom: 32, left: 42 };

export function TrendLine({ labels, values }: { labels: string[]; values: number[] }) {
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const maxV = Math.max(...values) * 1.15;

  const x = (i: number) => PAD.left + (i / (values.length - 1)) * iw;
  const y = (v: number) => PAD.top + (1 - v / maxV) * ih;

  const line = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${PAD.left},${PAD.top + ih} ${line} ${PAD.left + iw},${PAD.top + ih}`;
  const yTicks = [0.25, 0.5, 0.75, 1].map((t) => Math.round(maxV * t));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", fontFamily: "inherit" }}
         role="img" aria-label="월별 낙상 신고 추이">
      {yTicks.map((v, i) => (
        <g key={i}>
          <line x1={PAD.left} y1={y(v)} x2={PAD.left + iw} y2={y(v)} stroke="var(--track)" strokeWidth={1} />
          <text x={PAD.left - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--ink-muted)">{v}</text>
        </g>
      ))}
      {labels.map((m, i) => (i % 2 === 0 ? (
        <text key={m} x={x(i)} y={H - 10} textAnchor="middle" fontSize={10.5} fill="var(--ink-muted)">{m}</text>
      ) : null))}
      <polygon points={area} fill="rgba(30,39,97,.08)" />
      <polyline points={line} fill="none" stroke="var(--gov-navy)" strokeWidth={2.5} strokeLinejoin="round" />
      {values.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r={5} fill="var(--gov-navy)" stroke="#fff" strokeWidth={1.5}
                opacity={0.9}>
          <title>{labels[i]} · {v}건</title>
        </circle>
      ))}
    </svg>
  );
}
