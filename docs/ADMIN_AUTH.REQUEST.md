# Holy-Order 관리자 로그인 (JWT) 구현 요청서

이 문서는 Holy-Order 프로젝트에 관리자 로그인 기능(JWT)을 추가하기 위한 작업 명세서입니다.
기능 전체를 새로 설계하는 것이 아니라,
현재 구현된 관리자 기능에 **로그인/인증 계층만 추가**하는 것이 목표입니다.

기존 기능은 건드리지 말고, 요청한 부분만 최소 수정해주세요.

---

## 1. 목표

1. 관리자 로그인 페이지 추가
2. JWT 토큰 발급 API 추가
3. 모든 관리자 API 인증 보호
4. 프론트에서 토큰 자동 포함
5. 401 시 자동 로그아웃
6. 로그아웃 버튼 실동작 구현

---

## 2. 전제

- 관리자 Role은 단일 (admin만 존재)
- 관리자 계정 테이블은 이미 `models.Admin`으로 존재함
- AccessToken 단일 구조 (Refresh Token은 사용하지 않음)
- 토큰 저장 위치: localStorage
- 인증 방식: Bearer JWT
- 기존 기능 구조와 스타일 유지

---

## 3. 백엔드 요구사항

### 3-1. `backend/requirements.txt`
아래 항목 추가:
- `passlib[bcrypt]`
- `python-jose[cryptography]`

---

### 3-2. `backend/auth.py` (신규 파일)
다음 기능 포함:
- `hash_password(plain: str) -> str`
- `verify_password(plain: str, hashed: str) -> bool`
- `create_access_token(data: dict, expires_delta: timedelta | None = None) -> str`
- `get_current_admin()` — JWT 디코딩 + Admin 조회
- OAuth2PasswordBearer는 tokenUrl로 `/api/v1/admin/login` 사용

---

### 3-3. `backend/routers/admin.py`

#### 관리자 로그인 API 추가
- `POST /api/v1/admin/login`
- `OAuth2PasswordRequestForm` 사용
- 성공 시 `StandardResponse[TokenResponse]` 형태 반환
- 실패 시 400 에러

#### 모든 관리자 API 보호
- 모든 관리자 라우트에
  ```python
  _: models.Admin = Depends(get_current_admin)를 dependency로 추가

- 기존 함수 시그니처와 라우트는 그대로 유지

### 공개 API는 보호하지 말 것

- `backend/routers/menus.py`의 공개 API
- `backend/routers/orders.py`의 사용자용 API

---

### 3-4. `backend/schemas.py`

- 기존 `AdminLogin`, `TokenResponse` 유지
- 수정 필요 없음

---

### 3-5. `backend/seed.py`

- 초기 관리자 계정 생성 로직 추가
- 기본 계정:
    - login_id: `admin`
    - password: `admin`
    - name: `관리자`
- 비밀번호는 반드시 `hash_password()` 사용
- 이미 admin 계정이 있으면 스킵

---

### 3-6. 환경변수 사용

`config.py` 또는 기존 환경변수에서 아래 항목 사용:

- `SECRET_KEY`
- `ALGORITHM` (기본 HS256)
- `ACCESS_TOKEN_EXPIRE_MINUTES` (기본 720 = 12시간)

---

## 4. 프론트엔드 요구사항

### 4-1. `frontend/src/pages/admin/AdminLogin.tsx` (신규)

- 아이디 / 비밀번호 입력 UI
- 로그인 성공 시 `adminToken`을 localStorage에 저장 후 `/admin` 이동
- 실패 시 에러 메시지 노출
- 기존 프로젝트 UI 톤과 어울리게 스타일링

### 요청 포맷 주의

로그인 API는 `x-www-form-urlencoded`로 보내야 함.

---

### 4-2. `frontend/src/api/client.ts`

### 요청 인터셉터

- URL이 `/admin`으로 시작할 때만 Authorization 헤더에 JWT 자동 포함

### 응답 인터셉터

- 401 응답일 경우:
    - `adminToken` 제거
    - 현재 URL이 `/admin`으로 시작하면 `/admin/login`으로 리다이렉트

---

### 4-3. `frontend/src/components/ProtectedRoute.tsx` (신규)

- localStorage에 `adminToken`이 없으면 `/admin/login`으로 리다이렉트
- 있으면 `<Outlet />` 렌더

---

### 4-4. `frontend/src/App.tsx`

- `/admin/login` 라우트 추가
- 기존 `/admin` 하위 라우트를 `<ProtectedRoute>`로 감싸기
- 기존 하위 경로 그대로 유지

---

### 4-5. `frontend/src/pages/admin/AdminLayout.tsx`

- 로그아웃 버튼 onClick 구현
    - localStorage의 `adminToken` 제거
    - `/admin/login`으로 이동
- 기존 구조 유지

---

## 5. 보안 / 환경

### 운영 환경

- SECRET_KEY는 배포 환경에서만 강력한 값으로 관리
- 로그에 비밀번호 출력 금지
- DB에 비밀번호는 반드시 해시 저장

---

## 6. 출력 방식

1. 변경/추가되는 파일 목록 정리
2. 파일별 변경 코드만 제시
3. 전체 파일을 다시 출력하지 말고, 수정/추가된 부분만 제시
4. 초기 관리자 계정 생성 방법 짧게 안내
5. 로컬 테스트 방법 짧게 안내