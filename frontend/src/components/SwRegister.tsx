"use client";

import { useEffect } from "react";

/** 서비스 워커 등록 — 프로덕션에서만 (dev는 HMR과 충돌). */
export function SwRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* 등록 실패는 치명적이지 않음 — 일반 웹으로 동작 */
    });
  }, []);
  return null;
}
