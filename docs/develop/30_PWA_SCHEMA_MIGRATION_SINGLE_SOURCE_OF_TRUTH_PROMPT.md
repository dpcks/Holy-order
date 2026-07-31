# Antigravity 실행 프롬프트 — 30번

먼저 `docs/antigravity/00_README.md`를 읽고 공통 원칙을 확인한 뒤 아래 명세만 수행하세요.

```text
docs/antigravity/30_PWA_SCHEMA_MIGRATION_SINGLE_SOURCE_OF_TRUTH.md
```

이번 작업은 PWA 설치 통계 관련 스키마 변경을 `main.py` 자동 DDL과 전용 migration 두 곳에서 관리하는 문제를 제거하는 작업입니다.

최종 정책:

```text
- main.py/import/startup은 DB 스키마를 변경하지 않는다.
- PWA FK와 인덱스는 전용 idempotent migration만 관리한다.
- migration과 verification은 명시적 one-off 명령으로 실행한다.
- application start command에는 schema mutation을 포함하지 않는다.
```

다음 최종 계약을 보장하세요.

```text
pwa_installations.admin_id
→ admins.id
→ ON DELETE SET NULL
→ semantic FK 정확히 1개

orders.pwa_installation_id
→ pwa_installations.id
→ ON DELETE SET NULL
→ semantic FK 정확히 1개
```

잘못된 `admin_id -> users.id`, `NO ACTION` FK, 서로 다른 이름의 중복 FK를 정의 기준으로 탐지해 정리하세요. 고아 참조는 행을 삭제하지 말고 해당 FK 값만 NULL로 처리하세요.

기존 전용 SQL migration을 canonical source로 사용하고, 필요하면 다음과 같은 명시적 runner를 추가하세요.

```bash
cd backend
python scripts/apply_pwa_installation_constraints.py
python scripts/verify_pwa_installation_constraints.py
```

migration은 transaction과 가능한 경우 PostgreSQL advisory lock을 사용하며 여러 번 실행해도 결과가 같아야 합니다.

반드시 다음 테스트를 추가하세요.

```text
- from main import app 시 DDL 실행 0회
- migration 2회 실행 후 FK 각각 1개
- users.id 잘못된 FK 교정
- 중복 FK 정리
- 고아 값 NULL 처리
- migration 후 verification RESULT: PASS
```

Railway 배포 문서에는 다음 순서를 기록하세요.

```text
DB 백업 확인
→ one-off migration
→ 29번 verification
→ RESULT: PASS
→ backend application deploy
```

PWA API, 관리자 통계 UI, 이벤트, 재고, 주문 가격 로직은 변경하지 마세요.

완료 보고에는 제거한 startup DDL, canonical migration, runner 명령, 테스트 결과, 29번 검증 결과, Railway 배포 순서와 롤백 방법을 포함하세요.
