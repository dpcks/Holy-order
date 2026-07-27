# Antigravity 실행 프롬프트 — PWA 설치 감지 및 통계

저장소 루트에서 다음 문서를 먼저 읽고, 문서에 정의된 범위만 구현해 주세요.

```text
docs/antigravity/19_PWA_INSTALLATION_TRACKING_AND_ANALYTICS.md
```

## 현재 목적

Holy-Order에는 주문 시점의 `is_pwa` 값이 이미 있어 앱 주문과 웹 주문을 구분하지만, 이것은 설치 여부가 아니라 **이번 주문을 standalone PWA 화면에서 했는지**만 나타냅니다.

이번 작업에서는 기존 주문 통계를 유지하면서 다음 기능을 별도로 추가합니다.

```text
익명 설치 기기 ID
사용자 PWA / 관리자 PWA 구분
최초 감지·마지막 실행 시각
최근 7일·30일 활성 기기
플랫폼별 설치 감지 통계
관리자 화면의 PWA 설치 현황
PWA 주문과 설치 레코드의 선택적 연결
```

## 가장 중요한 원칙

1. 먼저 최신 저장소에서 `is_pwa`, standalone 판정, PWA manifest, 관리자 통계 구조를 전체 검색하세요.
2. `Order.is_pwa`를 삭제하거나 의미를 바꾸지 마세요.
3. 설치 통계와 앱/웹/현장 주문 통계를 섞지 마세요.
4. iPhone Safari에서 설치 여부를 확인할 수 없을 때 `false`가 아니라 `unknown/null`로 처리하세요.
5. iOS는 홈 화면 앱을 standalone으로 최초 실행한 시점에 설치 감지 기기로 등록하세요.
6. 앱 삭제를 실시간으로 감지한다고 구현하거나 보고하지 마세요. `last_seen_at`으로 최근 활성·stale 상태를 계산하세요.
7. installation_id는 인증·주문 소유권·결제 검증에 사용하지 마세요.
8. 사용자 이름, 전화번호, 전체 User-Agent, IP, Push 비밀키를 설치 레코드에 저장하지 마세요.
9. 사용자 heartbeat에서 `ADMIN` app type이나 admin_id를 클라이언트가 지정하지 못하게 하세요.
10. 관리자 설치 heartbeat와 통계 API는 관리자 인증으로 보호하세요.
11. 설치 추적 실패 때문에 주문이 실패해서는 안 됩니다.
12. 기존 PWA 푸시, WebSocket, 영업 상태 동기화, 관리자 알림음을 변경하지 마세요.

## 관리자 PWA 선행 조건

다음 작업이 현재 브랜치에 적용돼 있는지 먼저 확인하세요.

```text
18_ADMIN_PWA_SEPARATE_INSTALL.md
```

확인 항목:

```text
관리자 전용 manifest id
/admin/ start_url
/admin/ scope
관리자 전용 HTML 및 아이콘
```

적용되지 않았다면 일반 `/admin` 브라우저 접속을 관리자 PWA 설치로 오인하지 마세요. 관리자 설치 통계를 임시 추정으로 구현하지 말고, 선행 조건 누락을 결과에 명시하세요.

## 구현 방향

- `PwaInstallation` 전용 모델과 안전한 마이그레이션을 추가하세요.
- 사용자와 관리자 앱은 같은 Origin이어도 서로 다른 localStorage installation key를 사용하세요.
- 공용 `pwaInstallation.ts` 유틸리티를 만들고 standalone 판정을 한 곳으로 통합하세요.
- 사용자 PWA 공용 레이아웃과 관리자 `AdminLayout`에서 throttle된 heartbeat를 보내세요.
- `appinstalled` 및 `getInstalledRelatedApps()`는 지원 환경의 보조 신호로만 사용하세요.
- 주문 요청에는 standalone일 때만 선택적으로 installation key를 포함하세요.
- 백엔드는 유효한 USER installation만 일반 주문과 연결하고, 키가 없거나 잘못돼도 주문 자체는 정상 처리하세요.
- 관리자 통계에는 `설치 감지 기기`, `최근 7일 활성`, `최근 30일 활성`, 앱 유형·플랫폼 분포를 표시하세요.
- UI에는 사람 수가 아니라 기기·설치 단위이며 앱 삭제는 즉시 반영되지 않는다는 안내를 표시하세요.

## 검증

최소한 다음을 실행하세요.

```bash
pytest
cd frontend && npm run lint
cd frontend && npm run build
```

다음 실기기 시나리오를 결과에 포함하세요.

```text
iPhone Safari 일반 탭
→ 설치 false로 단정하지 않음

아이폰 사용자 PWA 최초 실행
→ USER 설치 레코드 생성

Android PWA 설치 및 실행
→ 중복 없는 설치 레코드와 heartbeat

PWA가 설치된 기기에서 QR로 일반 브라우저 주문
→ is_pwa=false 유지

같은 기기의 사용자 PWA와 관리자 PWA
→ 서로 다른 installation_id

앱 삭제
→ 즉시 삭제 처리하지 않고 last_seen 기준 stale 설명
```

## 작업 완료 보고

계획만 작성하고 멈추지 말고 실제 코드, 마이그레이션, 테스트, 빌드까지 완료하세요.

최종 보고에는 다음을 포함하세요.

```text
원인과 현재 한계
변경 파일
DB 마이그레이션
API 계약
installation ID 저장 정책
사용자·관리자 PWA 연동
주문 통계와 설치 통계 분리
보안·개인정보 조치
테스트 결과
iPhone·Android QA
배포 순서
롤백 방법
남은 위험
```
