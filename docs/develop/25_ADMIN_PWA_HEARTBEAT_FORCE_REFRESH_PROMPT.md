# Antigravity 실행 프롬프트: 관리자 PWA Heartbeat 강제 갱신

저장소 루트에서 다음 문서를 먼저 읽고, 문서 범위만 구현해 주세요.

```text
docs/antigravity/25_ADMIN_PWA_HEARTBEAT_FORCE_REFRESH.md
```

현재 관리자 PWA 설치 통계 heartbeat에는 6시간 throttle이 있습니다. 같은 기기에서 관리자 A가 로그아웃하고 관리자 B가 로그인하면, 최근 heartbeat 때문에 B의 heartbeat가 생략되어 DB의 `pwa_installations.admin_id`가 A로 남을 수 있습니다.

이번 작업은 관리자 계정 전환 시에만 throttle을 우회하여 같은 installation ID를 현재 로그인 관리자로 즉시 다시 연결하는 안정화 작업입니다.

## 필수 구현

```text
1. 마지막으로 연결한 관리자 ID를 별도 localStorage 키로 관리
2. `/admin/me`의 adminInfo.id가 이전 ID와 다르면 force heartbeat
3. 정상 API 응답 후에만 마지막 관리자 ID와 마지막 전송 시각 저장
4. 동일 admin ID의 React Query refetch에서는 강제 요청 반복 금지
5. StrictMode에서 동시에 heartbeat가 두 번 전송되지 않도록 dedupe
6. 로그아웃 시 admin heartbeat의 last_report와 last_admin_id 삭제
7. 관리자 PWA installation_id는 로그아웃 시 삭제하지 않음
8. 서버는 payload의 admin_id가 아니라 인증된 current_admin.id 사용
```

현재 관리자 PWA 매니페스트, 아이콘, 가로모드, WebSocket, 주문 관리 화면, 설치 통계 집계 방식은 변경하지 마세요.

## 필수 테스트

```text
A 로그인 → heartbeat → admin_id=A
A 로그아웃 → B 로그인(6시간 이내) → 즉시 heartbeat → 같은 행 admin_id=B
같은 B refetch → 중복 force 요청 없음
heartbeat 실패 → last_admin_id와 throttle 성공 시각 갱신 금지
로그아웃 → installation_id 유지
StrictMode effect 2회 → in-flight 요청 최대 1개
```

실행:

```bash
cd frontend
npm run lint
npm run build

cd ../backend
pytest
```

완료 보고에는 다음을 포함하세요.

```text
변경 파일
사용한 localStorage 키
force 판단 조건
중복 요청 방지 방식
A → B 실기기 QA 결과
DB 행 수와 admin_id 변경 결과
lint/build/pytest 결과
배포 및 롤백 순서
```
