# 배포 가이드

백엔드(FastAPI + ML)와 프론트엔드(Next.js PWA)를 따로 배포한다.
로컬 개발 환경 없이 웹 대시보드만으로 진행할 수 있다.

```
[Cloudflare Pages / Vercel]  ──HTTPS──▶  [Render / HF Spaces]
   Next.js PWA                              FastAPI + ML 모델
   NEXT_PUBLIC_API_BASE ────────────────▶   외부 API 키 보관
```

---

## 1. 백엔드 — Render

### 1-1. 배포

1. [render.com](https://render.com) 가입 → GitHub 연동
2. **New → Blueprint** → 이 저장소 선택 → 브랜치 `claude/streamlit-nextjs-pwa-rebuild-kyn98o`
3. 저장소 루트의 `render.yaml`을 자동으로 읽어 서비스가 생성된다
4. **Environment** 탭에서 키 입력 (`.env`에 넣었던 값 그대로):

   | 키 | 필수 | 없으면 |
   |---|---|---|
   | `TMAP_APP_KEY` | ★ | 경로·POI 기능 정지 |
   | `KWEATHER_API_KEY` | | Open-Meteo 폴백, 특보 미표시 |
   | `VWORLD_API_KEY` | | OSM 배경지도로 폴백 |
   | `SGIS_CONSUMER_KEY` / `SGIS_CONSUMER_SECRET` | | 인구지표 목업 표시 |
   | `SEOUL_OPENAPI_KEY` | | 생활인구 목업 표시 |
   | `DATA_GO_KR_KEY` | | 보안등 밀도 미표시 |

5. 첫 배포는 5~10분 (ML 패키지 설치). 완료되면 `https://ansim-api-xxxx.onrender.com` 형태의 URL이 나온다

### 1-2. 확인

```
https://<백엔드URL>/api/health     ← 키 설정 상태
https://<백엔드URL>/docs           ← 전체 API 테스트 UI
```

`ml_available: true`, 설정한 키들이 `*_configured: true`면 정상.

### 1-3. 무료 플랜 주의

15분간 요청이 없으면 인스턴스가 잠들고, 다음 첫 요청이 **1분 안팎** 걸린다.
- **시연 전 20분 안에 한 번 호출해서 깨워두면** 그 뒤로는 빠르다
- 상시 가동이 필요하면 `render.yaml`의 `plan: free` → `plan: starter` ($7/월)

메모리는 모델 4개 + SHAP 추론까지 최대 약 277MB로, 무료 플랜(512MB) 안에 들어간다.

---

## 2. 프론트엔드 — Cloudflare Pages

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages → Create → Pages** → GitHub 연동
2. 저장소·브랜치 선택 후 빌드 설정:

   | 항목 | 값 |
   |---|---|
   | Framework preset | Next.js |
   | Root directory | `frontend` |
   | Build command | `npm run build` |
   | Build output | `.next` |

3. **Environment variables**에 백엔드 주소 등록:
   ```
   NEXT_PUBLIC_API_BASE = https://<1단계에서 받은 백엔드 URL>
   ```
4. 배포 완료 후 나온 `https://xxxx.pages.dev` 주소를 **Render의 `CORS_ORIGINS`에 추가**하고 백엔드를 재배포한다 (이 단계를 빠뜨리면 브라우저가 API 호출을 차단한다)

> Vercel도 동일하다 — Root Directory `frontend`, 환경변수 `NEXT_PUBLIC_API_BASE` 하나.

---

## 3. 대안: Hugging Face Spaces (무료·16GB)

Render 무료의 cold start가 부담되면 백엔드만 옮길 수 있다. 코드 변경은 없다.

1. [huggingface.co/new-space](https://huggingface.co/new-space) → SDK **Docker** 선택
2. 저장소의 `backend/` 내용을 Space에 올리고 `Dockerfile` 추가:
   ```dockerfile
   FROM python:3.12-slim
   WORKDIR /app
   COPY requirements.txt .
   RUN pip install --no-cache-dir -r requirements.txt
   COPY . .
   CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]
   ```
3. Space **Settings → Variables and secrets**에 키 입력
4. 프론트의 `NEXT_PUBLIC_API_BASE`를 Space URL로 교체

---

## 4. 배포 후 점검

- [ ] `/api/health` — `ml_available: true`, 키 상태 확인
- [ ] `/docs`에서 `/api/assess/simple` 실행 → 확률 반환되는지
- [ ] 프론트에서 진단 완료 → 결과 화면에 AI 판정이 뜨는지
- [ ] 경로 화면에서 장소 검색 → 경사도 분석 (10~30초 소요)
- [ ] 대시보드 → 행정동 지도 표시, 동 클릭 시 인구 연계 조회

### 자주 겪는 문제

| 증상 | 원인 | 해결 |
|---|---|---|
| 프론트에서 API 호출 실패 (CORS) | `CORS_ORIGINS`에 프론트 도메인 없음 | Render 환경변수에 추가 후 재배포 |
| 첫 요청만 매우 느림 | 무료 플랜 sleep | 정상. 미리 깨우거나 유료 전환 |
| `ml_available: false` | 모델 로드 실패 | Render 로그에서 `ml_error` 확인 |
| 지도 타일 안 보임 | V-World 도메인 검증 | 인증키 사용URL에 배포 도메인 추가 |
| 500 오류 (메모리) | 동시 요청 과다 | 무료 512MB 한계. 유료 전환 또는 HF Spaces |
