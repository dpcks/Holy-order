# Antigravity 실행 프롬프트: PWA 설치 통계 DB 제약조건 검증

저장소 루트에서 다음 문서를 읽고, 문서 범위만 구현해 주세요.

```text
docs/antigravity/26_PWA_INSTALLATION_DB_CONSTRAINT_VERIFICATION.md
```

현재 코드 모델은 PWA 설치 통계의 `admin_id`가 `admins.id`를 참조하고, 주문의 `pwa_installation_id`가 `pwa_installations.id`를 참조해야 합니다. 그러나 Railway 운영 DB에 실제 제약조건이 적용됐는지는 코드만으로 확정할 수 없습니다.

이번 작업은 운영 DB의 실제 FK, delete rule, 인덱스, 고아 데이터를 재현 가능한 방식으로 검증하고 잘못된 제약을 안전하게 수정하는 작업입니다.

## 필수 구현

```text
1. 읽기 전용 verify 스크립트 추가
2. PASS=exit 0, FAIL=exit 1
3. pwa_installations.admin_id -> admins.id 확인
4. admin FK ON DELETE SET NULL 확인
5. orders.pwa_installation_id -> pwa_installations.id 확인
6. order FK ON DELETE SET NULL 확인
7. 필수 인덱스와 installation_id unique 계약 확인
8. 고아 admin_id와 고아 order 참조 진단
9. 잘못된 users.id FK 제거용 idempotent migration
10. 유효하지 않은 admin_id는 임의 매핑하지 말고 NULL 처리
11. migration 적용 후 verify 스크립트 PASS 확인
```

DB 비밀번호, 전체 DATABASE_URL, 푸시 endpoint 등 민감정보를 로그에 출력하지 마세요.

기본 verify 명령은 데이터를 변경하면 안 됩니다. 자동 수정 기능을 추가한다면 명시적인 `--apply` 없이는 절대로 실행되지 않게 하세요.

현재 PWA 통계 UI, heartbeat, 관리자 PWA, 주문 기능은 변경하지 마세요.

## 필수 검증

```bash
cd backend
pytest
python scripts/verify_pwa_installation_constraints.py
```

Railway PostgreSQL에서는 다음 결과를 보고하세요.

```text
admin_id referenced table
admin FK delete rule
orders installation FK target
order FK delete rule
orphan_admin_refs
orphan_order_refs
관련 index 목록
최종 PASS/FAIL
```

완료 보고에는 다음을 포함하세요.

```text
변경 파일
실제 발견한 기존 constraint
적용한 migration SQL 또는 Alembic revision
NULL 처리된 고아 행 수
verify 결과
pytest 결과
배포 순서
롤백 SQL
```
