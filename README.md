# 안심걸음 — 노인 낙상 위험 예측 서비스 (PWA)

Streamlit 프로토타입(`onebeaness/streamlit-slope`)을 **Next.js PWA + FastAPI** 구조로
재구축한 모노레포. 디자인 시스템(ansim-ui)과 IA는 프로토타입 정본을 따르고,
ML 모델·설문 문항은 **ML 확정본(2026-07-15, 팀원 배포용)** 을 채택했다.

```
[frontend/ — Next.js 15 PWA]  ──REST/JSON──▶  [backend/ — FastAPI]
   React 화면 8종 + ansim-ui                     ML 추론 (pkl 4종, 확정 threshold)
   manifest + Service Worker                     Tmap/V-World/기상청 프록시 (키 보호)
   상태: localStorage                            경사도 계산·날씨 조회
   (Supabase 전환 준비: supabase/schema.sql)
```

## 디렉토리

| 경로 | 내용 |
|---|---|
| `frontend/` | Next.js 15 (App Router, TypeScript) PWA. 지도는 Leaflet |
| `backend/` | FastAPI + ML 모델 서빙. 도커 불필요 — 순수 Python 앱 |
| `backend/models/` | ML 확정본 pkl 4종 + `model_utils.py` (predict/explain) |
| `supabase/schema.sql` | Supabase 전환용 스키마(프로필·진단 이력 + RLS). **아직 미연결** |

## 실행

### 백엔드 (Python 3.11)

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env      # TMAP_APP_KEY 등 입력
uvicorn app.main:app --reload --port 8000
```

- `GET /api/health` — 모델 로드·키 설정 상태
- `POST /api/assess/simple` · `POST /api/assess/precision` — `{answers, fall_experience}`
- `GET /api/poi?q=` · `POST /api/route` · `GET /api/weather?lat&lon&date`
- `GET /api/map/config` · `GET /api/map/tile/{layer}/{z}/{y}/{x}.png` (V-World 프록시)
- `GET /api/population/dong?adm_cd=` — SGIS 인구밀도·평균나이·노령화지수 (전국)
- `GET /api/population/floating?adm_cd=&date=` — 서울 생활인구(유동인구, 시간대별)

### 프론트엔드 (Node 20+)

```bash
cd frontend
npm install
cp .env.example .env.local   # NEXT_PUBLIC_API_BASE=http://localhost:8000
npm run dev                  # http://localhost:3000
```

## 화면 (IA.md 기준)

`/` 랜딩(분할형) → `/register` 간편 등록 → `/me` 진단 허브
→ `/me/simple` 간단 6문항 · `/me/precision` 정밀 42문항 · `/me/report` 보고서
→ `/me/route` 경사도 안전 경로(+날씨) · `/dashboard` B2G 대시보드(목업)

### 외부 데이터 연동

| 기능 | 소스 | 키 | 없을 때 |
|---|---|---|---|
| 인구밀도·평균나이·노령화지수 | SGIS 통계청 (`stats/population.json`) | `SGIS_CONSUMER_KEY/SECRET` ([발급](https://sgis.kostat.go.kr/developer)) | 대시보드에 시연용 목업 표시 |
| 유동인구(시간대별 생활인구) | 서울 열린데이터광장 `SPOP_LOCAL_RESD_DONG` | `SEOUL_OPENAPI_KEY` ([발급](https://data.seoul.go.kr)) — 서울 한정 | 〃 |
| 보안등 밀도(야간 조명) | 공공데이터포털 전국보안등정보표준데이터 | `DATA_GO_KR_KEY` ([활용신청](https://www.data.go.kr/data/15017320/standard.do)) | 안내 문구 표시 |
| 기상특보(대설·한파 등) | 기상청 API허브 `wrn_now_data` | `KWEATHER_API_KEY` (기존 날씨 키 재사용) | 배너 미표시 |
| 행정동 보행환경 위험도 | **팀 분석 산출물** `public/geo/seoul_dong_risk.geojson` (서울 427개 동, 경사·협소·재질) | **불필요** (번들 자산) | — |
| 로드뷰 | 카카오맵 URL 링크 (`map.kakao.com/link/roadview/…`) | **불필요** | — |

대시보드 지도는 행정동 choropleth(팀 분석 실데이터)이며, 동을 클릭하면
SGIS 인구지표·서울 생활인구·보안등 밀도가 연계 조회된다.
⚠️ 보안등 API의 지역 필터 컬럼명(`insttNm`)은 키 발급 후 실호출로 1회 검증 필요
(`backend/app/services/safety_lights.py` 주석 참고).

로드뷰는 경로 지도(구간·급경사·임의 지점 클릭)와 대시보드(위험 구간 표·마커 팝업)에서
새 탭으로 열린다. 임베드형이 필요하면 Kakao Maps JS SDK(appkey)로 교체 —
`frontend/src/lib/kakao.ts`가 교체 지점.

## ML 확정 사항 (2026-07-15 배포용 zip 반영)

- **threshold 확정**: 간략A 0.3 · 간략B 0.25 · 정밀A 0.4 · 정밀B 0.2
- **성별 인코딩 확정**: 남성=0, 여성=1
- **간략 6변수**: 외래진료 → **주관적 건강상태(1~5)** 로 교체
- **설문 42문항**: 공통 6 + 심층 36 (IADL 10문항 원점수 10~33, NSI DETERMINE 12문항)
- Model B(재발위험)는 **낙상 경험자에게만** 호출
- ⚠️ zip의 정밀 pkl은 kfrail 2변수(33변수) 버전 — `model_utils.py` 주석 참고.
  kfrail_cat 통합본 pkl 수령 시 `FEATURES_COMPLEX` 두 줄 + `fall_model.encode_complex`만 교체
- ⚠️ `walk_safety`는 학습 데이터가 1~5 척도인데 현행 매핑은 0/1 (ML 확정본 로직 유지) —
  보행환경 문항 추가 시 개선 지점

## 배포 (미정 — 배포중립 구성)

- **프론트**: Cloudflare Pages(`@opennextjs/cloudflare`) 또는 Vercel.
  환경변수 `NEXT_PUBLIC_API_BASE`에 백엔드 URL 지정
- **백엔드**: ML 스택(scikit-learn/lightgbm/shap)은 Cloudflare Workers에서 불가 —
  Render/Railway/Fly.io 등 Python 런타임에 배포. 시작 명령:
  `uvicorn app.main:app --host 0.0.0.0 --port $PORT` (루트 디렉토리 `backend/`)
  환경변수: `TMAP_APP_KEY`(필수), `VWORLD_API_KEY`·`KWEATHER_API_KEY`(선택), `CORS_ORIGINS`
- **Supabase**: 로그인·이력 저장 도입 시 `supabase/schema.sql` 적용 후
  `frontend/src/lib/storage.ts`의 `SupabaseStorage` 구현으로 교체

## PWA

- `public/manifest.json` (안심걸음, 아이콘 192/512/maskable, `#1E2761`/`#F2F5FB`)
- `public/sw.js` — 앱 셸 캐싱 + `/offline` 폴백. 문항 데이터는 번들에 포함되어
  오프라인 응답 가능, ML 결과 산출만 온라인 필요
- iOS 홈스크린 대응(apple-touch-icon, apple-mobile-web-app meta)

## 참고 자산 (저장소 밖)

- 팀원 배포용 zip: 데이터셋 CSV 2종, GIS geojson(행정동 폴리곤, 서울 상세 142MB) —
  B2G 대시보드 실데이터 연동 시 사용. 용량 문제로 저장소에는 미포함
