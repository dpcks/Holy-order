당신은 React 19 + TypeScript + TanStack Query v5 + Vite PWA 프런트엔드와
FastAPI + SQLAlchemy + PostgreSQL 백엔드로 구성된 기존 운영 프로젝트를 수정하는 시니어 풀스택 엔지니어다.

단순한 예제 코드나 설명만 제공하지 말고, 실제 저장소를 먼저 조사한 뒤 기존 코드에 직접 수정 사항을 적용하고 빌드 및 테스트까지 수행하라.

# 1. 이번 작업의 최종 목표

관리자 웹에서 카페의 영업 상태를 시작 또는 종료했을 때:

1. 화면에 열려 있는 사용자 PWA가 WebSocket을 통해 1~2초 안에 변경된 영업 상태를 반영해야 한다.
2. 사용자가 Home이 아니라 MenuDetail 또는 Cart 화면에 있어도 바로 반영되어야 한다.
3. 모바일 PWA가 백그라운드에 있다가 다시 전면으로 돌아오면 즉시 최신 상태를 조회해야 한다.
4. WebSocket 메시지를 놓치거나 연결이 끊겨도 최대 15초 안에 폴링으로 복구해야 한다.
5. 영업 상태를 확인할 수 없는 경우 절대로 주문 가능한 상태로 간주하지 않아야 한다.
6. 서버의 기존 주문 생성 시 영업 상태 검증은 그대로 유지해야 한다.
7. 기존 주문 추적, 푸시 알림, 관리자 새 주문 알림음, 관리자 주문 현황 기능에 회귀가 없어야 한다.

# 2. 현재 배포 및 실행 환경

- 프런트엔드: Vercel
- 프런트엔드 형태: 설치형 PWA
- 백엔드: Railway FastAPI
- DB: Railway PostgreSQL
- 이미지: Cloudinary
- Railway 리전: Singapore
- Railway Replica: 1개
- Uvicorn 서버 프로세스: 1개
- WebSocket 엔드포인트: /ws
- WebSocket 연결 목록은 backend/websocket.py의 메모리에 저장
- 현재는 Replica 1개, Worker 1개이므로 Redis Pub/Sub은 필요하지 않음
- 추후 Worker 또는 Replica가 2개 이상이 되면 Redis 등 외부 Pub/Sub이 필요하다는 점만 문서화할 것
- Vercel에는 VITE_API_BASE_URL과 VITE_WS_URL이 등록되어 있음
- 도메인은 코드에 하드코딩하지 말 것

# 3. 현재 확인된 핵심 문제

## 3-1. 백엔드 설정 변경 이벤트 누락

backend/routers/admin.py의 PUT /api/v1/admin/settings는 현재 다음 흐름이다.

관리자 요청
→ Setting DB 갱신
→ commit
→ 응답 반환

하지만 manager.broadcast()를 호출하지 않는다.

반면 Home.tsx와 OrderStatus.tsx는 SETTINGS_UPDATED WebSocket 메시지를 받아야 설정 Query를 무효화하도록 되어 있다.

따라서 DB는 변경되지만 사용자 PWA는 변경 사실을 즉시 알지 못한다.

## 3-2. WebSocket이 Home 페이지에만 존재

frontend/src/pages/Home.tsx 안에서 WebSocket을 직접 연결한다.

사용자가 아래 경로로 이동하면 Home이 언마운트되고 WebSocket이 종료된다.

- /menu/:id
- /cart

따라서 MenuDetail과 Cart에서는 영업 종료 이벤트를 받을 수 없다.

## 3-3. MenuDetail과 Cart의 설정 조회가 최초 1회뿐임

MenuDetail.tsx와 Cart.tsx는 useEffect에서 GET /settings를 한 번 호출하고 로컬 state에 저장한다.

다음 기능이 없다.

- WebSocket 설정 이벤트
- React Query 공유 캐시
- 폴링
- visibilitychange 복구
- online 복구

## 3-4. React Query 설정 키 충돌

현재 공개 설정 API와 관리자 설정 API가 같은 Query Key를 사용한다.

공개 API:
GET /api/v1/settings

관리자 API:
GET /api/v1/admin/settings

하지만 둘 다 다음 키를 사용한다.

['settings', 'main']

AdminSettings에서는 QK.settings.all도 같은 값이다.

이 상태에서는 같은 브라우저에서 관리자 화면과 사용자 화면을 오갈 때 서로 다른 API 응답이 같은 캐시에 들어갈 수 있다.

## 3-5. 전역 Query 설정

frontend/src/main.tsx의 전역 기본값은 다음과 같다.

- staleTime: 5분
- refetchOnWindowFocus: false

일반 데이터에는 유지해도 되지만 영업 상태 Query는 개별 옵션으로 반드시 덮어써야 한다.

## 3-6. Service Worker는 주원인이 아님

frontend/src/sw.ts는 precacheAndRoute만 사용하며 API에 대한 CacheFirst, NetworkFirst, StaleWhileRevalidate 등의 런타임 캐시 규칙이 없다.

따라서 이번 작업에서 Service Worker 런타임 캐싱 전략은 새로 추가하지 말 것.

## 3-7. 서버 주문 차단은 이미 구현되어 있음

POST /api/v1/orders는 Setting.is_open이 false이면 주문을 403으로 차단한다.

이 검증은 반드시 유지하라.

# 4. 구현 전 저장소 전체 조사

수정 전에 저장소 전체에서 아래 항목을 검색하라.

- QK.settings.main
- QK.settings.all
- QK_DOMAIN.settings
- new WebSocket
- getWsUrl
- SETTINGS_UPDATED
- /settings
- /admin/settings
- refetchInterval
- visibilitychange

예시 명령:

rg -n \
  "QK\.settings\.(main|all)|QK_DOMAIN\.settings|new WebSocket|getWsUrl|SETTINGS_UPDATED|/admin/settings|/settings|refetchInterval|visibilitychange" \
  frontend/src backend

검색 결과를 기준으로 누락된 사용처까지 모두 수정하라.

# 5. 필수 구현 사항

## 5-1. backend/routers/admin.py에서 SETTINGS_UPDATED 전송

PUT /admin/settings가 DB commit에 성공한 다음 다음 형식의 이벤트를 모든 연결에 전송하라.

{
  "type": "SETTINGS_UPDATED",
  "changed_fields": ["is_open"],
  "is_open": false,
  "timestamp": "timezone-aware ISO timestamp"
}

단, 현재 프로젝트는 동기 SQLAlchemy Session을 사용한다.

단순히 WebSocket broadcast를 await하기 위해 기존 sync def 엔드포인트를 async def로 바꾸고 동기 DB 쿼리를 이벤트 루프에서 실행하지 말 것.

권장 방식:

- 기존 def update_settings 유지
- FastAPI BackgroundTasks 주입
- commit 및 refresh 성공 후 background_tasks.add_task(manager.broadcast, payload) 사용

대략적인 구조:

from fastapi import BackgroundTasks

@router.put("/settings", ...)
def update_settings(
    update_data: schemas.SettingUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    admin: models.Admin = Depends(auth.get_current_admin),
):
    ...
    db.commit()
    db.refresh(setting)

    if update_dict:
        background_tasks.add_task(
            manager.broadcast,
            {
                "type": "SETTINGS_UPDATED",
                "changed_fields": list(update_dict.keys()),
                "is_open": setting.is_open,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        )

    return ...

다른 안전한 방식이 더 적절하다면 사용할 수 있지만 다음 조건은 지켜야 한다.

- DB commit 성공 전에 이벤트를 보내지 말 것
- sync SQLAlchemy 작업을 불필요하게 이벤트 루프에서 실행하지 말 것
- 빈 update 요청이면 불필요한 이벤트를 보내지 말 것
- 이벤트 전송 실패가 DB commit을 롤백시키지 않게 할 것

## 5-2. backend/routers/menus.py의 공개 설정 응답 캐시 금지

GET /api/v1/settings 응답에 다음 헤더를 추가하라.

Cache-Control: no-store, max-age=0

필요하면 Pragma: no-cache도 추가할 수 있다.

현재 API는 매 요청마다 DB의 Setting을 조회하므로 별도의 서버 캐시는 도입하지 말 것.

DB 스키마 변경이나 마이그레이션은 필요하지 않다.

## 5-3. 설정 Query Key 분리

frontend/src/api/queryKeys.ts의 settings를 다음 의미로 분리하라.

settings: {
  _domain: ['settings'],
  public: ['settings', 'public'],
  admin: ['settings', 'admin'],
}

기존 main과 all 별칭은 모든 사용처를 교체한 뒤 제거하라.
별칭을 남겨 누락된 사용처가 숨어버리지 않게 하라.

사용 원칙:

- Home → QK.settings.public
- MenuDetail → QK.settings.public
- Cart → QK.settings.public
- OrderStatus → QK.settings.public
- AdminSettings → QK.settings.admin
- AdminOrderManagement → QK.settings.admin
- 기타 GET /settings 사용처 → public
- 기타 GET /admin/settings 사용처 → admin

수정 후 다음 검색 결과가 0건이어야 한다.

rg -n "QK\.settings\.(main|all)" frontend/src

QK_DOMAIN.settings는 ['settings']로 유지해도 된다.

## 5-4. 공개 설정 공용 조회 함수와 훅 생성

새 파일을 적절한 위치에 추가하라.

권장:

frontend/src/hooks/usePublicSettings.ts

다음을 export하라.

1. fetchPublicSettings
2. usePublicSettings

fetchPublicSettings는 GET /settings를 호출해 SettingResponse | null을 반환해야 한다.

usePublicSettings 옵션:

- queryKey: QK.settings.public
- staleTime: 0
- refetchInterval: 15000
- refetchIntervalInBackground: false
- refetchOnMount: 'always'
- refetchOnWindowFocus: 'always'
- refetchOnReconnect: 'always'
- retry: 1

WebSocket이 정상일 때 폴링은 주 기능이 아니라 누락 복구용이다.

중요:

- 설정 데이터가 아직 없거나 조회에 실패한 상태를 영업 중으로 간주하지 말 것
- is_open === true가 명확히 확인된 경우에만 주문 동작을 허용할 것
- 이전 캐시 데이터가 있는 상태에서 백그라운드 refetch가 발생할 때 화면을 불필요하게 깜빡이지 않게 할 것

## 5-5. 사용자 주문 화면용 지속 WebSocket 레이아웃 생성

새 파일:

frontend/src/components/layout/PublicRealtimeLayout.tsx

이 컴포넌트는 Outlet을 렌더링하고 사용자 주문 경로 전체에서 WebSocket 연결을 하나만 유지해야 한다.

필수 동작:

- getWsUrl()로 연결
- 이미 OPEN 또는 CONNECTING이면 중복 연결 금지
- StrictMode의 mount/unmount에서도 유령 재연결 타이머가 남지 않게 처리
- 1초부터 최대 30초까지 지수 백오프
- cleanup 시 재연결 금지 플래그 설정
- reconnect timer 정리
- socket.onclose를 제거한 뒤 정상 종료
- 모바일 연결 유지를 위한 20~25초 heartbeat 또는 서버 ping 응답 처리
- 서버에서 {"type":"ping"}을 받으면 pong 메시지 전송
- 연결 성공 직후 놓친 변경을 복구하기 위해 공개 설정 Query 재조회
- document.visibilityState가 visible로 바뀌면 설정을 즉시 재조회하고 소켓 상태 확인
- window online 이벤트에서도 즉시 재조회 및 재연결

WebSocket 이벤트 처리:

SETTINGS_UPDATED
→ QK.settings.public을 exact하게 invalidate

MENU_UPDATED
MENU_CREATED
MENU_DELETED
CATEGORY_UPDATED
→ QK_DOMAIN.categories invalidate

ANNOUNCEMENT_UPDATED
→ QK_DOMAIN.announcements invalidate

현재 Home WebSocket이 처리하던 메뉴와 공지 이벤트 기능을 잃지 않도록 PublicRealtimeLayout으로 옮겨야 한다.

NEW_ORDER와 ORDER_UPDATED는 이 레이아웃에서 특별히 처리하지 않아도 된다.
주문 상태 화면은 기존 전용 소켓을 유지한다.

## 5-6. App.tsx 사용자 경로 묶기

Home, MenuDetail, Cart를 PublicRealtimeLayout의 자식 라우트로 묶어라.

개념 구조:

<Route element={<PublicRealtimeLayout />}>
  <Route path="/" element={<Home />} />
  <Route path="/menu/:id" element={<MenuDetail />} />
  <Route path="/cart" element={<Cart />} />
</Route>

다음은 이 레이아웃 밖에 둔다.

- /order/status/:id
- /admin/*
- /admin/login

이유:

- OrderStatus는 주문 추적 전용 WebSocket과 주문 폴링을 이미 사용
- AdminLayout도 관리자 새 주문 알림용 WebSocket을 이미 사용
- 관리자 화면에서 공용 사용자 WebSocket까지 중복 생성하지 말 것

## 5-7. Home.tsx 정리

Home 안의 다음 코드를 제거하라.

- wsRef
- reconnectTimerRef
- retryCountRef
- connectWebSocket
- Home 전용 WebSocket useEffect
- 불필요해진 useCallback/useRef/useQueryClient/getWsUrl/QK_DOMAIN import

기존 QK.settings.main useQuery를 제거하고 usePublicSettings를 사용하라.

Home의 loading 상태에는 설정 로딩도 포함하라.

화면 정책:

- settings.is_open === false → 기존 영업 종료 화면
- settings.is_open === true → 메뉴 화면
- 설정 최초 조회 중 → 로딩 화면
- 설정 조회 실패 또는 데이터 없음 → “영업 상태를 확인할 수 없습니다” 안내와 재시도 버튼
- 설정 상태를 모르는 동안 메뉴 상세 진입이나 주문 동작을 허용하지 말 것

영업 종료 화면에서도 usePublicSettings Query는 계속 활성 상태여야 하므로 관리자가 다시 영업을 시작하면 별도 새로고침 없이 메뉴 화면으로 돌아와야 한다.

## 5-8. MenuDetail.tsx 정리

현재 로컬 settings state와 최초 1회 GET /settings useEffect를 제거하고 usePublicSettings를 사용하라.

필수 동작:

- settings.is_open === false가 되면 홈으로 이동
- settings가 loading/error/null인 동안 주문 버튼 비활성화
- 장바구니 담기 직전 영업 상태 확인
- 바로 주문 직전 영업 상태 확인
- is_open === true일 때만 addItem 실행
- 영업 종료 상태에서 장바구니에 새 항목을 넣지 말 것
- 현재 품절 검사 로직은 유지
- 기존 가격 표시, 옵션, 텀블러 할인 기능은 변경하지 말 것
- handleAddToCart가 성공 여부를 boolean으로 반환하도록 구성하여 바로 주문이 실패했는데도 Cart로 이동하는 일이 없게 할 것

MenuDetail의 location.state 직접 접근 문제는 이번 작업의 핵심 범위가 아니다.
해당 부분을 수정하려면 별도 위험과 필요한 API 변경을 보고만 하고, 무리하게 범위를 넓히지 말 것.

## 5-9. Cart.tsx 정리

현재 로컬 settings state와 최초 1회 GET /settings 조회를 제거하고 usePublicSettings를 사용하라.

공지사항도 가능하면 기존 QK.announcements.active React Query로 전환하여 PublicRealtimeLayout의 ANNOUNCEMENT_UPDATED invalidation이 실제로 반영되게 하라.

필수 동작:

- 영업 종료 감지 시 사용자 정보 모달 닫기
- 홈으로 이동
- 주문 버튼 비활성화
- settings.is_open === true일 때만 사용자 정보 모달 열기
- setting loading/error/null이면 주문 불가
- 버튼 문구에 “영업 상태 확인 중”, “영업 종료” 등을 명확히 표시

중요한 경쟁 조건:

사용자가 주문자 정보 모달을 작성하는 동안 관리자가 영업을 종료할 수 있다.

따라서 실제 POST /orders 직전에 fetchPublicSettings를 사용해 설정을 강제로 한 번 더 조회하라.

권장:

await queryClient.fetchQuery({
  queryKey: QK.settings.public,
  queryFn: fetchPublicSettings,
  staleTime: 0,
})

최신 설정이 is_open !== true이면 POST /orders를 호출하지 말고 모달을 닫고 홈으로 이동하라.

POST /orders가 403을 반환하는 경우:

- QK.settings.public 즉시 invalidate
- 사용자 모달 닫기
- 홈으로 이동
- 서버의 detail 메시지를 사용자에게 보여주기
- Axios 전역 인터셉터와 Cart 로컬 토스트가 같은 오류를 중복 표시하지 않게 할 것

서버의 주문 영업 상태 검증은 절대 제거하지 말 것.

## 5-10. OrderStatus.tsx 수정

OrderStatus의 주문 상태 전용 WebSocket과 주문 폴링은 이번 작업에서 유지하라.

변경 사항:

- 설정 Query를 usePublicSettings로 교체
- SETTINGS_UPDATED 수신 시 QK.settings.public exact invalidate
- visibilitychange로 visible이 되었을 때 orders뿐 아니라 settings와 announcements도 갱신
- cleanup에서 isUnmountingRef.current = true 설정
- heartbeat, reconnect timer, polling timer, socket을 정확히 정리
- 언마운트 시 onclose가 재연결을 생성하지 않게 처리

중요:

카페 영업이 종료되어도 이미 생성된 주문 상태 화면은 계속 확인할 수 있어야 한다.
OrderStatus에서 is_open === false라고 홈으로 강제 이동시키지 말 것.

## 5-11. 관리자 설정 Query Key 변경

AdminSettings.tsx:

- QK.settings.all → QK.settings.admin
- mutation 성공 시 QK.settings.admin에 응답 데이터를 setQueryData
- localSettings를 응답 데이터로 갱신
- QK.settings.public exact invalidate
- 현재 계좌 정보 등의 편집 기능과 권한 검사는 유지

AdminOrderManagement.tsx:

- QK.settings.main → QK.settings.admin

이번 작업에서 AdminLayout과 AdminOrderManagement의 WebSocket을 하나로 합치는 대규모 리팩터링은 하지 말 것.

현재 두 소켓은 역할이 다르다.

- AdminLayout: 새 주문 알림음과 배지
- AdminOrderManagement: 주문 현황 갱신, 연결 상태 표시, 폴링 폴백

이 구조는 별도 리팩터링 작업으로 남겨라.
이번 수정으로 새 주문 알림음이 두 번 울리거나 사라지지 않게 테스트하라.

## 5-12. getWsUrl 안전성 강화

frontend/src/utils/url.ts를 점검하고 다음을 만족하도록 보완하라.

우선순위:

1. VITE_WS_URL
2. VITE_API_BASE_URL에서 WebSocket URL 파생
3. 로컬 개발 fallback
4. 최후에 현재 origin fallback

정규화 규칙:

- https: → wss:
- http: → ws:
- 최종 pathname은 /ws
- /api/v1 경로 제거
- query와 hash 제거
- Railway 도메인 하드코딩 금지

예:

VITE_API_BASE_URL=https://backend.example.com/api/v1
→ wss://backend.example.com/ws

VITE_WS_URL=https://backend.example.com
→ wss://backend.example.com/ws

환경변수가 잘못된 URL이면 명확한 console error를 남기고 무한 예외 루프가 발생하지 않게 하라.

VITE_* 환경변수에는 비밀 값을 추가하지 말 것.

# 6. 변경하지 말아야 할 사항

이번 작업에서는 다음을 하지 말 것.

- DB 마이그레이션 추가
- Redis 추가
- Railway Replica/Worker 수 변경
- Vercel/Railway 도메인 하드코딩
- Service Worker에 API CacheFirst 또는 StaleWhileRevalidate 추가
- 패키지 대규모 버전 업데이트
- 주문 상태/결제/푸시 알림 로직 대규모 재작성
- 관리자 WebSocket 전체 리팩터링
- UI 디자인 전면 변경
- 기존 한국어 문구와 스타일 임의 변경
- 백엔드의 영업 종료 주문 차단 제거
- 관련 없는 파일 포맷 전체 변경

수정 범위는 최소화하되, 실시간 영업 상태 동기화의 신뢰성은 충분히 확보하라.

# 7. 예상 변경 파일

최소한 다음 파일을 검토하라.

백엔드:

- backend/routers/admin.py
- backend/routers/menus.py
- backend/websocket.py
- backend/main.py
- backend/tests/*

프런트엔드:

- frontend/src/api/queryKeys.ts
- frontend/src/hooks/usePublicSettings.ts 신규
- frontend/src/components/layout/PublicRealtimeLayout.tsx 신규
- frontend/src/App.tsx
- frontend/src/pages/Home.tsx
- frontend/src/pages/MenuDetail.tsx
- frontend/src/pages/Cart.tsx
- frontend/src/pages/OrderStatus.tsx
- frontend/src/pages/admin/AdminSettings.tsx
- frontend/src/pages/admin/AdminOrderManagement.tsx
- frontend/src/utils/url.ts
- frontend/src/main.tsx
- frontend/src/sw.ts
- frontend/vite.config.ts

main.tsx, sw.ts, vite.config.ts는 변경이 필요하지 않으면 수정하지 말고, 왜 변경하지 않았는지 결과 보고에 명시하라.

# 8. 완료 기준

아래 조건을 모두 만족해야 완료로 간주한다.

## 실시간 동작

1. Home을 열어둔 상태에서 관리자가 영업 종료
   → 1~2초 안에 종료 화면 표시

2. Home을 열어둔 상태에서 관리자가 영업 시작
   → 1~2초 안에 메뉴 화면 표시

3. MenuDetail에서 관리자가 영업 종료
   → 장바구니 추가 불가
   → 홈 종료 화면으로 이동

4. Cart에서 관리자가 영업 종료
   → 주문자 모달 닫힘
   → 주문 버튼 비활성
   → 홈 종료 화면으로 이동

5. PWA를 백그라운드에 둔 상태에서 영업 종료 후 다시 실행
   → 화면이 보이는 즉시 최신 설정 조회

6. WebSocket 연결을 강제로 차단
   → 최대 15초 안에 폴링으로 변경 상태 반영

7. WebSocket 재연결 성공
   → 연결이 끊겨 있던 동안의 변경 상태 즉시 재조회

## 안전성

8. 설정 조회 실패 시 영업 중으로 간주하지 않음

9. 주문 제출 직전 최신 설정 재검증

10. 오래된 화면에서 주문 요청을 보내더라도 백엔드 403으로 차단

11. OrderStatus는 영업 종료 후에도 계속 접근 가능

## 연결 수

12. Home → MenuDetail → Cart를 이동해도 사용자 주문 영역의 WebSocket은 1개만 유지

13. OrderStatus에서는 주문 추적용 WebSocket이 정상 동작

14. 관리자 화면의 새 주문 알림음이 기존대로 한 번만 재생

## 캐시

15. GET /api/v1/settings 응답:
    Cache-Control: no-store, max-age=0

16. 공개 설정과 관리자 설정의 React Query 캐시가 서로 분리

17. QK.settings.main과 QK.settings.all 사용처가 0건

# 9. 테스트 및 검증

가능한 범위에서 기존 테스트 인프라를 활용해 다음을 수행하라.

백엔드:

- PUT /admin/settings 성공 후 SETTINGS_UPDATED가 예약 또는 전송되는지 테스트
- DB commit 실패 시 이벤트가 전송되지 않는지 확인
- GET /settings의 Cache-Control 헤더 테스트
- 기존 주문 영업 종료 403 테스트 유지
- pytest 실행

프런트엔드:

- npm run build
- npm run lint
- TypeScript 오류 0건
- 사용하지 않는 import/ref 제거
- 새로운 프런트엔드 테스트 프레임워크는 불필요하게 추가하지 말 것

기존 프로젝트에 이미 존재하는 lint 오류가 있다면:

- 기존 오류인지 이번 변경으로 생긴 오류인지 구분
- 이번 변경으로 새 오류를 만들지 말 것
- 결과 보고에 정확히 기록

수동 검증 방법도 결과에 작성하라.

Chrome DevTools의 Network → WS에서 확인할 사항:

- wss://<backend>/ws
- 101 Switching Protocols
- SETTINGS_UPDATED frame 수신
- 직후 GET /api/v1/settings 실행
- 응답의 is_open 최신값 확인

# 10. 구현 결과 보고 형식

작업이 끝나면 다음 순서로 보고하라.

1. 원인 요약
2. 실제 변경한 파일 목록
3. 파일별 핵심 변경 내용
4. 새로 추가한 실시간 동기화 흐름
5. 실행한 테스트 및 명령
6. 테스트 결과
7. 수동 QA 절차
8. 남아 있는 위험 또는 전제
9. 배포 순서
10. 롤백 방법

배포 순서는 다음을 권장한다.

1. Railway 백엔드 배포
2. SETTINGS_UPDATED 이벤트 확인
3. Vercel 프런트엔드 배포
4. 설치된 PWA 완전 종료 후 다시 실행
5. Home/MenuDetail/Cart/OrderStatus 실기기 테스트

# 11. 별도 보안 검토

주 기능 구현이 끝난 후, 코드에서 발견되는 보안 문제를 별도 목록으로만 보고하라.

특히 다음을 확인하라.

- /api/v1/dev/seed
- /api/v1/dev/clear
- /api/v1/dev/migrate
- POST /api/v1/orders/admin의 관리자 인증
- 공개 주문 상태 API의 주문 ID 열거 가능성
- 인증 없는 WebSocket에서 모든 주문 이벤트를 받는 구조

이 보안 항목들은 이번 실시간 영업 상태 패치와 같은 변경에 몰래 포함하지 말고, 위험도와 권장 조치만 별도 보고하라.

# 12. 작업 원칙

- 먼저 실제 코드를 읽고 현재 타입과 응답 구조에 맞게 구현할 것
- 위 예시를 맹목적으로 복사하지 말 것
- 기존 기능을 보존하는 최소 변경을 우선할 것
- 임시 우회보다 재연결, 폴링, 전면 복귀 복구까지 포함한 견고한 구조를 만들 것
- 계획만 제시하고 멈추지 말고 코드 수정과 검증까지 완료할 것
- 불확실한 부분은 추측하지 말고 결과 보고에 명시할 것