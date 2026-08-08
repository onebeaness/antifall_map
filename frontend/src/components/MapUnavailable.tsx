"use client";

/** 지도를 표시할 수 없을 때의 안내 패널 — 배경지도는 티맵 단독.
 * 실패 사유를 그대로 보여주고, 원인별 조치를 한 줄로 안내한다. */

/** 실패 사유 → 사용자가 할 조치 */
function advice(reason: string): string {
  if (reason.includes("연결할 수 없습니다")) {
    return "백엔드 서버가 깨어나는 중일 수 있습니다(무료 플랜은 첫 요청이 느립니다). 잠시 후 다시 시도해 주세요.";
  }
  if (reason.includes("서버에 설정") || reason.includes("키 조회 실패")) {
    return "Render 환경변수 TMAP_JS_APP_KEY(없으면 TMAP_APP_KEY)를 확인해 주세요.";
  }
  if (reason.includes("SDK 주소를 알려주지")) {
    return "appKey가 거부되었을 수 있습니다. openapi.sk.com에서 해당 앱의 JavaScript 지도 API 사용 설정과 서비스 도메인 등록을 확인해 주세요.";
  }
  if (reason.includes("본체 로드 실패") || reason.includes("Tmapv2.Map이 준비되지")) {
    return "지도 SDK 배포 서버(topopentile*.tmap.co.kr) 접근이 막혔을 수 있습니다. 사내망·광고차단 확장 프로그램을 확인해 주세요.";
  }
  if (reason.includes("로더 로드 실패") || reason.includes("시간 초과")) {
    return "네트워크에서 apis.openapi.sk.com 접근이 막혔을 수 있습니다. 잠시 후 다시 시도해 주세요.";
  }
  return "잠시 후 다시 시도해 주세요.";
}

export function MapUnavailable({
  height, reason, onRetry,
}: { height: number; reason?: string; onRetry?: () => void }) {
  return (
    <div style={{
      height, borderRadius: 14, background: "var(--track)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: 10, padding: 24, textAlign: "center",
    }}>
      <div style={{ fontSize: 15, fontWeight: 800 }}>지도를 표시할 수 없습니다</div>
      <div style={{ fontSize: 13.5, lineHeight: 1.7, color: "var(--ink-muted)", maxWidth: 440 }}>
        {reason ? <><b>{reason}</b><br /></> : null}
        {advice(reason ?? "")}
      </div>
      {onRetry ? (
        <button type="button" onClick={onRetry} style={{
          marginTop: 4, padding: "9px 18px", borderRadius: 10,
          border: "1px solid var(--line)", background: "#fff",
          fontSize: 13.5, fontWeight: 700, cursor: "pointer",
        }}>다시 시도</button>
      ) : null}
    </div>
  );
}
