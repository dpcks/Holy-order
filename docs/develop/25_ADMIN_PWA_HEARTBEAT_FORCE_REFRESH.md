# 관리자 PWA Heartbeat 강제 갱신 및 계정 전환 정합성 보완

## 0. 문서 목적

이 문서는 Holy-Order에 이미 구현된 관리자 PWA 설치 통계 heartbeat를 새로 만드는 작업이 아니다.

현재 구조의 다음 장점은 유지한다.

```text
관리자 PWA 전용 installation_id
관리자 인증 후 heartbeat 전송
6시간 기본 throttle
동일 installation_id upsert
PwaInstallation.admin_id 연결
관리자 PWA 설치·활성 통계
```

이번 작업의 목적은 **같은 관리자 PWA에서 관리자 계정이 바뀌었을 때, 6시간 throttle 때문에 DB의 admin_id가 이전 계정으로 남는 문제를 방지하는 것**이다.

정상 동작은 다음과 같아야 한다.

```text
관리자 A 로그인
→ 현재 관리자 ID로 heartbeat 즉시 전송
→ DB installation.admin_id = A

관리자 A 로그아웃
→ 관리자 B 로그인
→ 기존 6시간 throttle과 관계없이 heartbeat 즉시 전송
→ 동일 installation_id 유지
→ DB installation.admin_id = B

같은 관리자 B의 일반 화면 이동·React Query refetch
→ 불필요한 강제 heartbeat 반복 없음
```

---

# 1. 현재 문제

관리자 heartbeat는 네트워크·DB 부하를 줄이기 위해 최근 전송 시각을 localStorage에 저장하고 일정 시간 동안 재전송을 막는다.

예시:

```ts
const REPORT_THROTTLE_MS = 6 * 60 * 60 * 1000;
```

이 방식은 같은 관리자가 앱을 반복 실행할 때는 적절하다. 그러나 같은 기기에서 계정을 전환하면 문제가 생길 수 있다.

```text
1. 관리자 A heartbeat 성공
2. ADMIN_LAST_REPORT 저장
3. A 로그아웃
4. 6시간 이내 관리자 B 로그인
5. AdminLayout에서 heartbeat 호출
6. throttle에 의해 호출 생략
7. DB admin_id가 A로 유지
```

이 경우 관리자 통계 화면에서 해당 설치 인스턴스가 잘못된 관리자 이름과 연결될 수 있다.

---

# 2. 완료 목표

## 필수 목표

```text
관리자 계정 ID가 변경되면 throttle을 우회하여 즉시 heartbeat 전송
같은 관리자 ID의 일반 refetch에서는 중복 강제 전송 방지
installation_id는 계정 전환 시에도 유지
로그아웃 시 다음 로그인 강제 동기화가 가능하도록 메타데이터 정리
heartbeat 실패가 관리자 로그인이나 주문 관리 화면을 막지 않음
React StrictMode에서 중복 요청이 폭증하지 않음
```

## 제외 범위

```text
관리자 PWA 매니페스트·아이콘 수정
사용자 PWA heartbeat 변경
PWA 설치 통계 집계 방식 변경
DB FK 변경
관리자 인증 구조 변경
WebSocket 변경
관리자 UI 전면 개편
```

---

# 3. 권장 구현 설계

## 3-1. 관리자 연결 상태용 localStorage 키 추가

기존 관리자 installation ID와 마지막 heartbeat 시각은 유지한다.

추가로 마지막으로 서버에 연결한 관리자 ID를 별도 저장한다.

```ts
const ADMIN_LAST_LINKED_ADMIN_ID_KEY =
  'holy-order:pwa-installation-last-admin-id:admin';
```

다음 값들은 서로 다른 의미를 가진다.

```text
installation_id
→ 설치 인스턴스 식별자
→ 계정 전환 시 유지

last_report_at
→ 일반 heartbeat throttle 기준

last_linked_admin_id
→ 현재 설치 인스턴스와 마지막으로 연결한 관리자 계정
```

## 3-2. `reportPwaHeartbeat`의 force 옵션 유지 또는 추가

함수는 다음 형태를 지원해야 한다.

```ts
type ReportPwaHeartbeatOptions = {
  force?: boolean;
};

export async function reportPwaHeartbeat(
  appType: 'USER' | 'ADMIN',
  options: ReportPwaHeartbeatOptions = {},
): Promise<HeartbeatResult> {
  // ...
}
```

`force: true`일 때는 마지막 전송 시각 throttle만 우회한다.

다음 안전장치는 그대로 적용해야 한다.

```text
관리자 토큰 존재 확인
실제 관리자 PWA 또는 설치 증거 확인
유효한 installation_id 사용
apiClient를 통한 Railway 요청
응답 success 확인
```

force가 다음을 의미해서는 안 된다.

```text
새 installation_id 강제 생성
인증 없는 관리자 heartbeat 허용
실패 응답도 성공 처리
무한 재시도
```

## 3-3. AdminLayout에서 관리자 ID 변화 감지

`/admin/me` 조회로 `adminInfo.id`가 확인된 이후 heartbeat를 실행한다.

권장 흐름:

```ts
useEffect(() => {
  if (!adminInfo?.id) return;

  const lastLinkedAdminId = localStorage.getItem(
    ADMIN_LAST_LINKED_ADMIN_ID_KEY,
  );

  const currentAdminId = String(adminInfo.id);
  const isAccountChanged =
    lastLinkedAdminId !== currentAdminId;

  void reportPwaHeartbeat('ADMIN', {
    force: isAccountChanged,
  });
}, [adminInfo?.id]);
```

단, `last_linked_admin_id`는 요청을 보내기 전에 저장하면 안 된다.

정상 heartbeat 응답이 확인된 뒤에만 저장한다.

```ts
if (result.status === 'reported') {
  localStorage.setItem(
    ADMIN_LAST_LINKED_ADMIN_ID_KEY,
    currentAdminId,
  );
}
```

가능하면 `reportPwaHeartbeat()`가 관리자 ID를 인자로 직접 받지 않고, 서버가 인증 토큰의 current admin을 기준으로 연결하도록 유지한다.

## 3-4. StrictMode와 React Query refetch 중복 방지

개발 환경 StrictMode 또는 `/admin/me` refetch 때문에 effect가 짧은 시간 안에 두 번 실행될 수 있다.

다음 중 하나를 적용한다.

### 방법 A — in-flight Promise 공유

```ts
let adminHeartbeatInFlight: Promise<HeartbeatResult> | null = null;
```

동일 실행 중 요청이 있으면 새 요청을 만들지 않는다.

### 방법 B — 컴포넌트 ref

```ts
const heartbeatAdminIdRef = useRef<number | null>(null);
```

동일한 admin ID에 대해 현재 mount에서 이미 요청했다면 반복 호출하지 않는다.

권장 방식은 공용 유틸리티 레벨의 in-flight deduplication이다. 다른 관리자 화면에서도 같은 유틸리티를 호출할 가능성을 방어할 수 있기 때문이다.

## 3-5. 로그아웃 처리

로그아웃 시 다음 값은 삭제한다.

```text
adminToken
관리자 heartbeat 마지막 전송 시각
마지막 연결 관리자 ID
```

다음 값은 삭제하지 않는다.

```text
관리자 PWA installation_id
```

이유:

```text
installation_id는 앱 설치 인스턴스의 식별자
관리자 계정은 해당 설치 인스턴스에 현재 연결된 사용자
```

권장 코드:

```ts
localStorage.removeItem('adminToken');
localStorage.removeItem(
  'holy-order:pwa-installation-last-report:admin',
);
localStorage.removeItem(
  'holy-order:pwa-installation-last-admin-id:admin',
);
```

로그아웃 후 다음 관리자가 로그인하면 동일 installation ID에 새 admin_id가 즉시 연결돼야 한다.

---

# 4. API 및 백엔드 요구사항

기존 관리자 heartbeat API가 인증된 관리자 객체를 기준으로 `admin_id`를 저장한다면 API 계약은 변경하지 않는다.

```text
POST /api/v1/admin/pwa/installations/heartbeat
Authorization: Bearer <adminToken>
```

서버는 클라이언트가 임의의 admin_id를 보내더라도 신뢰하지 않는다.

```python
installation.admin_id = current_admin.id
```

기존 레코드에 다른 admin_id가 있어도 동일 installation_id의 정상 heartbeat라면 현재 인증 관리자 ID로 갱신한다.

```text
A → B 계정 전환
동일 installation_id
→ 새 행 추가 금지
→ 기존 행 admin_id만 B로 변경
```

---

# 5. 테스트 요구사항

## 프런트엔드 단위 테스트

fake timers와 localStorage mock을 사용한다.

### 같은 관리자 재실행

```text
last_linked_admin_id = 10
current admin id = 10
최근 heartbeat 1시간 전
→ force=false
→ 6시간 throttle로 요청 생략 가능
```

### 계정 전환

```text
last_linked_admin_id = 10
current admin id = 20
최근 heartbeat 1분 전
→ force=true
→ 즉시 API 요청
```

### 성공 후 메타데이터 저장

```text
API success
→ last_linked_admin_id = 20
→ last_report_at 갱신
```

### 실패 시 잘못 저장하지 않음

```text
API 500 또는 success=false
→ last_linked_admin_id는 10 유지 또는 제거
→ last_report_at 갱신 금지
→ 다음 화면 활성화에서 재시도 가능
```

### StrictMode 중복

```text
같은 admin id effect 2회
→ 동시에 실행되는 heartbeat 최대 1개
```

### 로그아웃

```text
adminToken 삭제
last_report 삭제
last_linked_admin_id 삭제
installation_id 유지
```

## 백엔드 테스트

```text
동일 installation_id + admin A heartbeat
→ 행 1개, admin_id=A

동일 installation_id + admin B heartbeat
→ 행 수 1개 유지, admin_id=B

클라이언트 payload에 임의 admin_id가 있어도
→ 인증 관리자 ID 사용
```

---

# 6. 수동 QA

## 시나리오 A — 동일 관리자

```text
관리자 A 로그인
→ 관리자 PWA 실행
→ heartbeat DB 저장 확인
→ 화면 이동·새로고침
→ 불필요한 신규 행 없음
```

## 시나리오 B — 계정 전환

```text
관리자 A 로그인 및 heartbeat 완료
→ A 로그아웃
→ 6시간 이내 관리자 B 로그인
→ 즉시 heartbeat 요청 확인
→ 동일 installation_id 유지
→ DB admin_id가 B로 변경
→ 관리자 통계 화면에 B 이름 표시
```

## 시나리오 C — 오프라인 로그인 복귀

```text
B 로그인 직후 네트워크 단절
→ heartbeat 실패
→ 관리자 화면은 사용 가능
→ 네트워크 복구 후 visibilitychange 또는 다음 실행
→ heartbeat 재시도
→ 성공 후 admin_id 연결
```

---

# 7. 완료 기준

```text
계정 전환 직후 6시간 throttle을 우회함
동일 installation_id에 새 행을 만들지 않음
DB admin_id가 현재 로그인 관리자로 즉시 변경됨
같은 관리자 refetch에서는 강제 요청이 반복되지 않음
로그아웃은 installation_id를 삭제하지 않음
heartbeat 실패가 관리자 기능을 중단시키지 않음
pytest 통과
npm run lint 통과
npm run build 통과
```

---

# 8. 배포 순서

1. 프런트 heartbeat 유틸리티 수정
2. AdminLayout 계정 변경 감지 적용
3. 관리자 로그아웃 메타데이터 정리 적용
4. 프런트 테스트·lint·build
5. Vercel 배포
6. 관리자 A → B 실기기 계정 전환 QA
7. Railway DB에서 동일 installation 행의 admin_id 갱신 확인

백엔드 API 계약이 이미 정상이라면 Railway 배포는 필요하지 않다.

---

# 9. 롤백

문제가 생기면 다음 변경만 되돌린다.

```text
AdminLayout의 force heartbeat 호출
마지막 관리자 ID localStorage 메타데이터
로그아웃 시 heartbeat 메타데이터 정리
```

다음은 유지한다.

```text
관리자 installation_id
기존 6시간 heartbeat throttle
PWA 설치 통계 API
관리자 PWA 구조
```
