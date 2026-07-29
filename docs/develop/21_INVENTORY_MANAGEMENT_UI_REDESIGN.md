# 21. 관리자 재고 관리 화면 재구성

## 문서 목적

이 문서는 Holy-order 관리자 재고 관리 화면을 현재의 가로형 Kanban Board에서, 관리자가 부족 품목과 현재 수량을 빠르게 파악하고 수정할 수 있는 **재고 점검 대시보드 + 우선순위 목록 + 반응형 표/카드 화면**으로 재구성하기 위한 구현 명세다.

Antigravity는 계획이나 예시만 제시하지 말고 실제 저장소의 최신 코드를 먼저 조사한 뒤, 이 문서의 범위 안에서 코드를 수정하고 테스트와 빌드까지 수행해야 한다.

---

# 1. 작업 목표

관리자가 재고 관리 화면에 들어온 뒤 3초 이내에 다음 질문에 답할 수 있어야 한다.

1. 지금 완전히 품절된 품목은 무엇인가?
2. 지금 바로 구매해야 하는 품목은 무엇인가?
3. 곧 부족해질 품목은 무엇인가?
4. 각 품목의 현재 재고와 부족 기준은 얼마인가?
5. 재고 수량을 가장 적은 클릭으로 어떻게 수정하는가?
6. 구매가 필요한 품목을 단체방에 어떻게 공유하는가?

최종 화면은 다음 우선순위를 가져야 한다.

```text
부족 품목 확인
→ 필요한 품목 검색·필터
→ 수량 빠른 조정
→ 상세 정보 수정
→ 신규 품목 추가 및 삭제
```

예쁜 카드 배치보다 **상태의 정확성, 비교 가능성, 빠른 수정, 실수 방지**를 우선한다.

---

# 2. 현재 저장소에서 확인해야 할 파일

작업 전 아래 파일을 전체 검색하고 최신 구조를 확인한다.

## 프런트엔드

```text
frontend/src/pages/admin/AdminIngredients.tsx
frontend/src/api/queryKeys.ts
frontend/src/api/client.ts
frontend/src/types/index.ts
frontend/src/pages/admin/AdminLayout.tsx
frontend/src/components/ui/*
frontend/src/index.css
frontend/package.json
```

## 백엔드

```text
backend/models.py
backend/schemas.py
backend/routers/admin.py
backend/tests/*
```

## 검색 명령 예시

```bash
rg -n \
  "AdminIngredients|Ingredient|ingredients|alert_threshold|current_stock|QK\.ingredients|재고 관리|주문 필요" \
  frontend/src backend
```

문서의 코드 예시를 그대로 복사하지 말고 현재 타입, API 응답 구조, Tailwind 버전, 공통 컴포넌트에 맞게 구현한다.

---

# 3. 현재 구조와 확인된 문제

## 3-1. 현재 화면은 가로형 Kanban Board

현재 `AdminIngredients.tsx`는 대략 다음 세 열을 사용한다.

```text
주문 필요
재료
소모품
```

재고 관리는 주문처럼 단계가 이동하는 업무가 아니다. 관리자의 주된 작업은 여러 품목의 현재 수량을 비교하고 부족한 품목을 빠르게 수정하는 것이다.

현재의 가로 스크롤과 열 내부 세로 스크롤은 다음 문제를 만든다.

- 화면 전체를 한눈에 비교하기 어렵다.
- iPad와 관리자 PWA에서 중첩 스크롤이 불편하다.
- 품목이 많아질수록 가로 탐색 비용이 커진다.
- 상태와 카테고리가 서로 다른 기준인데 같은 열처럼 보인다.

## 3-2. 같은 품목이 중복 표시될 수 있음

현재 `주문 필요` 열은 재고 상태로 분류하고, `재료` 및 `소모품` 열은 카테고리로 분류한다.

예를 들어 부족한 우유는 다음 두 곳에 동시에 표시될 수 있다.

```text
주문 필요 열
+
재료 열
```

관리자는 같은 품목이 두 개인지 혼동할 수 있고, 화면에 표시된 카드 수와 실제 품목 수가 달라진다.

새 화면에서는 **한 품목은 목록에 정확히 한 번만 표시**되어야 한다.

## 3-3. 프런트 상태 계산이 백엔드의 임계값 의미와 다름

백엔드의 부족 재고 API는 다음 의미를 사용한다.

```text
current_stock <= alert_threshold
→ 부족 재고
```

그러나 현재 프런트는 다음과 유사한 비율 계산을 사용한다.

```text
current_stock / alert_threshold <= 0.2
→ CRITICAL

current_stock / alert_threshold <= 0.5
→ WARNING
```

예:

```text
현재 재고 8팩
부족 기준 10팩

백엔드 의미
→ 이미 주문 필요

기존 프런트 의미
→ 0.8이므로 정상
```

새 화면은 백엔드의 `alert_threshold` 의미와 일치해야 한다.

## 3-4. `안전 재고` 요약이 주의 품목까지 포함함

현재 안전 재고 수는 전체 수에서 심각 품목만 뺀 값으로 계산될 수 있다.

```text
전체 - CRITICAL = 안전 재고
```

이 경우 곧 부족해질 `WARNING` 품목도 안전 재고에 포함된다.

새 화면은 품절, 주문 필요, 주의, 정상, 기준 미설정을 명확히 분리해야 한다.

## 3-5. 빠른 수량 조정이 전체 폼 PATCH를 사용함

현재 `-1`, `+1` 조작에서도 품목의 전체 필드를 다시 전송하는 구조가 사용될 수 있다.

```text
name
category
unit
current_stock
alert_threshold
memo
display_order
```

백엔드 PATCH는 부분 업데이트를 지원하므로 수량 조정은 다음 값만 전송하는 것이 안전하다.

```json
{
  "current_stock": 12
}
```

또한 한 품목을 저장하는 동안 전체 품목의 수량 버튼이 비활성화되지 않도록, 로딩 상태는 품목별로 관리해야 한다.

## 3-6. 상세 확인과 수정이 두 단계 모달임

현재 흐름은 다음처럼 길 수 있다.

```text
카드 클릭
→ 상세 모달
→ 정보 수정하기
→ 상세 닫기
→ 수정 모달
```

데스크톱과 iPad에서는 목록을 유지한 채 오른쪽 편집 패널에서 바로 수정하는 방식이 더 효율적이다.

---

# 4. 최종 화면 정보 구조

## 4-1. 전체 레이아웃

```text
┌─────────────────────────────────────────────────────────────────┐
│ 재고 관리                  마지막 갱신 11:35      [재고 추가]   │
│ 이번 주 운영에 필요한 재료와 소모품을 점검합니다               │
├─────────────────────────────────────────────────────────────────┤
│ [전체 18] [품절 1] [주문 필요 3] [주의 4] [정상 9] [미설정 1] │
├─────────────────────────────────────────────────────────────────┤
│ 오늘 확인할 품목 4개                     [구매 목록 복사]       │
│ 우유 0팩 · 일회용컵 8개 · 바닐라시럽 4병 · 빨대 50개          │
├─────────────────────────────────────────────────────────────────┤
│ 검색 [____________]  상태 필터  카테고리 필터  부족한 순 ▼     │
├─────────────────────────────────────────────────────────────────┤
│ 상태 │ 품목 │ 카테고리 │ 현재 재고 │ 부족 기준 │ 메모 │ 수정  │
│ 품절 │ 우유 │ 재료     │ [-] 0 [+] │ 3팩       │ ...  │  ⋮    │
│ 주문 │ 컵   │ 소모품   │ [-] 8 [+] │ 10개      │ ...  │  ⋮    │
└─────────────────────────────────────────────────────────────────┘
```

## 4-2. 페이지 상단 헤더

헤더에는 다음을 표시한다.

- 페이지 제목: `재고 관리`
- 보조 문구: `이번 주 운영에 필요한 재료와 소모품을 점검합니다.`
- 가장 최근 `updated_at` 기준의 `마지막 갱신 HH:mm`
- 수동 새로고침 버튼
- `재고 추가` 버튼

기존 관리자 레이아웃과 디자인 언어를 유지한다.

---

# 5. 재고 상태 정의

상태 계산을 컴포넌트 여러 곳에서 중복하지 말고 순수 함수 하나로 관리한다.

권장 타입:

```ts
export type InventoryStatus =
  | 'OUT_OF_STOCK'
  | 'ORDER_REQUIRED'
  | 'WARNING'
  | 'NORMAL'
  | 'UNSET';
```

## 5-1. 정확한 판정 순서

```ts
export const getInventoryStatus = (
  item: Ingredient,
): InventoryStatus => {
  if (item.current_stock <= 0) {
    return 'OUT_OF_STOCK';
  }

  if (item.alert_threshold <= 0) {
    return 'UNSET';
  }

  if (item.current_stock <= item.alert_threshold) {
    return 'ORDER_REQUIRED';
  }

  if (
    item.current_stock <=
    Math.ceil(item.alert_threshold * 1.5)
  ) {
    return 'WARNING';
  }

  return 'NORMAL';
};
```

## 5-2. 상태 의미

| 상태 | 조건 | 사용자 문구 |
|---|---|---|
| `OUT_OF_STOCK` | `current_stock <= 0` | 품절 / 재고 없음 |
| `ORDER_REQUIRED` | `0 < current_stock <= alert_threshold` | 주문 필요 / 구매 필요 |
| `WARNING` | `threshold < current_stock <= threshold × 1.5` | 주의 / 곧 부족 |
| `NORMAL` | 경고 범위보다 많음 | 정상 / 충분 |
| `UNSET` | `alert_threshold <= 0`, 단 재고 0 제외 | 기준 미설정 |

색상만으로 상태를 표현하지 말고 텍스트와 아이콘을 함께 사용한다.

## 5-3. 상태 예시

부족 기준이 10개인 경우:

```text
0개       → 품절
1~10개    → 주문 필요
11~15개   → 주의
16개 이상 → 정상
```

부족 기준이 0인 경우:

```text
현재 재고 0 → 품절
현재 재고 1 이상 → 기준 미설정
```

---

# 6. 상단 상태 요약 카드

다음 카드를 표시한다.

```text
전체
품절
주문 필요
주의
정상
기준 미설정
```

각 카드는 단순 통계가 아니라 클릭 가능한 상태 필터다.

예:

```text
[주문 필요 3]
클릭
→ 아래 목록에서 주문 필요 품목만 표시
```

요구사항:

- 현재 선택된 상태 카드는 명확하게 강조한다.
- 카드의 숫자는 현재 검색어와 카테고리 필터의 영향을 받지 않는 전체 재고 기준으로 표시한다.
- 모바일에서는 가로 스크롤 가능한 요약 칩 또는 2열/3열 그리드로 표시한다.
- `전체` 선택 시 모든 품목을 표시한다.
- `품절`은 `주문 필요`에 중복 포함하지 않는다. 요약 숫자는 상호 배타적이어야 한다.

---

# 7. 오늘 확인할 품목 패널

상태가 다음 중 하나인 품목을 상단에 우선 표시한다.

```text
OUT_OF_STOCK
ORDER_REQUIRED
WARNING
```

정렬 순서:

```text
품절
→ 주문 필요
→ 주의
→ display_order
→ 이름
```

각 품목에는 최소한 다음 정보를 표시한다.

```text
품목명
상태
현재 재고 + 단위
부족 기준 + 단위
부족 수량 또는 주의 문구
```

예:

```text
우유
품절
현재 0팩 / 기준 3팩
3팩 부족
```

```text
바닐라시럽
주의
현재 4병 / 기준 3병
곧 부족
```

부족 품목이 없다면 다음 빈 상태를 표시한다.

```text
현재 바로 확인할 부족 재고가 없습니다.
모든 품목이 정상 범위입니다.
```

---

# 8. 구매 목록 복사

`오늘 확인할 품목` 패널에 `구매 목록 복사` 버튼을 추가한다.

클립보드 형식 예시:

```text
[미션 카페 구매 목록]

- 우유: 현재 0팩 / 기준 3팩 / 3팩 부족
- 일회용컵: 현재 8개 / 기준 10개 / 2개 부족
- 바닐라시럽: 현재 4병 / 기준 3병 / 곧 부족

작성 시각: 2026-07-27 11:35
```

요구사항:

- 품절, 주문 필요, 주의 품목만 포함한다.
- 상태 우선순위대로 정렬한다.
- `navigator.clipboard.writeText()`를 우선 사용한다.
- 지원하지 않는 환경에서는 안전한 textarea fallback을 제공한다.
- 성공 및 실패 피드백을 표시한다.
- 품목이 없으면 복사 버튼을 비활성화한다.
- 개인정보나 관리자 계정 정보는 포함하지 않는다.

---

# 9. 검색, 필터, 정렬

## 9-1. 검색

검색 대상:

```text
품목명
메모
단위
```

대소문자 구분 없이 검색한다.

검색 결과가 없으면 다음 메시지를 표시한다.

```text
조건에 맞는 재고 품목이 없습니다.
검색어나 필터를 변경해 주세요.
```

## 9-2. 상태 필터와 카테고리 필터 분리

현재처럼 `전체 / 소모품 / 재료 / 주문 필요`를 한 줄에 섞지 않는다.

다음 두 필터를 독립적으로 제공한다.

```text
상태
[전체] [품절] [주문 필요] [주의] [정상] [기준 미설정]

카테고리
[전체] [재료] [소모품]
```

두 필터는 동시에 적용 가능해야 한다.

예:

```text
상태 = 주문 필요
카테고리 = 소모품
→ 구매가 필요한 소모품만 표시
```

## 9-3. 정렬

최소 다음 정렬 방식을 제공한다.

```text
부족한 순
품목명 순
최근 수정 순
관리자 지정 순
```

기본 정렬은 `부족한 순`이다.

### 부족한 순 정렬 기준

```text
상태 우선순위
→ 부족 정도
→ display_order
→ 품목명
```

상태 우선순위:

```text
OUT_OF_STOCK = 0
ORDER_REQUIRED = 1
WARNING = 2
UNSET = 3
NORMAL = 4
```

주문 필요 상태 안에서는 부족 수량이 큰 품목을 먼저 표시한다.

```ts
const shortage = Math.max(
  0,
  item.alert_threshold - item.current_stock,
);
```

---

# 10. 데스크톱 및 iPad 목록 UI

## 10-1. 표 기반 구조

데스크톱과 iPad 가로 화면에서는 한 줄에 한 품목을 표시한다.

권장 열:

```text
상태
품목명
카테고리
현재 재고
부족 기준
메모
최근 수정
관리
```

요구사항:

- 헤더는 스크롤 중 상단 고정한다.
- 한 품목은 정확히 한 행에만 표시한다.
- 상태는 텍스트 + 아이콘 + 배지로 표시한다.
- 품목명과 현재 재고를 가장 강하게 강조한다.
- 메모는 한 줄 말줄임 표시하고 전체 내용은 편집 패널에서 확인한다.
- `updated_at`은 `오늘 11:35`, `어제 14:20`, `7월 21일` 형태로 읽기 쉽게 표시한다.
- 표의 행 전체 클릭으로 상세 편집 패널을 연다.
- `-`, `+`, 직접 입력 영역을 클릭할 때는 행 클릭이 발생하지 않게 한다.

## 10-2. 가로 스크롤 최소화

관리자 레이아웃의 남은 너비 안에서 핵심 열이 보이도록 한다.

우선순위가 낮은 열은 좁은 화면에서 숨길 수 있다.

```text
메모
최근 수정
```

그러나 품목명, 상태, 현재 재고, 기준, 수량 조정은 항상 보여야 한다.

---

# 11. 모바일 관리자 PWA UI

좁은 화면에서는 표 대신 세로 카드 목록을 사용한다.

예:

```text
┌─────────────────────────────┐
│ 🔴 주문 필요        재료     │
│ 우유                        │
│                             │
│ 현재 2팩     부족 기준 3팩   │
│                             │
│       [-]   2팩   [+]        │
│ 구매처: 교회 앞 마트         │
└─────────────────────────────┘
```

요구사항:

- 한 카드에 상태, 품목명, 현재 재고, 기준, 수량 조정이 보여야 한다.
- 카드 전체 클릭 시 하단 시트 또는 전체 화면 편집 화면을 연다.
- 터치 대상은 최소 44px을 확보한다.
- 모바일에서 중첩 가로 스크롤을 만들지 않는다.
- safe area를 고려한다.

---

# 12. 수량 빠른 조정 UX

## 12-1. `-1`, `+1` 유지

기존의 빠른 수량 조절 기능은 유지한다.

```text
[-]  현재 8개  [+]
```

규칙:

- 수량은 0 미만이 될 수 없다.
- 저장 중에는 해당 품목의 조절 UI만 비활성화한다.
- 다른 품목의 조절 UI는 계속 사용할 수 있어야 한다.
- 저장 중인 행에는 작은 spinner 또는 `저장 중` 상태를 표시한다.
- 실패하면 기존 값으로 되돌리고 오류 메시지를 표시한다.

## 12-2. PATCH는 수량 필드만 전송

수량 변경 API 요청은 다음처럼 최소화한다.

```ts
apiClient.patch(
  `/admin/ingredients/${item.id}`,
  {
    current_stock: nextStock,
  },
);
```

수량 조정 시 이름, 메모, 카테고리 등 다른 필드를 함께 보내지 않는다.

## 12-3. 직접 수량 입력

현재 수량 숫자를 클릭하거나 별도의 입력 버튼을 누르면 직접 수량을 입력할 수 있게 한다.

```text
현재 수량 [ 12 ] 팩
```

요구사항:

- `inputMode="numeric"`
- 0 이상의 정수만 허용
- Enter 또는 저장 버튼으로 반영
- Escape 또는 취소로 원래 값 복원
- 빈 문자열은 바로 0으로 저장하지 않는다.
- blur 저장을 사용한다면 중복 요청이 발생하지 않게 한다.

## 12-4. 동시 요청 안정성

같은 품목에서 저장 요청이 진행 중일 때 추가 클릭으로 서로 다른 값이 역순 저장되지 않게 한다.

최소 구현:

```text
해당 품목 저장 중
→ 그 품목의 조절 버튼만 잠시 비활성화
```

전역 `saving` 값으로 모든 품목을 잠그지 않는다.

---

# 13. React Query 상태 처리

기존 Query Key를 유지한다.

```ts
QK.ingredients.list
QK_DOMAIN.ingredients
```

## 13-1. 조회

```ts
useQuery({
  queryKey: QK.ingredients.list,
  queryFn: fetchIngredients,
});
```

## 13-2. 수량 조정 Mutation

수량 변경 전용 mutation을 일반 정보 저장 mutation과 분리한다.

권장 계약:

```ts
type StockUpdateVariables = {
  id: number;
  nextStock: number;
};
```

가능하면 optimistic update를 적용하되, 구현이 안전하지 않으면 품목별 pending 상태와 성공 후 invalidate 방식을 사용한다.

Optimistic update를 적용할 경우 반드시 다음을 구현한다.

```text
onMutate
→ 해당 Query 취소
→ 이전 목록 snapshot
→ 해당 품목의 current_stock 즉시 변경

onError
→ 이전 snapshot 복구

onSettled
→ ingredients Query 재검증
```

동일 품목에 대한 빠른 연속 요청의 순서를 보장하지 못한다면 optimistic update를 무리하게 적용하지 말고, 해당 행만 잠그는 안전한 구현을 선택한다.

## 13-3. 일반 정보 저장 Mutation

다음 필드의 추가·수정은 기존 모달/패널 저장 mutation을 사용한다.

```text
name
category
unit
current_stock
alert_threshold
memo
display_order
```

## 13-4. 삭제

기존 소프트 삭제 API를 유지한다.

삭제 후:

```ts
void queryClient.invalidateQueries({
  queryKey: QK_DOMAIN.ingredients,
});
```

---

# 14. 상세 및 편집 UI

## 14-1. 데스크톱·iPad

품목 행을 클릭하면 오른쪽 편집 Drawer를 연다.

권장 내용:

```text
품목명
상태
카테고리
단위
현재 재고
부족 기준
메모
정렬 순서
최근 수정 시각
삭제
저장
```

예:

```text
┌────────────────────────────────┐
│ 우유                       [X] │
├────────────────────────────────┤
│ 상태        🔴 주문 필요       │
│ 카테고리    재료               │
│ 단위        팩                 │
│ 현재 재고   [2]                │
│ 부족 기준   [3]                │
│ 메모        [교회 앞 마트]     │
│ 정렬 순서   [1]                │
│                                │
│ [삭제]              [저장]     │
└────────────────────────────────┘
```

Drawer가 열려 있어도 왼쪽 재고 목록이 유지되어야 한다.

## 14-2. 모바일

하단 시트 또는 전체 화면 편집 화면을 사용한다.

- 배경 스크롤을 잠근다.
- 닫기 버튼과 명확한 제목을 제공한다.
- 키보드가 열려도 저장 버튼에 접근할 수 있어야 한다.

## 14-3. 신규 품목 추가

`재고 추가`는 기존 기능을 유지하되 새 디자인과 동일한 입력 컴포넌트를 재사용한다.

신규 품목 기본값:

```text
category = 재료
current_stock = 0
alert_threshold = 0
```

`alert_threshold = 0`은 정상 재고가 아니라 `기준 미설정` 상태로 표시된다는 점을 폼에 안내한다.

## 14-4. 삭제 확인

삭제 확인 문구에는 품목명을 포함한다.

```text
'우유' 재고 항목을 삭제하시겠습니까?
삭제 후 재고 목록에서 보이지 않습니다.
```

확인 버튼은 파괴적 동작임을 명확히 표시한다.

---

# 15. 입력 검증

## 15-1. 프런트엔드

다음을 검증한다.

- 품목명은 공백 제거 후 비어 있을 수 없음
- 현재 재고는 0 이상의 정수
- 부족 기준은 0 이상의 정수
- 정렬 순서는 0 이상의 정수
- 단위와 메모는 앞뒤 공백 정리
- 너무 긴 품목명과 메모는 UI를 깨뜨리지 않음

## 15-2. 백엔드

프런트엔드 검증만 보안 경계로 사용하지 않는다.

기존 Pydantic 스키마에 최소한 다음 제약을 추가한다.

```python
class IngredientCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    current_stock: int = Field(default=0, ge=0)
    alert_threshold: int = Field(default=0, ge=0)
    display_order: int = Field(default=0, ge=0)


class IngredientUpdate(BaseModel):
    name: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=100,
    )
    current_stock: Optional[int] = Field(
        default=None,
        ge=0,
    )
    alert_threshold: Optional[int] = Field(
        default=None,
        ge=0,
    )
    display_order: Optional[int] = Field(
        default=None,
        ge=0,
    )
```

정확한 최대 길이는 현재 DB 컬럼과 운영 데이터를 확인해 결정한다.

DB 마이그레이션은 이번 작업에 필요하지 않다.

---

# 16. API 및 데이터 구조 정책

현재 API 경로를 유지한다.

```text
GET    /api/v1/admin/ingredients
GET    /api/v1/admin/ingredients/alerts
POST   /api/v1/admin/ingredients
PATCH  /api/v1/admin/ingredients/{id}
DELETE /api/v1/admin/ingredients/{id}
```

현재 `Ingredient` 모델을 유지한다.

```text
name
category
unit
current_stock
alert_threshold
memo
is_active
display_order
created_at
updated_at
```

이번 작업에서는 다음을 추가하지 않는다.

- 재고 이동 이력 테이블
- 구매 주문 테이블
- 메뉴 레시피 연결
- 주문 완료 시 자동 재고 차감
- 유통기한 배치 관리
- 바코드 스캔

발견한 필요성은 결과 보고의 후속 작업으로만 기록한다.

---

# 17. 컴포넌트 구조 권장안

`AdminIngredients.tsx`가 지나치게 커지지 않도록 적절히 분리할 수 있다.

예시:

```text
frontend/src/pages/admin/inventory/
├─ inventoryStatus.ts
├─ InventorySummaryCards.tsx
├─ PriorityInventoryPanel.tsx
├─ InventoryToolbar.tsx
├─ InventoryTable.tsx
├─ InventoryMobileList.tsx
├─ InventoryStockControl.tsx
└─ InventoryEditorDrawer.tsx
```

반드시 이 경로를 그대로 사용할 필요는 없다.

원칙:

- 상태 계산은 순수 함수로 분리
- 같은 필터·정렬 로직을 데스크톱 표와 모바일 카드에서 공유
- 동일한 편집 폼을 신규 추가와 수정에 재사용
- 불필요한 전역 상태 라이브러리 추가 금지
- 현재 프로젝트의 React Query와 로컬 state 구조 활용

---

# 18. 접근성 및 사용성

다음을 만족해야 한다.

- 아이콘 버튼에는 `aria-label` 또는 `title` 제공
- 수량 버튼의 터치 영역 최소 44px
- 상태를 색만으로 표현하지 않음
- 키보드로 검색, 필터, 수량 조정, Drawer 닫기 가능
- focus-visible 스타일 유지
- 모달·Drawer가 열리면 초점을 내부로 이동
- 닫을 때 원래 선택한 행으로 초점 복귀
- 삭제와 저장 버튼의 위치와 색을 명확히 구분
- 모든 숫자에는 단위를 함께 표시
- 로딩 중 중복 클릭 방지

---

# 19. 로딩, 오류, 빈 상태

## 로딩

- 전체 화면 텍스트 `로딩 중...`만 표시하지 않는다.
- 요약 카드와 목록에 skeleton을 제공한다.
- 기존 목록이 있는 background refetch에서는 화면을 비우지 않는다.

## 오류

다음을 표시한다.

```text
재고 정보를 불러오지 못했습니다.
네트워크 상태를 확인한 후 다시 시도해 주세요.
[다시 시도]
```

## 빈 재고

```text
등록된 재고 품목이 없습니다.
첫 재고 품목을 추가해 주세요.
[재고 추가]
```

## 필터 결과 없음

```text
조건에 맞는 재고 품목이 없습니다.
검색어나 필터를 변경해 주세요.
[필터 초기화]
```

---

# 20. 백엔드 테스트

기존 테스트 구조를 확인하고 다음을 추가한다.

## 20-1. 부족 알림 기준

```text
current_stock == alert_threshold
→ /ingredients/alerts에 포함

current_stock < alert_threshold
→ 포함

current_stock > alert_threshold
→ 제외
```

## 20-2. 음수 값 차단

```text
current_stock = -1
→ 422

alert_threshold = -1
→ 422

display_order = -1
→ 422
```

## 20-3. 부분 업데이트

```text
PATCH {current_stock: 12}
→ 현재 재고만 변경
→ 이름, 단위, 메모, 기준값 유지
```

## 20-4. 인증

재고 조회·추가·수정·삭제 API는 관리자 인증 없이 접근할 수 없어야 한다.

현재 테스트 fixture가 인증을 override한다면, 인증 실패 전용 client 또는 별도 테스트 방식을 사용한다.

## 20-5. 소프트 삭제

```text
DELETE
→ is_active = false
→ 일반 목록에서 제외
```

실행:

```bash
cd backend
pytest
```

---

# 21. 프런트엔드 검증

최소 다음 명령을 실행한다.

```bash
cd frontend
npm run lint
npm run build
```

완료 기준:

- TypeScript 오류 0건
- 새 lint 오류 0건
- 사용하지 않는 import 없음
- 한 품목이 목록에 한 번만 표시
- 상태와 카테고리 필터가 독립적으로 동작
- 상태 요약 숫자와 목록 결과가 일치
- 수량 조정 시 해당 품목만 pending 처리
- 수정·삭제·신규 추가 기능 유지
- 기존 QK.ingredients 캐시 무효화 정상

새 테스트 프레임워크를 불필요하게 추가하지 않는다.

---

# 22. 수동 QA 시나리오

## 22-1. 상태 계산

다음 품목을 테스트 데이터로 준비한다.

```text
A: 현재 0 / 기준 3
→ 품절

B: 현재 2 / 기준 3
→ 주문 필요

C: 현재 4 / 기준 3
→ 주의

D: 현재 10 / 기준 3
→ 정상

E: 현재 5 / 기준 0
→ 기준 미설정
```

각 요약 카드 숫자와 행 상태가 일치해야 한다.

## 22-2. 중복 제거

```text
우유: 카테고리 재료 + 주문 필요
```

기대 결과:

```text
목록에 한 번만 표시
상태 배지 = 주문 필요
카테고리 = 재료
```

## 22-3. 필터 조합

```text
상태 = 주문 필요
카테고리 = 소모품
검색어 = 컵
```

세 조건이 동시에 적용되어야 한다.

## 22-4. 수량 조절

- `+1`, `-1` 동작
- 0에서 `-1` 불가
- 직접 입력 후 Enter 저장
- 저장 실패 시 이전 값 복구
- 한 행 저장 중 다른 행은 조작 가능
- 빠른 중복 클릭으로 잘못된 최종 수량이 저장되지 않음

## 22-5. 구매 목록 복사

- 부족 품목만 포함
- 상태 우선순위 정렬
- 수량과 단위 표시
- 품목이 없으면 비활성화
- iPad 및 관리자 PWA에서 클립보드 동작 확인

## 22-6. 편집

- 행 클릭 후 Drawer 열림
- 메모 전체 확인
- 기준 수량 수정 후 상태 즉시 변경
- 저장 후 목록과 요약 갱신
- 삭제 후 목록에서 제거

## 22-7. 반응형

다음 환경에서 확인한다.

```text
데스크톱 1440px 이상
아이패드 가로
아이패드 세로
관리자 PWA 모바일 폭
```

확인 항목:

- 중첩 가로 스크롤 없음
- 헤더와 필터 접근 가능
- 수량 버튼 터치 가능
- Drawer/하단 시트가 화면 밖으로 잘리지 않음
- 관리자 사이드바와 겹치지 않음

---

# 23. 완료 기준

다음 조건을 모두 만족해야 완료로 간주한다.

1. 기존 가로 Kanban Board가 우선순위 기반 단일 재고 목록으로 변경됨
2. 한 품목이 화면에 한 번만 표시됨
3. 백엔드 `current_stock <= alert_threshold` 의미와 UI의 주문 필요 상태가 일치함
4. 품절, 주문 필요, 주의, 정상, 기준 미설정이 분리됨
5. 상태 요약 카드로 목록을 필터링할 수 있음
6. 상태와 카테고리 필터를 동시에 적용할 수 있음
7. 기본 정렬이 부족한 순임
8. 오늘 확인할 품목 패널이 제공됨
9. 구매 목록 복사가 동작함
10. 데스크톱·iPad에서는 표, 모바일에서는 카드 목록이 제공됨
11. `-1`, `+1`, 직접 입력으로 수량 조절 가능
12. 수량 PATCH는 `current_stock`만 전송함
13. 저장 중 해당 품목만 비활성화됨
14. 상세 및 수정 흐름이 Drawer 또는 모바일 시트로 단순화됨
15. 기존 추가·수정·삭제 기능이 유지됨
16. 음수 수량이 프런트와 백엔드 모두에서 차단됨
17. DB 마이그레이션 없이 배포 가능함
18. 기존 주문·결제·푸시·WebSocket·통계 기능에 회귀가 없음
19. `pytest`, `npm run lint`, `npm run build` 결과가 보고됨
20. 데스크톱, iPad, 관리자 PWA 수동 QA 결과가 보고됨

---

# 24. 변경하지 말아야 할 사항

이번 작업에서는 다음을 하지 않는다.

- 재고 이동 이력 테이블 추가
- 구매 발주 워크플로 추가
- 메뉴별 레시피 및 자동 차감
- 주문 완료 시 재고 자동 감소
- 유통기한 또는 입고 배치 관리
- 바코드·QR 재고 스캔
- 기존 API 경로 변경
- Ingredient DB 컬럼 변경
- 관리자 전체 레이아웃 재설계
- WebSocket 신규 이벤트 추가
- 새로운 전역 상태 라이브러리 추가
- 관련 없는 주문·결제·푸시 코드 수정
- 화면 디자인을 이유로 기존 재고 데이터를 변환하거나 삭제

범위를 벗어난 문제는 결과 보고에 별도 후속 작업으로 기록한다.

---

# 25. 예상 변경 파일

최소 다음 파일을 검토한다.

```text
frontend/src/pages/admin/AdminIngredients.tsx
frontend/src/types/index.ts
frontend/src/api/queryKeys.ts
backend/schemas.py
backend/routers/admin.py
backend/tests/*
```

필요하면 다음과 같은 신규 프런트 파일을 추가할 수 있다.

```text
frontend/src/pages/admin/inventory/inventoryStatus.ts
frontend/src/pages/admin/inventory/InventorySummaryCards.tsx
frontend/src/pages/admin/inventory/PriorityInventoryPanel.tsx
frontend/src/pages/admin/inventory/InventoryToolbar.tsx
frontend/src/pages/admin/inventory/InventoryTable.tsx
frontend/src/pages/admin/inventory/InventoryMobileList.tsx
frontend/src/pages/admin/inventory/InventoryStockControl.tsx
frontend/src/pages/admin/inventory/InventoryEditorDrawer.tsx
```

단순 분리를 위해 파일을 지나치게 많이 만들지 말고, 실제 복잡도에 맞게 결정한다.

---

# 26. 배포 순서

1. 현재 재고 데이터 백업 또는 조회 결과 확보
2. 백엔드 입력 검증 및 테스트 반영
3. `pytest` 통과 확인
4. 프런트엔드 재구성 적용
5. `npm run lint` 및 `npm run build` 확인
6. 로컬 또는 Preview에서 데스크톱·iPad·모바일 QA
7. Railway 백엔드 배포
8. Vercel 프런트엔드 배포
9. 관리자 PWA를 완전히 종료 후 다시 실행
10. 실제 재고 1개를 `+1`, `-1`, 직접 입력으로 수정
11. 구매 목록 복사와 필터 조합 확인

백엔드 API 경로와 DB 스키마가 바뀌지 않으므로 프런트와 백엔드의 배포 순서는 크게 민감하지 않지만, 입력 검증을 먼저 배포하는 편이 안전하다.

---

# 27. 롤백 방법

문제 발생 시 다음 단위로 롤백할 수 있어야 한다.

```text
프런트엔드 재고 UI 변경
백엔드 Ingredient 스키마 검증 변경
```

롤백 시에도 다음은 유지해야 한다.

- 기존 ingredients 테이블 데이터
- 재고 CRUD API
- 소프트 삭제 정책
- QK.ingredients Query Key
- 관리자 인증

DB 마이그레이션을 추가하지 않으므로 롤백 시 스키마 복구 작업은 없어야 한다.

---

# 28. 작업 결과 보고 형식

작업 완료 후 다음 순서로 보고한다.

1. 기존 화면의 문제 요약
2. 실제 변경한 파일 목록
3. 최종 재고 상태 계산 규칙
4. 화면 구조 변경 내용
5. 수량 조정 요청 및 동시성 처리 방식
6. 백엔드 입력 검증 변경
7. 실행한 명령
8. 테스트 및 빌드 결과
9. 데스크톱·iPad·관리자 PWA 수동 QA 결과
10. 배포 순서
11. 롤백 방법
12. 남아 있는 위험과 별도 후속 작업

단순히 `UI를 개선했습니다`라고 보고하지 말고 다음 근거를 포함한다.

- 동일 품목 중복 표시가 사라졌는지
- 임계값 10, 현재 재고 8이 주문 필요로 표시되는지
- 상태별 숫자와 목록이 일치하는지
- 수량 PATCH가 `current_stock`만 전송하는지
- 저장 실패 시 값이 복구되는지
- 구매 목록 복사가 실제 기기에서 동작하는지
