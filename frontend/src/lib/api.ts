/** 백엔드 API 클라이언트 — 프론트는 이 모듈을 통해서만 서버와 통신한다.
 * 모든 외부 API 키(Tmap/V-World/기상청)는 백엔드에만 존재한다 (HANDOFF 3절).
 */
import type {
  Answers, AssessResult, MapConfig, Poi, RouteResult, WeatherInfo,
} from "./types";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "") ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError(0, "서버에 연결할 수 없습니다. 네트워크 상태를 확인해 주세요.");
  }
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch { /* JSON 아님 — 상태코드 유지 */ }
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

export interface Health {
  status: string;
  ml_available: boolean;
  tmap_configured: boolean;
  vworld_configured: boolean;
  kweather_configured: boolean;
}

export const getHealth = () => request<Health>("/api/health");

export const assessSimple = (answers: Answers, fallExperience: boolean) =>
  request<AssessResult>("/api/assess/simple", {
    method: "POST",
    body: JSON.stringify({ answers, fall_experience: fallExperience }),
  });

export const assessPrecision = (answers: Answers, fallExperience: boolean) =>
  request<AssessResult>("/api/assess/precision", {
    method: "POST",
    body: JSON.stringify({ answers, fall_experience: fallExperience }),
  });

export const searchPoi = (q: string) =>
  request<Poi[]>(`/api/poi?q=${encodeURIComponent(q)}`);

export const analyzeRoute = (
  start: Poi, end: Poi, mode: "pedestrian" | "car", intervalM = 30,
) =>
  request<RouteResult>("/api/route", {
    method: "POST",
    body: JSON.stringify({
      start: { name: start.name, lat: start.lat, lon: start.lon },
      end: { name: end.name, lat: end.lat, lon: end.lon },
      mode,
      interval_m: intervalM,
    }),
  });

export const getWeather = (lat: number, lon: number, date: string) =>
  request<WeatherInfo>(`/api/weather?lat=${lat}&lon=${lon}&date=${date}`);

export const getMapConfig = () => request<MapConfig>("/api/map/config");

/** 프록시 타일 URL을 절대 주소로 변환 (V-World 프록시는 백엔드 기준 상대경로) */
export const resolveTileUrl = (cfg: MapConfig): string =>
  cfg.tile_url.startsWith("/") ? `${API_BASE}${cfg.tile_url}` : cfg.tile_url;
