# 28. 예약 무료 이벤트 게시 시 현재 LIVE 이벤트 유지

## 1. 작업 목적

현재 이벤트/공지 시스템은 무료 제공 이벤트를 게시하거나 활성화할 때, 시간대가 겹치지 않는 미래 예약 이벤트임에도 기존의 모든 활성 무료 이벤트를 일괄 비활성화할 수 있다.

대표적인 문제 시나리오:

```text
이벤트 A
- 현재 시간: 10:00
- 운영 시간: 09:00~12:00
- 상태: LIVE

이벤트 B
- 운영 시간: 13:00~15:00
- 상태: SCHEDULED

관리자가 이벤트 B를 미리 게시
→ 이벤트 B는 이벤트 A와 시간이 겹치지 않음
→ 그러나 기존 일괄 비활성화 코드가 이벤트 A의 is_active를 False로 변경
→ 이벤트 A가 12:00 전에 조기 종료됨
```

이번 작업의 목표는 다음과 같다.

```text
- 겹치지 않는 무료 이벤트는 여러 개 게시 상태로 존재할 수 있게 한다.
- 현재 시각에 유효한 무료 이벤트만 LIVE로 판정한다.
- 미래 예약 이벤트를 게시해도 현재 LIVE 이벤트를 종료하지 않는다.
- 실제 시간 구간이 겹치는 무료 이벤트만 차단한다.
- 일반 공지의 동작은 변경하지 않는다.
```

---

## 2. 우선 조사할 파일

작업 전에 실제 저장소의 최신 코드를 확인한다.

```text
backend/routers/admin.py
backend/services/announcement_service.py
backend/routers/menus.py
backend/routers/orders.py
backend/schemas.py
backend/models.py
backend/tests/test_announcements.py
frontend/src/pages/admin/AdminAnnouncements.tsx
frontend/src/pages/Home.tsx
frontend/src/pages/Cart.tsx
```

다음 코드를 검색한다.

```bash
rg -n "is_event_mode|is_active|activate|overlap|SCHEDULED|LIVE|get_effective_free_event|validate_free_event_overlap" backend frontend/src
```

특히 관리자 이벤트 활성화/게시 API에서 다음과 같은 일괄 비활성화 코드가 있는지 확인한다.

```python
db.query(models.Announcement).filter(
    models.Announcement.is_active == True,
    models.Announcement.is_event_mode == True,
    models.Announcement.id != announcement_id,
).update({"is_active": False})
```

실제 코드가 다르면 의미가 동일한 로직을 찾아 제거 또는 수정한다.

---

## 3. 상태 의미를 명확히 정의

이번 작업에서 `is_active`는 "현재 즉시 LIVE"가 아니라 "게시됨/published"을 의미해야 한다.

```text
is_active=False
→ DRAFT 또는 비게시 상태

is_active=True + starts_at이 미래
→ SCHEDULED

is_active=True + 현재 시간이 유효 구간 안
→ LIVE

is_active=True + ends_at이 과거
→ ENDED
```

따라서 미래 예약 이벤트를 게시하기 위해 `is_active=True`로 변경해도, 현재 진행 중인 다른 이벤트를 자동 종료하면 안 된다.

상태 판정은 다음 원칙을 따른다.

```text
DRAFT
- is_active=False

SCHEDULED
- is_active=True
- starts_at이 존재하고 현재보다 미래

LIVE
- is_active=True
- starts_at이 없거나 starts_at <= now
- ends_at이 없거나 now < ends_at

ENDED
- is_active=True 또는 과거 게시 이력 존재
- ends_at이 존재하고 ends_at <= now
```

경계값은 프로젝트의 기존 정책에 맞추되, 시작은 포함하고 종료는 제외하는 반개구간을 권장한다.

```text
starts_at <= now < ends_at
```

---

## 4. 필수 백엔드 수정

### 4.1 기존 무료 이벤트 일괄 비활성화 제거

관리자가 무료 이벤트를 게시할 때 다른 모든 무료 이벤트의 `is_active`를 False로 바꾸는 코드를 제거한다.

제거 대상의 개념:

```python
if announcement.is_event_mode:
    db.query(models.Announcement).filter(
        models.Announcement.is_active.is_(True),
        models.Announcement.is_event_mode.is_(True),
        models.Announcement.id != announcement.id,
    ).update({"is_active": False})
```

이번 수정 이후에는 다음이 허용되어야 한다.

```text
09:00~12:00 무료 이벤트 A: is_active=True
13:00~15:00 무료 이벤트 B: is_active=True
다음 주 09:00~12:00 무료 이벤트 C: is_active=True
```

현재 시각에 실제로 적용되는 이벤트는 서버의 유효성 함수가 한 개만 반환한다.

### 4.2 시간 겹침 검증 유지 및 강화

기존 `validate_free_event_overlap()` 또는 동등한 서비스가 있다면 이를 단일 기준으로 유지한다.

겹침 판정 권장 공식:

```text
A.start < B.end
AND
B.start < A.end
```

열린 구간이 존재하는 경우 프로젝트 정책을 명확히 한다.

```text
starts_at=None
→ 즉시 시작 또는 시작 제한 없음

ends_at=None
→ 종료 제한 없음
```

무기한 무료 이벤트와 예약 이벤트가 동시에 허용되면 실제로 겹치므로 게시를 차단해야 한다.

검증 실패 시 기존 게시 상태를 변경하지 말고 HTTP 409 Conflict 또는 현재 프로젝트가 사용하는 명확한 4xx를 반환한다.

예시:

```json
{
  "detail": "동일 시간대에 게시된 무료 제공 이벤트가 이미 있습니다."
}
```

### 4.3 유효 이벤트 조회는 현재 시간 기준

공개 화면과 주문 서버는 동일한 `get_effective_free_event()`를 사용해야 한다.

예시:

```python
def get_effective_free_event(
    db: Session,
    *,
    now: datetime | None = None,
) -> models.Announcement | None:
    current = now or get_current_time()

    return (
        db.query(models.Announcement)
        .filter(
            models.Announcement.is_active.is_(True),
            models.Announcement.is_event_mode.is_(True),
            or_(
                models.Announcement.starts_at.is_(None),
                models.Announcement.starts_at <= current,
            ),
            or_(
                models.Announcement.ends_at.is_(None),
                models.Announcement.ends_at > current,
            ),
        )
        .order_by(
            models.Announcement.starts_at.desc().nullslast(),
            models.Announcement.id.desc(),
        )
        .first()
    )
```

겹침 검증이 정상이라면 LIVE 이벤트는 최대 한 개여야 한다.

### 4.4 게시/활성화 트랜잭션 순서

아래 순서를 지킨다.

```text
대상 Announcement 조회
→ 요청 데이터 반영 전후 유효 구간 계산
→ 무료 이벤트라면 overlap 검증
→ 대상의 is_active=True 설정
→ DB commit
→ commit 성공 후 ANNOUNCEMENT_UPDATED WebSocket 발송
```

검증 실패 또는 commit 실패 시 다른 이벤트의 상태를 바꾸면 안 된다.

### 4.5 수동 종료는 대상 이벤트만 변경

관리자가 특정 이벤트를 종료하면 해당 이벤트만 `is_active=False`로 변경한다.

```text
이벤트 A 종료
→ A만 비활성
→ 미래 예약 B와 C는 그대로 유지
```

---

## 5. 프런트엔드 요구사항

관리자 UI의 상태 표시는 서버 정책과 맞아야 한다.

```text
초안
예약
진행 중
종료
```

미래 예약 이벤트를 게시한 후에도 현재 LIVE 이벤트 카드가 `진행 중`으로 유지되어야 한다.

예약 이벤트 게시 성공 후 안내 예시:

```text
이벤트가 예약 게시되었습니다.
현재 진행 중인 이벤트는 종료 시각까지 유지됩니다.
```

일반 공지 게시 흐름과 무료 이벤트 게시 흐름을 혼합하지 않는다.

사용자 화면은 서버의 current/effective API 결과만 신뢰한다. 관리자 목록에 예약 이벤트가 `is_active=True`로 존재해도 사용자 Home·Cart에는 시작 시각 전 노출되면 안 된다.

---

## 6. 자동 테스트

`backend/tests/test_announcements.py` 또는 적절한 테스트 파일에 최소 다음 테스트를 추가한다.

### 6.1 비중첩 예약 이벤트가 LIVE 이벤트를 유지

```text
현재 시간: 10:00
A: 09:00~12:00, is_active=True
B: 13:00~15:00, is_active=False

B 게시 API 호출

기대:
A.is_active == True
B.is_active == True
get_effective_free_event(10:00) == A
```

### 6.2 예약 이벤트 시작 후 effective 이벤트 전환

```text
A: 09:00~12:00
B: 13:00~15:00

10:00 → A
12:30 → None
13:00 → B
15:00 → None
```

### 6.3 겹치는 이벤트 차단

```text
A: 09:00~12:00, 게시됨
B: 11:00~14:00, 초안

B 게시
→ 409 또는 명시한 4xx
→ A.is_active=True 유지
→ B.is_active=False 유지
```

### 6.4 일반 공지 동시 게시

```text
일반 공지 A, B 게시
→ 둘 다 is_active=True 가능
→ 무료 가격 판정에는 영향 없음
```

### 6.5 수동 종료 범위

```text
A LIVE, B SCHEDULED
A 종료
→ A=False
→ B=True 유지
```

### 6.6 commit 실패 시 WebSocket 미발송

```text
DB commit 강제 실패
→ ANNOUNCEMENT_UPDATED 호출 0회
→ 기존 이벤트 상태 보존
```

---

## 7. 실행 명령

```bash
cd backend
pytest -q backend/tests/test_announcements.py
pytest -q
```

```bash
cd frontend
npm run lint
npm run build
```

---

## 8. 수동 QA

### 시나리오 A: 현재 이벤트 + 미래 예약

```text
1. A를 현재 시간 포함 구간으로 게시
2. 사용자 Home에서 A 노출 확인
3. B를 A 종료 이후 시간으로 예약 게시
4. 관리자 목록에서 A=진행 중, B=예약 확인
5. 사용자 Home에서 계속 A만 노출 확인
```

### 시나리오 B: 시간 전환

```text
1. B 시작 전에는 A 또는 없음
2. B 시작 시각 이후 B 노출
3. Cart에서 무료 이벤트 ID가 B인지 확인
```

### 시나리오 C: 겹침 차단

```text
1. A와 겹치는 C 작성
2. C 게시 시 오류 안내
3. A가 조기 종료되지 않았는지 확인
```

---

## 9. 변경 금지 범위

이번 작업에서는 다음을 변경하지 않는다.

```text
- 주문 가격 계산 전체 재설계
- 일반 공지 푸시 발송
- 이벤트 정산 리포트 구조
- Announcement 테이블 전면 재설계
- 관리자 PWA 설치 구조
- WebSocket 인프라 전면 리팩터링
- VAPID 및 주문 완료 푸시
```

---

## 10. 완료 기준

아래 조건을 모두 만족해야 완료다.

```text
[ ] 미래 예약 무료 이벤트 게시 시 현재 LIVE 이벤트 유지
[ ] 시간 겹침 이벤트만 차단
[ ] 겹치지 않는 예약 이벤트 여러 개 게시 가능
[ ] 현재 유효 이벤트는 서버 함수가 최대 한 개 반환
[ ] 일반 공지 동작 회귀 없음
[ ] commit 후에만 WebSocket 발송
[ ] 테스트 전체 통과
[ ] 프런트 lint/build 통과
[ ] 관리자 화면에서 LIVE/SCHEDULED 상태가 정확히 표시
```

---

## 11. 완료 보고 형식

1. 조기 종료의 실제 원인
2. 제거하거나 변경한 일괄 비활성화 코드
3. 변경 파일 목록
4. overlap 판정 기준
5. effective 이벤트 시간 경계 정책
6. 추가한 테스트와 결과
7. 수동 QA 결과
8. 배포 순서
9. 롤백 방법
10. 남은 위험
