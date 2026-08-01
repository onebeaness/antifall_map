"use client";

/** 연령대별 고위험 추정 인구 — 단일 시리즈 세로 막대 (메디컬 블루). */
import React from "react";

const W = 520;
const H = 240;
const PAD = { top: 28, right: 14, bottom: 32, left: 14 };

export function AgeBars({ labels, values }: { labels: string[]; values: number[] }) {
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const maxV = Math.max(...values) * 1.12;
  const slot = iw / values.length;
  const barW = slot * 0.56;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", fontFamily: "inherit" }}
         role="img" aria-label="연령대별 고위험 추정 인구">
      <line x1={PAD.left} y1={PAD.top + ih} x2={PAD.left + iw} y2={PAD.top + ih}
            stroke="var(--line)" strokeWidth={1} />
      {values.map((v, i) => {
        const cx = PAD.left + slot * i + slot / 2;
        const h = (v / maxV) * ih;
        return (
          <g key={i}>
            <rect x={cx - barW / 2} y={PAD.top + ih - h} width={barW} height={h}
                  fill="var(--medical-blue)" rx={4}>
              <title>{labels[i]} · {v.toLocaleString()}명</title>
            </rect>
            <text x={cx} y={PAD.top + ih - h - 7} textAnchor="middle" fontSize={11.5}
                  fontWeight={700} fill="var(--ink)">
              {v.toLocaleString()}
            </text>
            <text x={cx} y={H - 10} textAnchor="middle" fontSize={11} fill="var(--ink-muted)">
              {labels[i]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
