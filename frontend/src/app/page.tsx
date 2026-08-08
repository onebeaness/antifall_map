"use client";

/** 랜딩 — 확정안 1b: 풀스크린 분할형 (IA.md 2.1, 정본: 랜딩 화면.dc.html). */
import { useRouter } from "next/navigation";
import { Button, HeaderBar, NoticeStrip } from "@/components/ui";
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
      <HeaderBar title="낙지도 — 어르신 낙상 예방 서비스" />

      <div className="split" style={{ flex: 1 }}>
        {/* 좌: 시민 · 개인용 (네이비) */}
        <section style={{ background: "var(--gov-navy)", padding: "56px 48px", color: "#fff" }}>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "1.5px", color: "#9fb0e6", marginBottom: 14 }}>
            시민 · 개인용
          </div>
          <h1 style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.5px", margin: "0 0 14px", lineHeight: 1.35 }}>
            천천히, 편안하게<br />건강 상태를 함께 살펴볼게요.
          </h1>
          <p style={{ fontSize: 16, lineHeight: 1.7, color: "#cfd6ee", margin: "0 0 26px" }}>
            낙상은 어르신 안전사고의 가장 큰 원인이지만,
            미리 알면 상당 부분 막을 수 있습니다.
            건강 상태와 다니시는 길의 경사를 함께 살펴보고,
            무엇을 조심하면 좋을지 알려드립니다.
          </p>
          <p style={{ fontSize: 15, lineHeight: 1.7, color: "#9fb0e6", margin: "0 0 26px" }}>
            정답을 맞히는 검사가 아닙니다.
            평소 생활과 가장 가까운 답을 골라주시면 됩니다.
          </p>
          <Bullet color="var(--good)" text="간편 확인" sub="6문항 · 약 2분" />
          <Bullet color="var(--warn)" text="심층 확인" sub="42문항 · 약 8~10분" />
          <Bullet color="var(--danger)" text="보행 경로 안내" sub="경사가 낮은 길로" />
          <div style={{ marginTop: 26 }}>
            <Button variant="white" size="lg" onClick={goPersonal}>
              개인용 시작하기 →
            </Button>
          </div>
        </section>

        {/* 우: 기관 · 지자체용 (슬레이트) */}
        <section style={{ background: "var(--bg-slate)", borderLeft: "1px solid var(--line)", padding: "56px 48px" }}>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "1.5px", color: "var(--medical-blue)", marginBottom: 14 }}>
            기관 · 지자체용
          </div>
          <h2 style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.5px", margin: "0 0 14px", lineHeight: 1.35 }}>
            지역 안전 현황
          </h2>
          <p style={{ fontSize: 16, lineHeight: 1.7, color: "var(--ink-muted)", margin: "0 0 26px" }}>
            보행로 137,805개 지점의 경사를 실측해 위험 구간을 찾고,
            유동인구를 겹쳐 어디부터 정비하면 효과가 큰지 제시합니다.
            자치구에서 행정동까지 좁혀 가며 살펴볼 수 있습니다.
          </p>
          <Bullet color="var(--medical-blue)" text="보행 경사위험도" sub="자치구 25개 · 행정동 421개" />
          <Bullet color="var(--warn)" text="인구·생활인구 연계" sub="통계청 · 서울 열린데이터" />
          <Bullet color="var(--danger)" text="투입 효과 기대 지역" sub="위험도 × 유동인구" />
          <div style={{ marginTop: 26 }}>
            <Button variant="blue" size="lg" onClick={() => router.push("/dashboard")}>
              기관용 살펴보기 →
            </Button>
          </div>
        </section>
      </div>

      <NoticeStrip />
    </div>
  );
}
