# Antigravity 실행 프롬프트 — 28번

저장소 루트에서 먼저 `docs/antigravity/00_README.md`를 읽고 공통 원칙을 확인한 뒤, 아래 명세만 실제 작업 대상으로 사용하세요.

```text
docs/antigravity/28_SCHEDULED_FREE_EVENT_PRESERVE_LIVE_EVENT.md
```

이번 작업의 핵심 문제는 미래의 무료 이벤트를 예약 게시할 때 현재 진행 중인 무료 이벤트가 조기 종료되는 것입니다.

현재 관리자 활성화 API에서 다른 모든 `is_active=True`, `is_event_mode=True` 항목을 일괄 비활성화하는 코드가 있다면 제거하세요.

정책은 다음과 같아야 합니다.

```text
- is_active는 게시됨을 의미한다.
- 미래 시작 이벤트는 SCHEDULED다.
- 현재 시간 구간에 포함되는 이벤트만 LIVE다.
- 시간이 겹치지 않는 무료 이벤트는 여러 개 게시 상태로 존재할 수 있다.
- 실제 시간 구간이 겹치는 무료 이벤트만 차단한다.
- 미래 예약 이벤트를 게시해도 현재 LIVE 이벤트는 종료 시각까지 유지한다.
```

기존 `validate_free_event_overlap()`와 `get_effective_free_event()`가 있다면 단일 기준으로 재사용하고, 공개 화면·공개 주문·관리자 주문이 같은 유효성 판정을 사용하도록 유지하세요.

반드시 다음 테스트를 추가하세요.

```text
A: 09:00~12:00 LIVE
B: 13:00~15:00 SCHEDULED
B 게시 후 A.is_active=True, B.is_active=True
10:00 effective=A
13:00 effective=B
```

겹치는 이벤트 게시 실패 시 A와 B의 기존 상태가 바뀌지 않아야 하며, DB commit 성공 후에만 `ANNOUNCEMENT_UPDATED`를 발송해야 합니다.

이번 작업에서 주문 가격 계산 전체, 일반 공지 푸시, 정산 리포트, PWA 및 WebSocket 인프라를 함께 리팩터링하지 마세요.

수정 후 다음을 실행하세요.

```bash
cd backend
pytest -q backend/tests/test_announcements.py
pytest -q

cd ../frontend
npm run lint
npm run build
```

완료 보고에는 변경 파일, 제거한 일괄 비활성화 로직, 시간 경계 정책, 테스트 결과, LIVE+SCHEDULED 수동 QA 결과, 배포 순서와 롤백 방법을 포함하세요.
