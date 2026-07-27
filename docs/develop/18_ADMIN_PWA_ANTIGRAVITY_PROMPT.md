# Antigravity 실행 프롬프트 — 관리자 전용 PWA

아래 문구와 함께 `18_ADMIN_PWA_SEPARATE_INSTALL.md`를 전달한다.

```text
저장소 루트에서 docs/antigravity/18_ADMIN_PWA_SEPARATE_INSTALL.md를 읽고,
문서에 정의된 범위만 구현해 주세요.

현재 Holy-Order는 하나의 React/Vite 앱에서 사용자 주문 화면과 /admin 관리자 화면을
같이 제공하고 있으며, VitePWA 매니페스트와 index.html이 사용자 앱 기준으로 하나만
존재합니다. 따라서 /admin에서 홈 화면에 추가해도 사용자 앱 이름과 아이콘으로
설치될 수 있습니다.

이번 작업의 목표는 같은 Vercel 프로젝트와 같은 백엔드를 유지하면서 다음 두 앱을
홈 화면에 구분해 설치할 수 있도록 만드는 것입니다.

- 사용자 PWA: 평택중앙교회 카페 / 시작 URL /
- 관리자 PWA: 평택중앙교회 카페 관리자 / 시작 URL /admin/

구현 전 현재 main 브랜치의 vite.config.ts, index.html, vercel.json, main.tsx,
App.tsx, sw.ts와 관리자 라우트를 먼저 확인하세요. 문서의 예시를 맹목적으로 복사하지
말고 현재 vite-plugin-pwa 버전과 실제 빌드 결과에 맞게 적용하세요.

핵심 원칙은 다음과 같습니다.

1. 기존 사용자 PWA의 앱 정체성을 보존하기 위해 사용자 manifest id는 /로 유지합니다.
2. 관리자 manifest id는 /admin/으로 분리합니다.
3. 사용자와 관리자용 HTML entry, manifest, apple-touch-icon, 앱 아이콘을 분리합니다.
4. Vercel에서 /admin 및 /admin/*는 admin.html로 rewrite합니다.
5. React 앱과 관리자 라우트를 복제하지 않고 기존 main.tsx와 App.tsx를 공유합니다.
6. Service Worker는 기존 루트 sw.ts 하나만 유지합니다.
7. 사용자 주문 완료 Push, 관리자 WebSocket, 새 주문 알림음, 영업 상태 실시간 반영에
   회귀가 없어야 합니다.
8. 관리자 PWA 설치는 인증 수단이 아니므로 기존 JWT와 ProtectedRoute를 유지합니다.
9. 별도 Vercel 프로젝트, 별도 DB, 두 번째 Service Worker는 만들지 마세요.
10. 현재 사용자 앱 아이콘을 관리자 이름으로 그대로 복제하지 말고 관리자 전용 아이콘을
    사용하세요. 필요한 최종 아이콘 자산이 없으면 임의 배포하지 말고 필요한 규격을 보고하세요.

구현 후 npm run lint와 npm run build를 실행하고, dist에 index.html, admin.html,
manifest.webmanifest, manifest-admin.webmanifest, sw.js가 생성되는지 확인하세요.

Vercel Preview에서 다음을 실기기로 검증하세요.

- Android에서 사용자 앱과 관리자 앱이 서로 다른 이름과 아이콘으로 설치되는지
- iPhone/iPad에서 각 HTML의 apple-touch-icon이 다르게 적용되는지
- 관리자 앱 실행 시 /admin/ 또는 /admin/login으로 시작하는지
- /admin/settings 직접 새로고침이 정상인지
- Service Worker 등록이 하나인지
- 기존 사용자 주문 Push가 정상인지
- 관리자 새 주문 WebSocket과 알림음이 정상인지

같은 Origin에서 두 PWA를 운영하므로 localStorage, 권한, Service Worker가 공유되는
제한을 숨기지 말고 결과 보고에 명시하세요. 자동 설치 배너가 사용자 앱 설치 때문에
관리자 페이지에서 표시되지 않는 브라우저가 있을 수 있으므로 수동 홈 화면 추가까지
검증하세요.

작업이 끝나면 변경 파일, manifest id/start_url/scope, 아이콘 경로, Vite 빌드 결과,
Vercel rewrite 결과, Android/iPhone 실기기 결과, 기존 기능 회귀 테스트, 남은 제한,
배포 및 롤백 방법을 순서대로 보고해 주세요.
```
