# PWA 설치 유무 통계 신뢰성 복구 및 API 계약 정합화

## 0. 문서 목적

이 문서는 Holy-Order에 이미 구현된 PWA 설치 추적 기능을 새로 만드는 문서가 아니다.

현재 `main` 브랜치에 구현된 다음 기능을 유지하면서, 관리자 통계 숫자가 실제 의미와 일치하도록 오류를 수정하는 안정화 작업 명세다.

```text
사용자 PWA와 관리자 PWA의 익명 installation_id 분리
standalone 실행 감지
appinstalled 이벤트 감지
heartbeat API
PwaInstallation 테이블
주문과 PWA 설치 레코드 연결
관리자 PWA 설치·활성 기기 통계 화면
```

현재 구조에는 전송 경로, 인증 토큰, 외래키, 통계 집계 기준, 프런트·백엔드 응답 계약이 서로 맞지 않는 문제가 있다.

이 상태에서는 관리자 화면에 숫자가 표시되더라도 다음을 신뢰하기 어렵다.

```text
실제로 설치된 PWA 수
사용자 PWA와 관리자 PWA 수
최근 7일·30일 활성 PWA 수
플랫폼별 설치 수
주문을 생성한 고유 PWA 기기 수
관리자 이름과 설치 레코드 연결
```

이번 작업의 최우선 목표는 **통계 숫자의 의미와 실제 저장 데이터를 일치시키는 것**이다.

---

# 1. 작업 범위

## 포함

```text
PWA heartbeat 전송 경로 수정
관리자 heartbeat 인증 수정
PwaInstallation.admin_id 외래키 수정
설치 증거가 있는 레코드만 통계에 포함
일반 QR·브라우저 방문을 설치 수에서 제외
활성 통계를 last_standalone_at 기준으로 변경
프런트·백엔드 응답 필드 통일
기존 오염 데이터의 안전한 제외 정책
주문과 PWA 설치 레코드 연결 검증
재설치 통계 용어 정리
관리자 통계 화면 문구 및 자동 갱신 보완
백엔드·프런트 테스트
PostgreSQL 마이그레이션 및 배포 검증
```

## 제외

```text
관리자 PWA 아이콘·매니페스트·가로모드 재구성
주일 봉사 스케줄 UI 수정
주문 완료 푸시 기능 수정
일반 공지 푸시 구현
WebSocket 구조 변경
주문 가격 계산 변경
사용자 로그인 기능 추가
브라우저 지문 수집
물리 휴대전화의 영구 ID 생성
기존 Order.is_pwa 의미 변경
```

관리자 PWA의 가로모드와 `/admin` 주문 관리 화면은 현재 정상 동작하는 것으로 확인되었으므로 이번 작업에서 변경하지 않는다.

---

# 2. 현재 저장소에서 확인된 핵심 문제

작업 시작 시 최신 `main`을 다시 확인하되, 현재 확인된 문제는 다음과 같다.

## 2-1. Heartbeat가 Railway API가 아니라 Vercel 프런트엔드로 전송될 수 있음

현재 `frontend/src/utils/pwaInstallation.ts`는 `apiClient`를 사용하지 않고 상대 경로로 `fetch()`한다.

```ts
const endpoint = appType === 'ADMIN'
  ? '/api/v1/admin/pwa/installations/heartbeat'
  : '/api/v1/pwa/installations/heartbeat';

await fetch(endpoint, ...);
```

Vercel의 현재 rewrite는 `/admin/*` 이외 모든 경로를 `index.html`로 보낸다.

```json
{
  "source": "/(.*)",
  "destination": "/index.html"
}
```

따라서 브라우저 기준 상대 URL인 `/api/v1/...` 요청이 Railway가 아니라 Vercel에 도달하고, Vercel이 `index.html`을 HTTP 200으로 반환할 수 있다.

현재 heartbeat 코드는 응답 본문을 확인하지 않고 `response.ok`만 검사한다.

```ts
if (response.ok) {
  localStorage.setItem(lastReportKey, now.toString());
}
```

이 경우 실제 DB에는 아무것도 저장되지 않았는데도 프런트엔드는 전송 성공으로 오인하고 다음 heartbeat를 제한할 수 있다.

## 2-2. 관리자 토큰 키가 실제 로그인 코드와 다름

관리자 로그인은 다음 키를 사용한다.

```ts
localStorage.setItem('adminToken', accessToken);
```

`apiClient`도 `adminToken`을 읽는다.

하지만 PWA heartbeat 유틸리티는 다음 키를 읽는다.

```ts
adminAccessToken
```

따라서 관리자 PWA heartbeat가 인증 토큰을 찾지 못해 전송되지 않을 수 있다.

## 2-3. `admin_id`가 잘못된 테이블을 참조함

현재 모델과 자동 마이그레이션은 다음 구조다.

```python
admin_id = Column(
    Integer,
    ForeignKey("users.id"),
)

admin = relationship("User")
```

하지만 heartbeat에서 전달하는 ID는 `Admin.id`다.

정상 구조는 다음이어야 한다.

```python
ForeignKey("admins.id")
relationship("Admin")
```

현재 구조에서는 PostgreSQL 외래키 오류가 발생하거나, 우연히 같은 숫자의 일반 사용자와 연결될 수 있다.

## 2-4. 일반 브라우저 방문도 설치 레코드로 생성될 수 있음

`PublicRealtimeLayout`은 일반 QR 웹 접속에서도 `reportPwaHeartbeat('USER')`를 호출한다.

현재 `reportPwaHeartbeat()`는 standalone 여부와 관계없이 먼저 installation ID를 생성하고 payload를 전송한다.

```ts
const installationId = getOrCreateInstallationId(appType);
```

백엔드는 `is_running_standalone=false`, `detection_method=UNKNOWN`이어도 새 `PwaInstallation` 행을 생성한다.

그 결과 다음 사용자가 설치 통계에 들어갈 수 있다.

```text
QR로 Safari를 연 사용자
QR로 Chrome을 연 사용자
주소를 직접 입력한 일반 웹 사용자
실제로 홈 화면에 설치한 PWA 사용자
```

## 2-5. 통계는 모든 행과 `last_seen_at`을 사용함

현재 `detected_total`은 모든 PwaInstallation 행을 센다.

```python
detected_total = db.query(PwaInstallation).count()
```

최근 7일·30일 활성도 `last_seen_at`을 사용한다.

```python
last_seen_at >= cutoff
```

하지만 관리자 UI 설명은 standalone 앱 실행 기록을 기준으로 표시한다.

```text
standalone 모드 최초 실행 기록 기준
7일 이내 PWA 실행 기기
```

일반 웹 방문 heartbeat가 저장되면 UI 설명과 실제 집계가 달라진다.

## 2-6. 프런트와 백엔드 목록 응답 필드가 다름

백엔드 목록 응답은 다음 필드를 반환한다.

```text
masked_installation_id
total_count
page
limit
total_pages
```

프런트 타입은 다음 필드를 기대한다.

```text
installation_id_masked
total
id
is_active_7d
is_active_30d
is_stale_90d
```

이 상태에서는 다음 문제가 생길 수 있다.

```text
총 등록 수가 0으로 표시
익명 ID가 비어 보임
React row key가 undefined
활성·미사용 상태 배지가 잘못 표시
```

## 2-7. 시간대 타입이 혼재함

`PwaInstallation` 시간 컬럼은 `DateTime(timezone=True)`이고 PostgreSQL은 `TIMESTAMP WITH TIME ZONE`을 사용한다.

하지만 서비스의 현재 시각은 timezone 정보를 제거한 naive KST다.

```python
datetime.now(KST).replace(tzinfo=None)
```

ORM 객체의 timezone-aware datetime과 naive datetime을 Python에서 비교하면 오류가 발생하거나 환경별로 동작이 달라질 수 있다.

## 2-8. 프런트 6시간 throttling이 standalone 실행에서는 사실상 적용되지 않음

현재 조건은 standalone이 아닐 때만 최근 전송 시각을 검사한다.

```ts
if (!isForce && !isStandalone && lastReportStr) {
  ...
}
```

standalone 앱에서는 화면 복귀마다 요청이 전송될 수 있다.

서버 5분 throttling이 있더라도 불필요한 네트워크 요청은 줄이는 것이 좋다.

## 2-9. `active_days` 쿼리 파라미터가 실제 집계에 반영되지 않음

라우터는 `active_days`를 받지만 서비스는 고정된 7일·30일만 계산한다.

API 계약에 존재하는 값은 실제 의미를 가져야 한다.

## 2-10. 재설치를 실제 물리 기기 중복으로 완전히 제거할 수 없음

현재 installation ID는 localStorage UUID다.

```text
같은 저장소가 유지됨
→ 같은 UUID
→ 같은 행 upsert

PWA 삭제 또는 사이트 데이터 삭제
→ UUID 소실 가능
→ 재설치 후 새 UUID
→ 새 설치 인스턴스
```

웹 플랫폼에는 앱 삭제 후에도 보존되는 신뢰 가능한 물리 기기 ID가 없다.

따라서 통계에서 다음을 구분해야 한다.

```text
설치 감지 인스턴스
확인된 고유 사용자
확인된 고유 관리자
실제 물리 기기 수는 산출 불가
```

브라우저 지문을 이용해 억지로 같은 기기로 합치지 말 것.

---

# 3. 통계 용어와 단일 판정 기준

## 3-1. 설치 증거가 있는 레코드

다음 중 하나를 만족해야 설치 감지 인스턴스로 인정한다.

```text
first_standalone_at IS NOT NULL
OR last_standalone_at IS NOT NULL
OR related_app_installed IS TRUE
OR last_detection_method = APPINSTALLED_EVENT
```

공용 서버 함수로 정의한다.

```python
def installation_evidence_filter():
    return or_(
        PwaInstallation.first_standalone_at.isnot(None),
        PwaInstallation.last_standalone_at.isnot(None),
        PwaInstallation.related_app_installed.is_(True),
        PwaInstallation.last_detection_method == "APPINSTALLED_EVENT",
    )
```

## 3-2. 설치 감지 인스턴스

```text
설치 증거가 있는 서로 다른 installation_id + app_type 행
```

관리자 UI 명칭은 다음을 사용한다.

```text
누적 설치 감지 인스턴스
```

다음 명칭은 사용하지 않는다.

```text
현재 설치된 실제 휴대전화 수
고유 물리 기기 수
정확한 설치 사용자 수
```

## 3-3. 최근 활성 PWA 인스턴스

최근 활성은 `last_seen_at`이 아니라 `last_standalone_at`을 기준으로 한다.

```text
최근 7일 활성
→ last_standalone_at >= now - 7 days

최근 30일 활성
→ last_standalone_at >= now - 30 days
```

`APPINSTALLED_EVENT`만 있고 아직 standalone으로 실행되지 않은 레코드는 누적 설치 감지에는 포함할 수 있으나 활성 실행에는 포함하지 않는다.

## 3-4. 확인된 고유 관리자

```text
설치 증거가 있는 ADMIN 레코드의 distinct admin_id
```

관리자 PWA 삭제 후 다시 설치해 installation ID가 바뀌어도 같은 관리자 계정이면 고유 관리자 수는 증가하지 않는다.

## 3-5. 확인된 고유 사용자

사용자 로그인이 없으므로 설치 시점에는 익명이다.

최근 PWA 주문과 연결된 주문의 `distinct user_id`를 이용해 확인된 고유 사용자를 계산한다.

```text
Order.pwa_installation_id IS NOT NULL
AND Order.user_id IS NOT NULL
AND 기간 조건 충족
```

같은 사용자가 삭제 후 재설치해 새 installation ID로 주문해도 같은 `user_id`라면 확인된 고유 사용자 수는 증가하지 않는다.

단, 전화번호를 입력하지 않아 매번 다른 User가 생성되는 구조라면 완전한 중복 제거를 보장하지 않는다.

## 3-6. 일반 웹 방문

다음 상태는 설치 통계에 포함하지 않는다.

```text
is_running_standalone = false
related_app_installed != true
detection_method not in APPINSTALLED_EVENT, RELATED_APPS
```

서버는 해당 요청을 오류로 만들 필요는 없지만, DB 행을 생성하지 않고 `ignored` 결과를 반환한다.

---

# 4. 목표 데이터 흐름

```text
사용자 또는 관리자 페이지 진입
        ↓
프런트에서 설치 증거 판정
        ↓
설치 증거 없음
→ heartbeat 전송하지 않음
        ↓
설치 증거 있음
→ app type별 installation_id 확보
→ apiClient로 Railway API 호출
        ↓
서버에서도 설치 증거 재검증
        ↓
PwaInstallation upsert
        ↓
standalone 시각과 마지막 실행 시각 갱신
        ↓
관리자 통계는 설치 증거 필터를 항상 적용
```

주문 생성 시:

```text
standalone USER PWA
→ pwa_installation_key 전송
→ 증거가 있는 USER 설치 레코드 조회
→ Order.pwa_installation_id 연결

일반 웹 주문
→ pwa_installation_key=null
→ 설치 레코드 연결 없음
```

---

# 5. 프런트엔드 필수 수정

## 5-1. `pwaInstallation.ts`에서 `apiClient` 사용

대상:

```text
frontend/src/utils/pwaInstallation.ts
```

상대 `fetch()`와 직접 Authorization 헤더 구성을 제거한다.

```ts
import { apiClient } from '../api/client';
```

API 경로는 `apiClient.baseURL`에 이미 `/api/v1`이 포함되어 있으므로 다음처럼 사용한다.

```ts
const path = appType === 'ADMIN'
  ? '/admin/pwa/installations/heartbeat'
  : '/pwa/installations/heartbeat';
```

요청 예시:

```ts
const response = await apiClient.post<
  StandardResponse<PwaHeartbeatResponse>,
  StandardResponse<PwaHeartbeatResponse>
>(
  path,
  payload,
  {
    headers: {
      'x-skip-error-toast': 'true',
    },
  },
);
```

프로젝트의 Axios generic 사용 방식에 맞게 조정하라.

관리자 토큰은 직접 읽지 말고 `apiClient` 인터셉터가 `adminToken`을 넣게 한다.

## 5-2. 성공 응답을 검증한 뒤에만 전송 시각 저장

다음 조건에서만 `lastReportKey`를 갱신한다.

```ts
response.success === true
AND response.data.status in ['created', 'updated', 'unchanged']
```

다음 결과에는 성공 시각을 저장하지 않는다.

```text
HTTP 200이지만 HTML 응답
success=false
status=ignored
응답 파싱 실패
네트워크 오류
```

`ignored`는 설치 증거가 없는 일반 웹 접근이므로 재전송 제한 키를 만들 필요가 없다.

## 5-3. 프런트에서도 설치 증거가 있을 때만 heartbeat 전송

공용 함수를 만든다.

```ts
export function hasPwaInstallationEvidence(
  state: PwaInstallState,
  override?: PwaDetectionMethod,
): boolean {
  const method = override ?? state.detectionMethod;

  return (
    state.isRunningStandalone ||
    state.isInstalledOnDevice === true ||
    method === 'APPINSTALLED_EVENT' ||
    method === 'RELATED_APPS'
  );
}
```

설치 증거가 없으면 `getOrCreateInstallationId()`도 호출하지 말고 즉시 종료한다.

이렇게 해야 일반 QR 웹 접속만으로 localStorage ID와 DB 행이 생성되지 않는다.

## 5-4. throttling 수정

다음 원칙을 적용한다.

```text
최초 설치 증거 감지
→ 즉시 전송

force=true 또는 APPINSTALLED_EVENT
→ throttling 무시

그 외 standalone 실행·visibilitychange·online
→ 성공한 마지막 heartbeat 후 6시간 이내면 생략
```

현재처럼 standalone일 때 throttling을 우회하지 말 것.

서버 5분 throttling은 별도 안전장치로 유지한다.

## 5-5. 관리자 heartbeat는 인증이 준비된 뒤 실행

`AdminLayout`은 보호 라우트 안에 있으므로 기본적으로 토큰이 존재하지만, 다음 조건을 명확히 한다.

```text
adminToken 존재
AND 관리자 인증 Query 성공
```

가능하면 `adminInfo?.id`가 확인된 뒤 첫 heartbeat를 보낸다.

```ts
useEffect(() => {
  if (!adminInfo?.id) return;

  void reportPwaHeartbeat('ADMIN');
  ...
}, [adminInfo?.id]);
```

관리자 heartbeat 실패가 로그아웃이나 화면 오류를 일으키면 안 된다.

## 5-6. 사용자 heartbeat 호출 위치 유지 조건

`PublicRealtimeLayout`에서 호출해도 되지만, `reportPwaHeartbeat()` 내부의 설치 증거 가드가 반드시 동작해야 한다.

다음 시나리오에서 DB 행이 생기면 안 된다.

```text
QR Safari 일반 탭
QR Chrome 일반 탭
주소 직접 입력 일반 탭
```

다음 시나리오에서는 기록되어야 한다.

```text
iOS 홈 화면 PWA 실행
Android 설치형 PWA 실행
Desktop 설치형 PWA 실행
appinstalled 이벤트
getInstalledRelatedApps로 설치 확인
```

## 5-7. 브라우저 판정 보완

필요한 범위에서 다음 iOS 브라우저 UA를 구분한다.

```text
CriOS
FxiOS
EdgiOS
```

통계 핵심은 플랫폼과 standalone 여부이므로 브라우저 이름 판정 실패가 전체 heartbeat를 막아서는 안 된다.

## 5-8. 주문 연결 유지

현재 `Cart.tsx`의 다음 구조는 유지한다.

```ts
is_pwa: isStandalonePwa(),
pwa_installation_key: getPwaInstallationIdForOrder(),
```

단 `getPwaInstallationIdForOrder()`는 standalone USER PWA일 때만 ID를 반환해야 한다.

백엔드가 설치 레코드를 찾지 못해도 주문은 정상 생성되어야 한다.

---

# 6. 백엔드 필수 수정

## 6-1. `admin_id` 모델 수정

대상:

```text
backend/models.py
```

수정:

```python
admin_id = Column(
    Integer,
    ForeignKey(
        "admins.id",
        ondelete="SET NULL",
    ),
    nullable=True,
    index=True,
)

admin = relationship(
    "Admin",
    foreign_keys=[admin_id],
)
```

## 6-2. PostgreSQL 외래키 마이그레이션

모델 변경만으로 기존 운영 DB 제약조건은 바뀌지 않는다.

프로젝트의 현재 마이그레이션 방식에 맞는 버전 관리된 migration을 작성하라.

Alembic이 아직 없다면 최소한 별도 idempotent migration 파일을 만들고 실행 결과를 기록하라.

PostgreSQL 기준 핵심 절차:

```sql
ALTER TABLE pwa_installations
DROP CONSTRAINT IF EXISTS pwa_installations_admin_id_fkey;

UPDATE pwa_installations p
SET admin_id = NULL
WHERE admin_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM admins a
    WHERE a.id = p.admin_id
  );

ALTER TABLE pwa_installations
ADD CONSTRAINT pwa_installations_admin_id_fkey
FOREIGN KEY (admin_id)
REFERENCES admins(id)
ON DELETE SET NULL;
```

기존 자동 마이그레이션의 `REFERENCES users(id)`도 반드시 수정한다.

실패를 단순 print 후 무시하지 말고 배포 단계에서 검증 가능한 결과를 제공한다.

## 6-3. 라우터 관리자 타입 수정

대상:

```text
backend/routers/pwa.py
```

현재 타입:

```python
current_admin: models.User
```

수정:

```python
current_admin: models.Admin
```

통계와 목록 API도 동일하게 수정한다.

## 6-4. 설치 증거가 없는 heartbeat는 저장하지 않기

서비스 또는 라우터의 공용 함수로 판정한다.

```python
def has_installation_evidence(
    *,
    is_running_standalone: bool,
    detection_method: str,
    related_app_installed: bool | None,
) -> bool:
    return (
        is_running_standalone
        or related_app_installed is True
        or detection_method in {
            "APPINSTALLED_EVENT",
            "RELATED_APPS",
        }
    )
```

증거가 없으면 DB를 변경하지 않고 다음처럼 반환한다.

```json
{
  "success": true,
  "data": {
    "status": "ignored",
    "reason": "no_installation_evidence"
  }
}
```

프런트 조작을 전제로 서버에서도 반드시 검사해야 한다.

## 6-5. Heartbeat 응답 상태 명확화

다음 상태를 반환한다.

```text
created
updated
unchanged
ignored
```

예:

```json
{
  "status": "updated",
  "app_type": "USER"
}
```

현재처럼 모든 정상 요청을 단순 `ok`로 반환하면 프런트 throttling과 진단이 어렵다.

## 6-6. 시간대 일관성

PWA 설치 서비스에서는 timezone-aware UTC를 사용한다.

```python
from datetime import datetime, timezone

now = datetime.now(timezone.utc)
```

다음을 사용하지 않는다.

```python
replace(tzinfo=None)
```

PostgreSQL `TIMESTAMP WITH TIME ZONE`과 Python 비교가 일관되도록 한다.

API는 offset이 포함된 ISO 8601 문자열을 반환하고, 프런트에서 사용자 로컬 시간으로 표시한다.

기존 데이터와 비교 테스트를 반드시 추가한다.

## 6-7. upsert 상태 변경 판정 보완

다음 값이 바뀌면 5분 이내라도 업데이트한다.

```text
standalone 최초 감지
push_permission
platform
browser_family
detection_method
related_app_installed
admin_id
```

현재 코드처럼 `admin_id` 변경이 state_changed에 포함되지 않는 문제를 방지한다.

## 6-8. 설치 통계에 증거 필터 적용

다음 모든 집계에 공용 `installation_evidence_filter()`를 적용한다.

```text
detected_total
active_7d
active_30d
stale_90d
by_app_type
by_platform
push_permission_granted
목록 조회
```

### 집계 기준

```text
detected_total
→ 설치 증거가 있는 전체 인스턴스

active_7d
→ 설치 증거 있음 AND last_standalone_at >= 7일 전

active_30d
→ 설치 증거 있음 AND last_standalone_at >= 30일 전

stale_90d
→ 설치 증거 있음 AND last_standalone_at < 90일 전

push_permission_granted
→ 설치 증거 있음 AND push_permission=GRANTED
```

`last_standalone_at`이 NULL인 APPINSTALLED_EVENT 레코드는 누적에는 포함하되 활성에는 포함하지 않는다.

## 6-9. 고유 사용자·관리자 지표 추가

기존 필드를 유지하면서 다음을 추가한다.

```text
confirmed_unique_users_30d
confirmed_unique_admins_30d
```

### 확인된 고유 사용자

```python
COUNT(DISTINCT Order.user_id)
WHERE Order.pwa_installation_id IS NOT NULL
  AND Order.user_id IS NOT NULL
  AND Order.created_at >= cutoff
  AND Order.is_active IS TRUE
```

### 확인된 고유 관리자

```python
COUNT(DISTINCT PwaInstallation.admin_id)
WHERE app_type = 'ADMIN'
  AND admin_id IS NOT NULL
  AND installation evidence
  AND last_standalone_at >= cutoff
```

이 지표는 삭제 후 재설치 시 installation ID가 바뀌어도 같은 계정이면 증가하지 않는다.

## 6-10. `active_days` 처리

다음 중 하나를 선택하고 테스트하라.

### 권장

기존 고정 7일·30일 필드는 유지하고 추가 필드를 반환한다.

```text
active_custom
active_days
```

```python
active_custom = ... last_standalone_at >= now - timedelta(days=active_days)
```

사용하지 않는 파라미터로 남겨두지 말 것.

## 6-11. 목록 응답 계약 확정

백엔드와 프런트에서 아래 계약을 동일하게 사용한다.

```json
{
  "items": [
    {
      "id": 12,
      "masked_installation_id": "550e8400...",
      "app_type": "USER",
      "platform": "IOS",
      "browser_family": "SAFARI",
      "first_seen_at": "2026-07-27T01:00:00+00:00",
      "last_seen_at": "2026-07-27T02:00:00+00:00",
      "first_standalone_at": "2026-07-27T01:00:00+00:00",
      "last_standalone_at": "2026-07-27T02:00:00+00:00",
      "last_detection_method": "STANDALONE_LAUNCH",
      "push_permission": "GRANTED",
      "admin_name": null,
      "has_install_evidence": true,
      "is_active_7d": true,
      "is_active_30d": true,
      "is_stale_90d": false
    }
  ],
  "total_count": 1,
  "page": 1,
  "limit": 20,
  "total_pages": 1
}
```

필드명은 다음으로 통일한다.

```text
masked_installation_id
total_count
```

프런트의 다음 구 필드는 제거한다.

```text
installation_id_masked
total
```

## 6-12. 오류 메시지에 내부 예외 노출 금지

현재 공개 heartbeat는 예외 문자열을 응답 message에 포함한다.

운영에서는 다음처럼 처리한다.

```text
서버 로그
→ stack trace 및 request ID 기록

클라이언트 응답
→ 일반적인 실패 메시지
```

예:

```json
{
  "success": false,
  "message": "PWA 상태 기록에 실패했습니다.",
  "data": null
}
```

DB 구조, SQL, 비밀값을 응답에 노출하지 말 것.

## 6-13. 공개 heartbeat 남용 방지

공개 USER heartbeat는 익명 API이므로 최소한 다음을 적용한다.

```text
installation_id + IP 기준 rate limit
요청 body 크기 제한
UUID 형식 및 enum 검증 유지
과도한 요청은 429
```

새 인프라를 도입하지 않고 구현이 어려우면, 현재 환경에서 가능한 최소 방어와 후속 권장안을 결과 보고에 분리한다.

## 6-14. 주문 연결 레코드도 설치 증거 검증

`get_user_installation_by_key()`는 다음 조건을 모두 만족해야 한다.

```text
installation_id 일치
app_type = USER
설치 증거 존재
```

일반 웹 방문으로 만들어진 과거 행에는 주문을 연결하지 않는다.

설치 레코드를 못 찾더라도 주문 자체는 정상 생성해야 한다.

---

# 7. 관리자 통계 화면 수정

대상:

```text
frontend/src/pages/admin/AdminSalesReports.tsx
frontend/src/types/index.ts
frontend/src/api/queryKeys.ts
```

## 7-1. UI 용어 수정

권장 KPI:

```text
누적 설치 감지 인스턴스
최근 7일 활성 PWA
최근 30일 활성 PWA
90일 이상 미사용 인스턴스
```

추가 보조 지표:

```text
최근 30일 확인된 고유 사용자
최근 30일 확인된 고유 관리자
최근 30일 PWA 주문
최근 30일 주문 생성 설치 인스턴스
```

다음 표현은 사용하지 않는다.

```text
정확한 실제 설치 휴대전화 수
현재 삭제되지 않은 앱 수
물리적으로 고유한 기기 수
```

## 7-2. 재설치 한계 안내

관리자 화면에 짧은 설명을 유지한다.

```text
설치 감지 인스턴스는 브라우저 저장소 ID 기준입니다.
앱 삭제나 사이트 데이터 초기화 후 재설치하면 새 인스턴스로 기록될 수 있습니다.
고유 사용자·관리자 수는 주문 사용자 ID와 관리자 계정 기준으로 별도 집계합니다.
```

## 7-3. API 타입 계약 일치

`frontend/src/types/index.ts`를 백엔드 응답과 정확히 맞춘다.

```ts
export interface PwaInstallationItem {
  id: number;
  masked_installation_id: string;
  app_type: 'USER' | 'ADMIN';
  platform: 'IOS' | 'ANDROID' | 'DESKTOP' | 'UNKNOWN';
  browser_family: string;
  first_seen_at: string;
  last_seen_at: string;
  first_standalone_at: string | null;
  last_standalone_at: string | null;
  last_detection_method: string;
  push_permission: string;
  admin_name: string | null;
  has_install_evidence: boolean;
  is_active_7d: boolean;
  is_active_30d: boolean;
  is_stale_90d: boolean;
}

export interface PwaInstallationListResponse {
  items: PwaInstallationItem[];
  total_count: number;
  page: number;
  limit: number;
  total_pages: number;
}
```

## 7-4. 자동 갱신 또는 문구 수정

현재 화면은 `실시간 기기 감지 중`이라고 표시하지만 PWA 통계 Query에는 자동 폴링이 없다.

권장:

```ts
refetchInterval:
  activeTab === 'PWA'
    ? 30_000
    : false,
refetchIntervalInBackground: false,
```

목록 Query도 PWA 탭에서만 30초 폴링하거나 명시적인 새로고침 버튼을 제공한다.

자동 갱신을 하지 않을 경우 `실시간` 문구를 `30초 캐시` 또는 `마지막 조회`로 변경한다.

## 7-5. Query Key 정리

하드코딩 배열 대신 `QK`에 다음을 추가한다.

```ts
pwaInstallations: {
  _domain: ['pwa-installations'],
  stats: (activeDays: number) => [
    'pwa-installations',
    'stats',
    activeDays,
  ],
  list: (filters) => [
    'pwa-installations',
    'list',
    filters,
  ],
}
```

필터 객체는 직렬화 가능한 값만 사용한다.

---

# 8. 기존 오염 데이터 처리

기존 DB에는 일반 웹 방문으로 생성된 행이 있을 수 있다.

물리 삭제를 자동으로 수행하지 말고, 우선 통계와 목록에서 설치 증거가 없는 행을 제외한다.

## 진단 SQL

```sql
SELECT
    COUNT(*) AS total_rows,
    COUNT(*) FILTER (
        WHERE first_standalone_at IS NOT NULL
           OR last_standalone_at IS NOT NULL
           OR related_app_installed IS TRUE
           OR last_detection_method = 'APPINSTALLED_EVENT'
    ) AS evidenced_rows,
    COUNT(*) FILTER (
        WHERE first_standalone_at IS NULL
          AND last_standalone_at IS NULL
          AND COALESCE(related_app_installed, FALSE) = FALSE
          AND last_detection_method NOT IN (
              'APPINSTALLED_EVENT',
              'RELATED_APPS'
          )
    ) AS web_only_rows
FROM pwa_installations;
```

## 관리자 FK 진단

```sql
SELECT p.id, p.admin_id
FROM pwa_installations p
LEFT JOIN admins a ON a.id = p.admin_id
WHERE p.admin_id IS NOT NULL
  AND a.id IS NULL;
```

## 정책

```text
웹 전용 행
→ 통계에서 즉시 제외
→ 자동 삭제하지 않음
→ 90일 이상 경과 후 별도 정리 가능

잘못 연결된 admin_id
→ 마이그레이션 중 NULL 처리
→ 이후 관리자 PWA가 실행되면 정상 계정으로 다시 연결
```

---

# 9. 재설치 중복 정책

## 반드시 명시할 한계

같은 물리 기기의 PWA 삭제 후 재설치를 100% 알아내는 표준 웹 API는 없다.

따라서 다음 정책을 사용한다.

```text
설치 감지 인스턴스
→ installation_id 기준
→ 삭제·사이트 데이터 초기화 후 재설치 시 증가할 수 있음

확인된 고유 관리자
→ distinct admin_id
→ 같은 관리자 재설치 시 증가하지 않음

확인된 고유 사용자
→ PWA 연결 주문의 distinct user_id
→ 같은 사용자 재설치 후 주문 시 증가하지 않음
```

브라우저 지문, IP, 화면 크기, 폰 모델 조합으로 영구 기기 ID를 만들지 말 것.

---

# 10. 자동 테스트

## 10-1. 프런트엔드 테스트

현재 테스트 프레임워크가 있다면 다음을 추가한다.

```text
일반 브라우저 + 설치 증거 없음
→ heartbeat 요청 없음
→ installation ID 생성 없음

standalone USER PWA
→ apiClient의 /pwa/installations/heartbeat 호출
→ success=true일 때만 마지막 전송 시각 저장

ADMIN PWA + adminToken
→ apiClient의 /admin/pwa/installations/heartbeat 호출
→ Authorization은 apiClient 인터셉터가 처리

success=false
→ 마지막 전송 시각 저장 안 함

status=ignored
→ 마지막 전송 시각 저장 안 함

6시간 이내 일반 heartbeat
→ 재전송 안 함

force=true APPINSTALLED_EVENT
→ 즉시 전송

일반 웹 주문
→ pwa_installation_key=null

standalone 주문
→ USER installation ID 포함
```

새 테스트 프레임워크를 불필요하게 추가하지 말 것.

## 10-2. 백엔드 테스트

최소 테스트:

### 설치 증거 없는 USER heartbeat

```text
is_running_standalone=false
related_app_installed=null
detection_method=UNKNOWN
→ HTTP 200
→ status=ignored
→ DB 행 0개
```

### USER standalone 최초 기록

```text
standalone=true
→ status=created
→ first_standalone_at 설정
→ last_standalone_at 설정
```

### 같은 installation ID 반복 실행

```text
같은 app_type + installation_id
→ 새 행 생성 안 함
→ 기존 행 갱신
```

### 관리자 FK

```text
ADMIN heartbeat
→ PwaInstallation.admin_id = Admin.id
→ item.admin.name 정상 조회
→ users 테이블과 연결되지 않음
```

SQLite 테스트에서도 foreign key enforcement를 활성화해 잘못된 FK를 놓치지 않게 한다.

### 통계 필터

```text
웹 전용 레코드 3개
standalone 레코드 2개
→ detected_total=2
```

### 활성 기준

```text
last_seen_at은 최근
last_standalone_at은 40일 전
→ active_30d에 포함되지 않음
```

### APPINSTALLED_EVENT

```text
standalone 실행 전 APPINSTALLED_EVENT
→ detected_total 포함
→ active_7d에는 포함하지 않음
```

### 목록 계약

```text
id
masked_installation_id
total_count
page
limit
total_pages
활성 상태 boolean
```

필드명이 프런트 타입과 정확히 일치하는지 검증한다.

### 주문 연결

```text
증거 있는 USER 설치 ID
→ Order.pwa_installation_id 연결

웹 전용 또는 존재하지 않는 ID
→ Order.pwa_installation_id=None
→ 주문 자체는 성공
```

### 고유 사용자·관리자

```text
같은 admin_id에 설치 인스턴스 2개
→ confirmed_unique_admins_30d=1

같은 user_id가 설치 인스턴스 2개로 주문
→ confirmed_unique_users_30d=1
```

### 시간대

```text
timezone-aware DB datetime과 now 비교
→ TypeError 없음
→ 기간 경계 테스트 통과
```

## 10-3. 필수 실행 명령

```bash
cd backend
pytest

cd ../frontend
npm run lint
npm run build
```

현재 저장소에 별도의 typecheck 명령이 있으면 함께 실행한다.

---

# 11. 실기기 및 통합 QA

## 11-1. 일반 QR 웹 접속

```text
iPhone Safari에서 QR 접속
Android Chrome에서 QR 접속
홈 화면 설치 없이 페이지 사용
```

기대 결과:

```text
heartbeat API 호출 없음 또는 서버 ignored
PwaInstallation 설치 수 증가 없음
localStorage installation ID 불필요 생성 없음
```

## 11-2. 사용자 PWA 최초 실행

```text
홈 화면에 사용자 앱 설치
홈 화면 아이콘으로 실행
```

기대 결과:

```text
POST Railway /api/v1/pwa/installations/heartbeat
status=created
app_type=USER
first_standalone_at 설정
누적 설치 감지 인스턴스 +1
```

## 11-3. 같은 사용자 PWA 재실행

```text
앱 종료 후 재실행
화면 백그라운드 후 복귀
```

기대 결과:

```text
행 수 증가 없음
기존 installation ID upsert
throttling 정책에 따라 불필요한 요청 감소
```

## 11-4. 관리자 PWA

```text
관리자 PWA 로그인
관리자 앱 실행
```

기대 결과:

```text
Railway /api/v1/admin/pwa/installations/heartbeat
Authorization Bearer adminToken
app_type=ADMIN
admin_id가 admins.id와 연결
관리자 이름 정상 표시
```

## 11-5. 주문 연결

```text
사용자 PWA에서 주문
```

기대 결과:

```text
Order.is_pwa=true
Order.pwa_installation_id not null
unique_ordering_installations_30d 증가
```

일반 QR 웹 주문:

```text
Order.is_pwa=false
Order.pwa_installation_id null
```

## 11-6. 삭제 후 재설치

테스트 결과를 다음 두 지표로 구분해서 보고한다.

```text
새 installation ID가 생긴 경우
→ 설치 감지 인스턴스 +1 가능

같은 관리자 계정
→ 확인된 고유 관리자 수 유지

같은 user_id로 주문
→ 확인된 고유 사용자 수 유지
```

물리 기기 중복 제거 성공이라고 과장하지 말 것.

## 11-7. Network 확인

정상 Request URL 예:

```text
https://<Railway API domain>/api/v1/pwa/installations/heartbeat
https://<Railway API domain>/api/v1/admin/pwa/installations/heartbeat
```

잘못된 예:

```text
https://holy-order.vercel.app/api/v1/...
```

응답 Content-Type은 JSON이어야 한다.

```text
application/json
```

HTML 응답을 성공으로 처리하면 안 된다.

---

# 12. 배포 순서

1. 운영 DB의 현재 PWA 행과 잘못된 admin FK를 진단한다.
2. DB 백업을 확인한다.
3. 백엔드 모델·서비스·스키마·라우터 테스트를 완료한다.
4. `admin_id -> admins.id` 마이그레이션을 적용한다.
5. 백엔드를 먼저 배포한다.
6. 통계 API가 기존 프런트에도 안전하게 응답하는지 확인한다.
7. 프런트의 heartbeat를 `apiClient` 방식으로 배포한다.
8. 일반 QR 웹이 설치 수를 증가시키지 않는지 확인한다.
9. 사용자 PWA와 관리자 PWA 실기기 heartbeat를 확인한다.
10. 관리자 통계 화면의 필드와 숫자를 DB SQL 결과와 대조한다.
11. 최소 1회 사용자 PWA 주문으로 주문 연결 지표를 확인한다.

백엔드와 프런트가 잠시 다른 버전으로 공존할 수 있으므로 새 응답 필드는 추가 방식으로 배포하고, 기존 필드는 프런트 전환이 끝날 때까지 유지한다.

---

# 13. 롤백

## 백엔드 롤백

```text
통계 서비스 코드를 이전 버전으로 복원
신규 응답 필드는 무시 가능하도록 유지
```

`admin_id` 외래키를 다시 `users.id`로 되돌리는 롤백은 원칙적으로 하지 않는다. 해당 구조는 의미상 잘못된 스키마다.

필요하면 관리자 PWA heartbeat만 일시 비활성화하고 올바른 FK를 유지한다.

## 프런트 롤백

```text
heartbeat 호출을 일시 중지
주문 is_pwa와 pwa_installation_key 전송은 유지 가능
관리자 통계 탭을 일시 숨김
```

설치 추적 실패 때문에 주문·관리자 주문 관리·푸시·영업 상태 기능을 롤백하지 말 것.

---

# 14. 완료 조건

다음이 모두 충족되어야 완료다.

```text
일반 QR 웹 방문이 설치 수를 증가시키지 않음
사용자 PWA 최초 standalone 실행이 정확히 1개 인스턴스로 기록됨
같은 installation ID 재실행은 새 행을 만들지 않음
관리자 PWA가 adminToken으로 인증되어 기록됨
admin_id가 admins.id를 참조함
관리자 이름이 올바르게 표시됨
통계는 설치 증거가 있는 행만 집계함
7일·30일 활성은 last_standalone_at 기준임
프런트·백엔드 목록 필드가 일치함
PWA heartbeat가 Railway API로 전송됨
HTML 200 응답을 성공으로 오인하지 않음
주문과 설치 인스턴스 연결이 정상임
재설치 한계를 관리자 UI에 정확하게 설명함
pytest 통과
npm run lint 통과
npm run build 통과
```

---

# 15. Antigravity 완료 보고 형식

1. 실제 원인 요약
2. 수정한 파일 목록
3. heartbeat 전송 경로 변경
4. 관리자 인증 변경
5. DB 외래키 마이그레이션 내용
6. 설치 증거 판정 기준
7. 통계 집계 기준 변경
8. API 응답 계약
9. 기존 오염 데이터 건수와 처리 정책
10. 재설치 통계 한계
11. 실행한 테스트 명령과 결과
12. iPhone·Android·관리자 PWA QA 결과
13. Railway Request URL과 응답 예시
14. 배포 순서
15. 롤백 방법
16. 남아 있는 위험

“통계가 정상화되었습니다”라고만 보고하지 말고, 다음 숫자를 DB와 API에서 각각 대조해 보고하라.

```text
전체 pwa_installations 행 수
설치 증거가 있는 행 수
웹 전용 제외 행 수
USER 설치 감지 인스턴스
ADMIN 설치 감지 인스턴스
최근 7일 standalone 활성
최근 30일 standalone 활성
확인된 고유 사용자
확인된 고유 관리자
최근 30일 주문 생성 설치 인스턴스
```
