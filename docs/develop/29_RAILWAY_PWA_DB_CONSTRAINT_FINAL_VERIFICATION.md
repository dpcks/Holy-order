# 29. Railway PWA 설치 통계 DB 제약조건 최종 검증

## 1. 작업 목적

코드의 SQLAlchemy 모델이나 마이그레이션 파일이 올바르더라도 Railway PostgreSQL 운영 DB에 실제 제약조건이 다르게 적용되어 있을 수 있다.

이번 작업은 운영 DB를 변경하는 작업이 아니라, 배포 전후에 실제 스키마가 기대 계약과 정확히 일치하는지 읽기 전용으로 검증하는 작업이다.

검증 대상:

```text
pwa_installations.admin_id
→ admins.id
→ ON DELETE SET NULL
→ nullable

orders.pwa_installation_id
→ pwa_installations.id
→ ON DELETE SET NULL
→ nullable
```

추가 검증:

```text
- 필요한 인덱스 존재
- 잘못된 users.id 참조 없음
- 동일한 의미의 중복 FK 없음
- 고아 admin_id 없음
- 고아 pwa_installation_id 없음
- 검증 스크립트가 실패를 PASS로 오인하지 않음
```

---

## 2. 작업 원칙

```text
- 기본 모드는 읽기 전용이다.
- 자동으로 ALTER TABLE, UPDATE, DELETE를 실행하지 않는다.
- DATABASE_URL, 비밀번호, 전체 호스트 정보를 로그에 노출하지 않는다.
- Railway 접근 권한이 없으면 PASS라고 주장하지 않는다.
- 검증 결과가 FAIL이면 원인과 수정 명령을 보고하되 자동 수정하지 않는다.
- 수정은 30번 단일 마이그레이션 작업에서 수행한다.
```

---

## 3. 우선 조사할 파일

```text
backend/models.py
backend/main.py
backend/migrations/20260730_fix_pwa_installation_constraints.sql
backend/scripts/verify_pwa_installation_constraints.py
backend/database.py
backend/tests/test_pwa_installations.py
backend/tests/test_pwa_constraint_verification.py
```

실제 파일명은 저장소 최신 상태에 맞춰 확인한다.

```bash
rg -n "pwa_installations|pwa_installation_id|admin_id|ON DELETE|SET NULL|verify_pwa" backend
```

---

## 4. 검증 스크립트 요구사항

기존 `backend/scripts/verify_pwa_installation_constraints.py`가 있다면 아래 계약을 만족하도록 보완한다.

### 4.1 실행 방식

```bash
cd backend
python scripts/verify_pwa_installation_constraints.py
```

### 4.2 종료 코드

```text
모든 검증 PASS
→ exit code 0

하나라도 FAIL 또는 검증 불가
→ exit code 1
```

### 4.3 로그 형식

예시:

```text
[PASS] table pwa_installations exists
[PASS] pwa_installations.admin_id is nullable
[PASS] FK admin_id -> admins.id
[PASS] admin_id ON DELETE SET NULL
[PASS] exactly one semantic admin FK exists
[PASS] orders.pwa_installation_id is nullable
[PASS] FK pwa_installation_id -> pwa_installations.id
[PASS] order FK ON DELETE SET NULL
[PASS] exactly one semantic order FK exists
[PASS] no orphan admin_id rows
[PASS] no orphan order installation references
[PASS] required indexes exist
RESULT: PASS
```

실패 예시:

```text
[FAIL] admin_id references users.id
[FAIL] duplicate semantic FK count=2
RESULT: FAIL
```

### 4.4 비밀정보 마스킹

출력에 다음을 포함하지 않는다.

```text
DATABASE_URL 원문
DB 비밀번호
전체 연결 문자열
SSL 인증 정보
```

연결 대상을 표시해야 하면 다음 정도만 허용한다.

```text
DB dialect: postgresql
DB host: ****.railway.app
DB name: ****
```

---

## 5. 정확히 검증할 계약

### 5.1 컬럼 존재 및 nullable

```sql
SELECT
    table_name,
    column_name,
    is_nullable,
    data_type
FROM information_schema.columns
WHERE
    (table_name = 'pwa_installations' AND column_name = 'admin_id')
    OR
    (table_name = 'orders' AND column_name = 'pwa_installation_id');
```

기대:

```text
pwa_installations.admin_id
- integer
- nullable YES

orders.pwa_installation_id
- integer
- nullable YES
```

### 5.2 외래키 대상과 delete rule

PostgreSQL catalog 또는 `information_schema`로 다음을 확인한다.

```text
pwa_installations.admin_id
- referenced table: admins
- referenced column: id
- delete_rule: SET NULL

orders.pwa_installation_id
- referenced table: pwa_installations
- referenced column: id
- delete_rule: SET NULL
```

제약조건 이름만 보지 말고 실제 정의를 기준으로 검증한다.

### 5.3 중복 의미 FK 탐지

동일 source column이 동일 referenced column을 가리키는 FK가 두 개 이상이면 FAIL이다.

예:

```text
fk_pwa_installations_admin_id
pwa_installations_admin_id_fkey
```

두 제약이 모두 `admin_id -> admins.id`라면 기능상 동작하더라도 스키마 드리프트이므로 FAIL로 판정한다.

### 5.4 잘못된 users.id 참조 탐지

다음이 하나라도 있으면 FAIL이다.

```text
pwa_installations.admin_id -> users.id
```

### 5.5 고아 데이터

```sql
SELECT COUNT(*)
FROM pwa_installations p
LEFT JOIN admins a ON a.id = p.admin_id
WHERE p.admin_id IS NOT NULL
  AND a.id IS NULL;
```

기대: 0

```sql
SELECT COUNT(*)
FROM orders o
LEFT JOIN pwa_installations p
  ON p.id = o.pwa_installation_id
WHERE o.pwa_installation_id IS NOT NULL
  AND p.id IS NULL;
```

기대: 0

### 5.6 인덱스

최소한 다음 source column에 사용 가능한 인덱스가 있어야 한다.

```text
pwa_installations.admin_id
orders.pwa_installation_id
```

인덱스 이름은 고정하지 말고 실제 컬럼 포함 여부로 검증한다.

---

## 6. Railway 실행 절차

### 6.1 대상 배포 확인

```text
- GitHub main commit SHA
- Railway backend deployment commit SHA
- 검증 실행 시각 UTC/KST
```

세 정보를 결과 보고에 기록한다.

### 6.2 Railway one-off shell 또는 안전한 로컬 터널

Railway 애플리케이션 서비스의 환경변수를 사용해 아래 명령을 실행한다.

```bash
cd backend
python scripts/verify_pwa_installation_constraints.py
```

Postgres 서비스 로그가 아니라 백엔드 one-off command 또는 shell에서 실행한다.

### 6.3 결과 보존

민감정보를 제외한 검증 결과를 텍스트로 저장한다.

```text
docs/operations/pwa-db-constraint-verification-YYYYMMDD.md
```

또는 배포 보고서에 그대로 첨부한다.

---

## 7. 실패 시 정책

검증 결과가 FAIL이면 다음을 수행한다.

```text
1. 백엔드 신규 배포 중지
2. 실패 항목 분류
3. DB 백업 상태 확인
4. 30번 마이그레이션 단일화 작업 수행
5. 전용 마이그레이션 적용
6. 본 29번 검증을 다시 실행
7. RESULT: PASS 확인 후 배포 재개
```

자동으로 운영 데이터를 수정하지 않는다.

---

## 8. 자동 테스트

검증 스크립트 자체에 최소 다음 테스트를 둔다.

```text
정상 FK 1개
→ PASS

admin_id -> users.id
→ FAIL

올바른 FK 2개 중복
→ FAIL

ON DELETE NO ACTION
→ FAIL

고아 admin_id 1건
→ FAIL

고아 order reference 1건
→ FAIL

필수 인덱스 없음
→ FAIL
```

SQLite는 PostgreSQL catalog 동작과 다르므로, 가능한 경우 테스트 PostgreSQL을 사용하거나 catalog query layer를 mock한다.

---

## 9. 완료 기준

```text
[ ] Railway 운영 DB를 대상으로 실제 실행
[ ] RESULT: PASS
[ ] admin_id -> admins.id 확인
[ ] 두 FK 모두 ON DELETE SET NULL 확인
[ ] 중복 의미 FK 0건
[ ] 잘못된 users.id FK 0건
[ ] 고아 참조 0건
[ ] 필수 인덱스 확인
[ ] 실행 commit SHA 및 시각 기록
[ ] 민감정보 로그 없음
```

Railway 접근 권한이 없어 실제 실행하지 못한 경우 완료가 아니다. 그 경우 `NOT VERIFIED`로 보고한다.

---

## 10. 완료 보고 형식

1. 검증한 Git commit SHA
2. Railway 배포 commit SHA
3. 검증 실행 시각
4. 실행 명령
5. PASS/FAIL 전체 출력
6. 제약조건 실제 정의 요약
7. 중복 FK 개수
8. 고아 데이터 개수
9. 인덱스 결과
10. RESULT: PASS 여부
11. 실패 시 30번 작업으로 넘길 항목
