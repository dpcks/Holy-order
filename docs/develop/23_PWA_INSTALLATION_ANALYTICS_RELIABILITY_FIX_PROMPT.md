# Antigravity 실행 프롬프트: PWA 설치 통계 신뢰성 복구

저장소 루트에서 다음 문서를 먼저 읽고, 해당 문서의 범위만 구현해 주세요.

```text
docs/antigravity/23_PWA_INSTALLATION_ANALYTICS_RELIABILITY_FIX.md
```

당신은 운영 중인 Holy-Order 저장소의 React + TypeScript + Vite PWA 프런트엔드와 FastAPI + SQLAlchemy + PostgreSQL 백엔드를 유지보수하는 시니어 풀스택 엔지니어입니다.

계획이나 예시만 제시하지 말고, 최신 `main`을 조사한 뒤 실제 코드를 수정하고 DB 마이그레이션, 테스트, 빌드까지 수행하세요.

---

## 현재 확인된 핵심 문제

다음을 먼저 실제 코드에서 재검증하세요.

```text
1. pwaInstallation.ts가 상대 fetch('/api/v1/...')를 사용하여
   Railway 대신 Vercel index.html에 요청할 가능성

2. 관리자 로그인은 adminToken을 저장하지만
   heartbeat 코드는 adminAccessToken을 찾는 불일치

3. PwaInstallation.admin_id가 admins.id가 아니라 users.id를 참조

4. PublicRealtimeLayout이 일반 QR 웹 접속에서도 heartbeat를 호출하고,
   서버가 설치 증거 없는 요청도 행으로 생성

5. detected_total과 active_7d/30d가 모든 행 및 last_seen_at을 사용하여
   일반 웹 방문이 설치 통계에 포함될 가능성

6. 프런트 목록 타입의 installation_id_masked / total과
   백엔드 masked_installation_id / total_count가 불일치

7. timezone-aware DB 컬럼과 naive KST datetime 비교

8. active_days 파라미터가 실제 집계에 반영되지 않음
```

현재 관리자 PWA의 가로모드, 별도 아이콘, `/admin` 주문 관리 화면은 정상 동작하므로 변경하지 마세요.

---

## 필수 구현 원칙

### 1. Heartbeat는 반드시 `apiClient` 사용

```text
USER  -> /pwa/installations/heartbeat
ADMIN -> /admin/pwa/installations/heartbeat
```

`VITE_API_BASE_URL`을 사용하는 Railway API로 전송하고, 관리자 토큰은 `apiClient` 인터셉터의 `adminToken`을 사용하세요.

상대 `fetch('/api/v1/...')`와 직접 토큰 조회를 제거하세요.

응답 JSON의 `success`와 `data.status`를 검증한 뒤에만 마지막 전송 시각을 저장하세요.

### 2. 설치 증거가 없으면 기록하지 않기

아래 중 하나가 있어야 설치 감지 인스턴스로 인정하세요.

```text
standalone 실행
related_app_installed=true
APPINSTALLED_EVENT
RELATED_APPS
```

프런트와 서버 양쪽에서 검사하세요.

일반 QR Safari/Chrome 방문은 PwaInstallation 행을 생성하거나 설치 수를 증가시키면 안 됩니다.

### 3. 관리자 FK 수정

```text
pwa_installations.admin_id
users.id 참조 제거
admins.id 참조로 마이그레이션
```

모델, relationship, 기존 자동 마이그레이션 SQL, 운영 PostgreSQL 제약조건을 모두 수정하세요.

잘못 연결된 기존 admin_id는 안전하게 NULL 처리하고, 다음 관리자 heartbeat에서 다시 연결되게 하세요.

### 4. 통계 의미 통일

```text
detected_total
→ 설치 증거가 있는 설치 인스턴스만

active_7d / active_30d
→ last_standalone_at 기준

stale_90d
→ 설치 증거 있음 + 90일 이상 standalone 미실행
```

일반 웹 heartbeat의 `last_seen_at`을 PWA 활성 통계로 사용하지 마세요.

### 5. 재설치 중복을 과장하지 않기

삭제 후 재설치로 localStorage UUID가 바뀌면 새 설치 인스턴스가 될 수 있습니다.

물리 기기를 식별하기 위한 브라우저 지문을 만들지 마세요.

대신 다음 지표를 분리하세요.

```text
설치 감지 인스턴스
확인된 고유 사용자: PWA 연결 주문의 distinct user_id
확인된 고유 관리자: distinct admin_id
```

### 6. API 계약 일치

백엔드와 프런트에서 다음 필드명을 통일하세요.

```text
masked_installation_id
total_count
page
limit
total_pages
```

목록 item에는 `id`, 설치 증거, 7일·30일 활성, 90일 미사용 boolean을 포함하세요.

### 7. 시간대

PWA 설치 서비스는 timezone-aware UTC를 사용하고 `replace(tzinfo=None)`을 사용하지 마세요.

### 8. 기존 기능 보존

다음 기능은 회귀가 없어야 합니다.

```text
사용자 QR 주문
사용자 PWA 주문과 Order.is_pwa
Order.pwa_installation_id 선택적 연결
관리자 PWA 로그인과 주문 관리
주문 완료 푸시
WebSocket 실시간 주문
영업 상태 실시간 반영
매출·주문 통계
```

설치 추적 실패로 주문이 실패해서는 안 됩니다.

---

## 수정 전 검색

다음 검색을 실행해 실제 사용처를 모두 확인하세요.

```bash
rg -n "reportPwaHeartbeat|getOrCreateInstallationId|getPwaInstallationIdForOrder|pwa_installation|PwaInstallation|detected_total|active_7d|active_30d|adminAccessToken|adminToken|masked_installation_id|installation_id_masked" frontend backend
```

문서의 예시를 맹목적으로 복사하지 말고, 현재 타입·인터셉터·라우터 구조에 맞게 적용하세요.

---

## 필수 테스트

### 백엔드

```bash
cd backend
pytest
```

최소 검증:

```text
설치 증거 없는 heartbeat -> ignored, DB 행 없음
USER standalone 최초 기록 -> created
동일 installation ID 반복 -> 행 수 유지
ADMIN heartbeat -> admins.id FK와 관리자 이름 연결
일반 웹 전용 행은 통계 제외
active_7d/30d는 last_standalone_at 기준
목록 응답과 Pydantic 스키마 일치
증거 있는 USER ID만 주문에 연결
같은 admin_id의 재설치 인스턴스 2개 -> 고유 관리자 1
같은 user_id의 재설치 인스턴스 2개 주문 -> 고유 사용자 1
timezone 비교 오류 없음
```

### 프런트엔드

```bash
cd frontend
npm run lint
npm run build
```

최소 검증:

```text
일반 웹에서 heartbeat 미전송
USER standalone에서 Railway API 호출
ADMIN에서 apiClient가 adminToken 첨부
응답 success=false 또는 ignored이면 throttle 시각 미저장
6시간 throttling
APPINSTALLED_EVENT force 전송
프런트 타입과 목록 응답 필드 일치
PWA 통계 탭 30초 갱신 또는 명시적 새로고침
```

---

## 실기기 완료 기준

### 일반 QR 웹

```text
iPhone Safari QR 접속
Android Chrome QR 접속
→ 설치 감지 수 증가 없음
```

### 사용자 PWA

```text
홈 화면 앱 최초 실행
→ USER 설치 감지 인스턴스 1개 생성

재실행
→ 새 행 생성 없음
```

### 관리자 PWA

```text
관리자 앱 로그인 후 실행
→ ADMIN 설치 기록 생성
→ 올바른 관리자 이름 표시
```

### 네트워크

heartbeat Request URL은 반드시 Railway API 도메인이어야 합니다.

```text
https://<railway-domain>/api/v1/...
```

Vercel 도메인의 `/api/v1/...`로 전송되면 실패입니다.

---

## 변경 금지

```text
관리자 PWA 매니페스트·아이콘·가로모드 변경
/admin 라우팅 구조 변경
주일 스케줄 UI 변경
푸시 VAPID 키 변경
WebSocket URL을 ws://로 변경
주문 가격·이벤트 무료 판정 변경
사용자 로그인 기능 추가
브라우저 지문 수집
관련 없는 대규모 리팩터링
```

---

## 완료 보고

다음 순서로 보고하세요.

1. 실제 원인
2. 수정한 파일
3. heartbeat Request URL 변경
4. 관리자 토큰 처리 변경
5. admin_id FK 마이그레이션
6. 설치 증거 판정
7. 통계 집계 SQL/조건
8. API 계약
9. 기존 오염 데이터 건수
10. 재설치 통계 한계
11. pytest 결과
12. npm lint/build 결과
13. iPhone·Android·관리자 PWA QA
14. 배포 순서
15. 롤백 방법
16. 남은 위험

DB와 API에서 아래 값을 대조해 함께 보고하세요.

```text
전체 행
설치 증거 행
웹 전용 제외 행
USER 인스턴스
ADMIN 인스턴스
7일·30일 standalone 활성
확인된 고유 사용자
확인된 고유 관리자
주문 생성 설치 인스턴스
```
