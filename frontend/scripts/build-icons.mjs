/** PWA 아이콘 생성 — public/icons/*.svg 를 PNG로 렌더한다.
 *
 *   node scripts/build-icons.mjs
 *
 * 원본(SVG)을 고치면 이 스크립트로 PNG를 다시 만든다. 렌더는 Playwright의
 * Chromium을 쓴다(별도 이미지 라이브러리 의존성 없이 정확한 SVG 렌더).
 *
 * 로고를 바꿀 때만 필요하므로 playwright는 상시 의존성에 넣지 않았다.
 * 실행 전에 한 번만: npm i -D playwright && npx playwright install chromium
 * (브라우저가 이미 있으면 CHROMIUM_PATH=/경로 로 지정할 수 있다.)
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ICONS = resolve(dirname(fileURLToPath(import.meta.url)), "../public/icons");

/** [원본 SVG, 출력 PNG, 한 변 픽셀] */
const TARGETS = [
  ["logo.svg", "icon-192.png", 192],
  ["logo.svg", "icon-512.png", 512],
  ["logo-maskable.svg", "icon-maskable-512.png", 512],
  // iOS는 자체 마스크를 씌우므로 모서리를 깎지 않은 전면 배경본을 쓴다
  ["logo-maskable.svg", "apple-touch-icon.png", 180],
];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
for (const [src, out, size] of TARGETS) {
  const svg = readFileSync(`${ICONS}/${src}`, "utf8")
    .replace(/width="512" height="512"/, `width="${size}" height="${size}" style="display:block"`);
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<body style="margin:0">${svg}</body>`);
  await page.locator("svg").screenshot({ path: `${ICONS}/${out}`, omitBackground: true });
  await page.close();
  console.log(`✓ ${out} (${size}×${size}) ← ${src}`);
}
await browser.close();
