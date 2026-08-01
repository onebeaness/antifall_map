"use client";

/** 경사도 안전 경로 (IA.md 2.7) — Tmap POI 검색 → 경로 → 30m 리샘플링 →
 * 고도 → 구간 경사도(%) + 이동 날짜 날씨 카드. 모든 외부 API는 백엔드 프록시. */
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, KpiCard, NoticeStrip, TextField } from "@/components/ui";
import { ElevationProfile } from "@/components/charts/ElevationProfile";
import { SlopeBars } from "@/components/charts/SlopeBars";
import { analyzeRoute, getMapConfig, getWeather, resolveTileUrl, searchPoi } from "@/lib/api";
import { SLOPE_COLORS, SLOPE_LABELS } from "@/lib/geo";
import type { MapConfig, Poi, RouteResult, WeatherInfo } from "@/lib/types";

const RouteMap = dynamic(() => import("@/components/RouteMap"), { ssr: false });

const RISK_COLOR = { danger: "var(--danger)", warn: "var(--warn)", good: "var(--good)" } as const;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** POI 검색 + 선택 */
function PoiPicker({ label, selected, onSelect }: {
  label: string;
  selected: Poi | null;
  onSelect: (p: Poi | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Poi[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await searchPoi(query.trim());
      setResults(r);
      if (r.length === 0) setError("검색 결과가 없습니다.");
    } catch (e) {
      setResults([]);
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  };

  return (
    <Card style={{ padding: 18 }}>
      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>{label}</div>
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <TextField placeholder="장소명 또는 주소 (예: 서울역)" value={query}
                     onChange={(e) => setQuery(e.target.value)}
                     onKeyDown={(e) => e.key === "Enter" && search()} />
        </div>
        <Button onClick={search} disabled={busy || !query.trim()} style={{ minHeight: 56 }}>
          {busy ? "..." : "검색"}
        </Button>
      </div>
      {error && <div style={{ fontSize: 13, color: "var(--danger)", marginTop: 8 }}>{error}</div>}
      {results.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
          {results.map((p, i) => {
            const sel = selected != null && selected.lat === p.lat && selected.lon === p.lon;
            return (
              <button key={i} onClick={() => onSelect(sel ? null : p)}
                      style={{
                        textAlign: "left", padding: "10px 12px", borderRadius: 10, cursor: "pointer",
                        fontFamily: "inherit", fontSize: 14,
                        border: sel ? "2px solid var(--gov-navy)" : "1.5px solid var(--line)",
                        background: sel ? "#f3f5fc" : "#fff",
                        fontWeight: sel ? 700 : 500,
                      }}>
                {p.name} <span style={{ color: "var(--ink-muted)", fontSize: 12.5 }}>{p.address}</span>
              </button>
            );
          })}
        </div>
      )}
      {selected && (
        <div style={{ fontSize: 13, color: "var(--good)", fontWeight: 700, marginTop: 8 }}>
          선택됨: {selected.name}
        </div>
      )}
    </Card>
  );
}

export default function RoutePage() {
  const router = useRouter();
  const [start, setStart] = useState<Poi | null>(null);
  const [end, setEnd] = useState<Poi | null>(null);
  const [mode, setMode] = useState<"pedestrian" | "car">("pedestrian");
  const [date, setDate] = useState(todayISO());
  const [result, setResult] = useState<RouteResult | null>(null);
  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [mapCfg, setMapCfg] = useState<MapConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMapConfig().then(setMapCfg).catch(() =>
      setMapCfg({
        provider: "osm",
        tile_url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        attribution: "© OpenStreetMap contributors",
        max_zoom: 19,
      }));
  }, []);

  // 출발지·날짜가 정해지면 날씨 자동 조회 (원본 동작)
  const fetchWeather = useCallback(async () => {
    if (!start) { setWeather(null); return; }
    setWeatherError(null);
    try {
      setWeather(await getWeather(start.lat, start.lon, date));
    } catch (e) {
      setWeather(null);
      setWeatherError(e instanceof Error ? e.message : String(e));
    }
  }, [start, date]);

  useEffect(() => { fetchWeather(); }, [fetchWeather]);

  const analyze = async () => {
    if (!start || !end) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await analyzeRoute(start, end, mode, 30));
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  };

  const absSlopes = result ? result.slopes.map((s) => Math.abs(s)) : [];

  return (
    <main className="container">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.3px" }}>경로 경사도 히트맵</div>
          <div style={{ fontSize: 13.5, color: "var(--ink-muted)", marginTop: 4 }}>
            경로를 검색하면 30m 간격 고도 데이터로 구간별 경사도를 계산해 지도에 표시합니다.
          </div>
        </div>
        <Button variant="ghost" onClick={() => router.push("/me")} style={{ minHeight: 44, fontSize: 14 }}>
          ← 종합 진단으로
        </Button>
      </div>

      <div style={{ height: 16 }} />

      {/* 검색 + 옵션 */}
      <div className="hub-grid">
        <PoiPicker label="출발지" selected={start} onSelect={setStart} />
        <PoiPicker label="도착지" selected={end} onSelect={setEnd} />
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 14 }}>
        <div style={{ display: "flex", gap: 8 }}>
          {(["pedestrian", "car"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)}
                    style={{
                      minHeight: 46, padding: "0 18px", borderRadius: 12, cursor: "pointer",
                      fontFamily: "inherit", fontSize: 15, fontWeight: 700,
                      border: mode === m ? "2px solid var(--gov-navy)" : "1.5px solid var(--line)",
                      background: mode === m ? "#f3f5fc" : "#fff",
                      color: mode === m ? "var(--gov-navy)" : "var(--ink)",
                    }}>
              {m === "pedestrian" ? "보행자 경로" : "자동차 경로"}
            </button>
          ))}
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700 }}>
          이동 날짜
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                 style={{
                   minHeight: 46, border: "1.5px solid var(--line)", borderRadius: 12,
                   padding: "0 12px", fontFamily: "inherit", fontSize: 15,
                 }} />
        </label>
        <div style={{ flex: 1, minWidth: 180 }}>
          <Button fullWidth disabled={!start || !end || busy} onClick={analyze}>
            {busy ? "경로 검색·고도 조회 중... (수십 초 걸릴 수 있어요)" : "경로 경사도 분석"}
          </Button>
        </div>
      </div>

      {error && (
        <Card style={{ marginTop: 14, padding: "14px 18px", borderLeft: "5px solid var(--danger)" }}>
          <span style={{ fontSize: 14, color: "var(--danger)", fontWeight: 600 }}>분석 실패: {error}</span>
        </Card>
      )}

      {/* 날씨 카드 */}
      {weather && (
        <Card style={{
          marginTop: 14, padding: "16px 20px",
          borderLeft: `5px solid ${RISK_COLOR[weather.risk_level]}`,
        }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 22 }}>
            <div>
              <div style={{ fontSize: 13, color: "var(--ink-muted)" }}>
                {weather.date} · {start?.name} 기준 날씨 {weather.is_past ? "과거 기록" : "예보"} · {weather.source}
              </div>
              <div style={{ fontSize: 21, fontWeight: 800, marginTop: 2 }}>{weather.description}</div>
            </div>
            <div>
              <div style={{ fontSize: 13, color: "var(--ink-muted)" }}>기온</div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>
                {weather.t_min?.toFixed(0)}° / {weather.t_max?.toFixed(0)}°
              </div>
            </div>
            <div>
              <div style={{ fontSize: 13, color: "var(--ink-muted)" }}>강수량</div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{weather.precipitation_mm?.toFixed(1)}mm</div>
            </div>
            <div>
              {weather.precipitation_prob != null ? (
                <>
                  <div style={{ fontSize: 13, color: "var(--ink-muted)" }}>강수 확률</div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{weather.precipitation_prob.toFixed(0)}%</div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 13, color: "var(--ink-muted)" }}>최대 바람</div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{weather.wind_max_kmh?.toFixed(0)}km/h</div>
                </>
              )}
            </div>
            <div style={{
              flex: 1, minWidth: 240, display: "flex", alignItems: "center", gap: 9,
              fontSize: 14.5, fontWeight: 700, color: RISK_COLOR[weather.risk_level],
            }}>
              <span style={{
                width: 10, height: 10, borderRadius: "50%",
                background: RISK_COLOR[weather.risk_level], flex: "none",
              }} />
              {weather.advice}
            </div>
          </div>
        </Card>
      )}
      {weatherError && start && (
        <div style={{ fontSize: 13, color: "var(--ink-muted)", marginTop: 8 }}>
          날씨 정보를 불러오지 못했습니다: {weatherError}
        </div>
      )}

      {/* 분석 결과 */}
      {result && mapCfg && (
        <>
          <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            <KpiCard value={`${(result.total_distance_m / 1000).toFixed(2)} km`} label="총 거리" />
            <KpiCard value={`${(result.total_time_s / 60).toFixed(0)} 분`} label="예상 시간" />
            <KpiCard value={`${(absSlopes.reduce((s, v) => s + v, 0) / absSlopes.length).toFixed(1)} %`}
                     label="평균 경사도" tone="blue" />
            <KpiCard value={`${Math.max(...absSlopes).toFixed(1)} %`} label="최대 경사도"
                     tone={Math.max(...absSlopes) >= 9 ? "danger" : Math.max(...absSlopes) >= 6 ? "warn" : "good"} />
          </div>

          <div className="route-grid" style={{ marginTop: 16 }}>
            <Card style={{ padding: 14 }}>
              <RouteMap
                points={result.points}
                slopes={result.slopes}
                elevations={result.elevations}
                startName={start?.name ?? "출발지"}
                endName={end?.name ?? "도착지"}
                tileUrl={resolveTileUrl(mapCfg)}
                attribution={mapCfg.attribution}
                maxZoom={mapCfg.max_zoom}
              />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12, alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 800 }}>경사도 범례</span>
                {SLOPE_COLORS.map((c, i) => (
                  <span key={c} style={{
                    background: c, padding: "2px 8px", borderRadius: 4,
                    color: "#222", fontSize: 12,
                  }}>{SLOPE_LABELS[i]}</span>
                ))}
              </div>
            </Card>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Card style={{ padding: 18 }}>
                <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>고도 프로파일</div>
                <ElevationProfile distances={result.distances} elevations={result.elevations} />
              </Card>
              <Card style={{ padding: 18 }}>
                <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>
                  구간별 경사도 (+오르막 / −내리막)
                </div>
                <SlopeBars distances={result.distances} slopes={result.slopes} />
              </Card>
              <Card style={{ padding: 18 }}>
                <details>
                  <summary style={{ fontSize: 14, fontWeight: 800, cursor: "pointer" }}>구간 데이터</summary>
                  <div style={{ maxHeight: 240, overflow: "auto", marginTop: 10 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ color: "var(--ink-muted)", textAlign: "right" }}>
                          <th style={{ padding: "4px 8px", textAlign: "right" }}>누적거리 (m)</th>
                          <th style={{ padding: "4px 8px", textAlign: "right" }}>고도 (m)</th>
                          <th style={{ padding: "4px 8px", textAlign: "right" }}>경사도 (%)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.slopes.map((s, i) => (
                          <tr key={i} style={{ borderTop: "1px solid var(--track)", textAlign: "right" }}>
                            <td style={{ padding: "4px 8px" }}>{Math.round(result.distances[i + 1])}</td>
                            <td style={{ padding: "4px 8px" }}>{result.elevations[i + 1].toFixed(1)}</td>
                            <td style={{ padding: "4px 8px", fontWeight: 700 }}>{s.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </Card>
            </div>
          </div>
        </>
      )}

      {!result && (
        <Card style={{ marginTop: 16, padding: "18px 22px" }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, marginBottom: 8 }}>사용 방법</div>
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.9, color: "var(--ink-muted)" }}>
            <li>출발지·도착지를 검색해서 선택</li>
            <li>이동 날짜를 고르면 해당 날짜의 날씨와 보행 위험 등급을 함께 보여드려요</li>
            <li><b style={{ color: "var(--ink)" }}>경로 경사도 분석</b> 버튼 클릭</li>
          </ol>
        </Card>
      )}

      <div style={{ height: 24 }} />
      <NoticeStrip />
    </main>
  );
}
