"use client";

/** 경사도 안전 경로 (IA.md 2.7) — Tmap POI 검색 → 경로 → 30m 리샘플링 →
 * 고도 → 구간 경사도(%) + 이동 날짜 날씨 카드. 모든 외부 API는 백엔드 프록시. */
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, KpiCard, NoticeStrip, TextField } from "@/components/ui";
import { ElevationProfile } from "@/components/charts/ElevationProfile";
import { SlopeBars } from "@/components/charts/SlopeBars";
import {
  analyzeRoute, getWeather, getWeatherWarnings, searchPoi,
} from "@/lib/api";
import { SLOPE_COLORS, SLOPE_LABELS } from "@/lib/geo";
import type { Poi, RouteResult, WeatherInfo, WeatherWarning } from "@/lib/types";

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
  // 정적 내보내기에서는 HTML이 빌드 시점에 만들어진다. 여기서 오늘 날짜를 바로
  // 넣으면 '빌드한 날'이 HTML에 박혀 hydration 불일치가 생기므로, 마운트 후 채운다.
  const [date, setDate] = useState("");
  useEffect(() => { setDate((d) => d || todayISO()); }, []);
  const [result, setResult] = useState<RouteResult | null>(null);
  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<WeatherWarning[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // 발효 중 기상특보 — 출발지 주소의 시·도 단위로 필터. 키 없으면(503) 조용히 생략.
  useEffect(() => {
    if (!start) { setWarnings([]); return; }
    const region = (start.address || "").split(" ")[0] || undefined;
    getWeatherWarnings(region)
      .then((r) => setWarnings(r.warnings))
      .catch(() => setWarnings([]));
  }, [start]);

  const analyze = async () => {
    if (!start || !end) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await analyzeRoute(start, end, 30));
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
            경로를 검색하면 서울 보행로 137,805개 지점의 실측 경사를 붙여 구간별로 표시합니다.
          </div>
        </div>
        <Button variant="ghost" onClick={() => router.push("/me")} style={{ minHeight: 44, fontSize: 14 }}>
          ← 종합 확인으로
        </Button>
      </div>

      <div style={{ height: 16 }} />

      {/* 검색 + 옵션 */}
      <div className="hub-grid">
        <PoiPicker label="출발지" selected={start} onSelect={setStart} />
        <PoiPicker label="도착지" selected={end} onSelect={setEnd} />
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 14 }}>
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
            {busy ? "경로 검색·경사 분석 중..." : "경로 경사도 분석"}
          </Button>
        </div>
      </div>

      {error && (
        <Card style={{ marginTop: 14, padding: "14px 18px", borderLeft: "5px solid var(--danger)" }}>
          <span style={{ fontSize: 14, color: "var(--danger)", fontWeight: 600 }}>분석 실패: {error}</span>
        </Card>
      )}

      {/* 발효 중 기상특보 배너 — 대설·한파는 낙상 직접 위험 */}
      {warnings.length > 0 && (
        <Card style={{
          marginTop: 14, padding: "13px 18px",
          borderLeft: `5px solid ${warnings.some((w) => w.relevance === "danger") ? "var(--danger)" : "var(--warn)"}`,
          background: warnings.some((w) => w.relevance === "danger") ? "rgba(214,69,69,.05)" : "rgba(224,168,0,.06)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13.5, fontWeight: 800 }}>기상특보 발효 중</span>
            {warnings.slice(0, 4).map((w, i) => (
              <span key={i} style={{
                display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700,
                padding: "3px 10px", borderRadius: 14,
                color: w.relevance === "danger" ? "var(--danger)" : "var(--warn)",
                background: w.relevance === "danger" ? "rgba(214,69,69,.12)" : "rgba(224,168,0,.14)",
              }}>
                {w.region} {w.type}{w.level_name}
              </span>
            ))}
            <span style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>
              {warnings.some((w) => w.type_code === "S" || w.type_code === "C")
                ? "결빙·미끄럼 위험이 큽니다 — 외출을 미루거나 급경사 구간을 피하세요."
                : "보행 시 주의가 필요합니다."}
            </span>
          </div>
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
      {result && (
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
              />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12, alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 800 }}>경사도 범례</span>
                {SLOPE_COLORS.map((c, i) => (
                  <span key={c} style={{
                    background: c, padding: "2px 8px", borderRadius: 4,
                    color: "#222", fontSize: 12,
                  }}>{SLOPE_LABELS[i]}</span>
                ))}
                <span style={{
                  background: "#d7191c", color: "#fff", padding: "2px 10px",
                  borderRadius: 999, fontSize: 12, fontWeight: 800,
                }}>↑12%</span>
                <span style={{ fontSize: 12, color: "var(--ink-muted)" }}>
                  9% 넘는 구간의 최고 지점 (↑오르막 ↓내리막)
                </span>
              </div>
              <div style={{ fontSize: 13, color: "var(--ink-muted)", marginTop: 8, lineHeight: 1.65 }}>
                경로 구간·급경사 라벨·지도의 아무 지점이나 클릭하면 <b>카카오 로드뷰</b>로
                실제 도로 상태(계단·경사·노면)를 확인할 수 있습니다.<br />
                {result.slope_source === "walkway" ? (
                  <>경사는 서울 보행로 {result.matched_points}개 지점의 <b>실측값</b>입니다
                    — 길 위에서 잰 값이라 옆 건물·비탈의 영향을 받지 않습니다.</>
                ) : (
                  <>서울 밖 구간이라 위성 고도모델(SRTM 30m)로 추정했습니다
                    — 도심에서는 건물 높이가 섞여 실제보다 가파르게 나올 수 있습니다.</>
                )}
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
