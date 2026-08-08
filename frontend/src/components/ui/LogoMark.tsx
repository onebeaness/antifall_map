import React from "react";

/** 낙지도 심벌 — 발자국(낙상) + 지도 핀 + 낙지 다리 + 궤도.
 *
 * 인라인 SVG로 두는 이유: 오프라인에서도 뜨고, 어떤 크기에서도 선명하며,
 * 헤더처럼 작은 자리에서 별도 네트워크 요청이 생기지 않는다.
 *
 * ⚠️ PWA 아이콘 원본 public/icons/logo.svg 와 **좌표가 같아야 한다.**
 * 로고를 고칠 때는 두 파일을 함께 고치고 `node scripts/build-icons.mjs` 로
 * PNG를 다시 만든다.
 */
const BRAND = "#0765C5";
/** 원본 대비 마크를 살짝 줄이고 왼쪽으로 — 타일 여백 비율을 맞춘다 */
const MARK = "translate(256 256) scale(0.95) translate(-268 -256)";

export function LogoMark({
  size = 30, radius, variant = "brand",
}: {
  size?: number;
  /** 모서리 반경(px). 기본은 크기에 비례 */
  radius?: number;
  /** brand: 파란 배경 + 흰 심벌 / ghost: 배경 없이 흰 심벌만 (어두운 패널용) */
  variant?: "brand" | "ghost";
}) {
  const r = radius ?? Math.round(size * 0.2);
  const brand = variant === "brand";

  return (
    <svg width={size} height={size} viewBox="0 0 512 512" role="img" aria-label="낙지도"
         style={{ display: "block", flex: "none" }}>
      {brand && <rect width="512" height="512" rx={(r / size) * 512} fill={BRAND} />}
      <g fill="#fff" transform={MARK}>
        {/* 궤도 — 핀 뒤를 지나므로 먼저 그리고, 앞쪽 반원을 핀 위에 다시 얹는다 */}
        <ellipse cx="256" cy="392" rx="107" ry="35" transform="rotate(-14 256 392)"
                 fill="none" stroke="#fff" strokeWidth="14" />
        {/* 발가락 5개 */}
        <ellipse cx="171" cy="99" rx="33" ry="43" transform="rotate(-10 171 99)" />
        <ellipse cx="242" cy="79" rx="22" ry="29" transform="rotate(-4 242 79)" />
        <ellipse cx="299" cy="90" rx="20" ry="26" transform="rotate(8 299 90)" />
        <ellipse cx="345" cy="113" rx="18" ry="24" transform="rotate(20 345 113)" />
        <ellipse cx="378" cy="145" rx="16" ry="20" transform="rotate(32 378 145)" />
        {/* 지도 핀 — 가운데 구멍은 evenodd로 뚫는다 */}
        <path fillRule="evenodd" d="M255 398 C255 398 332 288 332 208 A77 77 0 1 0 178 208 C178 288 255 398 255 398 Z M255 156 a44 44 0 1 0 0 88 a44 44 0 1 0 0-88 Z" />
        {/* 낙지 다리 */}
        <path fill="none" stroke="#fff" strokeWidth="13" strokeLinecap="round"
              d="M210 292 C176 290 156 304 158 322 C160 337 180 340 184 327 C186 318 177 314 172 320" />
        <path fill="none" stroke="#fff" strokeWidth="13" strokeLinecap="round"
              d="M300 292 C334 290 354 304 352 322 C350 337 330 340 326 327 C324 318 333 314 338 320" />
        {/* 궤도 앞쪽 반원 — 핀 끝을 가로지른다 */}
        <path fill="none" stroke="#fff" strokeWidth="14" strokeLinecap="round"
              transform="rotate(-14 256 392)" d="M149 392 A107 35 0 0 0 363 392" />
      </g>
      {/* 눈 두 개 — brand는 배경색으로 파내고, ghost는 어두운 패널이 비치도록 투명 처리 */}
      {brand && (
        <g fill={BRAND} transform={MARK}>
          <circle cx="237" cy="286" r="9.5" />
          <circle cx="273" cy="286" r="9.5" />
        </g>
      )}
    </svg>
  );
}
