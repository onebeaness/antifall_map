"use client";

/** 랜딩 — 확정안 1b: 풀스크린 분할형 (IA.md 2.1, 정본: 랜딩 화면.dc.html). */
import { useRouter } from "next/navigation";
import { Button, HeaderBar, KpiCard, NoticeStrip } from "@/components/ui";
import { storage } from "@/lib/storage";

const DOT = (color: string) => (
  <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flex: "none" }} />
);

function Bullet({ color, text, sub }: { color: string; text: string; sub?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15.5, fontWeight: 600, marginBottom: 12 }}>
      {DOT(color)}
      <span>
        {text}
        {sub && <span style={{ opacity: 0.55, fontWeight: 400 }}> {sub}</span>}
      </span>
    </div>
  );
}

export default function LandingPage() {
  const router = useRouter();

  const goPersonal = async () => {
    const profile = await storage.getProfile();
    router.push(profile ? "/me" : "/register");
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#fff" }}>
      <HeaderBar title="낙지도 — 노인 낙상 위험 예측 서비스" />

      <div className="split" style={{ flex: 1 }}>
        {/* 좌: 시민 · 개인용 (네이비) */}
        <section style={{ background: "var(--gov-navy)", padding: "56px 48px", color: "#fff" }}>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "1.5px", color: "#9fb0e6", marginBottom: 14 }}>
            시민 · 개인용
          </div>
          <h1 style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.5px", margin: "0 0 14px" }}>
            생활안전지도
          </h1>
          <p style={{ fontSize: 16, lineHeight: 1.65, color: "#cfd6ee", margin: "0 0 26px" }}>
            간단한 질문에 답하면 나의 낙상 위험도를 확인하고,<br />
            우리 동네 안전 경로까지 안내받을 수 있습니다.
          </p>
          <Bullet color="var(--good)" text="간단 테스트" sub="6문항 · 1분" />
          <Bullet color="var(--warn)" text="정밀 테스트" sub="42문항 · AI 분석" />
          <Bullet color="var(--danger)" text="경사도 히트맵" sub="안전 경로 안내" />
          <div style={{ marginTop: 26 }}>
            <Button variant="white" size="lg" onClick={goPersonal}>
              개인용으로 시작하기 →
            </Button>
          </div>
        </section>

        {/* 우: 기관 · 지자체용 (슬레이트) */}
        <section style={{ background: "var(--bg-slate)", borderLeft: "1px solid var(--line)", padding: "56px 48px" }}>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "1.5px", color: "var(--medical-blue)", marginBottom: 14 }}>
            기관 · 지자체용
          </div>
          <h2 style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.5px", margin: "0 0 14px" }}>
            지역 위험 대시보드
          </h2>
          <p style={{ fontSize: 16, lineHeight: 1.65, color: "var(--ink-muted)", margin: "0 0 26px" }}>
            고령 인구 특성과 지형 경사를 결합해 관내 위험 구간을<br />
            분석하고, 예산 투입 우선순위를 제안합니다.
          </p>
          <div style={{ display: "flex", gap: 10, marginBottom: 26 }}>
            <KpiCard value="25" label="관리 지역" />
            <KpiCard value="8" label="우선 관리 구역" tone="danger" />
            <KpiCard value="12,480" label="고위험 추정 인구" tone="warn" />
          </div>
          <Button variant="blue" size="lg" onClick={() => router.push("/dashboard")}>
            기관용으로 시작하기 →
          </Button>
        </section>
      </div>

      <NoticeStrip />
    </div>
  );
}
