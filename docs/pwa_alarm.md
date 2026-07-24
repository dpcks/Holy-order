# 17. iPhone PWA 주문 준비 완료 백그라운드 푸시 수정

## 문서 목적

이 문서는 **Holy-Order 교회 카페 주문 시스템**에서 iPhone 홈 화면 PWA의 주문 준비 완료 알림이 앱이 열려 있을 때만 나타나고, 앱을 벗어나거나 화면을 잠근 상태에서는 도착하지 않는 문제를 진단하고 수정하기 위한 실행 명세다.

Antigravity는 계획이나 예시만 제시하지 말고, 실제 저장소를 조사한 뒤 현재 코드에 직접 수정 사항을 적용하고 백엔드 테스트, 프런트엔드 정적 검사와 빌드, 운영 로그 확인 절차까지 완료해야 한다.

이 작업은 **기존 주문 추적, 영업 상태 실시간 동기화, 관리자 주문 보드, 관리자 새 주문 알림음, 토스 딥링크, PWA 설치와 Service Worker 캐시**에 회귀를 만들지 않는 최소 변경을 우선한다.

---

## 우선순위

- 우선순위: **P0 — 운영 장애 수정**
- 주요 대상: iPhone 홈 화면 PWA
- 영향 기능: 주문 준비 완료 알림
- DB 대규모 재설계: 이번 작업에서는 하지 않음
- VAPID 키 자동 교체: 절대 금지

---

## 1. 현재 시스템 구성

- 프런트엔드: React 19, TypeScript, Vite, TanStack Query v5
- PWA: `vite-plugin-pwa`, `injectManifest`, 커스텀 `sw.ts`
- 프런트 배포: Vercel HTTPS
- 백엔드: FastAPI, SQLAlchemy
- 백엔드 배포: Railway
- 데이터베이스: Railway PostgreSQL
- 주문 실시간 상태: FastAPI WebSocket + React Query 폴백
- 웹 푸시: VAPID + `pywebpush`
- 사용자 기기: iPhone
- iPhone 홈 화면 PWA 설치 완료
- iPhone 알림 권한 허용 완료
- WebSocket 운영 주소는 반드시 `wss://`를 유지해야 함

현재 Railway DB에서 실제 주문 구독이 확인됐다.

```text
order_id: 447
endpoint: https://web.push.apple.com/...
```

이는 최소한 다음 단계까지 성공했다는 뜻이다.

```text
iPhone PWA 알림 권한 허용
→ Service Worker 등록
→ PushManager.subscribe() 성공
→ Apple Web Push endpoint 발급
→ POST /orders/{order_id}/push-subscribe 성공
→ push_subscriptions 테이블 저장 성공
```

따라서 현재 문제를 단순히 “사용자가 알림을 허용하지 않았다” 또는 “PushSubscription 생성이 실패했다”로 단정하지 말 것.

1순위 조사 대상은 다음 구간이다.

```text
관리자가 PREPARING → READY 변경
→ FastAPI webpush() 호출
→ Apple Web Push Service 수락 또는 거부
→ iPhone 전달
→ Service Worker push 이벤트
→ showNotification()
```

---

## 2. 현재 증상

### 정상으로 보이는 동작

PWA의 `OrderStatus` 화면이 열려 있을 때 관리자가 주문을 `READY`로 변경하면 알림처럼 보이는 메시지가 나타난다.

### 실패 동작

다음 상태에서는 준비 완료 푸시가 도착하지 않는다.

- PWA에서 다른 앱으로 전환
- PWA를 닫거나 화면에서 나감
- iPhone 화면 잠금
- React 페이지 JavaScript가 실행되지 않는 상태

### 중요한 해석

현재 `OrderStatus.tsx`에는 주문 상태가 `READY`로 바뀌었을 때 페이지 JavaScript가 직접 `new Notification(...)`을 호출하는 로직이 있다.

이 코드는 페이지가 실행 중일 때만 동작한다.

```text
PWA가 열려 있음
→ WebSocket 또는 폴링으로 READY 감지
→ React effect 실행
→ new Notification()
→ 알림 표시

PWA가 닫힘
→ React effect 실행 안 됨
→ new Notification() 실행 안 됨
```

따라서 앱이 열려 있을 때 보이는 알림은 실제 서버 Web Push가 아니라 **포그라운드 로컬 알림**일 가능성이 높다.

앱이 닫힌 상태에서는 반드시 아래 경로가 성공해야 한다.

```text
FastAPI 서버
→ pywebpush
→ Apple Web Push Service
→ iPhone
→ Service Worker push 이벤트
→ registration.showNotification()
```

---

## 3. 현재 코드에서 확인된 핵심 문제

### 3.1 서버 Web Push 실패가 충분히 기록되지 않음

`backend/routers/admin.py`의 주문 상태 변경 API는 `PREPARING → READY` 전환 시 `webpush()`를 호출한다.

그러나 현재 `WebPushException` 처리에서는 404와 410만 부분적으로 처리하며 다음 정보를 Railway 애플리케이션 로그에 명확히 남기지 않는다.

- HTTP 400
- HTTP 401
- HTTP 403
- HTTP 429
- HTTP 500 / 502 / 503 / 504
- timeout
- VAPID claim 오류
- VAPID public/private key 불일치 가능성
- Push Service 응답 본문
- 전송 대상 개수
- 전송 성공 여부

사용자가 확인한 `checkpoint starting`, `checkpoint complete` 로그는 PostgreSQL 서비스 로그다. 실제 푸시 전송 로그는 Railway의 **Holy-order FastAPI 애플리케이션 서비스**에서 확인해야 한다.

### 3.2 전송 성공 여부와 관계없이 구독을 모두 삭제함

현재 READY 처리 후 다음과 비슷한 코드가 실행된다.

```python
db.query(models.PushSubscription).filter(
    models.PushSubscription.order_id == order_id
).delete()
db.commit()
```

따라서 실제 흐름이 다음처럼 될 수 있다.

```text
Apple Push 전송 시도
→ 401 / 403 / 400 / timeout 등으로 실패
→ 실패 로그는 부족함
→ 해당 주문 구독은 무조건 삭제
→ 재시도 불가능
→ 앱이 열려 있을 때의 로컬 알림만 보임
```

이 무조건 삭제 로직을 제거해야 한다.

### 3.3 TTL과 timeout이 명시되지 않음

현재 `webpush()` 호출에는 명시적인 TTL과 네트워크 timeout이 없다.

주문 준비 완료 알림은 사용자의 기기가 잠시 오프라인이거나 화면이 잠겨도 일정 시간 동안 Push Service가 보관할 수 있어야 한다.

이번 작업에서는 설치된 `pywebpush` 버전의 실제 함수 시그니처를 확인한 뒤 다음 정책을 적용한다.

```text
TTL: 3600초
네트워크 timeout: 약 10초
```

`pywebpush` 버전이 다르면 정확한 인자명을 확인해 현재 버전에 맞게 적용할 것.

### 3.4 실제 주문 구독 등록이 늦음

현재 실제 주문별 PushSubscription 등록은 주로 `OrderStatus.tsx`가 열린 뒤 effect에서 수행된다.

```text
주문 생성
→ OrderStatus 이동
→ 주문 조회
→ effect 실행
→ PushSubscription 확인/생성
→ 서버에 주문 연결
```

사용자가 OrderStatus가 완전히 초기화되기 전에 PWA를 나가거나, 토스 딥링크로 다른 앱에 이동하면 구독 연결이 완료되지 않을 수 있다.

### 3.5 Home의 알림 버튼 성공 메시지가 실제 상태와 다름

현재 Home의 “알림 켜기” 버튼은 주로 다음 작업만 한다.

```ts
Notification.requestPermission()
```

그러나 `Notification.permission === 'granted'`는 실제 PushSubscription 생성 성공을 뜻하지 않는다.

성공 메시지는 다음 과정이 완료된 뒤에만 보여야 한다.

```text
알림 권한 허용
→ Service Worker ready
→ VAPID 공개키 조회
→ 기존 PushSubscription 조회
→ 없으면 PushManager.subscribe()
→ 실제 PushSubscription 객체 확보
```

### 3.6 서버 Push 정상화 후 중복 알림 가능성

현재 `OrderStatus.tsx`의 직접 `new Notification()` 호출을 그대로 유지하면 서버 Web Push가 정상화된 후 다음 두 알림이 함께 나타날 수 있다.

```text
Service Worker가 표시한 Web Push 시스템 알림
+
OrderStatus React effect의 new Notification 알림
```

시스템 알림의 단일 책임은 Service Worker에 둔다.

페이지가 열려 있을 때는 다음 인앱 피드백만 유지한다.

- 주문 상태 UI 변경
- 화면 플래시
- 지원 기기의 진동

직접 `new Notification()` 호출은 제거하는 것이 기본 정책이다.

### 3.7 현재 PushSubscription 모델의 구조적 제한

현재 모델은 `endpoint`가 unique이고 하나의 레코드가 하나의 `order_id`에 직접 연결된다.

```text
PushSubscription
├─ order_id
├─ endpoint unique
├─ p256dh
└─ auth
```

동일 기기의 새 주문이 등록되면 기존 레코드의 `order_id`가 새 주문으로 변경될 수 있다.

이번 작업에서는 이 DB 구조를 대규모로 재설계하지 않는다. 멀티 주문 구독과 일반 공지 푸시는 다음 문서의 별도 범위다.

- `09_PUSH_SUBSCRIPTION_MULTI_ORDER.md`
- `16_GENERAL_PUSH_NOTIFICATION_BROADCAST.md`

이번 패치의 범위는 **단일 주문 준비 완료 백그라운드 푸시를 안정화하는 것**이다.

---

## 4. 작업 전 저장소 조사

수정 전에 저장소 전체에서 아래 항목을 검색하라.

```bash
rg -n \
  "webpush|WebPushException|PushSubscription|push-subscribe|vapid|VAPID|new Notification|showNotification|pushManager|requestPermission|notificationclick" \
  backend frontend/src
```

특히 다음 파일의 현재 구현을 먼저 읽어라.

### 백엔드

- `backend/routers/admin.py`
- `backend/routers/orders.py`
- `backend/models.py`
- `backend/schemas.py`
- `backend/config.py`
- `backend/database.py`
- `backend/requirements.txt`
- `backend/test_push.py`
- `backend/tests/*`

### 프런트엔드

- `frontend/src/pages/Home.tsx`
- `frontend/src/pages/Cart.tsx`
- `frontend/src/pages/OrderStatus.tsx`
- `frontend/src/sw.ts`
- `frontend/src/main.tsx`
- `frontend/src/api/client.ts`
- `frontend/vite.config.ts`

문서의 예시를 그대로 복사하지 말고 다음을 실제 코드에서 확인한 뒤 적용하라.

- 설치된 `pywebpush` 버전
- `webpush()` 함수 시그니처
- 현재 `StandardResponse` 제네릭 구조
- Axios 응답 인터셉터 동작
- 현재 주문 상태 API의 트랜잭션 순서
- Service Worker의 실제 빌드 방식
- iOS 홈 화면 PWA 여부 판별 방식

---

## 5. 필수 구현 — 백엔드

### 5.1 푸시 발송 로직을 전용 서비스로 분리

가능하면 다음 파일을 새로 만든다.

```text
backend/services/push_service.py
```

프로젝트 구조상 다른 위치가 더 적절하면 동등한 전용 모듈을 사용한다.

라우터 내부에 복잡한 `webpush()` 반복문을 계속 두지 말 것.

전용 서비스의 책임은 다음과 같다.

- 주문 준비 완료 payload 생성
- VAPID subject 정규화
- `pywebpush.webpush()` 호출
- TTL 적용
- timeout 적용
- 제한된 재시도
- 성공/실패 구조화 로그
- 만료 endpoint 정리
- 일시 오류 구독 보존
- request-scoped Session과 분리된 DB 처리

권장 인터페이스 예시:

```python
def send_order_ready_pushes(
    order_id: int,
    order_number: int,
) -> None:
    ...
```

이 함수는 `SessionLocal()`을 내부에서 새로 열고 반드시 `finally`에서 닫는다.

```python
def send_order_ready_pushes(
    order_id: int,
    order_number: int,
) -> None:
    db = SessionLocal()
    try:
        ...
    finally:
        db.close()
```

### 5.2 주문 상태 커밋과 푸시 실패를 분리

관리자가 주문을 `PREPARING → READY`로 변경할 때 주문 상태 DB 커밋이 가장 먼저 완료되어야 한다.

권장 순서:

```text
상태 전이 검증
→ order.status = READY
→ DB commit
→ ORDER_UPDATED WebSocket 이벤트
→ Background Task로 Web Push 발송
→ HTTP 성공 응답
```

푸시 발송이 실패하더라도 다음은 절대로 롤백되면 안 된다.

- 주문 상태 READY
- 결제 로그
- 관리자 주문 현황
- 사용자 주문 상태 조회
- ORDER_UPDATED WebSocket 이벤트

FastAPI `BackgroundTasks`를 사용하는 경우 다음 규칙을 지켜라.

- request-scoped `db: Session`을 Background Task에 넘기지 말 것
- request-scoped ORM 객체를 Background Task에 넘기지 말 것
- Background Task 내부에서 새 `SessionLocal()`을 열 것
- 동기 네트워크 호출인 `webpush()`는 동기 Background Task 함수에서 실행하여 이벤트 루프를 막지 않게 할 것

라우터 개념 예시:

```python
@router.patch("/orders/{order_id}/status")
async def update_order_status(
    order_id: int,
    status_update: schemas.OrderStatusUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    admin: models.Admin = Depends(auth.get_current_admin),
):
    ...
    order.status = next_status.value
    db.commit()
    db.refresh(order)

    if next_status == schemas.OrderStatusEnum.READY:
        background_tasks.add_task(
            send_order_ready_pushes,
            order.id,
            order.order_number,
        )

    await manager.broadcast({...})
    return {...}
```

현재 코드 구조에 맞게 순서를 조정할 수 있지만, DB commit 성공 전 푸시를 보내면 안 된다.

### 5.3 구조화된 애플리케이션 로그 추가

`print()`만 남기지 말고 Python `logging`을 사용한다.

발송 시작:

```text
event=webpush_start
order_id
order_number
target_count
```

발송 성공:

```text
event=webpush_success
order_id
subscription_id
endpoint_host
status
attempt
```

발송 실패:

```text
event=webpush_failure
order_id
subscription_id
endpoint_host
status
exception_type
response_excerpt
attempt
```

대상 없음:

```text
event=webpush_no_targets
order_id
```

다음 값은 절대로 로그에 출력하지 말 것.

- `VAPID_PRIVATE_KEY`
- 전체 `p256dh`
- 전체 `auth`
- 전체 Push endpoint
- 사용자 전화번호
- 관리자 JWT

endpoint 구분이 필요하면 URL host만 기록한다.

```text
endpoint_host=web.push.apple.com
```

응답 본문은 최대 길이를 제한한다.

```python
response_excerpt = response.text[:1000]
```

### 5.4 TTL과 timeout 적용

설치된 `pywebpush` 버전의 시그니처를 확인한 뒤 다음 정책을 적용한다.

```text
ttl = 3600
timeout = 10
```

예시:

```python
webpush(
    subscription_info=...,
    data=...,
    vapid_private_key=settings.VAPID_PRIVATE_KEY,
    vapid_claims={"sub": normalized_subject},
    ttl=3600,
    timeout=10,
)
```

현재 라이브러리 버전에서 인자명이 다르면 정확한 시그니처에 맞춰 적용하고 결과 보고에 기록한다.

### 5.5 알림 payload 표준화

주문 준비 완료 payload는 다음 정보를 포함한다.

```json
{
  "title": "평택중앙교회 카페",
  "body": "#447번 주문하신 메뉴가 준비되었습니다. 픽업대로 와 주세요.",
  "icon": "/pwa-192.png",
  "badge": "/pwa-192.png",
  "tag": "order-ready-447",
  "url": "/order/status/447",
  "type": "ORDER_READY"
}
```

실제 사용자 표시 번호는 가능하면 내부 DB ID가 아니라 `order_number`를 본문에 사용한다.

이동 URL은 현재 라우팅 구조에 맞게 주문 ID를 사용한다.

한글이 깨지지 않도록 JSON 직렬화를 확인한다.

```python
json.dumps(payload, ensure_ascii=False)
```

### 5.6 구독 삭제 정책 수정

현재의 “READY 처리 후 order_id 구독 전체 삭제” 로직을 제거한다.

다음 정책을 적용한다.

#### Push Service가 2xx로 수락

현재 구조가 주문별 일회성 구독이므로 해당 주문 연결을 삭제할 수 있다.

단, 다음을 충족해야 한다.

- 성공이 확인된 해당 레코드만 삭제
- 삭제 결과 로그 기록
- 다른 주문의 구독을 삭제하지 않음
- 실패한 레코드와 함께 일괄 삭제하지 않음

#### HTTP 404 또는 410

만료되었거나 사라진 endpoint이므로 해당 구독을 삭제한다.

#### HTTP 400, 401, 403

구독을 즉시 삭제하지 않는다.

다음과 같은 운영 구성 문제일 수 있다.

- VAPID 공개키/개인키 불일치
- 잘못된 VAPID subject
- 요청 형식 오류
- 암호화 키 문제

로그를 남기고 운영자가 원인을 확인할 수 있게 한다.

#### HTTP 429, 5xx, timeout, 네트워크 오류

구독을 삭제하지 않는다.

제한된 재시도를 적용한다.

```text
최대 시도 횟수: 2회
1차 실패
→ 짧은 backoff
→ 2차 시도
→ 최종 실패 시 로그 및 구독 유지
```

무한 재시도는 금지한다.

재시도 대상은 다음으로 제한한다.

- 429
- 500
- 502
- 503
- 504
- timeout
- 일시적인 네트워크 예외

400, 401, 403은 동일 요청을 즉시 반복하지 않는다.

### 5.7 VAPID subject 정규화

현재 환경변수는 다음 중 하나로 입력될 수 있다.

```text
admin@example.com
mailto:admin@example.com
https://example.com/contact
```

코드가 항상 `mailto:`를 덧붙여 다음처럼 되지 않게 한다.

```text
mailto:mailto:admin@example.com
```

정규화 함수 예시:

```python
def normalize_vapid_subject(value: str) -> str:
    normalized = value.strip()

    if normalized.startswith("mailto:"):
        return normalized

    if normalized.startswith("https://"):
        return normalized

    return f"mailto:{normalized}"
```

빈 값도 검증한다.

### 5.8 VAPID public/private 키 쌍 검증 도구

현재 Railway의 다음 값이 실제 한 쌍인지 확인할 수 있는 안전한 진단 스크립트를 추가하거나 기존 스크립트를 보완한다.

```text
VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
```

규칙:

- 키를 자동으로 새로 생성하지 말 것
- Railway 환경변수를 자동 변경하지 말 것
- 개인키 전체를 로그에 출력하지 말 것
- 공개키 전체도 불필요하게 출력하지 말 것
- 결과는 `MATCH` 또는 `MISMATCH` 중심으로 출력
- 불일치 시 배포 완료로 보고하지 말 것
- 기존 `generate_vapid_keys.py`를 운영 배포마다 실행하지 말 것

가능하면 설치된 `py-vapid` 또는 현재 의존성을 이용해 개인키에서 공개키를 파생하고 현재 `VAPID_PUBLIC_KEY`와 정규화 비교한다.

### 5.9 진단용 주문 푸시 스크립트 보완

기존 `backend/test_push.py`가 있다면 다음처럼 사용할 수 있게 개선한다.

```bash
python test_push.py --order-id 447
```

요구사항:

- 실제 환경변수 사용
- 대상 구독 개수 출력
- endpoint host만 출력
- 성공 status 출력
- 실패 status와 응답 본문 일부 출력
- TTL과 timeout 적용
- 테스트 후 구독을 자동 삭제하지 않음
- VAPID 개인키 출력 금지
- 공개 API 엔드포인트를 새로 만들지 않음

운영에서 새 주문 ID로 테스트하는 것을 권장한다. 과거 주문 447을 구현 코드에 하드코딩하지 말 것.

---

## 6. 필수 구현 — 프런트엔드

### 6.1 공용 Push 유틸리티 생성

다음 파일을 새로 만든다.

```text
frontend/src/utils/push.ts
```

프로젝트 구조상 hooks 또는 services 디렉터리가 더 적절하면 동등한 위치를 사용할 수 있다.

최소 제공 기능:

```ts
isPushSupported()
isIosDevice()
isStandalonePwa()
getVapidPublicKey()
getOrCreatePushSubscription()
registerOrderPushSubscription(orderId)
```

중복된 다음 로직을 공용화한다.

- base64url → `Uint8Array`
- VAPID 공개키 조회
- Service Worker ready 대기
- 기존 PushSubscription 조회
- 새 PushSubscription 생성
- 주문별 서버 등록
- 지원 여부 확인
- 권한 상태 확인

권장 결과 타입:

```ts
type PushSetupResult =
  | {
      status: 'subscribed';
      subscription: PushSubscription;
    }
  | { status: 'permission-denied' }
  | { status: 'permission-default' }
  | { status: 'unsupported' }
  | { status: 'not-installed-ios-pwa' }
  | { status: 'failed'; error: unknown };
```

호출부가 성공, 거부, 미지원, 미설치, 실패를 구분할 수 있어야 한다.

오류를 단순 `console.error`로 삼키고 성공처럼 처리하지 말 것.

### 6.2 iPhone 홈 화면 PWA 조건 확인

iPhone/iPad에서는 일반 Safari 탭과 홈 화면 PWA를 구분한다.

권장 검사:

```ts
const isStandalone =
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;
```

iOS 기기이지만 standalone이 아니면 다음 결과를 반환한다.

```text
not-installed-ios-pwa
```

사용자에게 홈 화면 설치 안내를 보여주고 “푸시 활성화 완료” 메시지를 띄우지 않는다.

### 6.3 Home의 알림 버튼을 실제 구독 완료까지 처리

현재 Home은 `Notification.requestPermission()`만 호출하고 권한이 granted이면 곧바로 성공 메시지를 표시한다.

이를 다음 흐름으로 변경한다.

```text
사용자가 “알림 켜기” 버튼 클릭
→ 푸시 지원 여부 확인
→ iOS 홈 화면 PWA 여부 확인
→ Notification.requestPermission()
→ VAPID 공개키 조회
→ navigator.serviceWorker.ready
→ 기존 PushSubscription 조회
→ 없으면 PushManager.subscribe()
→ 실제 PushSubscription 확보
→ 성공 메시지
```

다음 조건 전에는 성공 메시지를 띄우지 않는다.

```text
PushSubscription 객체를 실제로 확보함
```

권한만 허용됐지만 구독 생성이 실패한 경우 성공으로 표시하지 말 것.

### 6.4 기존 구독과 현재 VAPID 키 불일치 처리

기존 `registration.pushManager.getSubscription()` 결과가 있다는 이유만으로 무조건 재사용하지 말 것.

가능한 브라우저에서는 기존 subscription의 `options.applicationServerKey`와 현재 VAPID 공개키를 비교한다.

불일치가 명확히 확인되면:

```text
기존 subscription.unsubscribe()
→ 현재 VAPID 공개키로 재구독
```

규칙:

- 알림 권한이 `granted`인 경우에만 수행
- 사용자의 권한을 우회하지 않음
- 무한 재구독 루프 방지
- 브라우저가 applicationServerKey를 제공하지 않으면 안전한 fallback 사용
- 실패 시 사용자와 로그에 명확히 알림

### 6.5 주문 생성 직후 주문별 구독 연결

현재 OrderStatus effect에만 의존하지 말고 `Cart.tsx`에서 주문 생성 성공 직후 구독을 해당 주문에 연결한다.

권장 순서:

```text
POST /orders 성공
→ order_id 확보
→ activeOrders 저장
→ 권한이 granted이면 기존/신규 PushSubscription 확보
→ POST /orders/{order_id}/push-subscribe
→ OrderStatus 이동 또는 토스 딥링크
```

토스 주문에서는 반드시 다음 순서를 지킨다.

```text
주문 생성
→ 주문 푸시 구독 서버 저장 시도
→ activeOrders 저장
→ 토스 앱 딥링크 실행
→ 복귀 후 OrderStatus
```

푸시 등록 실패가 주문 자체를 실패시키면 안 된다.

실패 정책:

```text
주문은 정상 유지
→ 사용자에게 “주문은 접수됐지만 알림 등록에 실패했습니다” 안내 가능
→ OrderStatus에서 fallback 등록 재시도
```

푸시 등록 때문에 주문 완료 화면이나 토스 이동이 무한정 지연되지 않도록 적절한 timeout을 적용한다.

주의: 알림 권한 요청은 사용자 제스처 안에서만 수행해야 한다. 주문 생성이 끝난 뒤 갑자기 권한 팝업을 띄우는 흐름을 새로 만들지 말고, Home의 명시적 알림 버튼을 우선 사용한다. 이미 permission이 granted인 경우에만 자동 구독을 복구한다.

### 6.6 OrderStatus의 등록 로직을 fallback으로 유지

`OrderStatus.tsx`의 자동 주문 구독 등록을 완전히 제거하지 말고 공용 Push 유틸리티를 사용하는 fallback으로 정리한다.

조건:

- `id`와 주문 데이터가 있어야 함
- 주문 상태가 `PENDING` 또는 `PREPARING`일 때만 등록
- `READY`, `COMPLETED`, `CANCELLED`에는 새 등록 금지
- `Notification.permission === 'granted'`일 때만 자동 복구
- 동일 주문에 effect가 반복되어도 서버 upsert가 안전해야 함
- React Query refetch마다 과도하게 반복되지 않도록 ref 또는 Query 상태로 제어
- 실패 시 명확한 진단 로그

### 6.7 포그라운드 직접 Notification 제거

`OrderStatus.tsx`의 다음 로직을 제거한다.

```ts
new Notification(...)
```

서버 Web Push와 Service Worker가 시스템 알림의 단일 책임을 가진다.

포그라운드 READY 전환 시 다음은 유지한다.

- `isReadyFlash`
- 화면 상태 변경
- 지원 기기의 진동
- 주문 상태 Query 갱신

중복 시스템 알림이 발생하지 않아야 한다.

### 6.8 Service Worker 알림 옵션 보완

`frontend/src/sw.ts`의 `push` 이벤트에서 다음 payload 필드를 지원한다.

```ts
const options: NotificationOptions = {
  body: payload.body,
  icon: payload.icon || '/pwa-192.png',
  badge: payload.badge || '/pwa-192.png',
  tag: payload.tag,
  data: {
    url: payload.url || '/',
    type: payload.type,
  },
};
```

기존 다음 동작은 유지한다.

```ts
event.waitUntil(
  self.registration.showNotification(title, options),
);
```

알림 클릭 시:

- 기존 같은 Origin 창이 있으면 navigate + focus
- 창이 없으면 `openWindow`
- 외부 Origin URL은 열지 않음
- 잘못된 URL은 `/`로 fallback

정적 프리캐시 로직은 변경하지 말 것.

### 6.9 API 전역 토스트 중복 방지

Push 설정과 주문 구독 등록 실패를 호출부가 직접 처리할 경우 Axios 전역 오류 토스트와 중복될 수 있다.

현재 프로젝트에 `skipGlobalErrorToast` 같은 요청 옵션이 이미 있다면 사용한다.

없다면 이번 작업 범위에서 필요한 요청만 최소한으로 중복 토스트 없이 처리한다.

관련 요청:

- VAPID 공개키 조회
- 주문 push-subscribe 등록

API 클라이언트 전체를 대규모 리팩터링하지 말 것.

---

## 7. 변경하지 말아야 할 사항

이번 작업에서는 다음을 하지 말 것.

- VAPID 키 자동 재생성
- Railway 환경변수 자동 변경
- VAPID 개인키 로그 출력
- `wss://`를 `ws://`로 변경
- 실시간 영업 상태 WebSocket 구조 변경
- `PublicRealtimeLayout` 대규모 변경
- React Query 영업 상태 15초 폴링 변경
- 주문 가격 계산 변경
- 이벤트 무료 주문 로직 변경
- 토스 결제 정책 대규모 변경
- 일반 공지 푸시 기능 구현
- PushSubscription 다중 주문 DB 재설계
- 관리자 WebSocket 리팩터링
- Service Worker에 API 런타임 캐시 추가
- 관련 없는 UI 전면 변경
- 푸시 실패 때문에 주문 READY DB commit 롤백
- 전송 성공 여부와 관계없이 구독 일괄 삭제
- 과거 주문 ID `447` 하드코딩

---

## 8. 백엔드 자동 테스트

실제 Apple Push Service를 CI나 pytest에서 호출하지 말고 `webpush`를 mock한다.

### 8.1 성공 경로

```text
PREPARING → READY
→ 주문 상태 commit 성공
→ Background Task 예약
→ webpush 1회 호출
→ ttl=3600 확인
→ timeout 확인
→ payload의 type, tag, url 확인
→ 2xx 정책에 따라 해당 구독만 정리
→ 상태 변경 API 성공
```

검증 항목:

- `ORDER_UPDATED` 브로드캐스트 유지
- 주문 상태 READY 유지
- 푸시 성공 여부가 HTTP 응답 성공을 방해하지 않음

### 8.2 대상 구독 없음

```text
push_subscriptions 0건
→ 예외 없음
→ webpush 호출 없음
→ webpush_no_targets 로그
→ 상태 변경 API 성공
```

### 8.3 만료 endpoint

```text
webpush가 404 또는 410
→ 해당 구독 삭제
→ 다른 구독은 유지
→ 상태 변경 API 성공
```

### 8.4 인증 또는 구성 오류

```text
webpush가 400 / 401 / 403
→ 해당 구독 삭제하지 않음
→ 재시도하지 않음
→ 오류 로그 기록
→ 상태 변경 API 성공
```

### 8.5 일시 오류

```text
webpush가 429 / 500 / 502 / 503 / 504 / timeout
→ 최대 2회 제한 재시도
→ 최종 실패 시 구독 유지
→ 상태 변경 API 성공
```

### 8.6 Background Task DB 안전성

다음을 검증하거나 코드 리뷰로 명확히 확인한다.

```text
request-scoped Session을 Background Task에서 재사용하지 않음
Background Task 내부 Session이 반드시 닫힘
푸시 예외가 주문 상태 트랜잭션을 롤백하지 않음
```

### 8.7 VAPID subject 정규화

최소 테스트:

```text
admin@example.com
→ mailto:admin@example.com

mailto:admin@example.com
→ mailto:admin@example.com

https://example.com/contact
→ https://example.com/contact
```

### 8.8 기존 테스트 실행

```bash
cd backend
pytest
```

기존 테스트가 운영 DB에 접근하지 않는지 확인한다. 테스트 격리 문제가 발견되면 이번 푸시 수정과 분리해 위험을 보고하되, 실제 Apple Push 호출은 반드시 mock한다.

---

## 9. 프런트엔드 검증

최소 실행:

```bash
cd frontend
npm run lint
npm run build
```

검증 항목:

- TypeScript 오류 0건
- 사용하지 않는 import 없음
- `new Notification()` 중복 제거
- Home 성공 메시지는 실제 PushSubscription 생성 후에만 표시
- iOS Safari 탭에서는 홈 화면 설치 안내
- Cart가 주문 생성 직후 push-subscribe를 시도
- 토스 딥링크보다 push-subscribe 시도가 먼저 실행
- OrderStatus fallback 등록 유지
- Service Worker push 이벤트 유지
- 알림 클릭 시 올바른 주문 상태 URL 이동
- 기존 주문 추적 WebSocket과 10초 폴링 회귀 없음
- 영업 상태 실시간 반영과 15초 폴링 회귀 없음
- 관리자 주문 현황과 알림음 회귀 없음

새 프런트엔드 테스트 프레임워크를 불필요하게 추가하지 말 것.

---

## 10. Railway 운영 로그 완료 기준

푸시 로그는 PostgreSQL 서비스가 아니라 다음 위치에서 확인한다.

```text
Railway 프로젝트
→ Holy-order FastAPI 애플리케이션 서비스
→ Deployments
→ 최신 배포
→ Runtime Logs 또는 Deploy Logs
```

성공 예시:

```text
event=webpush_start order_id=... order_number=... target_count=1
event=webpush_success order_id=... subscription_id=... endpoint_host=web.push.apple.com status=201 attempt=1
```

실패 예시:

```text
event=webpush_failure order_id=... subscription_id=... endpoint_host=web.push.apple.com status=403 exception_type=WebPushException attempt=1 response_excerpt=...
```

대상 없음 예시:

```text
event=webpush_no_targets order_id=...
```

로그만으로 다음을 구분할 수 있어야 한다.

- 서버가 대상 구독을 찾았는지
- Push Service가 요청을 수락했는지
- 어떤 HTTP status로 실패했는지
- 구독을 삭제했는지 유지했는지
- 몇 번 시도했는지

---

## 11. VAPID 확인 완료 기준

배포 전에 다음 결과를 보고한다.

```text
VAPID public/private pair: MATCH 또는 MISMATCH
VAPID_CLAIM_EMAIL normalization: 정상 또는 수정 필요
Apple endpoint 대상 test_push 결과: 성공 또는 status/error
```

VAPID 키가 불일치하면:

- 임의로 새 키를 생성하지 말 것
- 기존 키 복구 가능 여부를 보고
- 키를 의도적으로 교체해야 한다면 기존 PWA 전부 재구독이 필요함을 명시
- 사용자에게 PWA 삭제/재설치를 먼저 요구하지 말 것
- 서버 로그와 키 쌍 검증을 먼저 수행

---

## 12. iPhone 실기기 QA

### 12.1 준비

1. iPhone 홈 화면 PWA로 실행
2. PWA 알림 권한 허용 확인
3. Home의 “알림 켜기” 버튼 클릭
4. 실제 PushSubscription 생성 성공 메시지 확인
5. 새 주문 생성
6. READY 전 해당 주문의 Apple endpoint가 DB에 있는지 확인

```sql
SELECT
    id,
    order_id,
    LEFT(endpoint, 100) AS endpoint,
    created_at
FROM push_subscriptions
WHERE order_id = <새 주문 ID>;
```

### 12.2 테스트 A — 화면 잠금

```text
PWA에서 주문
→ 구독 DB 확인
→ PWA를 백그라운드로 이동
→ iPhone 화면 잠금
→ 관리자가 PREPARING → READY
```

기대 결과:

- 잠금 화면에 준비 완료 알림 표시
- 알림 센터에 표시
- 알림 클릭 시 해당 `/order/status/{id}`로 이동
- Railway 애플리케이션 로그에 webpush_success

### 12.3 테스트 B — 다른 앱 사용 중

```text
PWA에서 주문
→ 다른 앱으로 이동
→ 관리자가 READY
```

기대 결과:

- React 페이지가 실행 중이 아니어도 알림 수신
- 시스템 알림은 한 번만 표시
- 알림 클릭 시 주문 상태 READY

### 12.4 테스트 C — 포그라운드

```text
OrderStatus 화면을 열어둠
→ 관리자가 READY
```

기대 결과:

- 주문 상태 UI 즉시 변경
- 화면 플래시와 인앱 피드백 유지
- `new Notification()` 중복 없음
- 시스템 알림은 Service Worker가 한 번만 표시

### 12.5 테스트 D — 일시 오프라인

```text
iPhone 네트워크 일시 차단
→ 관리자가 READY
→ TTL 3600초 이내 네트워크 복구
```

기대 결과:

- Push Service가 수락했다면 복구 후 전달 가능
- 최소한 Railway 로그에서 수락 또는 실패 원인을 명확히 확인 가능
- 일시 실패한 구독이 DB에서 무조건 삭제되지 않음

### 12.6 테스트 E — VAPID 불일치 시뮬레이션 금지

운영 키를 임의로 바꿔 테스트하지 말 것.

진단 스크립트로 키 쌍을 검증하고 실제 불일치가 확인된 경우에만 별도 운영 계획을 세운다.

---

## 13. 완료 기준

다음 조건을 모두 만족해야 완료로 간주한다.

### 서버

1. READY 상태 DB commit이 푸시 실패와 독립적이다.
2. 푸시 발송은 Background Task 또는 동등한 비차단 구조에서 실행된다.
3. request-scoped Session을 Background Task에서 재사용하지 않는다.
4. TTL 3600초가 적용된다.
5. 네트워크 timeout이 적용된다.
6. 404/410만 만료 구독으로 삭제한다.
7. 400/401/403은 구독을 유지하고 원인을 기록한다.
8. 429/5xx/timeout은 제한 재시도 후 구독을 유지한다.
9. 전송 성공 여부와 관계없는 일괄 삭제가 제거된다.
10. Railway 애플리케이션 로그에서 성공/실패 status를 확인할 수 있다.
11. VAPID private key와 전체 endpoint가 로그에 노출되지 않는다.

### 프런트엔드

12. Home 성공 메시지는 실제 PushSubscription 확보 후에만 표시된다.
13. iPhone Safari 탭에서는 PWA 설치 안내가 표시된다.
14. 주문 생성 직후 push-subscribe가 수행된다.
15. 토스 딥링크보다 주문 push-subscribe 시도가 먼저다.
16. OrderStatus fallback 등록이 유지된다.
17. 직접 `new Notification()` 중복 로직이 제거된다.
18. Service Worker가 `badge`, `tag`, `type`, `url`을 처리한다.
19. 알림 클릭 URL은 같은 Origin으로 제한된다.
20. 기존 주문 추적 WebSocket과 폴링이 유지된다.

### 실기기

21. iPhone 화면 잠금 상태에서 준비 완료 알림이 도착한다.
22. 다른 앱 사용 중에도 준비 완료 알림이 도착한다.
23. 포그라운드에서 시스템 알림이 중복되지 않는다.
24. 알림 클릭 시 해당 주문 상태 페이지가 열린다.
25. Railway 로그에 Apple Push 요청 결과가 기록된다.

---

## 14. 예상 변경 파일

실제 조사 결과에 따라 달라질 수 있지만 최소한 다음 파일을 검토한다.

### 백엔드

- `backend/routers/admin.py`
- `backend/routers/orders.py`
- `backend/services/push_service.py` 신규 권장
- `backend/config.py`
- `backend/database.py`
- `backend/test_push.py`
- `backend/tests/test_push.py` 또는 기존 테스트 파일

### 프런트엔드

- `frontend/src/utils/push.ts` 신규 권장
- `frontend/src/pages/Home.tsx`
- `frontend/src/pages/Cart.tsx`
- `frontend/src/pages/OrderStatus.tsx`
- `frontend/src/sw.ts`
- `frontend/src/api/client.ts` 필요 시 최소 변경

다음 파일은 회귀 검증은 하되 필요하지 않으면 수정하지 않는다.

- `frontend/src/main.tsx`
- `frontend/vite.config.ts`
- `frontend/src/utils/url.ts`
- 영업 상태 실시간 관련 파일
- 관리자 WebSocket 관련 파일

---

## 15. 결과 보고 형식

작업 완료 후 다음 순서로 보고한다.

1. 최종 원인
2. 원인을 확인한 로그 또는 테스트 근거
3. 실제 변경한 파일 목록
4. 백엔드 푸시 발송 흐름 변경
5. HTTP status별 구독 처리 정책
6. 프런트엔드 구독 생성 및 주문 연결 시점 변경
7. 포그라운드 중복 알림 제거 방식
8. VAPID 키 쌍 검증 결과
9. 실행한 테스트 명령
10. 테스트 결과
11. Railway 로그 예시
12. iPhone 실기기 QA 결과
13. 남아 있는 위험
14. 배포 순서
15. 롤백 방법

“수정했습니다”라고만 보고하지 말고 다음 근거를 포함한다.

- 어떤 Push Service status가 확인됐는지
- 구독이 언제 생성되고 언제 주문에 연결되는지
- 성공/404/410/401/403/429/5xx에서 DB 행을 어떻게 처리하는지
- 실제 PWA가 닫힌 상태에서 알림이 도착했는지
- 시스템 알림이 중복되지 않는지

---

## 16. 배포 순서

1. 현재 VAPID 키 쌍 검증
2. 백엔드 push service와 구조화 로그 배포
3. `test_push.py --order-id <새 테스트 주문>` 실행
4. Railway 애플리케이션 로그에서 status 확인
5. 백엔드 자동 테스트 통과 확인
6. 프런트엔드 공용 push 유틸리티 배포
7. Home 실제 구독 생성 적용
8. Cart 주문 직후 push-subscribe 적용
9. OrderStatus fallback과 중복 Notification 정리
10. Service Worker payload 옵션 배포
11. iPhone PWA를 완전히 종료 후 다시 실행
12. 새 주문으로 잠금 화면 테스트
13. 성공 후 진단 로그 수준 조정

백엔드를 먼저 배포하여 프런트엔드가 새 흐름을 사용하기 전에 서버 발송 결과를 관찰할 수 있게 한다.

---

## 17. 롤백 방법

문제 발생 시 다음 단위로 롤백 가능해야 한다.

```text
백엔드 push service 변경
프런트엔드 구독 등록 시점 변경
OrderStatus 포그라운드 알림 변경
Service Worker notification options 변경
```

롤백 중에도 다음 기존 기능은 유지해야 한다.

- 주문 상태 DB 변경
- WebSocket `ORDER_UPDATED`
- 주문 추적 10초 폴링
- 관리자 주문 현황
- 관리자 새 주문 알림음
- 영업 상태 실시간 반영
- 기존 VAPID 환경변수

VAPID 환경변수를 롤백 과정에서 자동 생성하거나 교체하지 말 것.

---

## Antigravity에게 함께 전달할 문구

> 현재 Railway DB에 `https://web.push.apple.com/...` endpoint가 주문에 연결되어 저장되는 것까지는 확인됐습니다. 따라서 구독 생성 실패로 단정하지 말고, READY 전환 시 서버가 Apple Push Service에 보낸 요청의 status와 응답을 먼저 계측한 뒤 원인을 확정해 주세요. 현재 코드는 발송 성공 여부와 관계없이 주문 구독을 삭제하므로 이를 우선 수정하고, VAPID 키는 절대로 자동 재생성하지 마세요. 운영 WebSocket은 `wss://`를 그대로 유지하세요.
