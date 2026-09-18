"use client";

/** 구간별 경사 막대 (+오르막 / −내리막) — 색은 경사 구간 스케일(geo.ts).
 * 백엔드는 기울기(%)로 주고, 화면 표기는 대시보드와 같은 도(°)로 통일한다. */
import React from "react";
import { percentToDegrees, slopeColor } from "@/lib/geo";

const W = 520;
const H = 240;
const PAD = { top: 16, right: 14, bottom: 30, left: 46 };

export function SlopeBars({ distances, slopes }: {
  distances: number[];
  slopes: number[];
}) {
  if (slopes.length === 0) return null;
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const deg = slopes.map(percentToDegrees);
  const maxAbs = Math.max(2, ...deg.map(Math.abs));
  const maxD = distances[distances.length - 1];

  const x = (d: number) => PAD.left + (d / maxD) * iw;
  const zeroY = PAD.top + ih / 2;
  const y = (s: number) => zeroY - (s / maxAbs) * (ih / 2);

  const barW = Math.max(1.5, (iw / slopes.length) * 0.8);
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * maxD);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", fontFamily: "inherit" }}
         role="img" aria-label="구간별 경사도">
      {[maxAbs, 0, -maxAbs].map((v, i) => (
        <g key={i}>
          <line x1={PAD.left} y1={y(v)} x2={PAD.left + iw} y2={y(v)}
                stroke={v === 0 ? "var(--line)" : "var(--track)"} strokeWidth={1} />
          <text x={PAD.left - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--ink-muted)">
            {v > 0 ? `+${v.toFixed(0)}°` : `${v.toFixed(0)}°`}
          </text>
        </g>
      ))}
      {xTicks.map((d, i) => (
        <text key={i} x={x(d)} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--ink-muted)">
          {(d / 1000).toFixed(1)}km
        </text>
      ))}
      {deg.map((d, i) => {
        const cx = x(distances[i + 1]);
        const top = Math.min(zeroY, y(d));
        const h = Math.max(1, Math.abs(y(d) - zeroY));
        return (
          <rect key={i} x={cx - barW / 2} y={top} width={barW} height={h}
                fill={slopeColor(slopes[i])} rx={1}>
            <title>{`${(distances[i + 1] / 1000).toFixed(2)}km · 경사 ${d >= 0 ? "+" : ""}${d.toFixed(1)}°`}</title>
          </rect>
        );
      })}
    </svg>
  );
}
