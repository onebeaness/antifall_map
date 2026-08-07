import React from "react";

/** 낙지도 심벌 — 발자국(낙상) + 지도 핀 + 낙지 다리.
 *
 * 인라인 SVG로 두는 이유: 오프라인에서도 뜨고, 어떤 크기에서도 선명하며,
 * 헤더처럼 작은 자리에서 별도 네트워크 요청이 생기지 않는다.
 * PWA 아이콘용 원본은 public/icons/logo.svg — **두 파일의 경로는 동일하게 유지할 것.**
 * (아이콘 PNG 재생성: node scripts/build-icons.mjs)
 */
export function LogoMark({
  size = 30, radius, variant = "brand",
}: {
  size?: number;
  /** 모서리 반경(px). 기본은 크기에 비례 */
  radius?: number;
  /** brand: 파란 배경 + 흰 심벌 / ghost: 배경 없이 흰 심벌만 (어두운 패널용) */
  variant?: "brand" | "ghost";
}) {
  const r = radius ?? Math.round(size * 0.22);
  const bg = variant === "brand" ? "#1668C8" : "transparent";
  // ghost는 배경이 없으므로 눈·구멍을 파낼 수 없다 → 심벌 안쪽을 배경색 대신 투명 처리
  const cut = variant === "brand" ? "#1668C8" : "none";

  return (
    <svg width={size} height={size} viewBox="0 0 512 512" role="img" aria-label="낙지도"
         style={{ display: "block", flex: "none" }}>
      <rect width="512" height="512" rx={(r / size) * 512} fill={bg} />
      <g transform="translate(256 256) scale(0.82) translate(-246 -256)">
        <g fill="#fff">
          <ellipse cx="176" cy="128" rx="35" ry="45" transform="rotate(-10 176 128)" />
          <ellipse cx="243" cy="100" rx="22" ry="29" transform="rotate(-5 243 100)" />
          <ellipse cx="292" cy="109" rx="20" ry="26" transform="rotate(6 292 109)" />
          <ellipse cx="335" cy="128" rx="18" ry="24" transform="rotate(16 335 128)" />
          <ellipse cx="371" cy="157" rx="16" ry="21" transform="rotate(26 371 157)" />
          <path fillRule="evenodd" d="M232 408 C232 408 314 306 314 244 A82 82 0 1 0 150 244 C150 306 232 408 232 408 Z M232 210 a35 35 0 1 0 0 70 a35 35 0 1 0 0-70 Z" />
          <path fill="none" stroke="#fff" strokeWidth="16" strokeLinecap="round"
                d="M163 312 C118 322 96 356 112 378 C124 394 148 391 150 374 C151 363 140 359 134 366" />
          <path fill="none" stroke="#fff" strokeWidth="16" strokeLinecap="round"
                d="M301 312 C346 322 368 356 352 378 C340 394 316 391 314 374 C313 363 324 359 330 366" />
          <path fill="none" stroke="#fff" strokeWidth="18" strokeLinecap="round"
                d="M112 386 C132 438 300 452 372 392 C398 370 396 348 372 344" />
        </g>
        {cut !== "none" && (
          <g fill={cut}>
            <circle cx="211" cy="322" r="11.5" />
            <circle cx="253" cy="322" r="11.5" />
          </g>
        )}
      </g>
    </svg>
  );
}
