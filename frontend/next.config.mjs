/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // 정적 내보내기 — 모든 화면이 클라이언트 컴포넌트라 서버 런타임이 필요 없다.
  // 결과물(out/)은 Cloudflare Pages·Vercel·S3 등 어디에나 그대로 올릴 수 있고,
  // Next.js 어댑터(@opennextjs/cloudflare 등)도 필요 없다.
  output: "export",

  // 정적 내보내기에서는 이미지 최적화 서버가 없으므로 비활성화
  images: { unoptimized: true },

  // /me/simple → /me/simple/index.html 로 생성해 정적 호스팅 라우팅을 안정화
  trailingSlash: true,
};

export default nextConfig;
