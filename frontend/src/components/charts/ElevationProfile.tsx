"use client";

/** 고도 프로파일 — 단일 시리즈 영역 차트 (원본 plotly 차트 이식).
 * 색은 경사도 스케일의 평지색(#2b83ba)을 따른다. 점 호버 시 값 툴팁. */
import React from "react";

const W = 520;
const H = 240;
const PAD = { top: 18, right: 14, bottom: 30, left: 46 };

export function ElevationProfile({ distances, elevations }: {
  distances: number[];
  elevations: number[];
}) {
  if (distances.length < 2) return null;
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const maxD = distances[distances.length - 1];
  const minE = Math.min(...elevations);
  const maxE = Math.max(...elevations);
  const span = Math.max(maxE - minE, 5);
  const y0 = minE - span * 0.1;
  const y1 = maxE + span * 0.1;

  const x = (d: number) => PAD.left + (d / maxD) * iw;
  const y = (e: number) => PAD.top + (1 - (e - y0) / (y1 - y0)) * ih;

  const line = distances.map((d, i) => `${x(d).toFixed(1)},${y(elevations[i]).toFixed(1)}`).join(" ");
  const area = `${PAD.left},${(PAD.top + ih).toFixed(1)} ${line} ${(PAD.left + iw).toFixed(1)},${(PAD.top + ih).toFixed(1)}`;

  const yTicks = [y0 + (y1 - y0) * 0.1, (y0 + y1) / 2, y1 - (y1 - y0) * 0.1];
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * maxD);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", fontFamily: "inherit" }}
         role="img" aria-label="고도 프로파일">
      {yTicks.map((v, i) => (
        <g key={i}>
          <line x1={PAD.left} y1={y(v)} x2={PAD.left + iw} y2={y(v)} stroke="var(--track)" strokeWidth={1} />
          <text x={PAD.left - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--ink-muted)">
            {Math.round(v)}m
          </text>
        </g>
      ))}
      {xTicks.map((d, i) => (
        <text key={i} x={x(d)} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--ink-muted)">
          {(d / 1000).toFixed(1)}km
        </text>
      ))}
      <polygon points={area} fill="rgba(43,131,186,.16)" />
      <polyline points={line} fill="none" stroke="#2b83ba" strokeWidth={2} strokeLinejoin="round" />
      {distances.map((d, i) => (
        <circle key={i} cx={x(d)} cy={y(elevations[i])} r={6} fill="transparent">
          <title>{`${(d / 1000).toFixed(2)}km · 고도 ${elevations[i].toFixed(0)}m`}</title>
        </circle>
      ))}
    </svg>
  );
}
