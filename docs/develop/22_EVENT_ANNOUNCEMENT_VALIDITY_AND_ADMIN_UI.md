# 22. 이벤트 유효성·무료 주문 판정 안전화 및 관리자 상태 중심 UI 재구성

## 0. 문서 목적

Holy-Order의 기존 **이벤트/공지 기능을 전면 폐기하지 않고**, 다음 두 축을 한 작업으로 안전하게 정리한다.

1. **이벤트 유효성과 무료 주문 판정의 서버 단일화**
2. **관리자 이벤트/공지 화면을 상태 중심 목록으로 재구성하고, 일반 공지와 무료 제공 이벤트의 생성 흐름을 분리**

현재 시스템은 `Announcement` 하나의 모델로 일반 공지와 무료 제공 이벤트를 함께 관리하며, `is_event_mode`, `is_active`, `starts_at`, `ends_at`으로 의미를 구분한다. 이 구조는 유지할 수 있지만, 공개 조회·주문 생성·관리자 수동 주문·사용자 화면이 서로 다른 방식으로 이벤트 유효성을 판단해서는 안 된다.

이번 작업의 최종 목표는 다음과 같다.

```text
일반 공지
→ 사용자에게 안내만 제공
→ 주문 가격과 결제 방식에는 절대 영향 없음

무료 제공 이벤트
→ 서버가 현재 유효한 이벤트인지 확인
→ 유효한 경우에만 서버가 최종 금액 0원과 FREE 결제를 결정
→ 클라이언트가 FREE 또는 0원을 보내 이벤트를 강제로 만들 수 없음
```

관리자 화면은 다음처럼 동작해야 한다.

```text
[일반 공지 작성] [무료 이벤트 만들기]

진행 중 | 예약 | 초안 | 종료 | 전체

유형: 전체 | 일반 공지 | 무료 이벤트
검색: 제목·후원자·배너 문구
```

---

## 1. 현재 프로젝트 환경

- 프런트엔드: React 19, TypeScript, Vite, TanStack Query v5, PWA
- 백엔드: FastAPI, SQLAlchemy, PostgreSQL
- 프런트 배포: Vercel
- 백엔드 및 DB: Railway
- 이미지: Cloudinary
- 실시간 반영: FastAPI WebSocket + React Query invalidate
- 이벤트/공지 관리자 경로: `/admin/announcements`
- 공개 사용자 화면: Home, MenuDetail, Cart, OrderStatus

현재 핵심 모델은 다음 의미를 가진다.

```text
Announcement.is_event_mode
false → 일반 공지
true  → 무료 제공 이벤트

Announcement.is_active
관리자가 게시 또는 활성화한 상태

Announcement.starts_at / ends_at
노출 및 이벤트 적용 가능 기간
```

이번 작업에서는 기존 데이터와 URL을 최대한 보존한다.

---

## 2. 작업 전 반드시 확인할 현재 문제

Antigravity는 수정 전에 저장소 전체에서 아래 항목을 검색해야 한다.

```bash
rg -n \
  "Announcement|announcements/active|is_event_mode|is_active|starts_at|ends_at|FREE|total_price == 0|payment_method.*FREE|announcement_id|ANNOUNCEMENT_UPDATED" \
  backend frontend/src
```

특히 아래 파일을 전체 확인한다.

### 백엔드

- `backend/models.py`
- `backend/schemas.py`
- `backend/routers/menus.py`
- `backend/routers/orders.py`
- `backend/routers/admin.py`
- `backend/tests/*`
- 현재 서비스 디렉터리가 있다면 `backend/services/*`

### 프런트엔드

- `frontend/src/pages/admin/AdminAnnouncements.tsx`
- `frontend/src/pages/Home.tsx`
- `frontend/src/pages/MenuDetail.tsx`
- `frontend/src/pages/Cart.tsx`
- `frontend/src/pages/OrderStatus.tsx`
- `frontend/src/api/queryKeys.ts`
- `frontend/src/types/index.ts`
- `frontend/src/components/layout/PublicRealtimeLayout.tsx`

현재 코드와 이 문서가 다르면 실제 저장소를 기준으로 구현하되, 아래 완료 조건은 반드시 충족한다.

---

## 3. 현재 구조에서 해결해야 하는 핵심 위험

### 3-1. 클라이언트 요청이 무료 이벤트를 강제로 만들 수 있음

현재 공개 주문 코드에 다음과 유사한 판정이 존재할 수 있다.

```python
is_event_request = (
    order.payment_method == PaymentMethodEnum.FREE
    or order.total_price == 0
)

is_event_mode = active_event is not None or is_event_request
```

이 구조에서는 유효한 무료 이벤트가 없어도 클라이언트가 요청을 직접 조작하여 다음 값을 보내면 이벤트 주문으로 처리될 수 있다.

```json
{
  "payment_method": "FREE",
  "total_price": 0
}
```

무료 여부는 반드시 서버의 유효한 무료 이벤트 조회 결과만으로 결정해야 한다.

### 3-2. 공개 화면과 주문 서버의 이벤트 유효성 기준이 다를 수 있음

공개 공지 조회가 `is_active=True`만 확인하고, 주문 생성은 시작·종료 시간을 함께 확인하면 다음 불일치가 발생할 수 있다.

```text
사용자 화면
→ 이벤트 배너와 0원 표시

주문 서버
→ 이벤트 종료로 판단
```

공개 조회, 사용자 화면, 공개 주문, 관리자 수동 주문은 모두 같은 서버 함수를 사용해야 한다.

### 3-3. 관리자 수동 주문의 이벤트 판정이 시간 범위를 무시할 수 있음

관리자 수동 주문에서도 단순히 `is_active=True AND is_event_mode=True`만 확인하면 종료된 이벤트가 계속 적용될 수 있다.

### 3-4. 일반 공지와 무료 이벤트의 운영 의미가 UI에서 혼재됨

현재 하나의 생성 폼에 다음 항목이 함께 나타날 수 있다.

```text
제목
상세 내용
배너
이미지
후원자
감사 유형
시작·종료
무료 이벤트 여부
```

일반 공지를 작성하는 관리자에게 이벤트 전용 항목이 노출되고, 버튼이나 토스트도 모두 “이벤트” 중심으로 보일 수 있다.

### 3-5. 활성 상태만으로는 운영 현황을 이해하기 어려움

관리자가 실제로 보고 싶은 상태는 다음이다.

```text
초안
예약
진행 중
종료
```

단순 `활성/비활성`만 표시하면 미래 예약과 종료된 콘텐츠를 구분하기 어렵다.

### 3-6. 하나의 무료 이벤트와 여러 일반 공지를 동시에 운영하기 어려움

무료 이벤트는 동시에 최대 1개여야 하지만, 일반 공지는 운영시간 안내와 중요 안내처럼 여러 개가 동시에 게시될 수 있어야 한다.

### 3-7. MenuDetail이 라우팅 state의 `isEventMode`를 신뢰할 수 있음

Home에서 MenuDetail로 이동할 때 전달한 `isEventMode`는 이벤트 종료 후에도 오래된 값으로 남을 수 있다. 이벤트 여부는 공용 Query의 서버 응답을 기준으로 해야 한다.

### 3-8. OrderStatus가 “현재 활성 이벤트”를 표시할 수 있음

주문 당시 이벤트와 현재 활성 이벤트가 다를 수 있다. 주문 상태 화면은 `order.announcement_id`에 연결된 이벤트 정보를 표시해야 하며, 현재 전역 이벤트를 대신 표시하면 안 된다.

---

## 4. 핵심 도메인 정의

## 4-1. 콘텐츠 유형

기존 `is_event_mode`를 유지한다.

```text
NOTICE
→ is_event_mode = false
→ 일반 공지
→ 가격에 영향 없음

FREE_EVENT
→ is_event_mode = true
→ 무료 제공 이벤트
→ 서버에서 유효할 때만 주문 가격 0원 적용
```

응답에서는 boolean만 전달하지 말고 파생 필드도 제공하는 것이 좋다.

```json
{
  "is_event_mode": true,
  "content_type": "FREE_EVENT"
}
```

DB에 별도 enum 컬럼을 추가하는 대규모 마이그레이션은 이번 작업에서 필수로 하지 않는다.

## 4-2. 게시 상태

게시 상태는 DB에 중복 저장하지 말고 서버에서 계산한다.

```text
DRAFT
- is_active = false
- 종료 시간이 이미 지난 항목은 제외

SCHEDULED
- is_active = true
- starts_at이 현재보다 미래

LIVE
- is_active = true
- starts_at이 없거나 starts_at <= now
- ends_at이 없거나 now < ends_at

ENDED
- ends_at이 존재하고 ends_at <= now
```

경계 정책은 다음으로 통일한다.

```text
시작 시각: 포함
종료 시각: 미포함

starts_at <= now < ends_at
```

`ends_at`이 `starts_at`보다 같거나 빠르면 저장을 거부한다.

## 4-3. 유효한 무료 이벤트

다음 조건을 모두 만족하는 항목만 무료 이벤트다.

```text
is_event_mode = true
is_active = true
starts_at is null OR starts_at <= now
ends_at is null OR now < ends_at
```

## 4-4. 유효한 일반 공지

다음 조건을 모두 만족하는 항목은 현재 노출 가능한 일반 공지다.

```text
is_event_mode = false
is_active = true
starts_at is null OR starts_at <= now
ends_at is null OR now < ends_at
```

무료 이벤트와 일반 공지는 서로 다른 결과 집합으로 반환한다.

---

## 5. 백엔드 필수 구현

## 5-1. 이벤트·공지 서비스 계층 추가

라우터마다 SQL 조건을 복사하지 말고, 다음과 같은 공용 모듈을 만든다.

```text
backend/services/announcement_service.py
```

권장 함수:

```python
get_announcement_status(announcement, now)
get_effective_free_event(db, now=None)
get_effective_notices(db, now=None)
get_current_public_announcements(db, now=None)
validate_announcement_period(starts_at, ends_at)
validate_free_event_overlap(db, starts_at, ends_at, exclude_id=None)
```

현재 프로젝트의 시간대 정책을 먼저 확인한다.

- `10_TIMEZONE_AND_ALEMBIC_FOUNDATION.md`가 적용된 경우 UTC timezone-aware 정책을 사용
- 아직 적용되지 않았다면 기존 DB 데이터와 호환되는 한 가지 정책으로 통일
- naive datetime과 aware datetime을 같은 비교에서 혼합하지 말 것
- 결과 보고에 실제 사용한 기준을 명시

## 5-2. 공개 현재 이벤트·공지 API 추가

새 엔드포인트를 권장한다.

```http
GET /api/v1/announcements/current
```

응답 예시:

```json
{
  "success": true,
  "data": {
    "free_event": {
      "id": 15,
      "title": "김OO 장로님 칠순 감사",
      "content_type": "FREE_EVENT",
      "publication_status": "LIVE",
      "is_event_mode": true,
      "sponsor_name": "김OO",
      "sponsor_duty": "장로",
      "starts_at": "2026-08-02T00:00:00+09:00",
      "ends_at": "2026-08-02T14:00:00+09:00"
    },
    "notices": [
      {
        "id": 18,
        "title": "오늘 주문 마감 안내",
        "content_type": "NOTICE",
        "publication_status": "LIVE",
        "is_event_mode": false
      }
    ],
    "server_now": "2026-08-02T10:30:00+09:00"
  },
  "message": "현재 이벤트와 공지를 조회했습니다."
}
```

요구사항:

- `free_event`는 최대 1개
- `notices`는 여러 개 가능
- 종료된 항목 제외
- 예약 항목 제외
- `Cache-Control: no-store, max-age=0`
- `Pragma: no-cache` 적용 가능

## 5-3. 기존 `/announcements/active` 하위 호환 유지

프런트와 백엔드가 동시에 배포되지 않을 수 있으므로 기존 API를 즉시 제거하지 않는다.

```http
GET /api/v1/announcements/active
```

하위 호환 정책:

1. 현재 유효한 무료 이벤트가 있으면 해당 이벤트 반환
2. 무료 이벤트가 없으면 현재 유효한 일반 공지 중 우선순위가 높은 1개 또는 최신 1개 반환
3. 아무것도 없으면 `data=null`
4. 반드시 시작·종료 시간까지 확인
5. 코드에 deprecated 주석 추가

신규 프런트는 `/announcements/current`만 사용한다.

## 5-4. 관리자 목록 응답에 파생 상태 제공

관리자 목록의 각 항목에 다음 파생 값을 포함한다.

```text
content_type: NOTICE | FREE_EVENT
publication_status: DRAFT | SCHEDULED | LIVE | ENDED
is_effective: boolean
linked_order_count: number
```

필요하면 관리자 목록 API에 필터를 추가한다.

```http
GET /api/v1/admin/announcements?status=LIVE&type=FREE_EVENT&search=김OO
```

프로젝트 규모상 프런트 필터링으로 충분하다면 기존 전체 목록 API를 유지해도 되지만, 상태 계산은 서버에서 수행한다.

## 5-5. 기간 검증

생성·수정 시 다음을 검증한다.

```text
starts_at과 ends_at이 둘 다 존재하면 starts_at < ends_at
```

잘못된 경우 422 또는 400:

```json
{
  "detail": "종료 시각은 시작 시각보다 늦어야 합니다."
}
```

## 5-6. 무료 이벤트 시간 중복 방지

게시되는 무료 이벤트끼리는 시간 범위가 겹치면 안 된다.

중복 판단 개념:

```text
existing_start < new_end
AND
new_start < existing_end
```

시작 또는 종료가 없는 경우 무한 범위로 처리한다.

다음은 허용한다.

```text
이벤트 A 종료 = 14:00
이벤트 B 시작 = 14:00
```

다음은 차단한다.

```text
이벤트 A 09:00~14:00
이벤트 B 13:00~15:00
```

중복 시 409 Conflict를 권장한다.

```json
{
  "detail": "같은 시간에 게시되는 무료 이벤트가 이미 있습니다."
}
```

일반 공지는 여러 개가 동시에 LIVE여도 된다.

## 5-7. 예약 게시 허용

미래 `starts_at`을 가진 항목도 `is_active=true`로 게시할 수 있어야 한다.

```text
게시됨 + 시작 전
→ SCHEDULED

시작 시각 도달
→ 공개 API에서 자동 LIVE

종료 시각 도달
→ 공개 API에서 자동 제외 및 ENDED
```

별도 스케줄러 없이 공개 조회 시 현재 시각으로 계산한다.

## 5-8. 게시·게시 중지 API 의미 정리

가능하면 기존 단순 toggle 대신 의미가 명확한 API를 사용한다.

```http
POST /api/v1/admin/announcements/{id}/publish
POST /api/v1/admin/announcements/{id}/unpublish
```

기존 toggle API가 이미 사용 중이면 하위 호환을 유지하며 내부 구현을 서비스 함수로 통일한다.

무료 이벤트 게시 시:

- 기간 검증
- 겹치는 게시 이벤트 검사
- 성공 후 commit
- commit 후 `ANNOUNCEMENT_UPDATED` 브로드캐스트

일반 공지 게시 시:

- 다른 일반 공지나 무료 이벤트를 자동 비활성화하지 않음

## 5-9. 삭제 보호

연결된 주문이 있는 이벤트는 물리 삭제하지 않는다.

```text
linked_order_count > 0
→ 삭제 거부
→ 종료 상태와 리포트 유지
```

권장 응답:

```http
409 Conflict
```

```json
{
  "detail": "주문 내역이 연결된 이벤트는 삭제할 수 없습니다."
}
```

주문이 연결되지 않은 초안은 기존 삭제를 허용할 수 있다.

보관함과 soft archive는 후속 작업으로 남긴다.

## 5-10. WebSocket 이벤트

DB commit 성공 후 다음 이벤트를 전송한다.

```json
{
  "type": "ANNOUNCEMENT_UPDATED",
  "announcement_id": 15,
  "content_type": "FREE_EVENT",
  "publication_status": "LIVE",
  "timestamp": "..."
}
```

생성·수정·게시·게시 중지·삭제 성공 후 모두 전송한다.

브로드캐스트 실패가 이미 완료된 DB commit을 롤백시키면 안 된다.

---

## 6. 무료 주문 판정 필수 구현

## 6-1. 공개 주문은 FREE와 VOLUNTEER를 요청할 수 없음

공개 `OrderCreate`에서는 다음 결제수단만 허용한다.

```text
BANK_TRANSFER
CASH
TOSS
```

방법:

- 공개 주문 전용 enum 추가 또는
- Pydantic validator 또는
- 주문 엔드포인트에서 명시적 차단

공개 요청이 `FREE` 또는 `VOLUNTEER`를 보내면 400을 반환한다.

## 6-2. `total_price == 0`을 이벤트 판정에 사용하지 않음

다음 로직은 제거한다.

```python
is_event_request = (
    order.payment_method == FREE
    or order.total_price == 0
)
```

무료 이벤트 여부는 오직 다음 값으로 판단한다.

```python
active_event = get_effective_free_event(db)
is_event_order = active_event is not None
```

## 6-3. 서버가 무료 이벤트 주문의 최종 필드를 결정

유효한 무료 이벤트가 있으면 서버가 다음 값을 결정한다.

```text
final total_price = 0
payment_method = FREE
announcement_id = active_event.id
original_price = 서버가 계산한 원래 가치
```

클라이언트가 보낸 다음 값은 무료 이벤트 판정의 근거가 아니다.

```text
payment_method
isEventMode
FREE 배지 표시
total_price=0
```

## 6-4. 일반 공지는 절대로 무료 주문을 만들지 않음

`is_event_mode=false`인 일반 공지가 LIVE여도 주문 가격과 결제 방식은 그대로 유지한다.

## 6-5. UI가 본 이벤트와 서버 이벤트 불일치 방지

공개 주문 요청에 선택 필드를 추가하는 것을 권장한다.

```python
expected_announcement_id: Optional[int] = None
```

프런트가 무료 이벤트를 보고 있다면 해당 ID를 보낸다.

서버 정책:

```text
클라이언트 expected ID 없음 + 서버 이벤트 없음
→ 일반 주문

클라이언트 expected ID 없음 + 서버 이벤트 있음
→ 서버가 이벤트 주문 적용 가능

클라이언트 expected ID 있음 + 서버 이벤트 ID 일치
→ 이벤트 주문

클라이언트 expected ID 있음 + 서버 이벤트 없음 또는 ID 불일치
→ 409 Conflict
→ 사용자에게 이벤트 상태가 바뀌었음을 알리고 재확인 요구
```

409 예시:

```json
{
  "detail": "이벤트 상태가 변경되었습니다. 장바구니를 다시 확인해 주세요."
}
```

이 정책은 사용자가 0원 화면을 보고 주문했는데 서버가 조용히 정상 가격으로 결제하는 사고를 방지한다.

## 6-6. 유효 이벤트가 없는데 0원 요청이 들어오면 거부

서버에 유효한 이벤트가 없고 공개 주문의 계산 금액이 0원이라면 정상 주문으로 자동 승인하지 않는다.

```text
유효 이벤트 없음
+ 공개 주문 total_price=0
→ 400 또는 409
```

## 6-7. 관리자 수동 주문과 무료 이벤트 분리

관리자 수동 주문은 반드시 관리자 인증을 요구한다.

```python
admin: models.Admin = Depends(auth.get_current_admin)
```

관리자 수동 무료 주문 의미:

```text
FREE / VOLUNTEER
+ 유효 무료 이벤트 없음
→ 관리자 수동 무료 주문
→ announcement_id = null

유효 무료 이벤트 있음
→ 이벤트 주문
→ announcement_id = effective_event.id
→ payment_method = FREE
```

일반 공지는 관리자 수동 주문 가격에 영향이 없다.

관리자 주문도 `get_effective_free_event()`를 사용하며 시간 조건을 복사해서 구현하지 않는다.

## 6-8. 서버 권위 가격 계산과의 관계

`03_SERVER_AUTHORITATIVE_ORDER_PRICING.md`가 이미 적용된 경우 해당 가격 계산 서비스를 그대로 사용한다.

아직 적용되지 않았다면 이번 작업에서 최소한 다음은 보장한다.

- 클라이언트 FREE/0원으로 이벤트를 강제할 수 없음
- 서버가 유효 이벤트 여부를 결정
- 서버가 최종 무료 결제 필드를 결정

옵션 ID 기반 전체 가격 계약 재설계는 03번 문서 범위를 몰래 중복 구현하지 않는다.

---

## 7. 프런트엔드 공통 데이터 구조

## 7-1. Query Key 추가

권장:

```ts
announcements: {
  _domain: ['announcements'],
  current: ['announcements', 'current'],
  list: ['announcements', 'list'],
  detail: (id: number) => ['announcements', 'detail', id],
  report: (id: number) => ['announcements', 'report', id],
}
```

기존 `active` 키는 마이그레이션 완료 후 제거하거나 호환 alias로 유지할 수 있다.

## 7-2. 공용 훅 추가

권장 파일:

```text
frontend/src/hooks/useCurrentAnnouncements.ts
```

반환 타입 예시:

```ts
type CurrentAnnouncements = {
  free_event: ActiveAnnouncement | null;
  notices: ActiveAnnouncement[];
  server_now: string;
};
```

옵션:

- `staleTime: 0`
- `refetchOnMount: 'always'`
- `refetchOnWindowFocus: 'always'`
- `refetchOnReconnect: 'always'`
- 필요하면 30~60초 폴링
- API 오류를 조용히 성공 `null`로 바꾸지 않음
- 백그라운드 오류 토스트는 요청별로 억제 가능

`PublicRealtimeLayout`의 `ANNOUNCEMENT_UPDATED`는 announcement domain 또는 `current`를 무효화한다.

---

## 8. 사용자 화면 필수 수정

## 8-1. Home

Home은 공용 `useCurrentAnnouncements()`를 사용한다.

```text
free_event
→ 무료 이벤트 배너
→ 메뉴 FREE 표시
→ 이벤트 감사 모달

notices
→ 일반 공지 카드 또는 공지 모달
→ 가격에는 영향 없음
```

일반 공지는 최대 3개 정도를 compact card로 보여주는 것을 권장한다.

```text
📢 오늘 주문 마감은 오후 1시 30분입니다.
```

기존 세션당 1회 모달을 유지한다면 공지 ID별 키를 사용한다.

```text
notice_modal_<id>
free_event_modal_<id>
```

## 8-2. MenuDetail

라우팅 state의 `isEventMode`를 이벤트 판정의 근거로 사용하지 않는다.

제거 또는 무시 대상:

```ts
location.state.isEventMode
```

무료 표시 여부는 현재 Query의 `free_event`로 결정한다.

이벤트가 종료되면 화면이 열린 상태에서도 무료 배지와 0원 표시가 해제되어야 한다.

## 8-3. Cart

Cart는 현재 `free_event`를 사용하여 화면만 표시한다.

주문 제출 직전 `/announcements/current`를 강제 재조회한다.

```text
모달 작성 중 이벤트 종료
→ 최신 조회
→ 이벤트 변경 안내
→ 결제금액 재확인
→ 사용자가 다시 주문 버튼을 눌러야 함
```

주문 요청에는 다음 값을 포함한다.

```ts
expected_announcement_id:
  current.free_event?.id ?? null
```

409 응답 시:

- cart 유지
- 사용자 정보 모달 닫기
- announcement current invalidate/refetch
- “이벤트 상태가 변경되었습니다. 결제 금액을 다시 확인해 주세요.” 표시
- 자동으로 정상 가격 주문을 재전송하지 않음

## 8-4. OrderStatus

주문 상태 화면에서 현재 활성 이벤트를 조회해 후원자를 표시하지 않는다.

다음 중 하나를 구현한다.

### 권장 A

`OrderResponse`에 주문과 연결된 이벤트 요약을 포함한다.

```ts
announcement?: {
  id: number;
  title: string;
  sponsor_name: string | null;
  sponsor_duty: string | null;
  event_type: string | null;
};
```

### 대안 B

`order.announcement_id`가 있을 때 공개 이벤트 상세 API로 조회한다.

```http
GET /api/v1/announcements/{id}/public
```

이벤트가 종료되더라도 해당 주문에는 주문 당시 연결된 이벤트 감사 문구가 유지되어야 한다.

---

## 9. 관리자 화면 재구성

대상 파일:

```text
frontend/src/pages/admin/AdminAnnouncements.tsx
```

기존 생성·수정·삭제·미리보기·리포트 기능을 가능한 한 재사용한다.

## 9-1. 헤더

```text
이벤트 & 공지
사용자에게 표시되는 일반 안내와 무료 제공 이벤트를 관리합니다.

[일반 공지 작성] [무료 이벤트 만들기]
```

두 버튼은 초기 form state가 달라야 한다.

```text
일반 공지 작성
→ is_event_mode=false
→ 이벤트 전용 입력 숨김

무료 이벤트 만들기
→ is_event_mode=true
→ 후원자·감사 유형·무료 영향 안내 표시
```

## 9-2. 상태 요약 및 탭

```text
[진행 중 2] [예약 1] [초안 3] [종료 12] [전체 18]
```

탭은 서버 파생 `publication_status`를 사용한다.

## 9-3. 유형 필터와 검색

```text
유형
[전체] [일반 공지] [무료 이벤트]

검색
제목, 배너 문구, 후원자 이름
```

정렬 기본값:

```text
LIVE
→ SCHEDULED
→ DRAFT
→ ENDED
```

같은 상태에서는 최근 수정 순 또는 시작 시각 순을 사용한다.

## 9-4. 현재 진행 중 섹션

LIVE 항목을 목록 상단에 별도 표시한다.

```text
현재 진행 중

[무료 이벤트] [진행 중]
김OO 장로님 칠순 감사
오늘 09:00 ~ 14:00
후원: 김OO 장로
주문 38건 · 제공 가치 142,000원
[정산 보기] [종료] [미리보기]

[일반 공지] [진행 중]
오늘 주문 마감 안내
오늘 13:30까지
[게시 중지] [미리보기]
```

## 9-5. 카드 정보 구조

카드에는 다음을 표시한다.

```text
유형 배지
게시 상태 배지
제목
배너 문구 요약
기간
후원자 또는 공지 설명
연결 주문 수
최근 수정 시각
```

주요 행동은 텍스트 버튼으로 표시한다.

```text
미리보기
수정
게시 / 게시 중지
정산 보기
```

삭제 같은 낮은 빈도·위험 행동은 `⋮` 메뉴에 넣는다.

## 9-6. 일반 공지 폼

표시 필드:

```text
제목
상세 내용
상단 배너 문구
이미지
시작 시각
종료 시각
```

숨김 필드:

```text
후원자 성함
후원자 직분
감사 유형
무료 제공 안내
```

버튼 문구:

```text
초안 저장
게시 또는 예약 게시
```

## 9-7. 무료 이벤트 폼

표시 필드:

```text
이벤트 제목
상세 내용
상단 배너 문구
이미지
후원자 성함
후원자 직분
감사 유형
시작 시각
종료 시각
```

영향 안내:

```text
이 이벤트가 진행 중인 동안 서버가 신규 사용자 주문을 무료 주문으로 처리합니다.
일반 공지와 달리 결제 금액과 정산에 영향을 줍니다.
```

## 9-8. 무료 이벤트 게시 확인 모달

무료 이벤트 게시 전 반드시 확인 모달을 표시한다.

```text
무료 제공 이벤트를 게시할까요?

• 유효 시간 동안 신규 주문의 최종 결제 금액은 0원이 됩니다.
• 주문은 이 이벤트와 연결되어 정산 리포트에 포함됩니다.
• 같은 시간에 다른 무료 이벤트가 있으면 게시할 수 없습니다.
• 일반 공지는 계속 함께 노출될 수 있습니다.

[취소] [무료 이벤트 게시]
```

토글 아이콘 한 번으로 즉시 적용하지 않는다.

## 9-9. 예약 항목 표시

```text
[예약]
8월 2일 오전 9시 자동 시작
D-3
```

예약 항목도 수정·게시 중지 가능하다.

## 9-10. 종료 항목 표시

종료 항목은 흐리게 표시하되 정산과 미리보기는 유지한다.

```text
[종료]
7월 26일 14:00 종료
주문 74건 · 제공 가치 268,000원
[정산 보기] [복제] [미리보기]
```

복제 기능은 기존에 없으면 이번 작업에서 필수 구현하지 않는다.

## 9-11. 반응형

### 데스크톱·iPad 가로

- 2열 카드 또는 넓은 목록
- 필터 한 줄
- 생성·수정은 오른쪽 preview 또는 큰 modal

### iPad 세로·관리자 PWA 모바일

- 1열 카드
- 탭 가로 스크롤
- 버튼은 하단 sticky 가능
- 아이콘만 있는 행동을 피하고 텍스트 라벨 제공

---

## 10. 데이터 마이그레이션 정책

이번 작업은 기존 `Announcement` 컬럼만으로 구현 가능하므로 새로운 타입 컬럼은 필수가 아니다.

다만 다음을 배포 전 진단한다.

```sql
SELECT
  id,
  title,
  is_event_mode,
  is_active,
  starts_at,
  ends_at
FROM announcements
ORDER BY id DESC;
```

확인 항목:

- `starts_at >= ends_at` 데이터
- 종료 시간이 지났지만 `is_active=true`인 데이터
- 여러 개의 시간 중복 무료 이벤트
- 주문이 연결된 이벤트

잘못된 데이터를 자동 수정하거나 삭제하지 않는다.

마이그레이션 또는 데이터 정리 SQL이 필요하면 별도 보고 후 실행한다.

---

## 11. 변경하지 말아야 할 사항

이번 작업에서는 다음을 하지 않는다.

- 전체 Announcement 모델을 새 테이블 여러 개로 분해
- 일반 공지 Web Push 발송 구현
- 공지 우선순위·노출 위치·닫기 정책 전체 설계
- 이벤트 복제 템플릿 구현
- 관리자 감사 로그 전체 구현
- 이벤트 리포트 CSV·이미지 내보내기
- 주문 가격 계약 전체 재설계
- 주문 public token 작업
- Toss 결제 흐름 변경
- WebSocket 전체 리팩터링
- 기존 주문 푸시 수정
- 사용자 UI 전체 디자인 변경
- 과거 이벤트 데이터 자동 삭제

범위를 넘어서는 문제는 결과 보고의 “후속 권장 사항”에만 기록한다.

---

## 12. 백엔드 자동 테스트

최소 다음 테스트를 추가한다.

## 12-1. 상태 계산

```text
is_active=false, 미래 기간
→ DRAFT

is_active=true, starts_at 미래
→ SCHEDULED

is_active=true, 현재가 기간 안
→ LIVE

ends_at == now
→ ENDED
```

## 12-2. 공개 현재 API

```text
LIVE 무료 이벤트 1개
LIVE 일반 공지 2개
예약 1개
종료 1개

→ free_event 1개
→ notices 2개
→ 예약·종료 제외
```

## 12-3. 일반 공지가 가격에 영향을 주지 않음

```text
LIVE 일반 공지만 존재
→ 공개 주문 정상 가격
→ announcement_id=null
→ payment_method 유지
```

## 12-4. 클라이언트 FREE 조작 차단

```text
유효 이벤트 없음
+ payment_method=FREE
→ 400
```

## 12-5. 클라이언트 0원 조작 차단

```text
유효 이벤트 없음
+ total_price=0
→ 400 또는 409
```

## 12-6. 유효 이벤트 자동 적용

```text
LIVE 무료 이벤트 존재
+ 공개 주문은 일반 결제수단 전송
→ 서버 total_price=0
→ payment_method=FREE
→ announcement_id=event.id
```

## 12-7. 만료 이벤트 미적용

```text
is_active=true
+ ends_at 과거
→ 일반 주문
```

## 12-8. stale expected event

```text
expected_announcement_id=15
서버 effective event 없음 또는 ID=16
→ 409
```

## 12-9. 무료 이벤트 시간 중복

```text
게시 이벤트 A 09:00~14:00
이벤트 B 13:00~15:00 게시
→ 409
```

## 12-10. 일반 공지 동시 게시

```text
일반 공지 A LIVE
일반 공지 B publish
→ 둘 다 LIVE 가능
```

## 12-11. 주문 연결 이벤트 삭제 보호

```text
announcement_id가 연결된 주문 존재
→ DELETE 거부
```

## 12-12. 관리자 수동 무료 주문

```text
유효 이벤트 없음
+ 인증된 관리자 FREE/VOLUNTEER 주문
→ announcement_id=null
→ 수동 무료 주문 유지
```

기존 `pytest` 전체를 실행한다.

---

## 13. 프런트엔드 검증

최소 실행:

```bash
npm run lint
npm run build
```

검증 항목:

- TypeScript 오류 0건
- Home, MenuDetail, Cart가 동일 current announcements Query 사용
- `location.state.isEventMode`가 가격 판단에 사용되지 않음
- 일반 공지는 메뉴 FREE 표시를 만들지 않음
- 무료 이벤트가 끝나면 열린 화면에서도 0원 표시 해제
- Cart 제출 직전 current 이벤트 재조회
- 이벤트 변경 409에서 자동 주문 재전송 없음
- OrderStatus는 주문에 연결된 이벤트 정보 표시
- `ANNOUNCEMENT_UPDATED` 후 사용자 Query 즉시 갱신
- 관리자 목록 상태 탭과 유형 필터 정상
- 미래 예약 항목이 SCHEDULED로 표시
- 여러 일반 공지 동시 게시 가능
- 무료 이벤트 중복 시간 게시 차단 메시지 표시
- 기존 정산 리포트 정상

---

## 14. 수동 QA 시나리오

## QA 1. 일반 공지

```text
일반 공지 작성
→ 즉시 게시
→ Home 공지 영역 표시
→ 메뉴 가격 정상
→ Cart 결제 정상
```

## QA 2. 예약 공지

```text
미래 시작 시각으로 게시
→ 관리자 목록 예약 탭 표시
→ 사용자 화면 미노출
→ 시작 후 사용자 화면 노출
```

## QA 3. 무료 이벤트 진행

```text
무료 이벤트 게시
→ Home 배너 및 메뉴 0원 표시
→ Cart 무료 안내
→ 주문 생성 시 서버 FREE, 0원, announcement_id 연결
→ 관리자 리포트 반영
```

## QA 4. 무료 이벤트 종료

```text
이벤트 종료 시각 도달
→ 새로고침 없이 또는 current Query 갱신 후 0원 표시 해제
→ 신규 주문 정상 가격
```

## QA 5. 장바구니 중 이벤트 종료

```text
무료 이벤트 중 Cart 진입
→ 사용자 정보 입력 중 이벤트 종료
→ 주문 제출
→ 409
→ 장바구니 유지
→ 가격 재확인 안내
```

## QA 6. 일반 공지와 무료 이벤트 동시 운영

```text
일반 공지 2개 게시
무료 이벤트 1개 게시
→ 사용자 화면에 공지와 이벤트 모두 표시
→ 무료 적용은 이벤트 하나만 담당
```

## QA 7. 이벤트 중복

```text
09:00~14:00 이벤트 게시
13:00~15:00 이벤트 게시 시도
→ 관리자에게 충돌 안내
→ 기존 이벤트 유지
```

## QA 8. 주문 상태 감사 문구

```text
이벤트 주문 생성
→ 이벤트 종료
→ 다른 이벤트 시작
→ 기존 주문 OrderStatus에는 원래 이벤트 후원자 표시
```

## QA 9. 화면 크기

```text
데스크톱
아이패드 가로
아이패드 세로
관리자 PWA 모바일
```

---

## 15. 완료 기준

다음 조건을 모두 만족해야 완료다.

1. 일반 공지는 주문 금액에 절대 영향을 주지 않는다.
2. 공개 사용자는 FREE 또는 VOLUNTEER를 요청해 무료 주문을 만들 수 없다.
3. `total_price=0`만으로 이벤트 주문이 되지 않는다.
4. 무료 이벤트는 서버의 공용 유효성 함수가 LIVE로 판정한 경우에만 적용된다.
5. 공개 API·공개 주문·관리자 주문이 같은 이벤트 유효성 함수를 사용한다.
6. 미래 게시 항목은 예약 상태이며 시작 전 사용자에게 노출되지 않는다.
7. 종료 시각이 지난 항목은 자동으로 사용자 화면과 신규 주문에서 제외된다.
8. 일반 공지는 여러 개 동시에 게시 가능하다.
9. 시간 범위가 겹치는 무료 이벤트는 동시에 게시할 수 없다.
10. 관리자 화면에서 일반 공지와 무료 이벤트 생성 흐름이 분리된다.
11. 관리자 목록에서 진행 중·예약·초안·종료를 한눈에 볼 수 있다.
12. 연결 주문이 있는 이벤트는 물리 삭제되지 않는다.
13. Cart에서 이벤트 상태 변경 시 자동으로 정상 가격 주문을 제출하지 않는다.
14. OrderStatus는 주문 당시 연결된 이벤트 정보를 유지한다.
15. 기존 이벤트 정산 리포트가 유지된다.
16. 기존 주문·푸시·WebSocket·영업 상태·관리자 알림음에 회귀가 없다.
17. `pytest`, `npm run lint`, `npm run build` 결과가 보고된다.

---

## 16. 권장 배포 순서

1. 현재 announcements 데이터 진단
2. 공용 announcement service 추가
3. 신규 `/announcements/current` API 배포
4. 기존 `/announcements/active` 하위 호환 유지 확인
5. 무료 주문 판정 서버 수정 배포
6. 백엔드 테스트 통과 확인
7. 프런트 공용 Query와 사용자 화면 배포
8. Cart 409 처리 배포
9. 관리자 상태 중심 UI 배포
10. 일반 공지·예약 공지·무료 이벤트 실기기 테스트
11. 구버전 프런트 사용량이 사라진 뒤 deprecated API 제거 여부 검토

백엔드를 먼저 배포하여 구버전 프런트와도 호환되도록 한다.

---

## 17. 롤백 방법

롤백 단위를 분리한다.

```text
A. 관리자 UI만 롤백
B. 신규 current announcements Query만 롤백
C. 신규 current API만 롤백
D. 무료 주문 판정 서비스 롤백
```

단, 무료 주문 취약점 수정은 가능하면 롤백하지 않는다.

롤백 중에도 다음을 유지해야 한다.

- 공개 주문의 FREE/VOLUNTEER 차단
- 클라이언트 0원으로 이벤트 강제 불가
- 기존 `/announcements/active` 하위 호환
- 기존 이벤트 주문과 리포트 데이터 보존

---

## 18. Antigravity 결과 보고 형식

작업 완료 후 다음 순서로 보고한다.

1. 기존 문제의 실제 원인
2. 실제 변경한 파일 목록
3. 이벤트 유효성 단일화 방식
4. 무료 주문 판정 변경 전·후
5. 공개 API 계약
6. 관리자 화면 변경 내용
7. DB 마이그레이션 및 데이터 정리 여부
8. 실행한 테스트 명령
9. 테스트 결과
10. 수동 QA 결과
11. 남아 있는 위험
12. 배포 순서
13. 롤백 방법

다음 내용을 명확히 증명해야 한다.

```text
유효 이벤트 없음 + FREE 요청
→ 차단

유효 이벤트 없음 + 0원 요청
→ 차단

일반 공지 LIVE
→ 정상 가격 주문

무료 이벤트 LIVE
→ 서버가 FREE·0원·announcement_id 결정
```
