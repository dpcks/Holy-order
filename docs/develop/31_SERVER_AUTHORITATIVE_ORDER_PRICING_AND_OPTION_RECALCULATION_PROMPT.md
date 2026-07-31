# Antigravity 실행 프롬프트 — 31번 서버 권위 주문 가격·옵션 재계산

저장소 루트에서 아래 문서를 먼저 읽고, 문서에 정의된 범위만 구현해 주세요.

```text
docs/antigravity/31_SERVER_AUTHORITATIVE_ORDER_PRICING_AND_OPTION_RECALCULATION.md
```

## 작업 목적

현재 Holy-Order 주문 요청은 프런트엔드가 계산한 다음 값을 백엔드에 전달합니다.

```text
options_text
sub_total
tumbler_discount
total_price
```

현재 백엔드는 메뉴 기본가 일부를 확인하지만 옵션 선택·옵션 가격·텀블러 할인·이벤트 `original_price`와 관리자 무료 주문 `original_price` 계산에서 클라이언트 값을 사용하고 있습니다.

이번 작업에서 다음 원칙을 구현하세요.

> 클라이언트는 메뉴 ID, 수량, 선택 옵션 ID, 화면에서 확인한 예상 총액만 전달합니다.  
> 서버는 DB 메뉴·옵션, 서버 텀블러 할인 정책, 현재 유효 무료 이벤트를 기준으로 모든 금액과 옵션 표시 문자열을 재계산합니다.

## 반드시 먼저 조사할 파일

```text
backend/routers/orders.py
backend/schemas.py
backend/models.py
backend/services/announcement_service.py
backend/routers/admin.py
backend/tests/test_api.py
backend/tests/test_announcements.py
backend/migrations/*
frontend/src/pages/MenuDetail.tsx
frontend/src/pages/Cart.tsx
frontend/src/context/CartContext.tsx
frontend/src/types/index.ts
frontend/src/pages/admin/AdminDirectOrderModal.tsx
frontend/src/api/client.ts
frontend/src/api/queryKeys.ts
```

아래 검색도 수행하세요.

```bash
rg -n \
  "sub_total|tumbler_discount|options_text|original_price|menu_price_snapshot|MenuOption|expected_announcement_id|ORDER_PRICE_CHANGED" \
  backend frontend/src
```

## 필수 구현

1. `backend/services/order_pricing_service.py`에 공용 서버 가격 계산 서비스를 만드세요.
2. 공개 주문과 관리자 현장 주문이 같은 계산 서비스를 사용하게 하세요.
3. 주문 항목 요청에 `option_ids`와 `pricing_version=2`를 도입하세요.
4. 클라이언트의 `options_text`, `sub_total`, `tumbler_discount`를 가격 권위값으로 사용하지 마세요.
5. 옵션이 해당 메뉴에 속하는지, 활성 상태인지, 중복인지 검증하세요.
6. ICE/HOT, 텀블러/일회용컵 충돌 및 필수 선택을 검증하세요.
7. 텀블러 할인은 서버 정책 한 곳에서만 정의하세요.
8. 프런트가 같은 할인액을 표시하도록 공개 가격 정책 API를 제공하세요.
9. `/api/v1/orders/quote` 견적 API를 같은 계산 서비스로 구현하세요.
10. 실제 주문 생성 시 견적과 별개로 다시 계산하세요.
11. 예상 금액과 서버 금액이 다르면 `409 ORDER_PRICE_CHANGED`를 반환하고 자동 주문하지 마세요.
12. 기존 `EVENT_STATE_CHANGED` 409 정책을 유지하세요.
13. 무료 이벤트 주문의 `original_price`를 서버 정상 판매 합계로 저장하세요.
14. 관리자 FREE/VOLUNTEER 주문의 `original_price`도 서버 계산값으로 저장하세요.
15. `OrderItem`에 옵션 가격·할인·단가·선택 옵션 JSON 스냅샷과 `pricing_version`을 추가하세요.
16. 과거 주문은 추측해서 재계산하지 말고 `pricing_version=1` 레거시로 유지하세요.
17. 프런트 장바구니에 `selected_option_ids`를 저장하세요.
18. 장바구니 동일 항목 비교는 옵션 문자열이 아니라 정렬된 옵션 ID로 처리하세요.
19. 기존 localStorage 장바구니에 옵션 ID가 없으면 안전하게 초기화하고 사용자에게 안내하세요.
20. 관리자 현장 주문도 옵션 ID를 전송하도록 수정하세요.

## 금지 사항

- 클라이언트 `sub_total`을 DB에 그대로 저장하지 마세요.
- 클라이언트 `tumbler_discount`로 할인액을 결정하지 마세요.
- 클라이언트 `options_text`를 파싱해 가격을 계산하지 마세요.
- 과거 주문의 옵션 가격을 추측하여 backfill하지 마세요.
- `main.py`에 신규 `ALTER TABLE`을 추가하지 마세요.
- 무료 이벤트·관리자 무료 주문의 원가를 클라이언트 `total_price`로 저장하지 마세요.
- 가격 변경 후 자동으로 재주문하지 마세요.
- 관련 없는 WebSocket, 푸시, PWA 통계, 재고, 이벤트 UI를 리팩터링하지 마세요.
- 서버 가격 계산을 공개 주문과 관리자 주문에 각각 복사하지 마세요.

## 데이터 의미

신규 주문부터 다음 의미를 유지하세요.

```text
일반 주문
Order.total_price = 서버 정상 판매 합계
Order.original_price = NULL
OrderItem.sub_total = 서버 정상 판매 품목 합계

무료 이벤트 주문
Order.total_price = 0
Order.original_price = 서버 정상 판매 합계
OrderItem.sub_total = 서버 정상 판매 품목 합계

관리자 FREE/VOLUNTEER 주문
Order.total_price = 0
Order.original_price = 서버 정상 판매 합계
OrderItem.sub_total = 서버 정상 판매 품목 합계
```

## 하위 호환성

구버전 PWA 또는 오래된 브라우저 탭이 `pricing_version=2` 없이 주문하면 클라이언트 계산값을 신뢰하여 처리하지 마세요.

```text
409 CLIENT_PRICING_SCHEMA_OUTDATED
```

를 반환하고 새로고침·장바구니 재구성을 안내하세요.

DB 신규 컬럼은 nullable 확장 방식으로 추가하고 과거 행은 계속 조회 가능해야 합니다.

## 필수 테스트

다음을 자동 테스트하세요.

```text
정상 메뉴 + 옵션 가격 계산
텀블러 할인 서버 계산
조작된 sub_total 무시
조작된 tumbler_discount 무시
다른 메뉴 옵션 차단
비활성 옵션 차단
중복 옵션 차단
ICE/HOT 동시 선택 차단
텀블러/일회용컵 동시 선택 차단
필수 온도·컵 옵션 누락 차단
일반 주문 가격 변경 409
무료 이벤트 total_price=0 및 original_price 서버 계산
관리자 FREE/VOLUNTEER original_price 서버 계산
견적 API와 주문 생성 결과 일치
신규 OrderItem 가격 스냅샷 저장
pricing_version=1 과거 주문 조회
구버전 pricing schema 요청 409
```

## 실행 명령

```bash
cd backend
pytest -q
```

```bash
cd frontend
npm ci
npm run lint
npm run build
```

프런트 테스트 스크립트가 이미 있으면 함께 실행하세요.

```bash
npm run test
```

## 수동 QA

다음을 iPhone PWA, Android PWA, 일반 QR 웹에서 확인하세요.

```text
일반 주문
샷 추가 주문
텀블러 할인 주문
무료 이벤트 주문
관리자 FREE 주문
관리자 VOLUNTEER 주문
장바구니 작성 후 메뉴 가격 변경
장바구니 작성 후 옵션 가격 변경
장바구니 작성 후 옵션 비활성화
Toss 주문
```

## 완료 보고

다음 순서로 보고하세요.

1. 기존 취약한 가격 흐름
2. 변경 파일 목록
3. 가격 계산 서비스 구조
4. 신규 API 계약
5. 옵션 검증 규칙
6. 텀블러 할인 정책 위치
7. DB migration
8. 프런트 장바구니 변경
9. 레거시 장바구니 처리
10. 테스트 명령과 결과
11. 수동 QA 결과
12. 배포 순서
13. 롤백 방법
14. 남은 위험

“수정 완료”라고만 보고하지 말고 다음 근거를 포함하세요.

```text
- 조작된 클라이언트 금액이 저장되지 않는 테스트
- 이벤트 original_price 서버 계산 결과
- 관리자 무료 주문 original_price 서버 계산 결과
- 다른 메뉴 옵션 차단 결과
- ORDER_PRICE_CHANGED 409 결과
- 신규 DB 스냅샷 실제 값
- 과거 주문 조회 결과
```
