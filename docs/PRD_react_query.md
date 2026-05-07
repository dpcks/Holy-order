
# Holy-Order React Query (TanStack Query v5) 도입 PRD

## 1. 배경

Holy-Order는 현재 다음과 같은 환경에서 운영됩니다.

- 프론트엔드: Vercel (한국 리전)
- 백엔드: Railway (싱가포르 리전, 한국 리전 미제공)
- 이미지 스토리지: Cloudinary
- 실시간 주문 처리: WebSocket
- 인증: JWT 기반 관리자 로그인

운영 중 다음 문제가 발생합니다.

- 관리자 페이지 이동 시 매번 fetch가 발생하여 체감 속도가 느림
- 한국–싱가포르 왕복 지연으로 단순 fetch도 200~500ms 소요
- 동일 데이터를 여러 화면에서 반복 fetch
- 화면 이동 시마다 로딩 깜빡임 발생

이 문제를 해결하기 위해 TanStack Query v5(이하 React Query)를 도입합니다.

## 2. 목표

- 관리자 페이지 이동 시 캐시 데이터 즉시 표시
- 동일 데이터에 대한 중복 fetch 제거
- WebSocket과 결합한 실시간성 유지
- 한국-싱가포르 환경에서의 체감 속도 개선
- 운영 중 fetch 폭증 없는 안정적 캐시 운영

## 3. 비목표

- 사용자 화면(QR 주문 흐름) 전면 전환은 최소화
- 라우팅 구조 변경 없음
- 기존 axios 인터셉터 구조 유지
- 인증 방식 변경 없음
- 기능 추가 없음

## 4. 기대 효과

- 관리자 페이지 재방문 시 즉시 표시 (stale-while-revalidate)
- WebSocket으로 트리거되는 invalidate 기반 일관된 갱신
- 페이지 이동 시 깜빡임 제거
- 중복 fetch 제거로 Railway 부하 감소
- 통계, 매출, 메뉴 등 자주 보는 데이터의 응답 지연 완화

## 5. 적용 범위

### 5-1. React Query 적용 대상
- 관리자 모든 데이터 조회/수정 화면
- 사용자 일부 화면(메뉴 목록, 활성 공지)
- 관리자 부가 데이터(KPI 카드 등)

### 5-2. 적용 제외 대상
- 관리자 실시간 주문 보드 데이터
  (이미 WebSocket으로 처리되므로 React Query 캐싱 제외)

## 6. 정책

### 6-1. QueryClient 기본 옵션
모든 query에 적용되는 기본 정책

```ts
{
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
  refetchOnWindowFocus: false,
  refetchOnReconnect: true,
  retry: 1,
}
```

mutation 기본 정책

```ts
{
  retry: 0,
}
```

### 6-2. staleTime 정책

| 데이터 | staleTime | 비고 |
|---|---|---|
| 주문 보드 (관리자 실시간) | 적용 안 함 | WebSocket 사용 |
| 주문 내역 (history) | 1분 | |
| 입금 내역 | 1분 | |
| 매출 통계 | 1분 | 기간/날짜를 queryKey로 분리 |
| 카테고리/메뉴 | 5분 | |
| 설정 | 5분 | |
| 봉사 스케줄 | 5분 | |
| 봉사자 마스터 | 10분 | |
| 공지/이벤트 | 5분 | |
| 활성 공지 (사용자) | 1분 | |
| 재고 | 5분 | |

### 6-3. queryKey 컨벤션
중앙에서 관리합니다.
- 위치: `frontend/src/api/queryKeys.ts`
- 형식: `[도메인, 종류, 매개변수]`

예시
- `['menus']`
- `['orders', 'history', filters]`
- `['stats', 'sales', period, date]`
- `['announcements', 'active']`
- `['ingredients', 'alerts']`

### 6-4. invalidate 매핑 정책

| 액션 | invalidate 대상 |
|---|---|
| 메뉴 변경 | `['menus']`, `['categories']` |
| 카테고리 변경 | `['menus']`, `['categories']` |
| 공지 변경/활성화 | `['announcements']`, `['announcements','active']` |
| 봉사자 변경 | `['volunteers']` |
| 봉사 스케줄 변경 | `['schedules']` |
| 결제 승인 | `['orders']`, `['payments']` |
| 주문 상태 변경 | `['orders']` |
| 재고 변경 | `['ingredients']`, `['ingredients','alerts']` |
| 설정 저장 | `['settings']` |

### 6-5. WebSocket 이벤트 → invalidate 매핑

| WebSocket 이벤트 | invalidateQueries |
|---|---|
| ORDER_UPDATED | `['orders']` |
| NEW_ORDER | `['orders']` |
| MENU_UPDATED | `['menus']`, `['categories']` |
| CATEGORY_UPDATED | `['menus']`, `['categories']` |
| ANNOUNCEMENT_UPDATED | `['announcements']`, `['announcements','active']` |
| INGREDIENT_UPDATED | `['ingredients']`, `['ingredients','alerts']` |
| SETTING_UPDATED | `['settings']` |

## 7. 위험 관리

### 7-1. 캐시 꼬임 가능성
- queryKey 컨벤션 문서화로 예방

### 7-2. invalidate 누락
- mutation별 invalidate 매핑 정책 강제

### 7-3. WebSocket invalidate 폭증 가능성
- 도메인 단위 invalidate
- 디바운스 검토

### 7-4. 사용자 화면 staleTime 정책
- 활성 공지, 메뉴는 staleTime 1~5분
- WebSocket invalidate가 핵심 갱신 트리거

## 8. 검증 계획

### 자동 검증
- `npx tsc --noEmit`
- `npm run lint`

### 수동 검증
- 관리자 페이지 이동 시 즉시 표시 여부
- mutation 후 목록 즉시 갱신
- WebSocket 이벤트로 사용자 화면 즉시 반영
- DevTools Network에서 fetch 횟수 감소 확인
- React Query Devtools에서 캐시 상태 확인

### 운영 검증
- 30분 이상 관리자 화면 방치 후 정상 동작
- 주말 운영 동안 캐시 정책의 실제 적합성 확인

## 9. 도입 단계

1. QueryClient 설정 및 queryKeys 정의
2. 관리자 페이지 1순위 적용
3. 관리자 페이지 2~3순위 적용
4. 사용자 페이지 적용
5. AdminOrderManagement 부가 데이터 적용
6. OrderStatus 검토
