# 낙지도 — 노인 낙상 위험 예측 서비스 (PWA)

Streamlit 프로토타입(`onebeaness/streamlit-slope`)을 **Next.js PWA + FastAPI** 구조로
재구축한 모노레포. 디자인 시스템(ansim-ui)과 IA는 프로토타입 정본을 따르고,
ML 모델·설문 문항은 **ML 확정본(2026-07-15, 팀원 배포용)** 을 채택했다.

```
[frontend/ — Next.js 15 PWA]  ──REST/JSON──▶  [backend/ — FastAPI]
   React 화면 8종 + ansim-ui                     ML 추론 (pkl 4종, 확정 threshold)
   manifest + Service Worker                     Tmap/기상청/SGIS 등 키 보호 프록시
   상태: localStorage                            경사도 계산·날씨 조회
   (Supabase 전환 준비: supabase/schema.sql)
```

## 디렉토리

| 경로 | 내용 |
|---|---|
| `frontend/` | Next.js 15 (App Router, TypeScript) PWA. 지도는 티맵 JS API |
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
- `GET /api/population/dong?adm_cd=` — SGIS 인구밀도·평균나이·노령화지수 (전국)
- `GET /api/population/floating?adm_cd=&date=` — 서울 생활인구(유동인구, 시간대별)
- `GET /api/population/floating/citywide?date=` — 서울 전역 일평균 생활인구 (효과 랭킹용)
- `GET /api/safety/lights?lat=&lon=` · `GET /api/weather/warnings` — 보안등 밀도 · 기상특보

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
→ `/me/route` 경사도 안전 경로(+날씨·특보) · `/dashboard` B2G 대시보드

### 외부 데이터 연동

**목업 데이터는 사용하지 않는다.** 모든 지표는 실데이터이며, 조회에 실패하면
값을 지어내지 않고 그 사실을 화면에 밝힌다.

| 기능 | 소스 | 키 | 없을 때 |
|---|---|---|---|
| **배경지도** (경로·대시보드) | 티맵 JS API v2 | `NEXT_PUBLIC_TMAP_APP_KEY` (**백엔드 키와 별도**, 프론트 빌드 변수) | 지도 자리에 설정 안내 패널 |
| 인구밀도·평균나이·노령화지수 | SGIS 통계청 (`stats/population.json`) | `SGIS_CONSUMER_KEY/SECRET` ([발급](https://sgis.kostat.go.kr/developer)) | "자료 없음" 표시 |
| 유동인구(시간대별·전역 일평균) | 서울 열린데이터광장 `SPOP_LOCAL_RESD_DONG` | `SEOUL_OPENAPI_KEY` ([발급](https://data.seoul.go.kr)) — 서울 한정 | 효과 랭킹 미표시 |
| 보안등 밀도(야간 조명) | 공공데이터포털 전국보안등정보표준데이터 | `DATA_GO_KR_KEY` ([활용신청](https://www.data.go.kr/data/15017320/standard.do)) | 안내 문구 표시 |
| 기상특보(대설·한파 등) | 기상청 API허브 `wrn_now_data` | `KWEATHER_API_KEY` (기존 날씨 키 재사용) | 배너 미표시 |
| 행정동 보행환경 위험도 | **자체 분석 산출물** `public/geo/seoul_dong_risk.geojson` (서울 427개 동, 경사·협소·재질) | **불필요** (번들 자산) | — |
| 로드뷰 | 카카오맵 URL 링크 (`map.kakao.com/link/roadview/…`) | **불필요** | — |

### 티맵 지도 키 (배경지도 필수)

1. [openapi.sk.com](https://openapi.sk.com) → **새 앱 생성** (백엔드용 앱과 별도)
2. 그 앱의 appKey를 복사하고, 앱 설정에 서비스 도메인(`http://localhost:3000`, 배포 주소) 등록
3. 프론트 빌드 환경변수 `NEXT_PUBLIC_TMAP_APP_KEY`에 넣고 **재배포** (빌드 시점 주입)

⚠️ **백엔드의 `TMAP_APP_KEY`를 그대로 쓰지 말 것.** 프론트 변수는 브라우저 번들에
노출되므로, 백엔드 키를 넣으면 제3자가 그 키로 경로·POI API를 호출해 할당량을
소진시킬 수 있다. 지도용 앱을 따로 만들어 키를 분리한다.

### 대시보드 구성

행정동 choropleth(자체 분석) → 동 클릭 시 위험 프로필·보안등·인구·생활인구 연계 조회 →
**투입 효과 기대 지역** 랭킹(위험도 × 일평균 유동인구)으로 정비 우선순위를 제시한다.

⚠️ 보안등 API의 지역 필터 컬럼명(`insttNm`)은 키 발급 후 실호출로 1회 검증 필요
(`backend/app/services/safety_lights.py` 주석 참고).

로드뷰는 경로 지도(구간·급경사·임의 지점 클릭)와 대시보드(위험 상위 표·효과 랭킹)에서
새 탭으로 열린다 — `frontend/src/lib/kakao.ts`.

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

## 배포

전체 절차는 `DEPLOY.md` 참고.

- **프론트**: 정적 내보내기(`output: "export"`)라 Cloudflare Pages·Vercel에 어댑터 없이 배포.
  빌드 출력 `out`, 환경변수 `NEXT_PUBLIC_API_BASE`·`NEXT_PUBLIC_TMAP_APP_KEY`
- **백엔드**: ML 스택(scikit-learn/lightgbm/shap)은 Cloudflare Workers에서 불가 —
  Render/Railway/Fly.io 등 Python 런타임에 배포. 시작 명령:
  `uvicorn app.main:app --host 0.0.0.0 --port $PORT` (루트 디렉토리 `backend/`)
  환경변수: `TMAP_APP_KEY`(필수), `KWEATHER_API_KEY`·`SGIS_*`·`SEOUL_OPENAPI_KEY`·
  `DATA_GO_KR_KEY`·`VWORLD_API_KEY`(선택), `CORS_ORIGINS`
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
