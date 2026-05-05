# Holy-Order 배포 가이드 (Vercel + Railway)

이 문서는 Holy-Order 시스템을 실제 운영 환경으로 배포하기 위한 A-Z 가이드입니다. 

---

## 1. CI/CD 파이프라인 및 브랜치 전략
GitHub 저장소와 배포 플랫폼(Vercel, Railway)을 연동하여, 코드 푸시가 곧 자동 빌드와 무중단 배포로 이어지는 과정을 구축합니다.

### 🌿 브랜치 분리 전략
*   **`main`**: 실제 운영 서버와 연결됩니다. 충분히 검증된 코드만 병합(Merge)하며, 이 브랜치에 코드가 푸시되면 자동으로 운영 서버 배포가 진행됩니다.
*   **`develop` / `feature/*`**: 기능 개발 및 안티그래비티와의 협업용 브랜치입니다. 이곳에서 안전하게 테스트한 뒤 `main`으로 PR을 보냅니다.

---

## 2. 사전 준비사항 (Prerequisites)

1. **배포 플랫폼 계정 생성**: [Vercel](https://vercel.com/) (프론트엔드용), [Railway](https://railway.app/) (백엔드 및 DB용)
2. **미디어 스토리지 계정**: [Cloudinary](https://cloudinary.com/) 계정 가입
3. **Cloudinary Upload Preset 세팅**:
    *   대시보드 -> Settings -> Upload -> Add upload preset 클릭
    *   Signing Mode를 **Unsigned**로 설정 후 Preset Name 복사 (`VITE_CLOUDINARY_UPLOAD_PRESET` 값으로 사용)
4. **JWT 보안 키 생성**:
    *   로컬 터미널에서 `openssl rand -hex 32` 명령을 실행하여 나온 해시값을 `SECRET_KEY`로 준비합니다.

---

## 3. 환경변수 모음 (Environment Variables)

### 🚂 Railway (Backend) 환경변수
*   `DATABASE_URL`: (Railway Postgres 추가 시 자동 주입됨)
*   `SECRET_KEY`: `openssl rand -hex 32`로 생성한 64자리 문자열
*   `ALGORITHM`: `HS256` (기본값)
*   `ACCESS_TOKEN_EXPIRE_MINUTES`: `1440` (24시간 권장)
*   `CORS_ORIGINS`: `["http://localhost:5173", "https://your-vercel-domain.vercel.app"]` (JSON 문자열 구조 엄수)

### 🚀 Vercel (Frontend) 환경변수
*   `VITE_API_BASE_URL`: `https://your-railway-app-url.up.railway.app/api/v1` (Railway에서 발급받은 백엔드 도메인)
*   `VITE_WS_URL`: `wss://your-railway-app-url.up.railway.app/ws` (API 도메인과 동일, 단 `wss://` 프로토콜 사용)
*   `VITE_CLOUDINARY_CLOUD_NAME`: Cloudinary 클라우드명
*   `VITE_CLOUDINARY_UPLOAD_PRESET`: Cloudinary에서 생성한 Unsigned Preset Name

---

## 4. 백엔드 배포 절차 (Railway)

1. Railway 대시보드에서 **New Project** -> **Provision PostgreSQL** 선택.
2. 동일 프로젝트 내에서 **New Service** -> **GitHub Repo** 선택 -> `Holy-order` 레포지토리 연결.
3. 배포 설정 (Settings):
    *   **Root Directory**: `/backend` 로 설정.
    *   **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT` 입력. (Procfile 대체)
4. **Variables** 탭으로 이동하여 위의 `Railway 환경변수`들을 모두 입력.
5. Deploy를 누르면 자동으로 빌드 및 배포가 진행되며 API 주소(Public Domain)가 발급됩니다.

---

## 5. 프론트엔드 배포 절차 (Vercel)

1. Vercel 대시보드에서 **Add New...** -> **Project** 선택.
2. `Holy-order` 레포지토리 `Import`.
3. 배포 설정 (Configure Project):
    *   **Framework Preset**: `Vite` 선택.
    *   **Root Directory**: `/frontend` (매우 중요!)
4. **Environment Variables** 토글을 열고 위의 `Vercel 환경변수`들을 모두 등록합니다.
    *   *주의: 백엔드 Railway 배포가 완료되어 API 주소를 알고 있어야 등록 가능합니다.*
5. Deploy를 클릭합니다. `main` 브랜치의 코드가 빌드되어 배포됩니다.

---

## 6. 배포 후 시스템 검증 (Post-Deployment Checks)

*   [ ] **API 연결 확인**: Vercel 주소로 접속 후 관리자 로그인 시도. (성공 시 API 및 DB 연결 정상)
*   [ ] **WebSocket 확인**: 브라우저 개발자 도구(F12) -> Network -> WS 탭 확인. 메뉴를 켜거나 껐을 때 이벤트가 정상 수신되는지 점검. (101 Switching Protocols 성공 여부)
*   [ ] **이미지 업로드 확인**: 관리자 메뉴/이벤트 화면에서 이미지를 업로드하고 Cloudinary 대시보드에 실제로 파일이 들어오는지 체크.
*   [ ] **Cold Start 점검**: 주일 피크 타임이 시작되기 전(9:50 경), 시스템에 한 번 접속하여 서버리스 함수 및 DB 연결을 예열(Warm-up)해 둡니다.
