"use client";

/** 지도를 표시할 수 없을 때의 안내 패널 — 배경지도는 카카오맵 단독(OSM 미사용). */
import { hasKakaoKey } from "@/lib/kakaoMaps";

export function MapUnavailable({ height, reason }: { height: number; reason?: string }) {
  return (
    <div style={{
      height, borderRadius: 14, background: "var(--track)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: 8, padding: 24, textAlign: "center",
    }}>
      <div style={{ fontSize: 15, fontWeight: 800 }}>지도를 표시할 수 없습니다</div>
      <div style={{ fontSize: 13.5, lineHeight: 1.7, color: "var(--ink-muted)", maxWidth: 420 }}>
        {!hasKakaoKey ? (
          <>
            카카오맵 키가 설정되지 않았습니다.<br />
            빌드 환경변수 <b>NEXT_PUBLIC_KAKAO_MAP_KEY</b>에 카카오 JavaScript 키를 넣고,
            카카오 개발자 앱의 플랫폼 Web에 이 사이트 도메인을 등록한 뒤 재배포하세요.
          </>
        ) : (
          <>
            카카오맵 SDK를 불러오지 못했습니다{reason ? ` (${reason})` : ""}.<br />
            카카오 개발자 앱의 플랫폼 Web에 <b>이 사이트 도메인</b>이 등록되어 있는지,
            네트워크 상태를 확인해 주세요.
          </>
        )}
      </div>
    </div>
  );
}
