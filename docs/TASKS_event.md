# Holy-Order 작업 티켓
## 이벤트(골든벨) 기능

---

# Epic 1. 이벤트 기본 데이터 구조

## Ticket 1-1. Announcement 모델 추가
### 목적
이벤트/공지 데이터를 저장하기 위한 모델 추가

### 작업
`backend/models.py`에 `Announcement` 모델 추가

### 필드
- id
- title
- content
- banner_text
- image_url
- is_event_mode
- sponsor_name
- sponsor_duty
- event_type
- is_active
- starts_at
- ends_at
- created_at
- updated_at

### 완료 조건
- announcements 테이블 생성 가능
- 모델 로딩 정상

---

## Ticket 1-2. Order 모델 확장
### 목적
이벤트 주문의 실제 무료 금액과 원래 금액을 구분 저장

### 작업
`backend/models.py`의 Order 모델에 추가
- announcement_id
- original_price

### 완료 조건
- 이벤트 주문에 원래 가격 저장 가능

---

## Ticket 1-3. 이벤트 스키마 추가
### 목적
이벤트 CRUD를 위한 Request/Response 스키마 추가

### 작업
`backend/schemas.py`에 추가
- AnnouncementCreate
- AnnouncementUpdate
- AnnouncementResponse

### 완료 조건
- API response_model로 사용 가능

---

# Epic 2. 이벤트 백엔드 API

## Ticket 2-1. 관리자 이벤트 CRUD API 구현
### 목적
관리자가 이벤트/공지를 생성, 수정, 삭제할 수 있도록 함

### 작업
`backend/routers/admin.py`에 아래 API 추가

### API
- `GET /api/v1/admin/announcements`
- `POST /api/v1/admin/announcements`
- `PATCH /api/v1/admin/announcements/{id}`
- `DELETE /api/v1/admin/announcements/{id}`

### 완료 조건
- CRUD 동작 가능

---

## Ticket 2-2. 이벤트 활성화/비활성화 API 구현
### 목적
현재 이벤트를 켜고 끌 수 있게 함

### 작업
`backend/routers/admin.py`에 추가

### API
- `POST /api/v1/admin/announcements/{id}/activate`
- `POST /api/v1/admin/announcements/{id}/deactivate`

### 규칙
- 기본적으로 동시에 1개의 이벤트만 active 상태가 되도록 처리 권장

### 완료 조건
- 이벤트 활성/종료 가능

---

## Ticket 2-3. 사용자 공개 이벤트 API 구현
### 목적
사용자 앱에서 현재 활성 이벤트 조회 가능하게 함

### 작업
공개 라우터에 추가

### API
- `GET /api/v1/announcements/active`

### 완료 조건
- 활성 이벤트가 있으면 반환
- 없으면 null 반환

---

## Ticket 2-4. 이벤트 정산 리포트 API 구현
### 목적
후원자 기준 정산 정보 제공

### 작업
`backend/routers/admin.py`에 추가

### API
- `GET /api/v1/admin/announcements/{id}/report`

### 포함 데이터
- 총 주문 건수
- 총 제공 수량
- original_price 합계
- 메뉴별 판매 현황
- 직분별 통계

### 완료 조건
- 리포트 조회 가능

---

# Epic 3. 주문 로직 반영

## Ticket 3-1. 주문 생성 로직에 이벤트 모드 반영
### 목적
이벤트 활성 시 주문 금액을 0원 처리

### 작업
`backend/routers/orders.py` 수정

### 규칙
활성 이벤트가 있으면:
- total_price = 0
- original_price = 실제 계산 금액
- announcement_id 연결

일반 모드면 기존 로직 유지

### 완료 조건
- 이벤트 중 주문 저장 구조 정상 동작

---

# Epic 4. 프론트 타입 및 라우팅

## Ticket 4-1. 이벤트 관련 타입 추가
### 목적
프론트에서 이벤트 데이터를 타입 안전하게 사용

### 작업
`frontend/src/types/index.ts` 수정

### 추가 타입
- Announcement
- AnnouncementReport
- ActiveAnnouncementResponse 등 필요한 타입

### 완료 조건
- any 없이 이벤트 관련 데이터 사용 가능

---

## Ticket 4-2. 관리자 라우트 및 메뉴 추가
### 목적
관리자에서 이벤트 페이지 접근 가능하게 함

### 작업
수정 파일:
- `frontend/src/App.tsx`
- `frontend/src/pages/admin/AdminLayout.tsx`

### 라우트
- `/admin/announcements`

### 메뉴 라벨
- `이벤트 / 공지`

### 완료 조건
- 관리자 사이드바에서 접근 가능

---

# Epic 5. 관리자 이벤트 UI

## Ticket 5-1. 관리자 이벤트 목록 페이지 생성
### 목적
이벤트/공지 목록과 현재 활성 이벤트 관리

### 작업
신규 파일:
- `frontend/src/pages/admin/AdminAnnouncements.tsx`

### 기능
- 현재 활성 이벤트 카드
- 전체 이벤트 목록
- 생성 버튼
- 수정/삭제
- 활성화/종료
- 리포트 보기

### 완료 조건
- 이벤트 목록 관리 가능

---

## Ticket 5-2. 이벤트 생성/수정 모달 구현
### 목적
이벤트 정보를 입력하는 UI 제공

### 입력 항목
- 제목
- 배너 문구
- 이미지 URL
- 상세 내용
- 이벤트 모드 여부
- 후원자 성함
- 후원자 직분
- 이벤트 유형
- 시작일시
- 종료일시

### 완료 조건
- 공지/이벤트 생성 가능

---

## Ticket 5-3. 관리자 이벤트 리포트 화면 구현
### 목적
후원자 기준 정산 내용을 관리자 화면에서 표시

### 작업
- 리포트 모달 또는 상세 화면 구현

### 완료 조건
- API와 연결되어 정산 리포트 표시 가능

---

# Epic 6. 사용자 이벤트 UI

## Ticket 6-1. 홈 상단 배너 구현
### 목적
활성 이벤트를 사용자에게 즉시 인지시킴

### 작업
`frontend/src/pages/Home.tsx` 수정

### 완료 조건
- 활성 이벤트가 있으면 배너 표시

---

## Ticket 6-2. 웰컴 모달 구현
### 목적
앱 진입 시 이벤트/공지 상세 표시

### 작업
- Home.tsx 또는 별도 공용 모달 컴포넌트

### 완료 조건
- 진입 시 이벤트 공지 모달 표시

---

## Ticket 6-3. 가격 표시 UI 변경
### 목적
이벤트 시 기존 가격 취소선 + 0원 표시

### 수정 대상
- `frontend/src/pages/Home.tsx`
- `frontend/src/pages/MenuDetail.tsx`
- `frontend/src/pages/Cart.tsx`

### 규칙
- 기존 가격: 회색 + 취소선
- 실제 가격: 0원

### 완료 조건
- 이벤트 모드에서 가격 UI가 일관되게 변경됨

---

## Ticket 6-4. 장바구니/주문 금액 0원 반영
### 목적
이벤트 중 장바구니와 주문 금액도 무료 처리

### 작업
- Cart.tsx
- 필요 시 OrderStatus.tsx

### 완료 조건
- 최종 금액 0원으로 표시
- 이벤트 할인 표시 가능하면 포함

---

# 구현 순서 제안

## 1차
Epic 1 ~ 3
(모델 + API + 주문 로직)

## 2차
Epic 4 ~ 5
(관리자 화면)

## 3차
Epic 6
(사용자 화면)