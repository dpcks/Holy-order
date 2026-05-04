Holy-Order 프로젝트를 이제 실제 배포할 수 있도록 준비해줘.

인프라 구성은 아래처럼 할 거야:
- 프론트엔드: Vercel
- 백엔드: Railway (FastAPI + PostgreSQL)
- 이미지 스토리지: Cloudinary

이번 요청의 목적은 "배포 직전 상태로 프로젝트를 정리 + 환경 설정 + 필요한 코드 수정"이야.
기능 자체를 새로 만들지 말고, 이미 구현된 기능이 실제 배포 환경에서 잘 돌아가도록 필요한 부분만 정비해줘.

---

[1. 전체 요구사항]

1) 환경변수 기반 동작으로 완전히 정리
- 로컬에서는 개발용 기본값으로 돌아가게
- 배포 환경에서는 환경변수로만 동작하게
- 하드코딩된 URL, 도메인, Cloudinary 정보 등은 전부 제거

2) 백엔드 CORS 설정 정비
- Vercel 프로덕션 도메인 허용
- 로컬 dev origin 유지
- 프로덕션과 로컬이 공존하도록 설계

3) WebSocket 주소도 환경에 따라 자동 분기
- 로컬에서는 ws://
- 프로덕션에서는 wss://
- `frontend/src/utils/url.ts`가 이미 존재하니 해당 파일 기반으로 정리

4) Cloudinary 업로드 연동 정비
- 프론트에서 Unsigned Upload Preset 방식으로 처리
- 필요한 환경변수:
  - VITE_CLOUDINARY_CLOUD_NAME
  - VITE_CLOUDINARY_UPLOAD_PRESET
- 업로드 후 받은 URL을 백엔드에 저장하는 구조

5) Railway 배포를 위해 필요한 백엔드 준비
- uvicorn 실행 명령
- Procfile / startup command 가이드
- DATABASE_URL 기반 SQLAlchemy 연결
- 배포 환경에서 DB 테이블 자동 생성 가능하도록 확인

6) Vercel 배포를 위해 필요한 프론트 준비
- 프로젝트 루트가 `frontend`라는 점 반영
- 빌드 명령 및 build output 확인
- 환경변수 등록 가이드

---

[2. 수정이 필요한 파일]

다음 파일들을 점검해서 필요한 경우 수정해줘:

### 백엔드
- backend/main.py (CORS / 라우팅)
- backend/config.py (환경변수 정리)
- backend/database.py (DATABASE_URL 기반)
- backend/routers/*.py (환경 의존 로직 점검만)
- backend/.env.example 보강
- backend/auth.py (SECRET_KEY 환경변수만 사용)

### 프론트
- frontend/src/api/client.ts (BASE_URL 환경변수)
- frontend/src/utils/url.ts (WebSocket 주소 환경 분기)
- Cloudinary 업로드 유틸 신규 추가 (`frontend/src/utils/uploadImage.ts` 등)
- AdminMenuManagement.tsx, AdminAnnouncements.tsx 등에서 이미지 업로드가 필요한 곳에 유틸 적용
- frontend/.env.example 보강

---

[3. 환경변수 정리 (문서화 요청)]

내가 Railway / Vercel에 어떤 값을 등록해야 하는지 최종 정리해줘.
아래 형태로 출력해줘:

### Railway 환경변수
- DATABASE_URL
- SECRET_KEY
- ALGORITHM
- ACCESS_TOKEN_EXPIRE_MINUTES
- CORS_ORIGINS

### Vercel 환경변수
- VITE_API_BASE_URL
- VITE_WS_URL
- VITE_CLOUDINARY_CLOUD_NAME
- VITE_CLOUDINARY_UPLOAD_PRESET

각 값의 예시와 용도 설명도 같이 넣어줘.

---

[4. 배포 문서 작성 요청]

docs 폴더에 배포 문서를 만들어줘:
- `docs/DEPLOY.md`

아래 내용을 포함해줘:
1) 배포 전에 준비할 것 (계정, 환경변수, 도메인 등)
2) Railway 배포 순서
3) Vercel 배포 순서
4) Cloudinary 업로드 연동 방법
5) 배포 후 테스트 방법
6) 주의사항 (SECRET_KEY, CORS, wss 등)

---

[5. 출력 방식]

1. 변경/추가될 파일 목록을 먼저 정리해줘
2. 파일별 변경된 코드만 보여줘
3. 전체 파일을 전부 다시 출력하지 말고, 수정/추가되는 부분만 보여줘
4. 환경변수와 배포 순서는 문서 형태로 정리해줘
5. 내가 Railway / Vercel / Cloudinary에서 직접 해야 하는 작업은 명확하게 체크리스트로 정리해줘

---

[6. 주의사항]

- 이미 구현된 기능은 건드리지 말 것
- 로컬 개발 환경에서도 계속 정상 동작할 것
- 보안/환경변수가 코드에 그대로 남지 않도록 할 것
- 예전처럼 하드코딩된 localhost나 기본 주소가 있다면 환경변수로 바꿔줄 것