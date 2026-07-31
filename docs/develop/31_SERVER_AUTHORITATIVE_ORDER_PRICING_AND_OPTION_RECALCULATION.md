# 31. 서버 권위 주문 가격·옵션 재계산 및 이벤트 원가 정합성

## 1. 문서 목적

이 문서는 Holy-Order 주문 시스템에서 **메뉴 가격, 선택 옵션 가격, 텀블러 할인, 일반 주문 최종 금액, 무료 이벤트 주문의 원가, 관리자 수동 무료 주문의 원가**를 서버가 최종 계산하도록 전환하기 위한 구현 명세다.

현재 프런트엔드는 메뉴 상세 화면에서 옵션 가격과 텀블러 할인을 계산한 뒤 다음 값을 주문 요청에 포함한다.

```text
options_text
sub_total
tumbler_discount
total_price
```

백엔드는 메뉴 기본 가격 일부를 확인하지만, 옵션 선택 자체와 옵션 추가금액, 텀블러 할인액, 이벤트 주문의 `original_price` 계산에서 여전히 클라이언트가 전달한 값을 사용한다.

이번 작업의 최종 원칙은 다음과 같다.

> 클라이언트는 메뉴 ID, 수량, 선택한 옵션 ID와 사용자가 화면에서 확인한 예상 금액만 전달한다.  
> 서버는 DB의 메뉴·옵션·할인 정책·현재 무료 이벤트를 기준으로 모든 금액과 표시용 옵션 문자열을 다시 계산한다.

---

## 2. 현재 저장소 기준 확인된 구조

작업 전에 실제 `main` 브랜치 전체를 다시 검색하고, 이 문서의 예시를 현재 타입과 라우트에 맞게 조정한다.

### 2.1 현재 공개 주문 요청

현재 `backend/schemas.py`의 `OrderItemCreate`는 대략 다음 값을 받는다.

```python
menu_id
quantity
options_text
sub_total
tumbler_discount
```

현재 `OrderCreate.total_price`는 클라이언트가 계산한 결제 총액이다.

### 2.2 현재 공개 주문 계산

현재 `backend/routers/orders.py`에서는 다음 값을 사용한다.

```python
item_total = item.sub_total
allowed_discount = item.tumbler_discount * item.quantity
calculated_total += item_total
```

무료 이벤트 주문의 `original_price`도 위 `calculated_total`을 사용한다.

따라서 요청 조작 시 다음 위험이 있다.

```text
- 옵션을 선택한 것처럼 options_text만 변경
- 다른 메뉴의 옵션명을 전송
- 실제 DB에 없는 옵션명을 전송
- 옵션 추가금액을 누락한 sub_total 전송
- 임의의 tumbler_discount 전송
- 무료 이벤트 정산 원가를 낮추거나 높임
- 관리자 무료 주문의 original_price를 임의 변경
```

### 2.3 현재 프런트엔드 장바구니 구조

`MenuDetail.tsx`는 실제 `MenuOption` 객체와 ID를 알고 있지만 장바구니에 넣을 때 ID를 버리고 다음 값만 저장한다.

```text
options_text
price
sub_total
tumbler_discount
```

`CartContext.tsx`도 동일 메뉴 여부를 `menu_id + options_text`로 판단한다.

`Cart.tsx`와 `AdminDirectOrderModal.tsx`는 최종 주문 요청에 옵션 ID가 아니라 문자열·계산 금액을 전송한다.

### 2.4 현재 DB 주문 상세 스냅샷

`OrderItem`은 현재 다음 주요 필드를 가진다.

```text
menu_name_snapshot
menu_price_snapshot
options_text
quantity
sub_total
```

옵션 가격·선택 옵션 목록·할인액·최종 단가를 구조적으로 보관하지 않는다.

---

## 3. 목표

이번 작업의 완료 후에는 다음이 보장되어야 한다.

1. 일반 주문 최종 금액을 서버가 계산한다.
2. 무료 이벤트 주문의 `original_price`를 서버가 계산한다.
3. 관리자 수동 무료·봉사 주문의 `original_price`를 서버가 계산한다.
4. 옵션 추가금액은 DB의 `MenuOption.extra_price`만 사용한다.
5. 텀블러 할인 금액은 서버 정책만 사용한다.
6. 클라이언트의 `options_text`, `sub_total`, `tumbler_discount`는 가격 권위값으로 사용하지 않는다.
7. 다른 메뉴의 옵션, 비활성 옵션, 중복 옵션, 서로 충돌하는 옵션을 차단한다.
8. 주문 시점의 메뉴·옵션·할인 내역을 스냅샷으로 보존한다.
9. 메뉴 또는 옵션 가격이 장바구니 작성 후 변경되면 `409 ORDER_PRICE_CHANGED`로 사용자에게 재확인을 요구한다.
10. 기존 주문 내역과 리포트는 계속 조회 가능해야 한다.
11. 사용자 주문, 관리자 현장 주문, 이벤트 정산이 동일한 가격 계산 서비스를 사용해야 한다.
12. 기존 영업 상태, 이벤트 유효성, PWA 통계, 푸시, WebSocket, Toss 흐름에 회귀가 없어야 한다.

---

## 4. 비목표

이번 작업에서 다음은 구현하지 않는다.

- 쿠폰 시스템
- 회원별 할인
- 포인트 적립
- 메뉴별 재고 자동 차감
- 옵션 수량 2개 이상 선택 기능
- 세금·부가세 계산
- 결제대행사 금액 검증
- 메뉴 레시피 시스템
- 과거 주문 금액을 추측하여 재작성
- 이벤트/공지 UI 전면 재구성
- 일반 공지 푸시 기능

옵션별 수량이 필요한 미래 기능은 별도 명세로 처리한다. 현재 추가 옵션은 동일 옵션을 최대 1회 선택하는 기존 UI를 유지한다.

---

## 5. 핵심 가격 정의

용어를 모든 코드와 테스트에서 일관되게 사용한다.

### 5.1 메뉴 기본 단가

```text
menu_base_price = Menu.price
```

### 5.2 옵션 추가 단가

```text
option_extra_price_per_unit
= 선택한 활성 옵션들의 DB extra_price 합계
```

### 5.3 텀블러 할인 단가

```text
tumbler_discount_per_unit
= 서버 정책의 할인 금액
```

클라이언트가 할인액을 지정하지 못하게 한다.

### 5.4 정상 판매 단가

```text
normal_unit_price
= max(
    0,
    menu_base_price
    + option_extra_price_per_unit
    - tumbler_discount_per_unit
  )
```

### 5.5 정상 판매 품목 합계

```text
normal_line_total
= normal_unit_price * quantity
```

### 5.6 정상 판매 주문 합계

```text
normal_order_total
= sum(normal_line_total)
```

### 5.7 일반 주문

```text
Order.total_price    = normal_order_total
Order.original_price = NULL
OrderItem.sub_total  = normal_line_total
```

### 5.8 무료 이벤트 주문

```text
Order.total_price    = 0
Order.original_price = normal_order_total
Order.payment_method = FREE
Order.announcement_id = 서버의 현재 유효 무료 이벤트 ID
OrderItem.sub_total  = normal_line_total
```

무료 주문이라도 `OrderItem.sub_total`은 실제 결제액 0이 아니라 **정상 판매 기준 제공 가치**로 저장한다. 기존 이벤트 리포트와 TOP 메뉴 통계에서 동일한 의미를 유지하기 위함이다.

### 5.9 관리자 수동 무료·봉사 주문

현재 무료 이벤트가 없다면:

```text
Order.total_price    = 0
Order.original_price = normal_order_total
Order.announcement_id = NULL
Order.payment_method = FREE 또는 VOLUNTEER
OrderItem.sub_total  = normal_line_total
```

현재 유효 무료 이벤트가 있으면 기존 정책대로 이벤트 주문으로 처리하되, `original_price`는 동일한 서버 계산값을 사용한다.

---

## 6. 서버 가격 정책 단일화

## 6.1 서버 정책 상수

최소한 다음 값을 서버의 한 파일에서만 정의한다.

권장 파일:

```text
backend/services/order_pricing_service.py
```

예:

```python
PRICING_VERSION = 2
TUMBLER_DISCOUNT_PER_UNIT = 500
TEMP_OPTION_NAMES = frozenset({"ICE", "HOT"})
CUP_OPTION_NAMES = frozenset({"텀블러", "일회용컵"})
```

문자열 비교는 공백 제거 및 필요한 범위의 대소문자 정규화를 수행한다.

같은 `500` 값을 프런트와 백엔드에 별도로 하드코딩하지 않는다.

## 6.2 공개 가격 정책 API

프런트가 화면 가격을 서버와 동일하게 표시할 수 있도록 다음 API를 추가한다.

```text
GET /api/v1/pricing-policy
```

응답 예:

```json
{
  "success": true,
  "data": {
    "pricing_version": 2,
    "tumbler_discount_per_unit": 500
  },
  "message": "가격 정책을 조회했습니다."
}
```

프런트는 `MenuDetail.tsx`의 고정 `TUMBLER_DISCOUNT = 500`을 제거하고 이 값을 사용한다.

가격 정책을 확인하지 못한 상태에서는 주문 버튼을 활성화하지 않는다.

---

## 7. 주문 요청 계약 변경

## 7.1 `OrderItemCreate`

신규 계약의 권위 입력값은 다음뿐이다.

```python
class OrderItemCreate(BaseModel):
    menu_id: int
    quantity: int = Field(gt=0)
    option_ids: list[int] = Field(default_factory=list)
    client_item_key: str | None = None

    # 아래 값은 배포 호환 기간에만 입력을 받아도 되지만 서버 계산에 사용하지 않는다.
    options_text: str | None = None
    sub_total: int | None = None
    tumbler_discount: int | None = None
```

`client_item_key`는 장바구니 품목과 서버 계산 결과를 연결하기 위해 그대로 응답하는 불투명 식별자다. 가격 계산이나 DB 권한 판단에는 사용하지 않는다.

## 7.2 `OrderCreate`

기존 `total_price` 필드는 제거하지 않고 의미를 다음처럼 변경한다.

```text
total_price = 사용자가 화면에서 확인한 예상 최종 결제액
```

서버는 이를 저장값으로 신뢰하지 않고 서버 계산값과 비교하는 데만 사용한다.

다음 필드를 추가한다.

```python
pricing_version: int = 1
```

신규 프런트는 반드시:

```json
{
  "pricing_version": 2
}
```

를 전송한다.

`AdminOrderCreate`에도 동일 필드를 추가한다.

## 7.3 구버전 클라이언트 처리

`pricing_version != 2`인 주문 요청은 클라이언트 계산값을 신뢰하여 처리하지 않는다.

다음 `409 Conflict`를 반환한다.

```json
{
  "detail": {
    "code": "CLIENT_PRICING_SCHEMA_OUTDATED",
    "message": "주문 방식이 업데이트되었습니다. 앱을 새로고침한 뒤 장바구니를 다시 확인해 주세요.",
    "required_pricing_version": 2
  }
}
```

기존 PWA 캐시나 오래된 브라우저 탭이 잘못된 가격으로 주문되는 것보다 명시적으로 새로고침시키는 것이 안전하다.

---

## 8. 옵션 검증 규칙

가격 서비스는 각 메뉴별로 다음을 검증한다.

## 8.1 메뉴 검증

- 메뉴가 존재해야 한다.
- `Menu.is_active == True`여야 한다.
- 공개 주문은 `Menu.is_available == True`여야 한다.
- 메뉴 가격은 0 이상이어야 한다.

## 8.2 옵션 소유권

전달된 모든 `option_id`는:

- 존재해야 한다.
- 해당 `menu_id`에 속해야 한다.
- `is_active == True`여야 한다.

다른 메뉴의 옵션을 전달하면 차단한다.

## 8.3 중복 옵션

동일한 옵션 ID가 중복되면 `400`으로 차단한다.

```json
{
  "detail": {
    "code": "DUPLICATE_OPTION",
    "message": "동일한 옵션을 중복 선택할 수 없습니다."
  }
}
```

## 8.4 온도 옵션

메뉴에 활성 `ICE/HOT` 옵션이 하나 이상 존재한다면 정확히 하나를 선택해야 한다.

```text
0개 선택 → 차단
2개 선택 → 차단
1개 선택 → 허용
```

## 8.5 컵 옵션

메뉴에 활성 `텀블러/일회용컵` 옵션이 하나 이상 존재한다면 정확히 하나를 선택해야 한다.

```text
0개 선택 → 차단
2개 선택 → 차단
1개 선택 → 허용
```

## 8.6 추가 옵션

온도·컵 그룹 외의 활성 옵션은 각각 0회 또는 1회 선택할 수 있다.

## 8.7 옵션 표시 문자열

`options_text`는 서버가 선택 옵션 DB 데이터로 생성한다.

권장 순서:

```text
온도 옵션
→ 컵 옵션
→ 나머지 옵션을 ID 오름차순 또는 현재 메뉴 옵션 정렬 순서
```

예:

```text
ICE / 텀블러 / 샷 추가
```

클라이언트가 보낸 `options_text`는 저장하지 않는다.

---

## 9. 가격 계산 서비스

## 9.1 파일 구조

```text
backend/services/order_pricing_service.py
```

권장 구조:

```python
@dataclass(frozen=True)
class CalculatedOrderItem:
    client_item_key: str | None
    menu_id: int
    menu_name: str
    menu_image_url: str | None
    quantity: int
    selected_option_ids: tuple[int, ...]
    selected_options_snapshot: tuple[dict, ...]
    options_text: str | None
    menu_base_price: int
    option_extra_price_per_unit: int
    discount_per_unit: int
    discount_total: int
    normal_unit_price: int
    normal_line_total: int


@dataclass(frozen=True)
class CalculatedOrderQuote:
    pricing_version: int
    items: tuple[CalculatedOrderItem, ...]
    normal_total: int
    discount_total: int
```

## 9.2 쿼리 방식

N+1 쿼리를 만들지 않는다.

권장 방식:

- 주문의 모든 `menu_id`를 한 번에 조회
- `joinedload(Menu.options)` 또는 메뉴·옵션을 각각 한 번에 조회
- 딕셔너리로 인덱싱

## 9.3 공용 함수

최소한 다음 함수를 제공한다.

```python
def calculate_order_quote(
    db: Session,
    items: Sequence[schemas.OrderItemCreate],
    *,
    require_available: bool,
) -> CalculatedOrderQuote:
    ...
```

공개 주문과 관리자 주문 모두 이 함수를 사용한다.

라우터에 별도의 가격 계산 구현을 중복 작성하지 않는다.

---

## 10. 주문 견적 API

장바구니가 서버 권위 가격을 표시하도록 다음 API를 추가한다.

```text
POST /api/v1/orders/quote
```

요청 예:

```json
{
  "pricing_version": 2,
  "expected_announcement_id": 15,
  "items": [
    {
      "client_item_key": "cart-abc",
      "menu_id": 3,
      "quantity": 2,
      "option_ids": [10, 14, 19]
    }
  ]
}
```

응답 예:

```json
{
  "success": true,
  "data": {
    "pricing_version": 2,
    "free_event_id": 15,
    "is_event_mode": true,
    "normal_total": 9000,
    "final_total": 0,
    "discount_total": 1000,
    "items": [
      {
        "client_item_key": "cart-abc",
        "menu_id": 3,
        "quantity": 2,
        "option_ids": [10, 14, 19],
        "options_text": "ICE / 텀블러 / 샷 추가",
        "menu_base_price": 4000,
        "option_extra_price_per_unit": 1000,
        "discount_per_unit": 500,
        "normal_unit_price": 4500,
        "normal_line_total": 9000
      }
    ]
  },
  "message": "주문 금액을 계산했습니다."
}
```

이 견적은 가격을 예약하거나 고정하지 않는다. 실제 주문 생성 시 서버는 반드시 다시 계산한다.

---

## 11. 공개 주문 생성 변경

`POST /api/v1/orders`의 흐름을 다음 순서로 구성한다.

```text
1. 사용자 검증
2. 영업 상태 fail-closed 검증
3. pricing_version 검증
4. 현재 유효 무료 이벤트 조회
5. expected_announcement_id 상태 검증
6. calculate_order_quote 실행
7. 서버 최종 결제액 결정
8. 클라이언트 예상 금액과 비교
9. 주문·스냅샷 저장
10. DB commit
11. NEW_ORDER WebSocket 발송
```

## 11.1 서버 최종 결제액

```python
if active_event:
    server_final_total = 0
    original_price = quote.normal_total
    payment_method = "FREE"
    announcement_id = active_event.id
else:
    server_final_total = quote.normal_total
    original_price = None
    payment_method = order.payment_method.value
    announcement_id = None
```

## 11.2 예상 금액 불일치

클라이언트 `order.total_price`와 서버 `server_final_total`이 다르면 주문을 자동 생성하지 않는다.

```json
HTTP 409
{
  "detail": {
    "code": "ORDER_PRICE_CHANGED",
    "message": "메뉴 또는 옵션 가격이 변경되었습니다. 장바구니 금액을 다시 확인해 주세요.",
    "expected_total": 8500,
    "current_total": 9000,
    "normal_total": 9000,
    "free_event_id": null,
    "items": [
      {
        "client_item_key": "cart-abc",
        "normal_unit_price": 4500,
        "normal_line_total": 9000,
        "options_text": "ICE / 텀블러 / 샷 추가"
      }
    ]
  }
}
```

무료 이벤트 주문에서는 프런트 예상값도 0이어야 한다. 이벤트 상태가 변한 경우에는 기존 `EVENT_STATE_CHANGED`를 우선 반환한다.

---

## 12. 관리자 수동 주문 변경

`POST /api/v1/orders/admin`도 동일한 가격 서비스를 사용한다.

클라이언트가 보낸 다음 값으로 `original_price`를 계산하지 않는다.

```text
total_price
sub_total
tumbler_discount
options_text
```

### 12.1 관리자 일반 결제 주문

```text
final total = quote.normal_total
```

예상 금액이 다르면 `409 ORDER_PRICE_CHANGED`를 반환한다.

### 12.2 관리자 FREE 또는 VOLUNTEER 주문

```text
final total    = 0
original_price = quote.normal_total
```

### 12.3 현재 무료 이벤트 진행 중

기존 정책을 유지한다.

```text
final total      = 0
original_price   = quote.normal_total
announcement_id  = active_event.id
payment_method   = FREE
```

`AdminDirectOrderModal.tsx`도 메뉴 옵션 ID를 보존하고 서버 요청에 전달하도록 수정한다.

---

## 13. DB 스냅샷 확장

과거 주문을 변경하지 않고 신규 주문부터 정확한 가격 근거를 저장한다.

## 13.1 신규 필드

`order_items`에 다음 컬럼을 추가한다.

```text
pricing_version                  INTEGER NOT NULL DEFAULT 1
option_price_snapshot            INTEGER NULL
 discount_per_unit_snapshot      INTEGER NULL
 discount_total_snapshot         INTEGER NULL
 unit_price_snapshot             INTEGER NULL
 selected_options_snapshot       JSONB NULL
```

실제 컬럼명은 프로젝트 컨벤션에 맞추되 의미를 유지한다.

권장 SQLAlchemy 예:

```python
pricing_version = Column(Integer, nullable=False, default=1)
option_price_snapshot = Column(Integer, nullable=True)
discount_per_unit_snapshot = Column(Integer, nullable=True)
discount_total_snapshot = Column(Integer, nullable=True)
unit_price_snapshot = Column(Integer, nullable=True)
selected_options_snapshot = Column(JSON, nullable=True)
```

신규 주문은 `pricing_version=2`를 저장한다.

## 13.2 과거 데이터 처리

과거 주문을 추측하여 잘못된 값을 채우지 않는다.

```text
기존 행
→ pricing_version = 1
→ 신규 스냅샷 컬럼은 NULL 허용

신규 행
→ pricing_version = 2
→ 신규 스냅샷 모두 기록
```

과거 `options_text`를 파싱해 옵션 ID나 가격을 역산하지 않는다.

## 13.3 마이그레이션 원칙

30번 작업에서 정리한 스키마 마이그레이션 단일 기준을 사용한다.

- `main.py`에 신규 `ALTER TABLE`을 추가하지 않는다.
- 전용 migration 파일을 작성한다.
- migration은 transaction과 idempotency를 고려한다.
- 신규 컬럼 추가 후 기존 데이터 조회가 계속 가능해야 한다.

---

## 14. 주문 상세 저장 규칙

신규 주문의 `OrderItem`은 서버 계산 결과로만 생성한다.

```python
OrderItem(
    menu_id=calculated.menu_id,
    menu_name_snapshot=calculated.menu_name,
    menu_price_snapshot=calculated.menu_base_price,
    menu_image_url_snapshot=calculated.menu_image_url,
    quantity=calculated.quantity,
    options_text=calculated.options_text,
    sub_total=calculated.normal_line_total,
    pricing_version=2,
    option_price_snapshot=calculated.option_extra_price_per_unit,
    discount_per_unit_snapshot=calculated.discount_per_unit,
    discount_total_snapshot=calculated.discount_total,
    unit_price_snapshot=calculated.normal_unit_price,
    selected_options_snapshot=list(calculated.selected_options_snapshot),
)
```

`selected_options_snapshot` 예:

```json
[
  {
    "id": 10,
    "name": "ICE",
    "extra_price": 0
  },
  {
    "id": 14,
    "name": "텀블러",
    "extra_price": 0
  },
  {
    "id": 19,
    "name": "샷 추가",
    "extra_price": 500
  }
]
```

---

## 15. 이벤트·통계·리포트 정합성

## 15.1 이벤트 원가

이벤트 리포트는 신규 주문에 대해 다음 값을 기준으로 사용한다.

```text
Order.original_price
OrderItem.sub_total
OrderItem.discount_total_snapshot
```

`options_text` 문자열에 `텀블러`가 포함되었는지 검사하여 고정 500원을 역산하지 않는다.

과거 `pricing_version=1` 주문은 기존 fallback 로직을 유지할 수 있다.

```python
if item.pricing_version >= 2:
    discount_total = item.discount_total_snapshot or 0
else:
    discount_total = legacy_discount_calculation(item)
```

## 15.2 TOP 메뉴와 매출 통계

현재 `OrderItem.sub_total` 집계를 유지할 수 있다. 신규 주문부터는 서버 권위 정상 판매 가치가 저장되므로 통계 신뢰도가 높아진다.

## 15.3 관리자 주문 카드

표시용 `options_text`는 서버 생성값이므로 기존 UI를 유지할 수 있다.

필요한 경우 상세 화면에 다음 정보를 추가할 수 있으나 이번 작업의 필수 조건은 아니다.

```text
기본가
옵션 추가금액
텀블러 할인
정상 판매가
```

---

## 16. 프런트엔드 변경

## 16.1 타입

`CartItem`에 다음 필드를 추가한다.

```ts
export interface CartItem {
  cartItemId: string;
  menu_id: number;
  name: string;
  image_url?: string;
  quantity: number;

  selected_option_ids: number[];
  options_text: string | null;

  // 아래 금액은 화면 예상값이며 서버 권위값이 아니다.
  price: number;
  sub_total: number;
  tumbler_discount: number;
}
```

## 16.2 MenuDetail

선택된 모든 옵션의 ID를 저장한다.

```ts
const selectedOptions = [
  selectedTemp,
  selectedCup,
  ...selectedExtras,
].filter(
  (option): option is MenuOption =>
    option !== null,
);

addItem({
  // ...
  selected_option_ids:
    selectedOptions.map(
      (option) => option.id,
    ),
});
```

텀블러 할인액은 `usePricingPolicy()`의 서버 값으로 계산한다.

## 16.3 CartContext

동일 장바구니 품목 판정은 `options_text`가 아니라 정렬된 옵션 ID 집합으로 한다.

```ts
const normalizeOptionIds = (
  ids: number[],
) => [...new Set(ids)]
  .sort((a, b) => a - b)
  .join(',');
```

```ts
item.menu_id === newItem.menu_id &&
normalizeOptionIds(item.selected_option_ids) ===
normalizeOptionIds(newItem.selected_option_ids)
```

## 16.4 Cart 요청

```ts
const orderData = {
  pricing_version: 2,
  total_price: serverQuote.final_total,
  expected_announcement_id:
    currentAnnouncements?.free_event?.id ?? null,
  items: items.map((item) => ({
    client_item_key: item.cartItemId,
    menu_id: item.menu_id,
    quantity: item.quantity,
    option_ids: item.selected_option_ids,
  })),
};
```

다음 값은 더 이상 전송하지 않거나 deprecated compatibility 값으로만 둔다.

```text
options_text
sub_total
tumbler_discount
```

## 16.5 서버 견적 표시

Cart 화면의 상품금액·할인·최종 결제액은 `/orders/quote` 응답을 우선 사용한다.

요청 중에는 주문 버튼을 잠시 비활성화한다.

견적 실패 시 이전 클라이언트 금액으로 주문하지 않는다.

```text
가격 정보를 확인할 수 없어 주문을 진행할 수 없습니다.
```

## 16.6 `409 ORDER_PRICE_CHANGED`

- 자동 재주문하지 않는다.
- 메뉴·공지·견적 Query를 무효화한다.
- 서버가 반환한 최신 견적으로 장바구니 표시를 갱신한다.
- 사용자에게 금액 변경 사실을 안내한다.
- 사용자가 주문 버튼을 다시 눌러야 한다.

예시 문구:

```text
메뉴 또는 옵션 가격이 변경되어 장바구니 금액을 새로 계산했습니다.
최종 결제 금액을 다시 확인해 주세요.
```

## 16.7 구버전 장바구니

기존 localStorage 장바구니에는 `selected_option_ids`가 없다.

`options_text`를 추측하여 옵션 ID로 변환하지 않는다.

권장 방식:

```text
장바구니 스키마 버전 2 도입
→ 기존 버전 또는 selected_option_ids 누락 감지
→ 레거시 장바구니 삭제
→ 사용자에게 메뉴를 다시 담아달라는 1회 안내
```

예:

```json
{
  "version": 2,
  "items": []
}
```

안내 문구:

```text
가격 계산 방식이 업데이트되어 기존 장바구니를 초기화했습니다.
메뉴와 옵션을 다시 선택해 주세요.
```

기존 문자열을 자동 매핑하면 옵션명 중복·비활성 옵션·가격 변경을 안전하게 판단할 수 없으므로 금지한다.

## 16.8 관리자 현장 주문

`AdminDirectOrderModal.tsx`의 선택 항목에도 옵션 ID 배열을 보존한다.

그룹화 키는:

```text
menu_id + 정렬된 option_ids
```

로 변경한다.

무료·봉사 주문이라고 `sub_total=0`을 보내지 않는다. 서버가 `original_price`와 최종 0원을 결정한다.

---

## 17. 오류 코드

다음 구조화된 오류 코드를 사용한다.

| HTTP | code | 의미 |
|---|---|---|
| 400 | `MENU_NOT_FOUND` | 메뉴 없음 |
| 400 | `MENU_NOT_AVAILABLE` | 비활성 또는 품절 |
| 400 | `OPTION_NOT_FOUND` | 옵션 없음 |
| 400 | `OPTION_NOT_AVAILABLE` | 비활성 옵션 |
| 400 | `OPTION_MENU_MISMATCH` | 다른 메뉴 옵션 |
| 400 | `DUPLICATE_OPTION` | 중복 옵션 ID |
| 400 | `TEMPERATURE_OPTION_REQUIRED` | 온도 옵션 누락 |
| 400 | `TEMPERATURE_OPTION_CONFLICT` | ICE/HOT 동시 선택 |
| 400 | `CUP_OPTION_REQUIRED` | 컵 옵션 누락 |
| 400 | `CUP_OPTION_CONFLICT` | 텀블러/일회용컵 동시 선택 |
| 409 | `CLIENT_PRICING_SCHEMA_OUTDATED` | 구버전 클라이언트 |
| 409 | `EVENT_STATE_CHANGED` | 이벤트 상태 변경 |
| 409 | `ORDER_PRICE_CHANGED` | 메뉴·옵션·할인 가격 변경 |

전역 Axios 토스트와 Cart 자체 메시지가 중복되지 않도록 기존 오류 처리 정책을 따른다.

---

## 18. 보안 및 데이터 무결성 규칙

1. 클라이언트 `sub_total`은 DB 저장값으로 사용하지 않는다.
2. 클라이언트 `tumbler_discount`는 할인 판정에 사용하지 않는다.
3. 클라이언트 `options_text`는 옵션 선택 판정에 사용하지 않는다.
4. 클라이언트 `total_price`는 예상 금액 비교용으로만 사용한다.
5. 무료 이벤트 적용 여부는 서버의 현재 유효 이벤트로만 결정한다.
6. 공개 클라이언트는 FREE·VOLUNTEER 결제수단을 요청할 수 없다.
7. 관리자 FREE·VOLUNTEER 주문도 원가는 서버가 계산한다.
8. 옵션 ID는 메뉴 소유권과 활성 여부를 검증한다.
9. 가격 계산 후 DB commit 전에 메뉴·옵션을 클라이언트 값으로 다시 덮어쓰지 않는다.
10. DB commit 성공 후에만 NEW_ORDER WebSocket을 보낸다.

---

## 19. 백엔드 자동 테스트

실제 DB 모델과 현재 fixture에 맞게 다음 테스트를 추가한다.

## 19.1 정상 일반 주문

```text
메뉴 3,000
샷 추가 500
수량 2
→ 서버 normal_total 7,000
→ total_price 7,000
→ item.sub_total 7,000
```

## 19.2 텀블러 할인

```text
메뉴 3,000
샷 추가 500
텀블러 -500
수량 2
→ 단가 3,000
→ 합계 6,000
→ discount_total_snapshot 1,000
```

## 19.3 클라이언트 조작 무시

```text
sub_total=1
tumbler_discount=999999
options_text="무료"
실제 option_ids는 ICE + 일회용컵
→ 서버는 정상 DB 가격으로 계산
→ 예상 total과 다르면 409
```

## 19.4 다른 메뉴 옵션

```text
메뉴 A 주문에 메뉴 B 옵션 ID 전달
→ 400 OPTION_MENU_MISMATCH
```

## 19.5 비활성 옵션

```text
is_active=False 옵션 전달
→ 400 OPTION_NOT_AVAILABLE
```

## 19.6 중복 옵션

```text
option_ids=[1,1]
→ 400 DUPLICATE_OPTION
```

## 19.7 온도·컵 충돌

```text
ICE + HOT
→ 400

텀블러 + 일회용컵
→ 400
```

## 19.8 필수 그룹 누락

```text
메뉴에 ICE/HOT 그룹이 있으나 선택 없음
→ 400

메뉴에 컵 그룹이 있으나 선택 없음
→ 400
```

## 19.9 이벤트 주문

```text
LIVE 무료 이벤트 존재
정상 판매 합계 8,500
클라이언트 최종 예상 0
→ total_price 0
→ original_price 8,500
→ announcement_id 설정
→ OrderItem.sub_total 합계 8,500
```

## 19.10 관리자 무료 주문

```text
이벤트 없음
관리자 FREE 또는 VOLUNTEER
정상 판매 합계 8,500
→ total_price 0
→ original_price 8,500
→ announcement_id NULL
```

## 19.11 가격 변경

```text
장바구니 예상 3,000
주문 전 메뉴 DB 가격 3,500으로 변경
→ 409 ORDER_PRICE_CHANGED
→ 주문 DB 행 생성 없음
```

옵션 가격 변경도 동일하게 테스트한다.

## 19.12 견적과 주문 계산 일치

동일 요청을 `/orders/quote`와 `/orders`에 전달했을 때:

```text
quote.final_total == 생성된 Order.total_price
quote.normal_total == 이벤트 주문의 Order.original_price
```

## 19.13 스냅샷

신규 주문의 다음 값이 정확히 저장되는지 확인한다.

```text
pricing_version
menu_price_snapshot
option_price_snapshot
discount_per_unit_snapshot
discount_total_snapshot
unit_price_snapshot
selected_options_snapshot
options_text
sub_total
```

## 19.14 레거시 조회

신규 스냅샷이 NULL인 `pricing_version=1` 과거 주문도 `OrderResponse`와 이벤트 리포트에서 오류 없이 조회되어야 한다.

---

## 20. 프런트엔드 자동 테스트

현재 프런트에 테스트 환경이 없다면 불필요하게 대규모 테스트 프레임워크를 추가하지 않는다. 이미 Vitest가 추가되어 있다면 기존 환경을 사용한다.

최소 검증 대상:

```text
- MenuDetail이 option ID를 장바구니에 저장
- CartContext가 정렬된 option ID 기준으로 병합
- 다른 option ID 조합은 별도 장바구니 행
- Cart payload가 option_ids와 pricing_version=2를 전송
- 409 ORDER_PRICE_CHANGED 시 자동 재주문하지 않음
- 레거시 장바구니 초기화 안내
- 관리자 현장 주문 payload에 option_ids 포함
```

자동 테스트 환경을 새로 추가하지 않는 경우 최소한 타입 검사와 수동 QA 결과를 상세히 보고한다.

---

## 21. 실행 명령

```bash
cd backend
pytest -q
```

마이그레이션 검증 명령이 있다면 함께 실행한다.

```bash
cd frontend
npm ci
npm run lint
npm run build
```

프런트 테스트 스크립트가 존재하면:

```bash
npm run test
```

---

## 22. 수동 QA

## 22.1 일반 사용자 주문

```text
아메리카노
ICE
일회용컵
샷 추가
수량 2
→ 화면 금액과 서버 주문 금액 일치
```

## 22.2 텀블러

```text
텀블러 선택
→ 서버 정책 할인액 적용
→ Cart·OrderStatus·관리자 주문 카드 금액 일치
```

## 22.3 무료 이벤트

```text
무료 이벤트 LIVE
→ 화면 최종 0원
→ 서버 total_price 0
→ original_price는 옵션·할인 포함 정상 판매 가치
→ 이벤트 정산 리포트와 일치
```

## 22.4 관리자 무료 주문

```text
관리자 현장 주문
FREE 또는 VOLUNTEER
→ total_price 0
→ original_price 서버 계산
```

## 22.5 가격 변경 경쟁 조건

```text
사용자가 장바구니를 열어둠
→ 관리자가 메뉴 또는 옵션 가격 변경
→ 사용자가 주문
→ 409 안내
→ 최신 견적 표시
→ 재확인 후 주문 성공
```

## 22.6 옵션 비활성화

```text
사용자가 옵션을 담아둠
→ 관리자가 해당 옵션 삭제 또는 비활성화
→ 주문 시 명확한 오류
→ 잘못된 주문 생성 없음
```

## 22.7 PWA 구버전

```text
오래된 PWA 코드 또는 기존 장바구니
→ CLIENT_PRICING_SCHEMA_OUTDATED 또는 로컬 장바구니 초기화
→ 잘못된 금액으로 주문되지 않음
```

## 22.8 기존 기능 회귀

- 영업 시작·종료 실시간 반영
- 사용자 주문 WebSocket
- 관리자 새 주문 알림음
- 주문 준비 완료 푸시
- Toss 딥링크 및 송금 완료 확인
- PWA 설치 통계 연결
- 이벤트 상태 409
- 관리자 수동 주문
- 주문 내역·통계·이벤트 정산

---

## 23. 배포 순서

가격 계약이 바뀌므로 배포 순서가 중요하다.

### 23.1 사전 준비

1. 운영 DB 백업
2. 현재 Railway·Vercel 커밋 SHA 기록
3. 기존 장바구니 사용자 영향 공지 필요 여부 결정
4. 테스트 환경에서 migration 재실행 가능성 검증

### 23.2 권장 배포

```text
1. DB migration 적용
2. backend 배포
   - pricing_version=2 지원
   - 구버전 요청은 안전한 409 반환
   - quote API 제공
3. backend 테스트 및 health 확인
4. frontend 배포
   - option_ids 전송
   - pricing policy/quote 사용
   - 레거시 장바구니 초기화
5. iPhone·Android·일반 QR 웹 수동 주문 검증
6. 이벤트·관리자 무료 주문 정산 검증
```

Backend 배포와 frontend 배포 사이의 짧은 시간 동안 구버전 클라이언트가 409를 받을 수 있다. 이때 사용자에게 새로고침 안내가 표시되어야 한다.

### 23.3 배포 후 확인 SQL

신규 주문의 스냅샷을 확인한다.

```sql
SELECT
    oi.id,
    oi.order_id,
    oi.menu_name_snapshot,
    oi.menu_price_snapshot,
    oi.option_price_snapshot,
    oi.discount_per_unit_snapshot,
    oi.discount_total_snapshot,
    oi.unit_price_snapshot,
    oi.sub_total,
    oi.pricing_version,
    oi.selected_options_snapshot
FROM order_items oi
ORDER BY oi.id DESC
LIMIT 20;
```

이벤트 주문 확인:

```sql
SELECT
    id,
    total_price,
    original_price,
    announcement_id,
    payment_method
FROM orders
WHERE announcement_id IS NOT NULL
ORDER BY id DESC
LIMIT 20;
```

---

## 24. 롤백

DB 신규 컬럼은 기존 코드가 무시할 수 있는 nullable 확장 컬럼으로 설계한다.

문제 발생 시:

```text
1. 프런트엔드 이전 버전 롤백
2. 백엔드 이전 버전 롤백
3. 신규 컬럼은 즉시 삭제하지 않음
4. 주문 생성 중단 여부 확인
5. 문제 주문 ID와 서버 로그 보존
```

다만 이전 백엔드로 롤백하면 클라이언트 금액 신뢰 문제가 다시 생긴다. 롤백은 긴급 복구 수단일 뿐 최종 상태로 유지하지 않는다.

신규 컬럼 삭제는 데이터 보존 검토 후 별도 migration으로만 수행한다.

---

## 25. 완료 보고 형식

Antigravity는 다음 순서로 보고한다.

1. 기존 취약한 가격 흐름 요약
2. 실제 변경한 파일 목록
3. 신규 가격 계산 서비스 구조
4. API 요청·응답 계약 변경
5. 옵션 검증 규칙
6. 텀블러 할인 정책 위치
7. DB migration 내용
8. 레거시 장바구니 처리 방식
9. 일반 주문·이벤트 주문·관리자 무료 주문 계산 예시
10. 실행한 테스트 명령
11. 테스트·lint·build 결과
12. 수동 QA 결과
13. 배포 순서
14. 롤백 방법
15. 남은 위험과 후속 작업

다음 근거를 반드시 포함한다.

```text
- 조작된 sub_total과 tumbler_discount가 서버 계산에 사용되지 않음
- 다른 메뉴 옵션 ID가 차단됨
- 이벤트 original_price가 서버 계산값임
- 관리자 FREE/VOLUNTEER original_price가 서버 계산값임
- 가격 변경 시 409 후 자동 주문하지 않음
- 신규 OrderItem 스냅샷이 DB에 저장됨
- 과거 pricing_version=1 주문이 정상 조회됨
```

---

## 26. 최종 완료 기준

다음 조건을 모두 만족해야 완료다.

- [ ] 공개 주문에서 클라이언트 금액을 저장값으로 사용하지 않는다.
- [ ] 관리자 주문에서 클라이언트 금액을 `original_price`로 사용하지 않는다.
- [ ] `option_ids`를 기준으로 DB 옵션을 검증한다.
- [ ] 옵션 가격은 DB 값만 사용한다.
- [ ] 텀블러 할인은 서버 정책만 사용한다.
- [ ] 서버 견적 API와 실제 주문 계산 결과가 일치한다.
- [ ] 일반 주문 금액 변경 시 409가 발생한다.
- [ ] 이벤트 상태 변경 시 기존 409 정책이 유지된다.
- [ ] 이벤트 주문의 `original_price`가 서버 계산값이다.
- [ ] 관리자 무료·봉사 주문의 `original_price`가 서버 계산값이다.
- [ ] 신규 가격 스냅샷이 저장된다.
- [ ] 레거시 주문은 계속 조회된다.
- [ ] 구버전 장바구니가 안전하게 초기화된다.
- [ ] `pytest`가 통과한다.
- [ ] `npm run lint`가 통과한다.
- [ ] `npm run build`가 통과한다.
- [ ] iPhone PWA, Android PWA, QR 웹에서 주문이 검증된다.
- [ ] 주문 푸시, WebSocket, Toss, 이벤트 리포트에 회귀가 없다.
