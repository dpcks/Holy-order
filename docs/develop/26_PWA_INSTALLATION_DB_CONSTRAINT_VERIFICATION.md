# PWA 설치 통계 DB 제약조건 검증 및 안전한 운영 마이그레이션

## 0. 문서 목적

이 문서는 PWA 설치 통계 모델을 새로 설계하는 작업이 아니다.

현재 애플리케이션 코드가 기대하는 외래키와 운영 Railway PostgreSQL에 실제 적용된 제약조건이 일치하는지 검증하고, 잘못된 제약조건이 있으면 안전하게 수정하는 운영 안정화 작업이다.

특히 다음 관계를 검증한다.

```text
pwa_installations.admin_id
→ admins.id

orders.pwa_installation_id
→ pwa_installations.id
```

코드가 올바르게 수정돼 있어도 운영 DB 마이그레이션이 실패하거나 일부만 적용되면 다음 문제가 남을 수 있다.

```text
관리자 heartbeat FK 오류
엉뚱한 users.id와 관리자 설치 레코드 연결
주문과 PWA 설치 인스턴스 연결 실패
관리자 설치 통계의 관리자 이름 누락
배포는 성공했지만 DB 구조는 이전 상태
```

이번 작업의 핵심은 **모델 선언만 보는 것이 아니라 Railway DB의 실제 constraint를 재현 가능한 스크립트로 검증하는 것**이다.

---

# 1. 작업 범위

## 포함

```text
SQLAlchemy 모델 선언 확인
운영 PostgreSQL information_schema / pg_catalog 검증
idempotent verify 스크립트 추가
잘못된 admin_id FK의 안전한 마이그레이션
orders.pwa_installation_id 컬럼·FK 검증
필수 인덱스 검증
고아 데이터 진단
마이그레이션 실패 시 배포 실패 또는 명확한 경고 정책
백엔드 테스트
Railway 배포 전후 검증 명령
롤백 SQL
```

## 제외

```text
PWA 설치 통계 UI 변경
heartbeat 로직 변경
관리자 계정 전환 force heartbeat
재설치 중복 제거 재설계
브라우저 지문
주문 가격·결제 로직 변경
다른 도메인의 전체 DB 마이그레이션 정리
```

---

# 2. 기대 DB 계약

작업 시작 시 최신 모델과 기존 migration 코드를 확인하고 실제 이름에 맞춘다.

최소 기대 계약은 다음과 같다.

## `pwa_installations.admin_id`

```sql
FOREIGN KEY (admin_id)
REFERENCES admins(id)
ON DELETE SET NULL
```

요구사항:

```text
nullable 허용
인덱스 존재
users.id 참조 금지
관리자 삭제 시 설치 통계 행 삭제 금지
관리자 참조만 NULL 처리
```

## `orders.pwa_installation_id`

```sql
FOREIGN KEY (pwa_installation_id)
REFERENCES pwa_installations(id)
ON DELETE SET NULL
```

요구사항:

```text
nullable 허용
인덱스 존재
설치 레코드 삭제가 주문 삭제로 이어지지 않음
기존 비-PWA 주문과 하위 호환
```

## 설치 식별자 제약

현재 모델이 `installation_id`에 unique를 선언하고 있다면 운영 DB에도 동일한 unique constraint 또는 unique index가 있어야 한다.

```text
동일 installation_id heartbeat
→ 중복 행 생성 금지
→ upsert 가능
```

문서에 없는 새 unique 정책을 임의로 추가하지 말고 현재 모델 계약을 기준으로 검증한다.

---

# 3. 읽기 전용 검증 스크립트

다음과 같은 운영 스크립트를 추가한다.

```text
backend/scripts/verify_pwa_installation_constraints.py
```

기본 실행은 **읽기 전용**이어야 한다.

```bash
python backend/scripts/verify_pwa_installation_constraints.py
```

출력 예시:

```text
[PASS] table pwa_installations exists
[PASS] pwa_installations.admin_id is nullable
[PASS] admin_id FK -> admins.id
[PASS] admin_id ON DELETE SET NULL
[PASS] admin_id index exists
[PASS] orders.pwa_installation_id exists
[PASS] order FK -> pwa_installations.id
[PASS] order FK ON DELETE SET NULL
[PASS] no orphan admin_id rows
[PASS] no orphan order installation references
RESULT: PASS
```

오류 예시:

```text
[FAIL] admin_id FK points to users.id
[FAIL] 3 orphan admin_id values do not exist in admins
RESULT: FAIL
```

## 스크립트 원칙

```text
비밀번호·전체 DATABASE_URL 로그 금지
데이터 자동 변경 금지
FAIL 시 exit code 1
PASS 시 exit code 0
PostgreSQL에서 실제 constraint 이름을 동적으로 조회
constraint 이름을 하드코딩하지 않음
SQLite에서는 지원하지 않는 검사를 명확히 skip 또는 별도 처리
```

SQLAlchemy Inspector 또는 PostgreSQL system catalog를 사용할 수 있다.

---

# 4. 안전한 마이그레이션

프로젝트가 Alembic을 사용한다면 revision으로 구현한다.

아직 Alembic 기반이 아니라면 idempotent SQL migration 파일과 별도 적용 명령을 제공한다.

권장 파일 예시:

```text
backend/migrations/20260730_fix_pwa_installation_constraints.sql
```

## 4-1. 사전 진단

```sql
SELECT p.id, p.admin_id
FROM pwa_installations p
LEFT JOIN admins a ON a.id = p.admin_id
WHERE p.admin_id IS NOT NULL
  AND a.id IS NULL;
```

기존 잘못된 FK가 `users.id`를 참조했다면 같은 숫자의 users 행과 잘못 연결된 데이터가 있을 수 있다.

자동으로 임의 관리자에게 매핑하지 않는다.

안전한 기본 정책:

```text
admins.id에 존재하지 않는 admin_id
→ NULL 처리
→ 다음 정상 관리자 heartbeat에서 재연결
```

## 4-2. 기존 잘못된 FK 제거

constraint 이름을 조회한 뒤 제거한다.

```sql
ALTER TABLE pwa_installations
DROP CONSTRAINT IF EXISTS <actual_constraint_name>;
```

## 4-3. 고아 참조 정리

```sql
UPDATE pwa_installations p
SET admin_id = NULL
WHERE admin_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM admins a
    WHERE a.id = p.admin_id
  );
```

## 4-4. 올바른 FK 추가

```sql
ALTER TABLE pwa_installations
ADD CONSTRAINT fk_pwa_installations_admin_id
FOREIGN KEY (admin_id)
REFERENCES admins(id)
ON DELETE SET NULL;
```

## 4-5. 인덱스

```sql
CREATE INDEX IF NOT EXISTS
ix_pwa_installations_admin_id
ON pwa_installations(admin_id);
```

## 4-6. 주문 연결 FK

컬럼이 없는 경우에만 추가한다.

```sql
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS pwa_installation_id INTEGER;
```

고아 참조를 정리하고 올바른 FK를 추가한다.

```sql
UPDATE orders o
SET pwa_installation_id = NULL
WHERE pwa_installation_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM pwa_installations p
    WHERE p.id = o.pwa_installation_id
  );
```

```sql
ALTER TABLE orders
ADD CONSTRAINT fk_orders_pwa_installation_id
FOREIGN KEY (pwa_installation_id)
REFERENCES pwa_installations(id)
ON DELETE SET NULL;
```

```sql
CREATE INDEX IF NOT EXISTS
ix_orders_pwa_installation_id
ON orders(pwa_installation_id);
```

실제 constraint가 이미 올바르게 존재하면 재생성하지 않는다.

---

# 5. 애플리케이션 시작 시 마이그레이션 정책

현재 앱 시작 코드가 migration 실패를 경고만 출력하고 서버를 계속 시작한다면, PWA 설치 통계 핵심 제약의 실패는 최소한 명확한 운영 로그와 상태를 남겨야 한다.

권장 우선순위:

```text
1. 배포 전 migration 명령 실행
2. verify 스크립트 PASS
3. 그 후 애플리케이션 시작
```

가능하면 Railway 배포 명령을 다음처럼 구성한다.

```bash
python backend/scripts/verify_pwa_installation_constraints.py
```

단, 아직 migration 적용 전 검증이므로 배포 파이프라인은 다음 순서가 더 정확하다.

```text
migration apply
→ constraint verify
→ uvicorn start
```

런타임 요청 중 자동 ALTER TABLE에 의존하지 않는 것이 좋다.

이번 작업에서 전체 마이그레이션 체계를 전면 교체하지는 않는다.

---

# 6. 백엔드 테스트

SQLite 테스트만으로 PostgreSQL FK 계약을 완전히 검증했다고 보고하지 않는다.

## 단위 테스트

검증 함수가 inspector 결과를 올바르게 판정하는지 테스트한다.

```text
admin_id -> admins.id       → PASS
admin_id -> users.id        → FAIL
ON DELETE CASCADE           → FAIL
admin_id index 없음         → FAIL 또는 WARN 정책에 따라 검증
orders 컬럼 없음            → FAIL
고아 admin_id 존재          → FAIL
```

## PostgreSQL 통합 테스트 가능 시

Testcontainers 또는 CI PostgreSQL을 사용해 다음을 검증한다.

```text
Admin 삭제
→ PwaInstallation 행 유지
→ admin_id NULL

PwaInstallation 삭제
→ Order 행 유지
→ pwa_installation_id NULL

존재하지 않는 admin_id INSERT
→ FK 오류

동일 installation_id 중복 INSERT
→ unique 정책이 있으면 오류
```

새로운 대규모 테스트 의존성을 추가해야 한다면 먼저 보고하고, 불필요한 패키지 추가는 피한다.

---

# 7. Railway 수동 검증 SQL

## 외래키 대상 확인

```sql
SELECT
    tc.constraint_name,
    kcu.table_name,
    kcu.column_name,
    ccu.table_name AS referenced_table,
    ccu.column_name AS referenced_column,
    rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
 AND tc.constraint_schema = kcu.constraint_schema
JOIN information_schema.constraint_column_usage ccu
  ON tc.constraint_name = ccu.constraint_name
 AND tc.constraint_schema = ccu.constraint_schema
JOIN information_schema.referential_constraints rc
  ON tc.constraint_name = rc.constraint_name
 AND tc.constraint_schema = rc.constraint_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND (
    (kcu.table_name = 'pwa_installations' AND kcu.column_name = 'admin_id')
    OR
    (kcu.table_name = 'orders' AND kcu.column_name = 'pwa_installation_id')
  );
```

## 고아 관리자 참조

```sql
SELECT COUNT(*) AS orphan_admin_refs
FROM pwa_installations p
LEFT JOIN admins a ON a.id = p.admin_id
WHERE p.admin_id IS NOT NULL
  AND a.id IS NULL;
```

## 고아 주문 설치 참조

```sql
SELECT COUNT(*) AS orphan_order_refs
FROM orders o
LEFT JOIN pwa_installations p
  ON p.id = o.pwa_installation_id
WHERE o.pwa_installation_id IS NOT NULL
  AND p.id IS NULL;
```

## 인덱스

```sql
SELECT
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename IN ('pwa_installations', 'orders')
  AND (
    indexdef ILIKE '%admin_id%'
    OR indexdef ILIKE '%pwa_installation_id%'
    OR indexdef ILIKE '%installation_id%'
  );
```

---

# 8. 완료 기준

```text
검증 스크립트가 읽기 전용으로 실행됨
잘못된 users.id FK가 존재하지 않음
admin_id가 admins.id를 참조함
admin FK의 delete rule이 SET NULL임
orders.pwa_installation_id FK가 정상임
필수 인덱스가 존재함
고아 참조 0건
검증 실패 시 exit code 1
마이그레이션이 재실행 가능하고 idempotent함
pytest 통과
Railway verify 결과 PASS
```

---

# 9. 배포 순서

1. 운영 DB 백업 또는 Railway snapshot 확인
2. 현재 constraint와 고아 데이터 읽기 전용 진단
3. migration SQL dry review
4. maintenance window 또는 저부하 시간에 migration 적용
5. verify 스크립트 실행
6. 백엔드 배포
7. 관리자 PWA heartbeat 실행
8. DB에서 관리자 이름 연결 확인
9. 사용자 PWA 주문 후 `orders.pwa_installation_id` 확인

---

# 10. 롤백

마이그레이션 전 constraint 이름과 상태를 기록한다.

롤백 시 데이터 행을 삭제하지 않는다.

```text
새 FK 제거
필요 시 이전 FK 복원
새 인덱스 제거 여부는 선택
고아 정리로 NULL 처리된 admin_id는 자동 복구하지 않음
다음 heartbeat로 재연결
```

이전의 잘못된 `users.id` FK는 운영상 문제가 있으므로 단순 롤백 대상으로 권장하지 않는다. 애플리케이션 장애가 생기면 새 FK를 일시 제거하고 원인을 조사하되, 잘못된 users FK를 다시 만들지 않는다.
