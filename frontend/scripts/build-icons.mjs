/** PWA 아이콘 생성 — public/icons/logo.svg 하나에서 PNG 4종을 렌더한다.
 *
 *   node scripts/build-icons.mjs
 *
 * maskable 변형(모서리 없는 전면 배경 + 안전영역 축소)은 logo.svg에서
 * 자동으로 파생시킨다 — 원본이 하나뿐이라 둘이 어긋날 일이 없다.
 * 앱 화면 안에서 쓰는 인라인 심벌은 src/components/ui/LogoMark.tsx 에 있고,
 * 그쪽은 수동으로 맞춰야 한다(같은 좌표를 쓸 것).
 *
 * 렌더는 Playwright의 Chromium을 쓴다(별도 이미지 라이브러리 없이 정확한 SVG 렌더).
 * 로고를 바꿀 때만 필요하므로 playwright는 상시 의존성에 넣지 않았다.
 * 실행 전에 한 번만: npm i -D playwright && npx playwright install chromium
 * (브라우저가 이미 있으면 CHROMIUM_PATH=/경로 로 지정할 수 있다.)
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ICONS = resolve(dirname(fileURLToPath(import.meta.url)), "../public/icons");

const logo = readFileSync(`${ICONS}/logo.svg`, "utf8");
/** maskable: 모서리 라운딩을 없애고(런처가 직접 마스킹) 마크를 안전영역 안으로 */
const maskable = logo
  .replace(/<rect width="512" height="512" rx="\d+"/, '<rect width="512" height="512"')
  .replaceAll("scale(0.95)", "scale(0.70)");

/** [SVG 소스, 출력 PNG, 한 변 픽셀] */
const TARGETS = [
  [logo, "icon-192.png", 192],
  [logo, "icon-512.png", 512],
  [maskable, "icon-maskable-512.png", 512],
  // iOS는 자체 마스크를 씌우므로 모서리를 깎지 않은 전면 배경본을 쓴다
  [maskable, "apple-touch-icon.png", 180],
];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
for (const [svg, out, size] of TARGETS) {
  const sized = svg.replace(/width="512" height="512"/,
    `width="${size}" height="${size}" style="display:block"`);
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<body style="margin:0">${sized}</body>`);
  await page.locator("svg").screenshot({ path: `${ICONS}/${out}`, omitBackground: true });
  await page.close();
  console.log(`✓ ${out} (${size}×${size})`);
}
await browser.close();
