"use client";

/** 지도를 표시할 수 없을 때의 안내 패널 — 배경지도는 티맵 단독. */
import { hasTmapKey } from "@/lib/tmapMaps";

export function MapUnavailable({ height, reason }: { height: number; reason?: string }) {
  return (
    <div style={{
      height, borderRadius: 14, background: "var(--track)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: 8, padding: 24, textAlign: "center",
    }}>
      <div style={{ fontSize: 15, fontWeight: 800 }}>지도를 표시할 수 없습니다</div>
      <div style={{ fontSize: 13.5, lineHeight: 1.7, color: "var(--ink-muted)", maxWidth: 440 }}>
        {!hasTmapKey ? (
          <>
            티맵 지도 키가 설정되지 않았습니다.<br />
            빌드 환경변수 <b>NEXT_PUBLIC_TMAP_APP_KEY</b>에 티맵 JS API용 appKey를 넣고 재배포하세요.
            (백엔드 <b>TMAP_APP_KEY</b>와는 별도의 키를 쓰세요 — 브라우저에 노출됩니다.)
          </>
        ) : (
          <>
            티맵 지도 SDK를 불러오지 못했습니다{reason ? ` (${reason})` : ""}.<br />
            openapi.sk.com에서 해당 앱에 <b>이 사이트 도메인</b>이 등록되어 있는지,
            JavaScript 지도 서비스가 활성화되어 있는지 확인해 주세요.
          </>
        )}
      </div>
    </div>
  );
}
