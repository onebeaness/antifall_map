import { Card } from "@/components/ui";

/** 오프라인 폴백 화면 — 서비스 워커가 내비게이션 실패 시 보여준다. */
export default function OfflinePage() {
  return (
    <main className="container" style={{ display: "flex", justifyContent: "center", paddingTop: 80 }}>
      <Card variant="question" style={{ textAlign: "center" }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12, background: "var(--gov-navy)", color: "#fff",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          fontSize: 20, fontWeight: 800, marginBottom: 14,
        }}>안</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.5px", margin: "0 0 10px" }}>
          네트워크 연결이 필요합니다
        </h1>
        <p style={{ fontSize: 15.5, lineHeight: 1.65, color: "var(--ink-muted)", margin: 0 }}>
          지금은 인터넷에 연결되어 있지 않아요.<br />
          이미 열어 본 화면과 진단 문항은 계속 볼 수 있지만,<br />
          AI 분석 결과 산출과 지도·날씨 조회에는 연결이 필요합니다.
        </p>
      </Card>
    </main>
  );
}
