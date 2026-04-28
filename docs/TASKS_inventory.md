# Holy-Order 작업 티켓
## 재고 관리 기능

---

# Epic 1. 재고 기본 데이터 구조

## Ticket 1-1. Ingredient 모델 추가
### 목적
재료/소모품 재고 저장 모델 추가

### 작업
`backend/models.py`에 Ingredient 모델 추가

### 필드
- id
- name
- category
- unit
- current_stock
- alert_threshold
- memo
- is_active
- display_order
- created_at
- updated_at

### 완료 조건
- ingredients 테이블 생성 가능

---

## Ticket 1-2. Ingredient 스키마 추가
### 목적
재고 CRUD용 스키마 정의

### 작업
`backend/schemas.py`에 추가
- IngredientCreate
- IngredientUpdate
- IngredientResponse

### 완료 조건
- response_model 사용 가능

---

# Epic 2. 재고 API

## Ticket 2-1. 재고 CRUD API 구현
### 목적
관리자가 재고 관리 가능하도록 API 제공

### 작업
`backend/routers/admin.py`에 추가

### API
- `GET /api/v1/admin/ingredients`
- `GET /api/v1/admin/ingredients/alerts`
- `POST /api/v1/admin/ingredients`
- `PATCH /api/v1/admin/ingredients/{ingredient_id}`
- `DELETE /api/v1/admin/ingredients/{ingredient_id}`

### 완료 조건
- CRUD 동작 가능

---

# Epic 3. 프론트엔드

## Ticket 3-1. 재고 타입 정의 추가
### 목적
프론트에서 재고 타입 사용

### 작업
`frontend/src/types/index.ts` 수정

### 완료 조건
- any 없이 타입 사용 가능

---

## Ticket 3-2. 재고 관리 페이지 생성
### 목적
관리자 UI 제공

### 작업
신규 파일:
- `frontend/src/pages/admin/AdminIngredients.tsx`

수정 파일:
- `frontend/src/App.tsx`
- `frontend/src/pages/admin/AdminLayout.tsx`

### 완료 조건
- `/admin/ingredients` 접근 가능

---

## Ticket 3-3. 재고 추가/수정 모달 구현
### 목적
재고 항목 생성/수정

### 완료 조건
- 생성/수정 가능
- 저장 후 목록 반영

---

## Ticket 3-4. 부족 재고 강조 UI
### 목적
구매 필요 재고를 빠르게 인지하게 함

### 완료 조건
- 부족 재고가 시각적으로 구분됨