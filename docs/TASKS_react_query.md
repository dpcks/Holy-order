
# Holy-Order React Query 도입 작업 명세서 (TASK)

이 문서는 PRD_react_query.md를 기반으로 한 실제 작업 단계입니다.
안티그래비티가 이 문서를 기반으로 작업할 수 있도록
모든 변경 파일과 적용 패턴을 구체적으로 정의합니다.

기존 기능을 깨지 않고 점진적으로 도입하는 것이 핵심입니다.

---

## 0. 사전 작업

### 패키지 설치

```bash
npm install @tanstack/react-query
npm install -D @tanstack/react-query-devtools
```

---

## 1. 기반 설정

### 1-1. QueryClient + Provider
파일: `frontend/src/main.tsx`

작업
- `QueryClient` 생성
- 기본 옵션 정책 적용
  - staleTime: 5 * 60 * 1000
  - gcTime: 30 * 60 * 1000
  - refetchOnWindowFocus: false
  - retry: 1
- `<QueryClientProvider>`로 앱 전체 감쌈
- React Query Devtools는 dev 모드에서만 표시

### 1-2. queryKeys 중앙 관리
파일: `frontend/src/api/queryKeys.ts` (신규)

작업
- 도메인별 queryKey 정의
- PRD에 명시된 컨벤션 그대로 적용
  - 배열 첫 번째 요소: 도메인
  - 두 번째 요소: 종류
  - 세 번째 이후: 매개변수

---

## 2. 관리자 페이지 마이그레이션 (1순위)

### 2-1. AdminMenuManagement
- 메뉴/카테고리 목록 조회 → useQuery
- 메뉴 CRUD → useMutation
- mutation 성공 시 invalidate
  - `['menus']`
  - `['categories']`

### 2-2. AdminAnnouncements
- 공지/이벤트 목록 → useQuery
- 활성화/종료/CRUD → useMutation
- mutation 성공 시 invalidate
  - `['announcements']`
  - `['announcements', 'active']`

### 2-3. AdminSettings
- 시스템 설정 조회 → useQuery
- 저장 → useMutation
- invalidate
  - `['settings']`

### 2-4. AdminSchedule
- 봉사 스케줄 → useQuery
- 봉사자 명단 → useQuery
- 스케줄 / 봉사자 CRUD → useMutation
- invalidate
  - `['schedules']`
  - `['volunteers']`

### 2-5. AdminIngredients
- 재고 목록 / 부족 재고 → useQuery
- 재고 CRUD → useMutation
- invalidate
  - `['ingredients']`
  - `['ingredients', 'alerts']`

---

## 3. 관리자 페이지 마이그레이션 (2순위)

### 3-1. AdminSalesReports
- 통계 데이터 → useQuery
- queryKey: `['stats', 'sales', period, date]`
- staleTime: 1분

### 3-2. AdminOrderHistory
- 주문 내역 → useQuery
- queryKey: `['orders', 'history', filters]`
- staleTime: 1분

### 3-3. AdminPaymentLogs
- 입금 내역 → useQuery
- queryKey: `['payments', filters]`
- staleTime: 1분

---

## 4. 사용자 페이지 마이그레이션 (3순위)

### 4-1. Home.tsx
- `/categories` → useQuery
- `/announcements/active` → useQuery
- staleTime: 5분
- WebSocket 이벤트로 invalidate

### 4-2. OrderStatus.tsx
- 부분 적용
- 주문 상태(`/orders/status/{id}`) → useQuery
- WebSocket 이벤트(ORDER_UPDATED) 수신 시 invalidate
- 폴링 fallback 유지

---

## 5. 부가 데이터 마이그레이션 (4순위)

### 5-1. AdminOrderManagement (실시간 보드 SKIP)
- 실시간 주문 리스트는 WebSocket 유지
- 단, 부가 데이터(KPI 카드 등)는 useQuery 적용 가능

---

## 6. WebSocket → invalidateQueries 적용

### 6-1. 적용 위치
- 관리자 화면: AdminLayout 또는 별도 hook (`useRealtimeInvalidate`)
- 사용자 화면: Home.tsx, OrderStatus.tsx

### 6-2. 처리 패턴

```ts
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  switch (data.type) {
    case 'ORDER_UPDATED':
    case 'NEW_ORDER':
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      break;
    case 'MENU_UPDATED':
    case 'CATEGORY_UPDATED':
      queryClient.invalidateQueries({ queryKey: ['menus'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      break;
    case 'ANNOUNCEMENT_UPDATED':
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
      queryClient.invalidateQueries({ queryKey: ['announcements', 'active'] });
      break;
    case 'INGREDIENT_UPDATED':
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
      queryClient.invalidateQueries({ queryKey: ['ingredients', 'alerts'] });
      break;
    case 'SETTING_UPDATED':
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      break;
  }
};
```

---

## 7. 컨벤션 강제

### 7-1. queryKey
- queryKeys.ts에 정의된 키만 사용
- 컴포넌트 내부에서 임의 string array 사용 금지

### 7-2. mutation
- mutation 성공 시 invalidate 누락 금지
- invalidate는 PRD invalidate 매핑 표 기준

### 7-3. 인터셉터
- 기존 client.ts 인터셉터(토큰, 401 처리) 유지
- 변경 금지

### 7-4. 페이지 구조
- 페이지에서 직접 fetch 금지
- 모든 fetch는 useQuery / useMutation

---

## 8. 출력 방식 (안티그래비티 요청 시)

1. 변경/추가될 파일 목록을 먼저 정리
2. 파일별 변경 코드만 제시
3. 전체 파일 재출력 금지
4. mutation/invalidate 매핑은 PRD를 그대로 따를 것
5. 코드 스타일과 기존 구조는 최대한 유지

---

## 9. 검증

### 빌드 검증
- `npx tsc --noEmit` 통과
- `npm run build` 통과

### 동작 검증
- 페이지 이동 시 즉시 표시
- mutation 후 목록 자동 갱신
- WebSocket 이벤트로 캐시 즉시 갱신
- DevTools Network 호출 감소
- React Query Devtools에서 캐시 일관성 확인

---

## 10. 단계별 적용 순서

1. main.tsx + queryKeys.ts
2. AdminMenuManagement
3. AdminAnnouncements
4. AdminSettings
5. AdminSchedule
6. AdminIngredients
7. AdminSalesReports
8. AdminOrderHistory
9. AdminPaymentLogs
10. Home.tsx
11. OrderStatus.tsx
12. WebSocket invalidate
13. AdminOrderManagement 부가 데이터

---

## 11. 종료 조건

- 모든 페이지에서 React Query 패턴 적용 완료
- WebSocket invalidate 정상 동작
- 빌드 / 타입 체크 통과
- 운영 환경에서 fetch 빈도 감소 확인
- 페이지 재방문 시 즉시 표시 확인
```

---

