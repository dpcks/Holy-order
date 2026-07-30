# Antigravity 실행 프롬프트 — 이벤트 유효성·무료 주문 판정 및 관리자 UI 개선

저장소 루트에서 아래 문서를 먼저 읽고, **22번 문서에 정의된 범위만** 구현해 주세요.

```text
docs/antigravity/22_EVENT_ANNOUNCEMENT_VALIDITY_AND_ADMIN_UI.md
```

## 이번 작업의 핵심 목표

현재 일반 공지와 무료 제공 이벤트가 하나의 Announcement 구조에서 관리되고 있으므로, 다음을 안전하게 분리해 주세요.

```text
일반 공지
→ 사용자 안내만 제공
→ 주문 가격과 결제수단에 영향 없음

무료 제공 이벤트
→ 서버가 현재 유효한 이벤트인지 판정
→ 유효할 때만 서버가 최종 0원·FREE·announcement_id를 결정
```

현재 공개 주문 코드에서 클라이언트의 `payment_method=FREE` 또는 `total_price=0`이 이벤트 주문 판정에 영향을 줄 수 있는지 먼저 확인하세요. 해당 로직이 존재하면 제거하고, 무료 여부를 서버의 유효한 무료 이벤트 조회 결과만으로 결정하세요.

## 작업 전 필수 조사

다음을 전체 검색하세요.

```bash
rg -n \
  "Announcement|announcements/active|is_event_mode|is_active|starts_at|ends_at|FREE|total_price == 0|announcement_id|ANNOUNCEMENT_UPDATED" \
  backend frontend/src
```

특히 아래 파일을 확인하세요.

```text
backend/models.py
backend/schemas.py
backend/routers/menus.py
backend/routers/orders.py
backend/routers/admin.py
frontend/src/pages/admin/AdminAnnouncements.tsx
frontend/src/pages/Home.tsx
frontend/src/pages/MenuDetail.tsx
frontend/src/pages/Cart.tsx
frontend/src/pages/OrderStatus.tsx
frontend/src/api/queryKeys.ts
frontend/src/types/index.ts
```

문서의 예시를 맹목적으로 복사하지 말고 현재 브랜치의 실제 API, 타입, 마이그레이션 구조에 맞게 구현하세요.

## 반드시 구현할 것

1. `backend/services/announcement_service.py` 또는 동등한 공용 서비스 추가
2. 공개 조회·공개 주문·관리자 수동 주문이 동일한 이벤트 유효성 함수를 사용
3. 이벤트 유효 범위는 `starts_at <= now < ends_at`
4. `DRAFT / SCHEDULED / LIVE / ENDED` 파생 상태 제공
5. 신규 `GET /api/v1/announcements/current` 추가
6. 기존 `/announcements/active`는 배포 호환성을 위해 유지하되 시간 조건 적용
7. 일반 공지는 여러 개 동시 게시 가능
8. 무료 이벤트는 겹치는 시간대에 최대 1개
9. 공개 주문에서 FREE와 VOLUNTEER 요청 차단
10. `total_price=0`을 이벤트 판정에 사용하지 않기
11. 유효 이벤트가 있으면 서버가 `total_price=0`, `payment_method=FREE`, `announcement_id` 결정
12. Cart의 stale 이벤트를 감지하기 위한 `expected_announcement_id` 또는 동등한 안전장치
13. 이벤트가 주문 제출 전에 바뀌면 409를 반환하고 자동 정상가 주문 재전송 금지
14. OrderStatus는 현재 이벤트가 아니라 주문에 연결된 이벤트 정보 표시
15. 관리자 화면에 `[일반 공지 작성]`, `[무료 이벤트 만들기]` 분리
16. 관리자 목록을 `진행 중 / 예약 / 초안 / 종료 / 전체` 상태 중심으로 재구성
17. 유형 필터, 검색, 현재 진행 중 섹션, 예약 표시
18. 무료 이벤트 게시 전 영향 확인 모달
19. 주문이 연결된 이벤트 물리 삭제 차단
20. commit 후 `ANNOUNCEMENT_UPDATED` 브로드캐스트

## 범위 제한

이번 작업에서 아래는 구현하지 마세요.

```text
일반 공지 푸시 발송
공지 우선순위·노출 위치 전체 시스템
이벤트 템플릿·복제
관리자 감사 로그 전체
정산 CSV·이미지 내보내기
Announcement 테이블 전면 분리
주문 가격 계약 전체 재설계
WebSocket 전체 리팩터링
기존 주문 푸시 변경
```

`03_SERVER_AUTHORITATIVE_ORDER_PRICING.md`가 현재 브랜치에 이미 적용돼 있다면 해당 가격 서비스를 재사용하세요. 아직 적용되지 않았다면 이번 작업에서는 최소한 클라이언트가 FREE·0원 요청으로 이벤트를 강제하지 못하도록 하되, 03번 작업을 몰래 중복 구현하지 마세요.

## 테스트

백엔드:

```bash
pytest
```

최소 검증:

```text
유효 이벤트 없음 + FREE 요청 → 400
유효 이벤트 없음 + 0원 요청 → 차단
일반 공지 LIVE → 정상 가격
무료 이벤트 LIVE → 서버가 FREE·0원·announcement_id 적용
만료 이벤트 → 미적용
예약 이벤트 → 시작 전 미노출
stale expected event → 409
무료 이벤트 시간 중복 → 409
일반 공지 여러 개 동시 게시 → 성공
주문 연결 이벤트 삭제 → 거부
```

프런트엔드:

```bash
npm run lint
npm run build
```

최소 검증:

```text
Home·MenuDetail·Cart가 동일 current announcements Query 사용
route state의 isEventMode를 가격 판단에 사용하지 않음
Cart 제출 직전 이벤트 재확인
409에서 장바구니 유지 및 결제 재확인 안내
관리자 상태 탭과 유형별 생성 흐름 정상
OrderStatus가 주문에 연결된 이벤트 표시
```

## 완료 보고

아래 순서로 보고하세요.

1. 실제 원인
2. 변경 파일
3. 이벤트 유효성 단일화 방식
4. 무료 주문 판정 전·후
5. 신규·호환 API 계약
6. 관리자 UI 변경
7. 테스트 명령과 결과
8. 수동 QA
9. 남은 위험
10. 배포 순서
11. 롤백 방법

코드 수정과 검증까지 완료하고, 계획만 작성한 뒤 멈추지 마세요.
