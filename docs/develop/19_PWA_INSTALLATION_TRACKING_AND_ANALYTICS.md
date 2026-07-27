# PWA 설치 감지·활성 기기 추적·관리자 통계 구성

## 0. 문서 목적

이 문서는 Holy-Order의 사용자 주문 PWA와 관리자 PWA에 대해 다음을 구현하기 위한 작업 명세다.

```text
현재 PWA 앱으로 실행 중인지 판정
설치가 확인된 기기를 익명 installation_id로 등록
앱 재실행 시 last_seen_at 갱신
최근 7일·30일 활성 PWA 기기 수 집계
사용자 PWA와 관리자 PWA를 분리 집계
iOS·Android·Desktop 플랫폼별 집계
기존 앱 주문·웹 주문·현장 주문 통계와 별도로 표시
```

현재 주문 통계는 주문 시점의 실행 모드만 저장한다.

```text
is_pwa=true
→ 이번 주문이 standalone PWA 화면에서 생성됨

is_pwa=false
→ 이번 주문이 일반 브라우저 화면에서 생성됨
```

이 값은 **PWA가 기기에 설치돼 있는지**, **몇 대에 설치돼 있는지**, **최근에 실제로 사용된 설치 기기가 몇 개인지**를 뜻하지 않는다.

이번 작업의 목표는 기존 `Order.is_pwa`를 대체하는 것이 아니라, 주문 실행 환경 통계와 설치 기기 통계를 정확히 분리하는 것이다.

---

# 1. 현재 저장소 기준 확인 사항

작업 전에 반드시 최신 `main` 브랜치를 다시 조사하라. 현재 확인된 기본 구조는 다음과 같다.

## 1-1. 주문 시점의 PWA 실행 여부만 기록한다

`frontend/src/pages/Cart.tsx`는 주문 직전에 다음 방식으로 standalone 실행 여부를 판정한다.

```ts
window.matchMedia('(display-mode: standalone)').matches ||
(navigator as { standalone?: boolean }).standalone === true
```

그 결과를 주문 요청의 `is_pwa`로 전송한다.

백엔드는 `Order.is_pwa`에 값을 저장하고, 관리자 통계는 이를 기준으로 앱 주문과 웹 주문을 집계한다.

따라서 다음 두 상황은 서로 다르다.

```text
PWA가 설치돼 있지만 QR로 Safari/Chrome을 열어 주문
→ is_pwa=false
→ 웹 주문

홈 화면 아이콘으로 PWA를 실행해 주문
→ is_pwa=true
→ 앱 주문
```

## 1-2. 설치 기기 자체를 기록하는 모델과 API가 없다

현재 `backend/models.py`에는 주문의 `is_pwa`는 있으나, 다음 정보를 관리하는 전용 모델은 없다.

```text
설치 기기 식별자
사용자 앱 / 관리자 앱 구분
플랫폼
최초 감지 시각
마지막 실행 시각
최근 활성 여부
설치 감지 방식
```

## 1-3. 푸시 구독은 설치 통계의 완전한 대체가 아니다

현재 PushSubscription은 주문 준비 완료 푸시를 위한 데이터다.

```text
푸시 권한을 허용하지 않은 PWA 설치자
→ 설치돼 있어도 PushSubscription 없음

일반 공지 푸시 또는 주문 푸시 구독이 남은 기기
→ 현재 앱이 실제로 설치돼 있는지 즉시 확정 불가
```

따라서 PushSubscription 수를 PWA 설치 수로 직접 사용하지 말 것.

## 1-4. 관리자 PWA 별도 설치 작업과 의존 관계가 있다

관리자 앱을 `/admin/` 전용 이름·아이콘·manifest id로 별도 설치하려면 다음 선행 문서가 적용돼 있어야 한다.

```text
18_ADMIN_PWA_SEPARATE_INSTALL.md
```

18번 작업이 적용되지 않았다면 `/admin` 경로라는 이유만으로 관리자 PWA 설치로 기록하지 말 것.

```text
사용자 PWA가 /admin으로 이동했을 가능성
일반 브라우저에서 /admin을 연 가능성
```

이 둘을 관리자 PWA 설치로 오인할 수 있다.

---

# 2. 반드시 구분할 세 가지 개념

## 2-1. 현재 standalone으로 실행 중

다음 판정은 비교적 신뢰할 수 있다.

```ts
const isRunningStandalone =
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;
```

이 값은 다음 의미다.

```text
true
→ 현재 창이 홈 화면 PWA 또는 설치형 앱 모드로 실행 중

false
→ 현재 창은 일반 브라우저 탭
```

이것은 **현재 실행 방식**이며, 설치 여부 자체와 동일하지 않다.

## 2-2. 기기에 설치돼 있음

일부 Chromium 환경에서는 `getInstalledRelatedApps()`를 사용할 수 있다.

하지만 다음 원칙을 지켜야 한다.

```text
지원되는 환경
→ 설치 여부를 true 또는 false로 확인 가능

지원되지 않는 환경
→ false가 아니라 unknown/null
```

특히 iPhone Safari 일반 탭에서는 이미 홈 화면에 설치돼 있는지를 범용 API로 확정하기 어렵다.

## 2-3. 서버가 설치 기기를 감지한 적이 있음

서버 통계는 다음 의미로 표현해야 한다.

```text
설치 감지 기기
→ standalone 실행 또는 지원되는 설치 이벤트/API를 통해 서버에 등록된 익명 기기

최근 활성 PWA 기기
→ 일정 기간 내 standalone 실행 heartbeat가 들어온 기기
```

관리자 UI에서 이를 단순히 `현재 설치 수`라고 표시하지 말 것.

---

# 3. 정확도 한계와 UI 용어

## 3-1. iOS 설치 감지

아이폰에서는 다음 시점에 설치 기기로 기록한다.

```text
홈 화면에 추가
→ 홈 화면 아이콘으로 최초 실행
→ standalone 감지
→ 서버 등록
```

Safari 일반 탭만 보고 이미 설치돼 있는지 확정하지 말 것.

## 3-2. 앱 삭제 감지

PWA 삭제 시 브라우저가 서버에 uninstall 이벤트를 보내준다고 가정하면 안 된다.

따라서 다음 통계를 사용한다.

```text
누적 설치 감지 기기
최근 7일 활성 기기
최근 30일 활성 기기
90일 이상 미사용 기기
```

앱 삭제 여부를 즉시 true/false로 제공하지 말 것.

## 3-3. 사용자 수가 아니라 기기·설치 단위

Holy-Order 사용자 앱은 일반 사용자 로그인이 없으므로, 다음 통계는 사용자 수가 아니다.

```text
한 사람이 iPhone과 Android에 설치
→ 2개 설치 기기

한 기기에 사용자 앱과 관리자 앱 설치
→ USER 1개 + ADMIN 1개
```

관리자 화면에는 `설치 사용자` 대신 `설치 감지 기기`라고 표시한다.

---

# 4. 최종 아키텍처

```text
사용자 또는 관리자 PWA 실행
        ↓
프런트엔드가 standalone / platform / app type 감지
        ↓
app type별 익명 installation_id 확보
        ↓
heartbeat API 호출
        ↓
PwaInstallation upsert
        ↓
first_seen_at / last_seen_at / detection method 갱신
        ↓
관리자 통계 API에서 기간별 활성 기기 집계
```

주문 생성 시에는 다음 정보를 선택적으로 연결한다.

```text
현재 standalone PWA
→ installation_id를 주문 요청에 포함
→ 백엔드가 PwaInstallation을 찾아 Order와 연결

일반 QR/웹 주문
→ installation_id 미전송 또는 null
→ 기존 is_pwa=false 유지
```

---

# 5. 데이터 모델

## 5-1. 신규 모델: PwaInstallation

`backend/models.py`에 프로젝트 스타일에 맞는 모델을 추가하라.

권장 필드:

```text
id                      PK
installation_id         UUID 문자열, 외부 공개 식별자
app_type                 USER | ADMIN
platform                 IOS | ANDROID | DESKTOP | UNKNOWN
browser_family           SAFARI | CHROME | EDGE | FIREFOX | OTHER | UNKNOWN
first_seen_at            최초 서버 등록 시각
last_seen_at             마지막 heartbeat 시각
first_standalone_at      standalone 최초 실행 시각
last_standalone_at       standalone 마지막 실행 시각
last_detection_method    STANDALONE_LAUNCH | APPINSTALLED_EVENT | RELATED_APPS | UNKNOWN
push_permission          GRANTED | DENIED | DEFAULT | UNSUPPORTED | UNKNOWN
related_app_installed    true | false | null
admin_id                  ADMIN 앱인 경우 선택적 관리자 FK
created_at
updated_at
```

필수 제약:

```text
UniqueConstraint(installation_id, app_type)
app_type enum 또는 검증된 문자열
installation_id 길이 제한
platform / browser / detection method 허용값 제한
```

### 저장하지 말아야 할 값

```text
사용자 이름
전화번호
주문 요청사항
전체 User-Agent 원문
IP 주소 장기 저장
Push endpoint 원문
p256dh / auth
관리자 JWT
```

이번 기능의 설치 레코드는 인증 토큰이나 사용자 계정으로 사용하지 않는다.

## 5-2. 주문과 선택적 연결

기존 `Order.is_pwa`는 유지한다.

선택적으로 다음 FK를 추가한다.

```text
orders.pwa_installation_id
→ pwa_installations.id
→ nullable
```

프런트엔드는 DB PK가 아니라 익명 `installation_id` 문자열을 보낸다.

백엔드는 이를 조회해 내부 FK로 연결한다.

하위 호환성:

```text
기존 프런트엔드
→ installation_id 없음
→ 주문 정상 생성

새 프런트엔드지만 heartbeat 등록 실패
→ 주문 자체는 실패시키지 않음
→ pwa_installation_id=null
→ is_pwa는 기존 판정값 유지
```

설치 추적 실패가 주문 실패 원인이 되어서는 안 된다.

---

# 6. 마이그레이션

## 6-1. 필수 변경

```text
pwa_installations 테이블 생성
orders.pwa_installation_id nullable FK 추가
필요한 unique/index 추가
```

권장 인덱스:

```text
(app_type, last_seen_at)
(platform, last_seen_at)
installation_id
admin_id
```

## 6-2. 적용 방식

저장소에 Alembic이 이미 적용돼 있다면 정식 revision을 추가하라.

Alembic이 아직 없다면:

- 새로운 공개 `/dev/migrate` 엔드포인트를 추가하지 말 것
- 현재 저장소의 확립된 배포 마이그레이션 방식을 조사할 것
- idempotent SQL 또는 안전한 migration script를 작성할 것
- 적용·검증·롤백 SQL을 문서화할 것

기존 주문 데이터는 다음 상태로 유지한다.

```text
pwa_installation_id = NULL
is_pwa = 기존 값 유지
```

과거 주문을 추정해서 임의의 설치 레코드에 연결하지 말 것.

---

# 7. 백엔드 스키마

## 7-1. 허용 enum

권장 타입:

```python
PwaAppType = "USER" | "ADMIN"
PwaPlatform = "IOS" | "ANDROID" | "DESKTOP" | "UNKNOWN"
PwaBrowserFamily = "SAFARI" | "CHROME" | "EDGE" | "FIREFOX" | "OTHER" | "UNKNOWN"
PwaDetectionMethod = "STANDALONE_LAUNCH" | "APPINSTALLED_EVENT" | "RELATED_APPS" | "UNKNOWN"
PushPermissionState = "GRANTED" | "DENIED" | "DEFAULT" | "UNSUPPORTED" | "UNKNOWN"
```

Pydantic Enum 또는 Literal을 사용해 임의 문자열 저장을 막는다.

## 7-2. 사용자 heartbeat 요청

```json
{
  "installation_id": "UUID",
  "platform": "IOS",
  "browser_family": "SAFARI",
  "is_running_standalone": true,
  "detection_method": "STANDALONE_LAUNCH",
  "push_permission": "GRANTED",
  "related_app_installed": null
}
```

사용자 공개 엔드포인트에서는 `app_type`을 요청 본문에서 받지 말고 서버가 `USER`로 고정한다.

## 7-3. 관리자 heartbeat 요청

본문은 사용자와 동일한 형태를 사용할 수 있다.

관리자 엔드포인트는 반드시 인증을 적용하고 서버가 다음을 결정한다.

```text
app_type = ADMIN
admin_id = current_admin.id
```

클라이언트가 임의 관리자 ID를 보내지 못하게 한다.

## 7-4. 주문 생성 요청 확장

기존 `OrderCreate`에 선택 필드를 추가한다.

```json
{
  "is_pwa": true,
  "pwa_installation_key": "UUID 또는 null"
}
```

필드명은 현재 프로젝트 명명 규칙에 맞게 조정할 수 있다.

서버 규칙:

```text
키 없음
→ 정상 주문

키 형식 오류
→ 주문 실패시키지 않음
→ 연결 생략 + 안전한 로그

등록된 USER installation key
→ orders.pwa_installation_id 연결

ADMIN installation key
→ 일반 사용자 주문에 연결 금지
```

---

# 8. 백엔드 API

## 8-1. 사용자 PWA heartbeat

권장:

```http
POST /api/v1/pwa/installations/heartbeat
```

특징:

```text
인증 없음
app_type=USER 서버 고정
UUID 및 enum 검증
upsert
중복 행 생성 금지
last_seen_at 갱신
standalone=true일 때 last_standalone_at 갱신
```

## 8-2. 관리자 PWA heartbeat

권장:

```http
POST /api/v1/admin/pwa/installations/heartbeat
Authorization: Bearer <admin token>
```

특징:

```text
get_current_admin 필수
app_type=ADMIN 서버 고정
admin_id 서버 결정
```

## 8-3. 관리자 통계 조회

권장:

```http
GET /api/v1/admin/pwa/installations/stats?active_days=30
```

응답 예시:

```json
{
  "success": true,
  "data": {
    "detected_total": 120,
    "active_7d": 47,
    "active_30d": 83,
    "stale_90d": 12,
    "by_app_type": {
      "USER": 110,
      "ADMIN": 10
    },
    "by_platform": {
      "IOS": 61,
      "ANDROID": 54,
      "DESKTOP": 5,
      "UNKNOWN": 0
    },
    "standalone_active_30d": 79,
    "push_permission_granted": 70,
    "pwa_orders_30d": 132,
    "unique_ordering_installations_30d": 65
  }
}
```

정확한 응답 타입은 Pydantic schema로 정의한다.

## 8-4. 관리자 설치 목록

권장:

```http
GET /api/v1/admin/pwa/installations
  ?page=1
  &limit=20
  &app_type=USER
  &platform=IOS
  &activity=ACTIVE_30D
```

목록에는 다음 정도만 제공한다.

```text
masked_installation_id
app_type
platform
browser_family
first_seen_at
last_seen_at
last_standalone_at
push_permission
admin name 또는 admin_id는 ADMIN 레코드에서만 권한에 따라 표시
```

전체 installation_id를 UI에 노출하지 말 것.

예:

```text
8c1d2f4a…
```

---

# 9. 백엔드 write 절감과 중복 방지

프런트엔드가 화면 활성화 때마다 DB를 과도하게 갱신하지 않도록 두 단계 throttling을 적용한다.

## 9-1. 프런트엔드 throttling

권장 기본값:

```text
최초 standalone 실행: 즉시
appinstalled 이벤트: 즉시
이후 heartbeat: 마지막 성공 후 6시간 이상 지났을 때
온라인 복귀: 6시간 제한을 만족할 때
visibility visible: 6시간 제한을 만족할 때
```

관리자 앱은 운영 빈도에 따라 1~6시간 범위로 설정할 수 있으나, 기본은 사용자 앱과 동일하게 단순화한다.

## 9-2. 백엔드 throttling

같은 installation_id가 짧은 시간 내 반복 호출되면:

```text
응답은 성공
실제 DB update는 마지막 갱신 후 일정 시간이 지난 경우에만 수행 가능
```

필요하면 5분 미만의 반복 write를 생략한다.

---

# 10. 프런트엔드 공용 유틸리티

신규 파일 권장:

```text
frontend/src/utils/pwaInstallation.ts
```

최소 export:

```ts
export type PwaAppType = 'USER' | 'ADMIN';

export type PwaInstallState = {
  isRunningStandalone: boolean;
  isInstalledOnDevice: boolean | null;
  detectionMethod:
    | 'STANDALONE_LAUNCH'
    | 'APPINSTALLED_EVENT'
    | 'RELATED_APPS'
    | 'UNKNOWN';
  platform: 'IOS' | 'ANDROID' | 'DESKTOP' | 'UNKNOWN';
  browserFamily: 'SAFARI' | 'CHROME' | 'EDGE' | 'FIREFOX' | 'OTHER' | 'UNKNOWN';
};

export function isStandalonePwa(): boolean;
export function detectPwaPlatform(): ...;
export function detectBrowserFamily(): ...;
export function getOrCreateInstallationId(appType: PwaAppType): string;
export async function detectPwaInstallState(appType: PwaAppType): Promise<PwaInstallState>;
export async function reportPwaHeartbeat(appType: PwaAppType, options?: ...): Promise<void>;
export function getPwaInstallationIdForOrder(): string | null;
```

## 10-1. app type별 localStorage key

사용자 앱과 관리자 앱이 같은 Origin을 공유하므로 반드시 별도 키를 사용한다.

```text
holy-order:pwa-installation-id:user
holy-order:pwa-installation-id:admin

holy-order:pwa-installation-last-report:user
holy-order:pwa-installation-last-report:admin
```

한 앱의 설치 통계가 다른 앱에 덮어써지지 않게 한다.

## 10-2. UUID 생성

우선:

```ts
crypto.randomUUID()
```

지원되지 않는 환경에는 암호학적으로 충분한 fallback을 구현한다.

날짜·User-Agent·IP를 조합한 추적 ID를 만들지 말 것.

## 10-3. standalone 판정 공용화

현재 `Home.tsx`, `Cart.tsx`, 푸시 유틸리티 등 여러 파일에 중복된 판정을 이 공용 함수로 통합한다.

```ts
isStandalonePwa()
```

기존 앱 주문 통계의 동작은 유지돼야 한다.

## 10-4. getInstalledRelatedApps는 선택적 보완

사용 가능할 때만 호출한다.

```ts
if ('getInstalledRelatedApps' in navigator) {
  // 지원 환경에서만
}
```

오류 또는 미지원 시:

```text
isInstalledOnDevice=null
```

으로 반환한다.

`false`로 단정하지 말 것.

18번 작업으로 사용자·관리자 매니페스트가 분리돼 있다면, 각 매니페스트에 자기 자신을 가리키는 related application 설정을 검토하라.

단, 기존 manifest `id`, `scope`, `start_url`을 바꾸지 말 것.

## 10-5. appinstalled 이벤트

Chromium 계열에서 이벤트를 지원하면 등록한다.

```ts
window.addEventListener('appinstalled', ...)
```

이 이벤트만을 유일한 설치 판정으로 사용하지 않는다.

```text
Android/Chromium
→ appinstalled 이벤트 + standalone 최초 실행

iOS
→ standalone 최초 실행
```

---

# 11. 사용자 PWA 연동

## 11-1. 등록 위치

사용자 주문 라우트 전체에서 유지되는 공용 계층을 우선 사용한다.

현재 구조를 확인한 뒤 다음 중 적절한 위치를 선택한다.

```text
PublicRealtimeLayout
사용자 전용 App bootstrap hook
별도 PwaInstallationReporter 컴포넌트
```

페이지마다 중복 heartbeat를 보내지 말 것.

## 11-2. 실행 흐름

```text
사용자 앱 부팅
→ install state 감지
→ standalone이면 USER installation_id 확보
→ heartbeat
→ visibility visible / online에서 throttle 조건 확인 후 heartbeat
```

일반 QR 웹에서는 설치 ID를 새로 만들어 서버에 보내지 않는 것을 기본 원칙으로 한다.

예외:

```text
지원되는 getInstalledRelatedApps로 설치를 확인했고
기존 USER installation_id가 localStorage에 존재
→ 선택적으로 설치 존재 heartbeat 가능
```

하지만 이 경로가 통계의 필수 조건은 아니다.

## 11-3. 주문 요청 연결

`Cart.tsx`에서 기존 `is_pwa`를 공용 함수로 계산한다.

```ts
const isPwa = isStandalonePwa();
```

standalone일 때만 다음 값을 포함한다.

```ts
pwa_installation_key: getPwaInstallationIdForOrder()
```

다음은 유지한다.

```text
QR 웹 주문
→ is_pwa=false
→ installation key 없음

PWA 주문
→ is_pwa=true
→ installation key 존재 가능
```

설치 ID 확보나 heartbeat 실패로 주문을 막지 말 것.

---

# 12. 관리자 PWA 연동

## 12-1. 선행 조건 검증

다음이 적용됐는지 먼저 확인한다.

```text
관리자 전용 manifest id
/admin/ start_url
/admin/ scope
관리자 전용 HTML/아이콘
```

적용되지 않았다면 `ADMIN` 설치 통계를 구현 완료로 보고하지 말 것.

## 12-2. 등록 위치

`AdminLayout`처럼 인증된 관리자 영역 전체에서 유지되는 계층에 reporter를 연결한다.

동작:

```text
/admin PWA standalone 실행
→ ADMIN installation_id 확보
→ 인증된 heartbeat API 호출
→ current admin과 연결
```

일반 브라우저 `/admin` 접속은 관리자 PWA 설치로 기록하지 않는다.

## 12-3. 사용자·관리자 설치 ID 분리

같은 iPhone/iPad에 두 앱이 설치돼도 다음처럼 별도 레코드가 생성돼야 한다.

```text
USER installation_id=A
ADMIN installation_id=B
```

같은 Origin이라는 이유로 동일 ID를 공유하지 말 것.

---

# 13. 관리자 통계 UI

## 13-1. 위치

기존 관리자 정보 구조를 조사한 뒤 다음 중 한 곳에 최소 변경으로 추가한다.

권장 우선순위:

```text
1. AdminSalesReports 내 별도 PWA 설치 현황 섹션
2. AdminSettings 내 운영 현황 카드
3. 별도 route는 기능 규모가 커진 경우에만
```

새로운 최상위 메뉴를 불필요하게 추가하지 말 것.

## 13-2. 필수 카드

```text
누적 설치 감지 기기
최근 7일 활성 기기
최근 30일 활성 기기
사용자 PWA 설치 감지 기기
관리자 PWA 설치 감지 기기
푸시 권한 허용 기기
```

플랫폼 분포:

```text
iOS
Android
Desktop
Unknown
```

주문 연결 통계:

```text
최근 30일 PWA 주문 수
최근 30일 PWA 주문을 생성한 고유 설치 기기 수
```

## 13-3. 필수 안내 문구

다음 의미가 사용자에게 보이도록 tooltip 또는 설명을 추가한다.

```text
설치 감지 기기는 앱을 standalone으로 실행한 기록을 기준으로 합니다.
앱 삭제 여부는 즉시 감지되지 않습니다.
iPhone Safari에서는 설치 후 홈 화면 앱을 한 번 실행해야 기록됩니다.
이 수치는 사람 수가 아니라 기기·설치 단위입니다.
```

## 13-4. 기존 주문 통계 명칭 보존

현재의 다음 통계는 그대로 유지한다.

```text
앱 주문
웹/QR 주문
현장 주문
```

설치 통계를 기존 `order_type_counts`에 섞지 말 것.

```text
주문 방식 통계
≠
설치 기기 통계
```

---

# 14. 활성·비활성 계산 규칙

권장 기본값:

```text
ACTIVE_7D
→ last_seen_at >= now - 7 days

ACTIVE_30D
→ last_seen_at >= now - 30 days

STALE_90D
→ last_seen_at < now - 90 days
```

`is_installed=true/false` 컬럼을 서버에서 임의로 갱신하지 말고, 활동 기준으로 계산한다.

필요하면 운영 환경변수 또는 설정 상수로 기간을 분리할 수 있다.

```text
PWA_ACTIVE_SHORT_DAYS=7
PWA_ACTIVE_LONG_DAYS=30
PWA_STALE_DAYS=90
```

이번 작업에서 꼭 환경변수로 만들 필요는 없지만, 하드코딩 위치는 한 곳으로 모은다.

---

# 15. 푸시 상태 연동 원칙

`Notification.permission`은 최신 heartbeat에서 선택적으로 저장할 수 있다.

하지만 다음 제한을 문서화한다.

```text
GRANTED
→ 마지막 heartbeat 시점에 권한이 granted였음

DENIED/DEFAULT
→ 마지막 heartbeat 시점의 상태

현재 유효한 PushSubscription 존재 여부
→ 별도 푸시 구독 데이터와 검증 필요
```

푸시 권한 값만 보고 백그라운드 푸시 전송 가능 기기라고 단정하지 말 것.

향후 `09_PUSH_SUBSCRIPTION_MULTI_ORDER.md` 또는 `16_GENERAL_PUSH_NOTIFICATION_BROADCAST.md`가 적용되면 PushEndpoint와 installation을 선택적으로 연결할 수 있다.

이번 작업에서는 기존 주문 푸시 스키마를 대규모로 변경하지 말 것.

---

# 16. 개인정보·보안 요구사항

## 16-1. installation_id의 성격

installation_id는 익명 설치 식별자다.

다음 용도로 사용하지 말 것.

```text
로그인
주문 소유권 인증
관리자 인증
결제 검증
공개 주문 접근 권한
```

## 16-2. 공개 heartbeat 보호

사용자 heartbeat API는 공개될 수밖에 있으므로 다음을 적용한다.

```text
UUID 형식 검증
허용 enum 검증
요청 길이 제한
app_type=USER 서버 고정
짧은 기간 반복 update 억제
가능하면 IP별 rate limit
```

클라이언트가 `ADMIN` app type이나 admin_id를 임의로 등록하지 못하게 한다.

## 16-3. 관리자 API

다음은 반드시 관리자 인증이 필요하다.

```text
ADMIN heartbeat
설치 통계
설치 목록
```

목록 API에는 MASTER 또는 적절한 관리자 권한 정책을 적용한다.

## 16-4. 로그

로그에는 다음만 남긴다.

```text
event name
app_type
platform
masked installation id 또는 DB id
upsert / heartbeat 결과
```

전체 installation_id와 User-Agent 원문을 반복적으로 기록하지 말 것.

---

# 17. 데이터 보존 정책

기본 권장:

```text
최근 90일 미사용
→ stale로 분류

최근 365일 미사용 + 연결 주문 없음
→ 삭제 또는 익명 정리 후보
```

연결된 과거 주문의 통계 무결성을 깨뜨리지 말 것.

삭제 정책을 자동화하지 않는다면 관리자 문서에 수동 정리 SQL 또는 유지 정책을 기록한다.

---

# 18. 작업 전 전체 검색

수정 전에 최소한 다음을 검색한다.

```bash
rg -n \
  "is_pwa|display-mode: standalone|navigator.*standalone|appinstalled|getInstalledRelatedApps|manifest|start_url|scope|related_applications|AdminSalesReports|order_type_counts|PushSubscription" \
  frontend backend
```

다음 파일을 반드시 확인한다.

```text
backend/models.py
backend/schemas.py
backend/routers/orders.py
backend/routers/admin.py
backend/tests/*
frontend/src/pages/Home.tsx
frontend/src/pages/Cart.tsx
frontend/src/pages/admin/AdminLayout.tsx
frontend/src/pages/admin/AdminSalesReports.tsx
frontend/src/App.tsx
frontend/src/main.tsx
frontend/src/utils/push.ts
frontend/vite.config.ts
frontend/public 또는 manifest 파일
frontend/vercel.json
```

18번 관리자 PWA 작업이 적용돼 있다면 다음도 확인한다.

```text
frontend/admin.html
manifest-admin.webmanifest
manifest-user.webmanifest
Vite multi-page input
/admin rewrite
```

---

# 19. 자동 테스트

## 19-1. 백엔드 모델·API 테스트

최소 테스트:

```text
USER heartbeat 최초 등록
같은 USER installation_id 재호출 시 upsert, 중복 없음
last_seen_at 갱신
standalone=true일 때 standalone 시각 갱신
ADMIN heartbeat 인증 없으면 401
ADMIN heartbeat는 current admin과 연결
사용자 endpoint가 ADMIN app_type을 만들 수 없음
잘못된 UUID는 422 또는 정의된 400
잘못된 enum은 거부
```

## 19-2. 주문 연동 테스트

```text
기존 주문 payload에 installation key 없음
→ 기존과 동일하게 성공

유효한 USER installation key + is_pwa=true
→ Order FK 연결

존재하지 않는 key
→ 주문은 성공, FK null

ADMIN installation key를 일반 주문에 전달
→ 연결 거부, 주문은 안전하게 처리

기존 Order.is_pwa 통계 유지
```

## 19-3. 통계 테스트

고정된 시각 데이터를 사용해 다음을 검증한다.

```text
누적 설치 감지 수
7일 활성 수
30일 활성 수
90일 stale 수
USER / ADMIN 분리
IOS / ANDROID / DESKTOP 분리
고유 주문 설치 기기 수
취소 주문 포함 정책 명확화
```

## 19-4. 인증 테스트

```text
설치 통계 API 미인증 접근 차단
일반 ADMIN과 MASTER 권한 정책 검증
```

## 19-5. 프런트엔드

```bash
npm run lint
npm run build
```

새 테스트 프레임워크를 불필요하게 추가하지 말 것.

---

# 20. 실기기 QA

## 20-1. iPhone 사용자 PWA

```text
Safari에서 일반 웹 접속
→ 설치 여부를 false로 단정하지 않음
→ 일반 웹 heartbeat로 설치 레코드 생성하지 않음

홈 화면에 추가
→ 아이콘으로 최초 실행
→ USER installation 등록
→ platform=IOS
→ standalone 시각 기록

앱 재실행
→ 중복 행 없음
→ last_seen_at 갱신
```

## 20-2. Android 사용자 PWA

```text
Chrome에서 설치
→ appinstalled 지원 시 즉시 기록 가능
→ 홈 화면 앱 실행 시 standalone heartbeat
→ 중복 행 없음
```

## 20-3. 설치돼 있지만 QR로 브라우저 주문

```text
PWA는 이미 설치됨
→ QR을 다시 스캔해 Chrome/Safari 일반 탭에서 주문
→ is_pwa=false 유지
→ 앱 주문으로 오분류하지 않음
```

설치 통계와 주문 실행 환경 통계가 분리돼야 한다.

## 20-4. 관리자 PWA

18번 작업이 적용된 환경에서:

```text
사용자 PWA 설치 및 실행
→ USER ID 생성

관리자 PWA 설치 및 실행
→ ADMIN ID 별도 생성

같은 기기·같은 Origin
→ 서로 다른 installation ID
```

일반 브라우저 `/admin` 접속은 ADMIN 설치로 기록되지 않아야 한다.

## 20-5. 앱 삭제

```text
앱 삭제 직후
→ 서버 누적 기록은 즉시 사라지지 않음

시간 경과
→ last_seen_at 기준 stale 분류
```

관리자 UI 안내 문구가 이 한계를 정확히 설명해야 한다.

---

# 21. 완료 기준

다음 조건을 모두 만족해야 완료로 간주한다.

1. 기존 `Order.is_pwa`와 앱/웹/현장 주문 통계가 유지된다.
2. 사용자 PWA standalone 최초 실행 시 USER 설치 레코드가 생성된다.
3. 같은 앱을 반복 실행해도 중복 설치 행이 생성되지 않는다.
4. iPhone Safari 일반 탭에서 설치 여부를 false로 단정하지 않는다.
5. Android 지원 환경에서는 appinstalled 또는 related apps를 보조 신호로 사용할 수 있다.
6. 사용자 앱과 관리자 앱이 서로 다른 installation_id를 사용한다.
7. 관리자 PWA는 18번 작업이 적용된 경우에만 ADMIN 설치로 기록된다.
8. 일반 브라우저 `/admin` 접속은 관리자 설치로 집계되지 않는다.
9. heartbeat API는 과도한 DB write를 만들지 않는다.
10. 관리자 통계에 누적 감지, 7일·30일 활성, 플랫폼, 앱 유형이 표시된다.
11. 관리자 UI는 `현재 설치 사용자 수`라고 과장하지 않는다.
12. 주문 생성은 설치 추적 실패와 무관하게 정상 동작한다.
13. 새 프런트엔드의 PWA 주문은 설치 레코드와 선택적으로 연결된다.
14. 이전 프런트엔드 주문 payload도 정상 처리된다.
15. 관리자 통계·목록 API는 인증으로 보호된다.
16. 이름·전화번호·전체 User-Agent·Push 비밀키를 설치 레코드에 저장하지 않는다.
17. 백엔드 테스트, 프런트 lint, 프런트 build가 통과한다.
18. iPhone과 Android 실기기 QA 결과가 보고된다.

---

# 22. 변경하지 말아야 할 사항

이번 작업에서는 다음을 하지 말 것.

```text
Order.is_pwa 삭제 또는 의미 변경
QR/APP/DIRECT 통계 의미를 몰래 변경
사용자 로그인 시스템 추가
설치 ID를 인증 토큰으로 사용
브라우저 fingerprint 생성
IP·User-Agent 원문 장기 저장
PushSubscription 전체 구조 재설계
일반 공지 푸시 구현
관리자 PWA HTML/manifest를 18번과 다른 방식으로 재구축
사용자·관리자 PWA manifest id 변경
VAPID 키 변경
WebSocket 구조 변경
주문·결제 로직 대규모 리팩터링
관련 없는 UI 전면 변경
```

범위를 넘어서는 문제는 결과 보고에 별도 항목으로 제시한다.

---

# 23. 예상 변경 파일

실제 저장소 조사 후 조정할 수 있으나 최소한 다음을 검토한다.

## 백엔드

```text
backend/models.py
backend/schemas.py
backend/routers/orders.py
backend/routers/admin.py
backend/services/pwa_installation_service.py 신규 가능
backend/tests/test_pwa_installations.py 신규
마이그레이션 파일
```

## 프런트엔드

```text
frontend/src/utils/pwaInstallation.ts 신규
frontend/src/components/PwaInstallationReporter.tsx 신규 가능
frontend/src/components/layout/PublicRealtimeLayout.tsx 또는 사용자 bootstrap
frontend/src/pages/Cart.tsx
frontend/src/pages/admin/AdminLayout.tsx
frontend/src/pages/admin/AdminSalesReports.tsx
frontend/src/types/index.ts
사용자·관리자 manifest 파일
```

18번 작업이 적용되지 않았다면 관리자 manifest를 이번 작업에서 임의로 재설계하지 말고 선행 조건을 보고한다.

---

# 24. 배포 순서

권장 순서:

```text
1. 현재 DB 백업
2. 백엔드 모델·스키마·통계 API 배포
3. DB 마이그레이션 검증
4. 구버전 프런트엔드 주문이 정상인지 확인
5. 사용자 PWA reporter 배포
6. 사용자 installation heartbeat 확인
7. 관리자 PWA reporter 배포
8. 관리자 설치 통계 UI 배포
9. iPhone / Android 실기기 검증
10. 7일·30일 집계 쿼리 검증
```

백엔드를 먼저 배포해 새 프런트엔드 heartbeat 요청을 받을 준비를 완료한다.

---

# 25. 롤백

문제 발생 시 다음 순서로 롤백할 수 있어야 한다.

```text
프런트 installation reporter 비활성화
관리자 설치 통계 UI 숨김
신규 heartbeat API 유지 또는 비활성화
Order의 nullable FK는 그대로 둠
pwa_installations 테이블은 즉시 삭제하지 않음
```

기존 주문 기능과 `is_pwa` 통계는 롤백 중에도 계속 동작해야 한다.

DB 컬럼과 테이블 삭제는 데이터 보존 여부를 확인한 별도 마이그레이션에서만 수행한다.

---

# 26. 작업 결과 보고 형식

작업 완료 후 다음 순서로 보고하라.

1. 현재 코드 조사 결과
2. 설치 감지와 standalone 실행 판정의 차이
3. 실제 변경 파일 목록
4. DB 모델과 마이그레이션
5. heartbeat API 계약
6. 프런트 installation ID 생성·저장 정책
7. 사용자 PWA 연동 위치
8. 관리자 PWA 선행 조건 확인 결과
9. 주문과 설치 레코드 연결 방식
10. 관리자 통계 UI와 용어
11. 개인정보·보안 조치
12. 실행한 테스트 명령과 결과
13. iPhone QA 결과
14. Android QA 결과
15. 정확도 한계
16. 배포 순서
17. 롤백 방법
18. 남은 후속 작업

다음 표현은 사용하지 말 것.

```text
정확한 설치 사용자 수
현재 설치된 모든 앱 수
앱 삭제를 실시간 감지함
```

대신 다음 표현을 사용한다.

```text
설치 감지 기기
최근 활성 PWA 기기
standalone 실행 감지
지원 환경에서 확인된 설치 상태
```
