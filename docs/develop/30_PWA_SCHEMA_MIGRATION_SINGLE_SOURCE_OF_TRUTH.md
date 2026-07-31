# 30. PWA 설치 통계 스키마 마이그레이션 단일 기준화

## 1. 작업 목적

현재 PWA 설치 통계 관련 DB 스키마가 두 경로에서 변경될 가능성이 있다.

```text
1. backend/main.py 또는 애플리케이션 startup의 자동 DDL
2. backend/migrations/... 전용 SQL 마이그레이션
```

두 경로의 정의가 조금이라도 다르면 다음 문제가 발생한다.

```text
- ON DELETE SET NULL 누락
- 같은 의미의 FK가 서로 다른 이름으로 중복 생성
- 신규 환경과 운영 환경의 스키마 불일치
- 검증 스크립트는 PASS처럼 보이지만 중복 제약이 남음
- 앱 시작 때마다 운영 DB를 변경하는 위험
- 테스트 import가 운영 DB에 접근하는 위험
```

이번 작업의 목표는 PWA 관련 스키마 변경을 **전용 마이그레이션 한 곳만의 책임**으로 만들고, 애플리케이션 시작 코드는 DB를 변경하지 않도록 정리하는 것이다.

---

## 2. 최종 원칙

```text
- main.py는 애플리케이션을 구성하고 실행한다.
- main.py import/startup에서 ALTER TABLE, CREATE INDEX, DROP CONSTRAINT를 실행하지 않는다.
- PWA 스키마 변경은 전용 idempotent migration으로만 수행한다.
- migration 적용과 schema verification은 별도 명령이다.
- 배포는 migration → verification → application 순서로 진행한다.
- 여러 Railway replica가 동시에 migration을 실행하지 않는다.
```

---

## 3. 우선 조사할 파일

```text
backend/main.py
backend/models.py
backend/database.py
backend/migrations/20260730_fix_pwa_installation_constraints.sql
backend/scripts/verify_pwa_installation_constraints.py
backend/scripts/apply_pwa_installation_constraints.py
backend/tests/conftest.py
backend/tests/test_pwa_installations.py
backend/tests/test_pwa_constraint_verification.py
README.md
docs/DEPLOY.md
railway.json 또는 배포 설정 파일
```

검색:

```bash
rg -n "ALTER TABLE|ADD CONSTRAINT|DROP CONSTRAINT|pwa_installations|pwa_installation_id|create_all|migration" backend docs railway.json
```

---

## 4. 필수 수정 1 — main.py의 스키마 변경 제거

`backend/main.py` 또는 startup/lifespan에서 PWA 관련 DDL을 실행하는 코드를 제거한다.

제거 대상 예시:

```python
db.execute(text(
    "ALTER TABLE orders "
    "ADD COLUMN IF NOT EXISTS pwa_installation_id "
    "INTEGER REFERENCES pwa_installations(id)"
))
```

```python
db.execute(text(
    "ALTER TABLE pwa_installations "
    "ADD CONSTRAINT ..."
))
```

```python
models.Base.metadata.create_all(bind=engine)
```

`create_all()`이 아직 import 시점에 남아 있다면 기존 프로젝트 영향 범위를 확인하고 제거 또는 개발 전용 명령으로 분리한다. 운영 애플리케이션 import가 스키마를 변경하면 안 된다.

`main.py`에는 필요하면 read-only health check만 남길 수 있지만, 자동 수정은 금지한다.

---

## 5. 필수 수정 2 — 전용 마이그레이션을 canonical source로 지정

다음 파일 또는 현재 저장소의 동등한 migration을 단일 기준으로 사용한다.

```text
backend/migrations/20260730_fix_pwa_installation_constraints.sql
```

이 migration은 다음 최종 계약을 보장해야 한다.

```text
pwa_installations.admin_id INTEGER NULL
FK -> admins.id
ON DELETE SET NULL
의미상 동일한 FK 정확히 1개
인덱스 존재

orders.pwa_installation_id INTEGER NULL
FK -> pwa_installations.id
ON DELETE SET NULL
의미상 동일한 FK 정확히 1개
인덱스 존재
```

### 5.1 제약조건 이름보다 정의 기준

기존 운영 DB에는 서로 다른 이름의 제약이 있을 수 있다.

```text
fk_pwa_installations_admin_id
pwa_installations_admin_id_fkey
```

마이그레이션은 이름 하나만 가정하지 말고 PostgreSQL catalog를 검사해 source/ref/delete rule이 동일한 제약을 찾아 정규화해야 한다.

### 5.2 잘못된 제약 제거

다음을 제거한다.

```text
admin_id -> users.id
ON DELETE NO ACTION인 기존 FK
같은 의미의 중복 FK
```

### 5.3 고아 데이터 정리

제약 생성 전 다음 값을 안전하게 NULL로 처리한다.

```text
admins에 존재하지 않는 admin_id
pwa_installations에 존재하지 않는 order.pwa_installation_id
```

행을 삭제하지 않는다.

### 5.4 트랜잭션과 잠금

가능하면 migration 전체를 하나의 트랜잭션으로 실행한다.

Railway의 다중 replica 또는 중복 실행을 방지하기 위해 PostgreSQL advisory lock을 권장한다.

예시 개념:

```sql
SELECT pg_advisory_lock(...);

BEGIN;
-- migration
COMMIT;

SELECT pg_advisory_unlock(...);
```

실제 구현은 연결 종료 시 lock 해제가 보장되도록 작성한다.

---

## 6. 필수 수정 3 — 명시적 migration runner

Alembic 기반이 아직 없다면 아래와 같은 명시적 실행 스크립트를 제공한다.

```text
backend/scripts/apply_pwa_installation_constraints.py
```

요구사항:

```text
- DATABASE_URL 사용
- SQL 파일을 명시적으로 로드
- 트랜잭션 실행
- 성공 시 exit 0
- 실패 시 rollback 및 exit 1
- 비밀번호와 전체 URL 로그 금지
- 적용 후 29번 verification 로직 호출 또는 별도 실행 안내
- 여러 번 실행해도 동일 결과
```

실행:

```bash
cd backend
python scripts/apply_pwa_installation_constraints.py
python scripts/verify_pwa_installation_constraints.py
```

장기적으로 Alembic을 도입할 예정이라면 이번 migration을 Alembic revision으로 옮길 수 있다. 다만 이번 작업에서 전체 프로젝트를 강제로 Alembic으로 전환하지 않는다.

---

## 7. 배포 파이프라인 문서화

배포 순서는 다음으로 고정한다.

```text
1. 운영 DB 백업 확인
2. migration one-off command 실행
3. migration 성공 확인
4. 29번 verification 실행
5. RESULT: PASS 확인
6. 백엔드 애플리케이션 배포
7. health check
8. PWA heartbeat smoke test
```

Railway의 일반 application start command에 migration을 직접 포함하지 않는 것을 권장한다.

나쁜 예:

```text
python migrate.py && uvicorn main:app
```

여러 replica가 동시에 시작되면 migration이 중복 실행될 수 있다.

권장:

```text
Railway one-off command 또는 별도 pre-deploy job
→ migration
→ verification

application service
→ uvicorn only
```

현재 Railway 기능과 저장소 배포 방식에 맞게 문서에 정확한 명령을 적는다.

---

## 8. 애플리케이션 시작 시 검증 정책

startup에서 스키마를 수정하지 않는다.

선택적으로 다음 환경변수를 지원할 수 있다.

```text
VERIFY_PWA_DB_CONSTRAINTS_ON_STARTUP=true
```

동작:

```text
- 읽기 전용 검증
- 실패하면 명확한 로그
- 운영 정책에 따라 startup fail-fast 또는 health degraded
- 절대 ALTER TABLE 실행 금지
```

기본값은 프로젝트 운영 정책에 맞추되, migration 대체 수단으로 사용하지 않는다.

---

## 9. 테스트 요구사항

### 9.1 main import가 DDL을 실행하지 않음

```text
from main import app
→ ALTER TABLE 호출 0회
→ 운영 DB schema mutation 0회
```

DB engine mock 또는 SQL execution spy를 사용한다.

### 9.2 migration idempotency

```text
깨끗한 PostgreSQL 테스트 DB
→ migration 1회 실행
→ PASS
→ migration 2회 실행
→ PASS
→ semantic FK count 각각 1개
```

### 9.3 잘못된 FK 교정

```text
admin_id -> users.id 준비
→ migration
→ users FK 제거
→ admins FK 1개
→ ON DELETE SET NULL
```

### 9.4 중복 FK 정리

```text
올바른 admin FK 2개 준비
→ migration
→ 정확히 1개 유지
```

### 9.5 고아 참조 정리

```text
고아 admin_id
고아 order.pwa_installation_id
→ migration
→ 해당 값 NULL
→ 행 자체는 유지
```

### 9.6 verification 연계

migration 직후 검증 스크립트가 `RESULT: PASS`와 exit 0을 반환해야 한다.

---

## 10. 하위 호환성

이번 작업은 API 응답과 프런트엔드 계약을 변경하지 않는다.

```text
- PWA heartbeat API 경로 유지
- installation_id 유지
- 주문 pwa_installation_id 저장 유지
- 관리자 통계 화면 유지
```

스키마 적용 과정에서 짧은 구버전·신버전 공존을 고려한다. 두 컬럼은 nullable이므로 마이그레이션 중 기존 애플리케이션이 즉시 실패하지 않아야 한다.

---

## 11. 변경 금지 범위

```text
- PWA 설치 통계 UI 재설계
- heartbeat 인증 구조 전면 변경
- 관리자 계정 모델 변경
- 주문 가격 계산 변경
- 이벤트/공지 기능 변경
- 재고 관리 변경
- 전체 DB를 재생성하거나 초기화
```

---

## 12. 완료 기준

```text
[ ] main.py 및 startup에 PWA 관련 schema mutation 없음
[ ] canonical migration 파일 1개 지정
[ ] migration 여러 번 실행 가능
[ ] 잘못된 FK와 중복 FK 정리
[ ] 두 FK 모두 ON DELETE SET NULL
[ ] 고아 데이터는 NULL 처리, 행 보존
[ ] 명시적 migration runner 제공
[ ] deploy 문서에 one-off 순서 기록
[ ] migration 후 29번 verification RESULT: PASS
[ ] 테스트 전체 통과
```

---

## 13. 롤백

코드 롤백:

```text
- main.py의 자동 DDL을 다시 넣는 방식으로 롤백하지 않는다.
- 이전 애플리케이션 버전은 nullable 컬럼과 호환되어야 한다.
```

DB 롤백이 꼭 필요하면:

```text
- 현재 제약 정의 백업
- 새 FK 제거
- 이전 FK 복구 여부를 명시적으로 결정
```

잘못된 `users.id` 참조로 되돌리는 것은 원칙적으로 금지한다.

---

## 14. 완료 보고 형식

1. 기존 schema mutation 위치
2. 제거한 main.py/startup DDL
3. canonical migration 파일
4. migration runner 명령
5. 제약조건 정규화 방식
6. advisory lock/트랜잭션 방식
7. 테스트 결과
8. 29번 verification 결과
9. Railway 배포 순서
10. 롤백 방법
11. 남은 위험
