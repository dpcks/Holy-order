# Antigravity 작업 패키지 안내

## 목적

이 디렉터리는 **Holy-Order 교회 카페 주문 시스템**의 보안, 결제 신뢰성, 주문 안정성, 실시간 통신, 운영 기능을 단계적으로 개선하기 위한 작업 명세 모음이다.

한 번에 모든 문서를 실행하지 말고, **문서 하나당 하나의 작업·브랜치·검증·커밋**으로 처리한다. 각 문서는 Antigravity에게 그대로 전달할 수 있는 실행 지시서다.

---

## 프로젝트 기준 환경

- 프런트엔드: React 19, TypeScript, Vite, TanStack Query v5, PWA
- 백엔드: FastAPI, SQLAlchemy, PostgreSQL
- 프런트 배포: Vercel
- 백엔드 및 DB: Railway
- 이미지: Cloudinary
- 실시간 통신: FastAPI WebSocket
- Railway 현재 구성: Singapore, Replica 1개, Uvicorn 프로세스 1개
- 현재 WebSocket 연결 목록은 프로세스 메모리에 저장됨

---

## Antigravity에게 전달하는 기본 문구

각 문서를 전달할 때 다음 문장을 함께 사용한다.

> 저장소 루트에서 이 문서를 읽고, **이 문서에 정의된 범위만** 구현해 주세요.  
> 먼저 관련 코드를 전체 검색해 현재 동작을 확인하고, 문서의 예시를 맹목적으로 복사하지 말고 실제 타입·라우트·응답 구조에 맞추세요.  
> 기존 기능을 보존하는 최소 변경을 우선하고, 코드 수정 후 빌드·테스트·정적 검사까지 실행하세요.  
> 관련 없는 리팩터링, 패키지 대규모 업데이트, UI 전면 변경은 하지 마세요.  
> 작업이 끝나면 변경 파일, 구현 내용, 테스트 결과, 남은 위험, 배포 및 롤백 순서까지 보고하세요.

---

## 권장 실행 순서

### P0 — 즉시 처리할 보안·금액 신뢰성

1. `01_REALTIME_BUSINESS_STATUS_SYNC.md`
2. `02_ACCESS_CONTROL_AND_DEV_ENDPOINTS.md`
3. `03_SERVER_AUTHORITATIVE_ORDER_PRICING.md`
4. `04_PUBLIC_ORDER_ACCESS_TOKEN.md`
5. `05_TOSS_PAYMENT_REPORTED_FLOW.md`
6. `06_ORDER_IDEMPOTENCY_AND_DAILY_SEQUENCE.md`

### P1 — 실시간 통신과 푸시 안정성

7. `07_WEBSOCKET_HARDENING.md`
8. `08_WEBSOCKET_CHANNEL_SPLIT.md`
9. `09_PUSH_SUBSCRIPTION_MULTI_ORDER.md`

### P1 기반 정리

10. `10_TIMEZONE_AND_ALEMBIC_FOUNDATION.md`

### P2 — 운영 기능 및 사용자 경험

11. `11_STORE_OPERATING_STATUS_ENUM.md`
12. `12_QUEUE_CAPACITY_AND_WAIT_TIME.md`
13. `13_MENU_DEEP_LINK_AND_QR_ANALYTICS.md`
14. `14_ADMIN_AUDIT_AND_CLOSING_WORKFLOW.md`
15. `15_PRODUCTION_OPERATIONS_AND_RECOVERY.md`

### P2 — 푸시 기능 확장 및 장애 수정

16. `16_GENERAL_PUSH_NOTIFICATION_BROADCAST.md`
17. `17_IOS_PWA_BACKGROUND_ORDER_READY_PUSH_FIX.md`

### P3 — PWA 설치 경험 및 설치 통계

18. `18_ADMIN_PWA_SEPARATE_INSTALL.md`
19. `19_PWA_INSTALLATION_TRACKING_AND_ANALYTICS.md`
23. `23_PWA_INSTALLATION_ANALYTICS_RELIABILITY_FIX.md` — 현재 구현된 설치 통계의 전송·인증·FK·집계·API 계약 오류 수정
25. `25_ADMIN_PWA_HEARTBEAT_FORCE_REFRESH.md` — 같은 관리자 PWA에서 계정 전환 시 throttle을 우회해 현재 관리자와 즉시 재연결
26. `26_PWA_INSTALLATION_DB_CONSTRAINT_VERIFICATION.md` — Railway PostgreSQL의 관리자·주문 PWA FK, 인덱스, 고아 참조를 검증하고 안전하게 수정

### P3 — 사용자 PWA 화면 안정화

24. `24_PUBLIC_PWA_SCROLL_BACKGROUND_CONTINUITY_FIX.md` — MenuDetail·Cart·OrderStatus의 검은 배경 노출, fixed 하단 바, safe-area 및 동적 viewport 개선

### P3 — 관리자 운영 UI 개선

20. `20_SUNDAY_VOLUNTEER_SCHEDULE_BOARD.md`
21. `21_INVENTORY_MANAGEMENT_UI_REDESIGN.md`
22. `22_EVENT_ANNOUNCEMENT_VALIDITY_AND_ADMIN_UI.md`
27. `27_INVENTORY_ITEM_SCOPED_OPTIMISTIC_ROLLBACK.md` — 재고 수량 저장 실패 시 해당 품목만 복원하고 다른 품목의 성공 값을 보존

실행 프롬프트만 별도로 전달해야 할 때는 다음 파일을 사용한다.

- `18_ADMIN_PWA_ANTIGRAVITY_PROMPT.md`
- `19_PWA_INSTALLATION_TRACKING_ANTIGRAVITY_PROMPT.md`
- `20_SUNDAY_VOLUNTEER_SCHEDULE_ANTIGRAVITY_PROMPT.md`
- `21_INVENTORY_MANAGEMENT_UI_ANTIGRAVITY_PROMPT.md`
- `22_EVENT_ANNOUNCEMENT_ANTIGRAVITY_PROMPT.md`
- `23_PWA_INSTALLATION_ANALYTICS_RELIABILITY_FIX_PROMPT.md`
- `24_PUBLIC_PWA_SCROLL_BACKGROUND_CONTINUITY_FIX_PROMPT.md`
- `25_ADMIN_PWA_HEARTBEAT_FORCE_REFRESH_PROMPT.md`
- `26_PWA_INSTALLATION_DB_CONSTRAINT_VERIFICATION_PROMPT.md`
- `27_INVENTORY_ITEM_SCOPED_OPTIMISTIC_ROLLBACK_PROMPT.md`

---

## 의존 관계

- `04_PUBLIC_ORDER_ACCESS_TOKEN.md` 완료 후 `08_WEBSOCKET_CHANNEL_SPLIT.md`와 `09_PUSH_SUBSCRIPTION_MULTI_ORDER.md`를 수행하는 것이 안전하다.
- `10_TIMEZONE_AND_ALEMBIC_FOUNDATION.md` 완료 후 예약 영업, 주문 만료, 마감 정산 같은 시간 기반 기능을 확장한다.
- `11_STORE_OPERATING_STATUS_ENUM.md` 완료 후 `12_QUEUE_CAPACITY_AND_WAIT_TIME.md`를 구현한다.
- `03_SERVER_AUTHORITATIVE_ORDER_PRICING.md` 완료 전에는 결제 금액과 이벤트 무료 주문 판단을 신뢰할 수 있는 상태로 간주하지 않는다.
- `09_PUSH_SUBSCRIPTION_MULTI_ORDER.md` 완료 후 `16_GENERAL_PUSH_NOTIFICATION_BROADCAST.md`를 수행하는 것이 안전하다.
- `17_IOS_PWA_BACKGROUND_ORDER_READY_PUSH_FIX.md`는 현재 주문 푸시가 비정상일 때 우선 수행하며, 정상화 이후에는 회귀 방지 문서로 유지한다.
- `18_ADMIN_PWA_SEPARATE_INSTALL.md`는 백엔드나 DB 변경 없이 독립적으로 수행할 수 있으나, 기존 사용자 PWA와 Push 회귀 테스트를 반드시 포함한다.
- 관리자 설치 통계까지 정확히 구현하려면 `18_ADMIN_PWA_SEPARATE_INSTALL.md` 완료 후 `19_PWA_INSTALLATION_TRACKING_AND_ANALYTICS.md`를 수행한다. 사용자 PWA 추적만으로 관리자 PWA 설치를 추정하지 않는다.
- `23_PWA_INSTALLATION_ANALYTICS_RELIABILITY_FIX.md`는 19번 구현 이후 현재 통계 숫자를 신뢰하기 전에 수행하는 P0 안정화 작업이다. heartbeat가 Railway로 전달되는지, `admin_id`가 `admins.id`를 참조하는지, 일반 웹 방문이 설치 수에 포함되지 않는지를 우선 검증한다.
- `20_SUNDAY_VOLUNTEER_SCHEDULE_BOARD.md`는 기존 스케줄 API와 테이블을 유지한 채 독립적으로 수행할 수 있다. 핵심 UI 변경 전에 기존 평일 스케줄 데이터 여부를 진단하고, 평일 행을 자동 삭제하거나 이동하지 않는다.
- `21_INVENTORY_MANAGEMENT_UI_REDESIGN.md`는 기존 Ingredient 테이블과 CRUD API를 유지한 채 독립적으로 수행할 수 있다. 품절·주문 필요 상태를 백엔드의 `current_stock <= alert_threshold` 의미와 일치시키고, 재고 이력·자동 차감·구매 워크플로우는 별도 작업으로 남긴다.
- `22_EVENT_ANNOUNCEMENT_VALIDITY_AND_ADMIN_UI.md`는 `03_SERVER_AUTHORITATIVE_ORDER_PRICING.md`가 적용된 경우 해당 서버 가격 계산 서비스를 재사용한다. 아직 03번이 적용되지 않았다면 이번 작업에서는 클라이언트 FREE·0원 요청으로 이벤트를 강제하지 못하도록 무료 이벤트 자격 판정만 서버 단일화하고, 가격 계약 전체 재설계는 중복하지 않는다.
- `24_PUBLIC_PWA_SCROLL_BACKGROUND_CONTINUITY_FIX.md`는 백엔드 변경 없이 독립적으로 수행한다. 사용자 화면의 전역 body 배경, 100dvh, fixed 하단 바, safe-area만 수정하고 관리자 PWA 및 주문·푸시·WebSocket 로직은 변경하지 않는다.
- `25_ADMIN_PWA_HEARTBEAT_FORCE_REFRESH.md`는 23번 설치 통계 안정화 이후 수행한다. 관리자 계정 전환 때만 heartbeat throttle을 우회하며 installation_id는 유지한다.
- `26_PWA_INSTALLATION_DB_CONSTRAINT_VERIFICATION.md`는 23번 배포 후 Railway 운영 DB의 실제 `admin_id -> admins.id` 및 주문 설치 FK를 확인하는 필수 운영 검증이다. DB 백업과 읽기 전용 진단을 먼저 수행한다.
- `27_INVENTORY_ITEM_SCOPED_OPTIMISTIC_ROLLBACK.md`는 21번 재고 UI 리디자인 이후 수행한다. DB 변경 없이 optimistic rollback 범위만 품목 단위로 제한한다.

---

## 공통 작업 원칙

1. **서버가 최종 권한과 금액을 결정한다.**
2. 프런트엔드의 숨김·비활성화는 사용자 경험일 뿐 보안 경계로 사용하지 않는다.
3. 숫자형 내부 ID만으로 공개 주문에 접근하지 않는다.
4. 모든 데이터 변경은 DB 커밋 성공 후에만 WebSocket 이벤트를 보낸다.
5. PWA 및 모바일 브라우저는 백그라운드에서 WebSocket이 끊길 수 있다고 가정한다.
6. DB 스키마 변경은 Alembic 마이그레이션으로 관리한다.
7. 배포 전후 버전이 잠시 공존할 수 있으므로 하위 호환성과 배포 순서를 명시한다.
8. 민감 정보는 로그, URL, WebSocket 메시지에 포함하지 않는다.
9. 기존 주문·결제·푸시·통계 기능의 회귀 테스트를 수행한다.
10. 문서의 범위를 넘어서는 문제를 발견하면 몰래 함께 고치지 말고 별도 보고한다.

---

## 공통 완료 보고 형식

1. 원인 및 위험 요약
2. 실제 변경한 파일
3. DB 마이그레이션 내용
4. API 계약 변경
5. 프런트엔드 변경
6. 실행한 명령
7. 테스트 및 빌드 결과
8. 수동 QA 절차
9. 하위 호환성과 배포 순서
10. 롤백 방법
11. 남은 위험과 후속 작업

---

## 배포 전 최종 안정화 작업 (28~30)

28. `28_SCHEDULED_FREE_EVENT_PRESERVE_LIVE_EVENT.md` — 미래 예약 무료 이벤트 게시 시 현재 LIVE 이벤트를 조기 종료하지 않도록 활성화 정책 수정
29. `29_RAILWAY_PWA_DB_CONSTRAINT_FINAL_VERIFICATION.md` — Railway 운영 DB의 PWA FK, ON DELETE, 중복 제약, 고아 참조를 읽기 전용으로 최종 검증
30. `30_PWA_SCHEMA_MIGRATION_SINGLE_SOURCE_OF_TRUTH.md` — main.py 자동 DDL을 제거하고 전용 migration을 PWA 스키마의 단일 기준으로 통일

실행 프롬프트:

- `28_SCHEDULED_FREE_EVENT_PRESERVE_LIVE_EVENT_PROMPT.md`
- `29_RAILWAY_PWA_DB_CONSTRAINT_FINAL_VERIFICATION_PROMPT.md`
- `30_PWA_SCHEMA_MIGRATION_SINGLE_SOURCE_OF_TRUTH_PROMPT.md`

권장 적용 순서:

```text
28번 이벤트 예약 활성화 수정
→ 29번 운영 DB 사전 검증
→ 30번 migration 단일화 적용
→ 29번 운영 DB 최종 검증 재실행
```

---

## 주문 가격·이벤트 정산 최종 안정화 작업 (31)

31. `31_SERVER_AUTHORITATIVE_ORDER_PRICING_AND_OPTION_RECALCULATION.md` — 메뉴·옵션·텀블러 할인·무료 이벤트 원가·관리자 무료 주문 원가를 서버가 DB 기준으로 재계산하고 주문 항목 스냅샷을 보존

실행 프롬프트:

- `31_SERVER_AUTHORITATIVE_ORDER_PRICING_AND_OPTION_RECALCULATION_PROMPT.md`

의존 관계:

```text
28번 예약 무료 이벤트 보존
→ 31번 서버 권위 가격·옵션 재계산
```

31번은 기존 03번 서버 권위 주문 가격 명세의 현재 저장소 맞춤형 후속 구현 문서다. 22번 이벤트/공지 안전성 작업에서 남아 있던 이벤트 `original_price`와 옵션 가격 신뢰 문제를 함께 해결한다.

---

## 사용자 PWA 이미지 성능 최적화 작업 (32)

32. `32_CLOUDINARY_RESPONSIVE_IMAGE_DELIVERY_OPTIMIZATION.md` — Cloudinary 메뉴 이미지에 `f_auto`, `q_auto`, 화면별 `w/h`, 반응형 `srcSet`, 첫 두 장 eager, 나머지 lazy, 사용자 HTML preconnect를 적용

실행 프롬프트:

- `32_CLOUDINARY_RESPONSIVE_IMAGE_DELIVERY_OPTIMIZATION_PROMPT.md`

의존 관계:

```text
24번 사용자 PWA 화면 안정화
→ 32번 Cloudinary 반응형 이미지 전달 최적화
```

32번은 DB와 백엔드를 변경하지 않는다. Cloudinary `secure_url`을 canonical 원본 URL로 유지하고 Home, MenuDetail, Cart 렌더링 시점에만 화면별 변환 URL을 생성한다. Service Worker 이미지 캐시는 별도 후속 작업으로 남긴다.
