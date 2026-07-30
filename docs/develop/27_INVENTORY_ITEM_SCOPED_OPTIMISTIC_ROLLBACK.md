# 재고 수량 수정의 품목 단위 Optimistic Rollback 안정화

## 0. 문서 목적

이 문서는 재고 관리 UI를 다시 디자인하는 작업이 아니다.

현재 재고 관리 화면의 다음 기능은 유지한다.

```text
품절·주문 필요·주의·정상 상태 표시
요약 카드
오늘 확인할 품목
상태·카테고리 필터
데스크톱 표·모바일 카드
수량 - / + 빠른 수정
current_stock 부분 PATCH
React Query optimistic update
저장 중 품목 표시
```

이번 작업의 목적은 **한 품목의 수량 저장 요청이 실패했을 때 전체 재고 목록 snapshot을 복원하여, 이미 성공한 다른 품목의 화면 값까지 되돌리는 경쟁 조건을 제거하는 것**이다.

---

# 1. 현재 문제

현재 optimistic mutation이 변경 전 전체 `Ingredient[]`를 snapshot으로 저장하고, 오류 시 전체 목록을 복원한다면 다음 상황이 가능하다.

```text
초기 상태
우유 5
컵 10

1. 우유 +1 요청 시작
   화면: 우유 6, 컵 10
   snapshot A: 우유 5, 컵 10

2. 컵 +1 요청 시작
   화면: 우유 6, 컵 11
   snapshot B: 우유 6, 컵 10

3. 컵 요청 성공
   서버: 우유 5, 컵 11

4. 우유 요청 실패
   snapshot A 전체 복원
   화면: 우유 5, 컵 10
```

컵 요청은 성공했지만 화면에서 10으로 되돌아간다.

다음 refetch가 실행되면 회복될 수 있지만, 그 전까지 관리자에게 잘못된 수량을 보여준다.

---

# 2. 완료 목표

```text
실패한 품목의 값만 롤백
성공한 다른 품목 값 유지
품목 ID별 saving 상태 유지
동일 품목의 중복 클릭 방지
mutation 종료 후 서버 값으로 재검증
실패 토스트는 한 번만 표시
재고 상태 카드와 필터가 즉시 올바르게 재계산
```

## 제외 범위

```text
재고 UI 재디자인
재고 이력 모델 추가
자동 재고 차감
구매 워크플로우
백엔드 API 경로 변경
Ingredient DB 컬럼 변경
전역 React Query 구조 변경
```

---

# 3. 권장 구현

## 3-1. 전체 목록 snapshot 제거

`onMutate` context에는 전체 배열 대신 변경 대상 품목의 이전 값만 저장한다.

```ts
type StockMutationVariables = {
  id: number;
  nextStock: number;
};

type StockMutationContext = {
  id: number;
  previousStock: number;
};
```

권장 코드:

```ts
const stockMutation = useMutation({
  mutationFn: async ({
    id,
    nextStock,
  }: StockMutationVariables) => {
    const response = await apiClient.patch(
      `/admin/ingredients/${id}`,
      {
        current_stock: nextStock,
      },
    );

    return response;
  },

  onMutate: async ({ id, nextStock }) => {
    setSavingIds((previous) => {
      const next = new Set(previous);
      next.add(id);
      return next;
    });

    await queryClient.cancelQueries({
      queryKey: QK.ingredients.list,
    });

    const items =
      queryClient.getQueryData<Ingredient[]>(
        QK.ingredients.list,
      ) ?? [];

    const target = items.find(
      (item) => item.id === id,
    );

    if (!target) {
      throw new Error(
        `재고 품목을 찾을 수 없습니다: ${id}`,
      );
    }

    const previousStock = target.current_stock;

    queryClient.setQueryData<Ingredient[]>(
      QK.ingredients.list,
      (oldItems) =>
        (oldItems ?? []).map((item) =>
          item.id === id
            ? {
                ...item,
                current_stock: nextStock,
              }
            : item,
        ),
    );

    return {
      id,
      previousStock,
    } satisfies StockMutationContext;
  },

  onError: (
    error,
    variables,
    context,
  ) => {
    if (context) {
      queryClient.setQueryData<Ingredient[]>(
        QK.ingredients.list,
        (oldItems) =>
          (oldItems ?? []).map((item) =>
            item.id === context.id
              ? {
                  ...item,
                  current_stock:
                    context.previousStock,
                }
              : item,
          ),
      );
    }

    toast.error(
      '재고 수량 저장에 실패했습니다.',
      {
        id: `ingredient-stock-${variables.id}`,
      },
    );
  },

  onSettled: (
    _data,
    _error,
    variables,
  ) => {
    setSavingIds((previous) => {
      const next = new Set(previous);
      next.delete(variables.id);
      return next;
    });

    void queryClient.invalidateQueries({
      queryKey: QK.ingredients.list,
    });
  },
});
```

문서의 예시를 그대로 복사하지 말고 현재 `apiClient` 반환 타입과 Query Key에 맞춘다.

## 3-2. 동일 품목 중복 mutation 방지

품목 단위 롤백만으로 다른 품목 간 경쟁 조건은 해결된다.

하지만 같은 품목에 여러 요청이 동시에 발생하면 다음 문제가 생길 수 있다.

```text
우유 5 → +1 요청 A
우유 6 → +1 요청 B
B 성공 후 A 실패
→ 단순 previousStock 롤백 순서가 꼬일 수 있음
```

현재 UI가 `savingIds.has(id)`일 때 해당 품목 버튼을 비활성화한다면 이 정책을 유지하고 테스트로 고정한다.

```tsx
const isSaving = savingIds.has(item.id);

<button
  disabled={isSaving}
  onClick={() => updateStock(item, -1)}
>
```

직접 입력·Drawer 저장·모바일 카드·데스크톱 표 등 모든 수량 변경 진입점에서 같은 품목의 요청 중복을 막아야 한다.

다른 품목은 동시에 수정할 수 있어야 한다.

```text
우유 저장 중
→ 우유 버튼 비활성
→ 컵 버튼은 사용 가능
```

## 3-3. 이전 값이 없는 경우

캐시에 품목이 없으면 optimistic update를 진행하지 않는다.

다음 중 하나로 처리한다.

```text
mutation 실행 전 목록 refetch
또는
optimistic update 없이 서버 요청 후 invalidate
```

전체 배열을 빈 배열로 덮어쓰지 않는다.

## 3-4. 서버 응답 적용

PATCH 응답이 수정된 `Ingredient`를 반환한다면 성공 시 해당 품목만 서버 응답으로 교체한다.

```ts
onSuccess: (response, variables) => {
  if (!response.success || !response.data) return;

  queryClient.setQueryData<Ingredient[]>(
    QK.ingredients.list,
    (oldItems) =>
      (oldItems ?? []).map((item) =>
        item.id === variables.id
          ? response.data
          : item,
      ),
  );
}
```

현재 API가 data를 반환하지 않는다면 `onSettled` invalidate로 서버 값을 재조회한다.

API 계약을 이번 작업에서 불필요하게 변경하지 않는다.

## 3-5. 저장 상태와 접근성

저장 중에는 해당 품목만 다음 상태를 표현한다.

```text
- / + 버튼 disabled
spinner 또는 저장 중 텍스트
aria-busy=true
```

예:

```tsx
<div aria-busy={isSaving}>
```

화면 전체를 잠그지 않는다.

---

# 4. 실패 시 UX

오류가 발생하면 다음 순서로 동작한다.

```text
1. 실패한 품목만 이전 수량으로 복원
2. 다른 품목의 optimistic·성공 값 유지
3. 해당 품목 저장 상태 해제
4. 오류 토스트 1회
5. 목록 invalidate로 서버 최종 값 확인
```

네트워크 오류 메시지와 페이지 자체 토스트가 중복되지 않도록 현재 `apiClient`의 전역 토스트 정책을 확인한다.

필요하면 해당 PATCH 요청에 기존 프로젝트의 `skipGlobalErrorToast` 옵션을 사용한다.

---

# 5. 테스트 요구사항

## 핵심 경쟁 조건 테스트

deferred Promise 또는 mock server를 사용한다.

### 다른 품목 동시 수정

```text
초기: 우유 5, 컵 10
우유 +1 요청 pending
컵 +1 요청 pending
컵 요청 success
우유 요청 failure

기대:
우유 5
컵 11
```

### 성공·실패 순서 반대

```text
우유 failure 먼저
컵 success 나중

기대:
우유 5
컵 11
```

### 같은 품목 중복 클릭

```text
우유 요청 pending
우유 + 버튼 다시 클릭
→ 두 번째 mutation 실행 안 됨
```

### savingIds

```text
우유 저장 중
→ savingIds = {우유 ID}
→ 컵은 저장 가능
→ 우유 settle 후 Set에서 제거
```

### invalidate 후 서버 정합성

```text
mutation settle
→ ingredients list invalidate
→ 서버 최종 값 반영
```

### 오류 토스트

```text
한 요청 실패
→ 토스트 1개
→ 다른 품목 성공 토스트·상태에 영향 없음
```

## 백엔드 회귀 테스트

기존 PATCH가 `current_stock` 하나만 받아 다른 필드를 변경하지 않는지 확인한다.

```text
current_stock PATCH
→ name/category/unit/threshold/memo 유지
→ 음수 값은 422 또는 명세된 오류
```

---

# 6. 수동 QA

## 시나리오 A — 다른 품목 연속 수정

```text
네트워크 throttling 활성화
우유 +1
즉시 컵 +1
한 요청만 실패하도록 mock
→ 실패 품목만 되돌아감
```

## 시나리오 B — 같은 품목 빠른 연타

```text
우유 + 버튼 여러 번 빠르게 탭
→ 요청 중에는 추가 입력 차단
→ 요청 완료 후 다시 수정 가능
```

## 시나리오 C — 모바일·데스크톱 동시 진입점

```text
데스크톱 표의 + / -
모바일 카드의 + / -
Drawer 직접 입력
```

모든 경로가 동일한 품목 단위 mutation 정책을 사용해야 한다.

## 시나리오 D — 상태 재계산

```text
주문 필요 → 정상
정상 → 주의
1 → 0 품절
```

optimistic update와 rollback 시 상단 요약 카드, 필터 결과, 오늘 확인할 품목이 즉시 올바르게 바뀌어야 한다.

---

# 7. 완료 기준

```text
전체 Ingredient[] snapshot 롤백 제거
context에 id와 previousStock만 저장
실패한 품목만 복원
다른 품목 성공 값 유지
동일 품목 동시 요청 방지
다른 품목 동시 요청 허용
settled 후 서버 재조회
테스트로 경쟁 조건 재현 및 통과
npm run lint 통과
npm run build 통과
pytest 통과
```

---

# 8. 배포 순서

1. 프런트 mutation 테스트 추가
2. 품목 단위 optimistic context 적용
3. 모든 수량 변경 진입점의 savingIds 확인
4. lint·build
5. 기존 백엔드 재고 테스트 실행
6. Vercel 배포
7. 네트워크 throttling 수동 QA

DB 마이그레이션은 필요하지 않다.

---

# 9. 롤백

문제가 생기면 stock mutation의 `onMutate`, `onError`, `onSettled` 변경만 되돌린다.

재고 UI 리디자인, 상태 계산, 백엔드 음수 검증은 유지한다.

롤백 후에도 서버 최종 값은 invalidate로 복구할 수 있도록 유지한다.
