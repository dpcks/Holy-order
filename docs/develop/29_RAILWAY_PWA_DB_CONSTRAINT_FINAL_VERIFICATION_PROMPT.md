# Antigravity 실행 프롬프트 — 29번

먼저 `docs/antigravity/00_README.md`를 읽고 공통 운영 원칙을 확인한 뒤 아래 문서만 수행하세요.

```text
docs/antigravity/29_RAILWAY_PWA_DB_CONSTRAINT_FINAL_VERIFICATION.md
```

이번 작업은 Railway PostgreSQL 운영 DB의 PWA 설치 통계 관련 제약조건을 **읽기 전용으로 최종 검증**하는 작업입니다.

검증 계약:

```text
pwa_installations.admin_id
→ admins.id
→ ON DELETE SET NULL
→ nullable
→ 의미상 동일한 FK 정확히 1개

orders.pwa_installation_id
→ pwa_installations.id
→ ON DELETE SET NULL
→ nullable
→ 의미상 동일한 FK 정확히 1개
```

추가로 다음을 확인하세요.

```text
- users.id를 참조하는 잘못된 FK 없음
- 고아 admin_id 0건
- 고아 pwa_installation_id 0건
- 필요한 인덱스 존재
- 중복 FK 없음
```

기존 검증 스크립트가 있다면 실제 제약조건 이름이 아니라 정의를 기준으로 검증하고, 모든 항목 PASS일 때만 exit code 0과 `RESULT: PASS`를 출력하도록 보완하세요.

운영 DB를 자동 수정하지 마세요. FAIL이면 배포를 중지하고 실패 항목을 보고한 뒤 30번 마이그레이션 단일화 작업으로 넘기세요.

Railway 접근 권한이 없거나 실제 운영 DB에서 실행하지 못했다면 절대로 PASS라고 보고하지 말고 `NOT VERIFIED`로 보고하세요.

실행 예시:

```bash
cd backend
python scripts/verify_pwa_installation_constraints.py
```

결과 보고에는 GitHub commit SHA, Railway deployment SHA, 실행 시각, 검증 전체 결과, 중복 FK 개수, 고아 데이터 개수, 인덱스 결과와 최종 `RESULT: PASS` 여부를 포함하세요. DATABASE_URL과 비밀번호는 로그에 출력하지 마세요.
