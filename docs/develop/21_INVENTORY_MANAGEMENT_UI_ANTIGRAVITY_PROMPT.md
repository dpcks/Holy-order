# Antigravity 실행 프롬프트 — 관리자 재고 관리 UI/UX 리디자인

저장소 루트에서 다음 문서를 먼저 읽고, 문서에 정의된 범위만 구현해 주세요.

```text
docs/antigravity/21_INVENTORY_MANAGEMENT_UI_REDESIGN.md
```

## 작업 목표

현재 관리자 재고 화면은 `주문 필요 / 재료 / 소모품` 칸반 열을 가로 스크롤하는 구조입니다.

이를 다음 구조의 **재고 우선순위 점검표**로 변경하세요.

```text
상태 요약 카드
→ 오늘 확인할 품목
→ 검색·상태·카테고리 필터
→ 한 품목이 한 번만 나타나는 단일 표/목록
→ 오른쪽 상세·편집 drawer
```

관리자가 화면 진입 후 약 3초 안에 품절, 주문 필요, 주의 품목과 현재 수량을 확인할 수 있어야 합니다.

## 먼저 확인할 파일

```text
frontend/src/pages/admin/AdminIngredients.tsx
frontend/src/api/queryKeys.ts
frontend/src/types/index.ts
frontend/src/api/client.ts
frontend/src/pages/admin/AdminLayout.tsx
backend/models.py
backend/schemas.py
backend/routers/admin.py
backend/tests/*
```

저장소 전체에서 다음 항목도 검색하세요.

```bash
rg -n \
  "AdminIngredients|getStockStatus|alert_threshold|ingredients/alerts|QK\.ingredients|IngredientCreate|IngredientUpdate" \
  frontend/src backend
```

최신 실제 코드와 API 타입을 기준으로 구현하고, 문서의 예시 코드를 맹목적으로 복사하지 마세요.

## 필수 구현

1. 기존 칸반 열과 마우스 드래그 가로 스크롤을 제거하세요.
2. 한 품목이 화면에 한 번만 나타나도록 단일 목록 또는 표로 구성하세요.
3. 재고 상태를 다음 규칙으로 통일하세요.

```text
current_stock <= 0
→ 품절

alert_threshold <= 0 && current_stock > 0
→ 기준 미설정

current_stock <= alert_threshold
→ 주문 필요

current_stock <= alert_threshold * 1.5
→ 주의

그 외
→ 정상
```

4. 상태 판정은 순수 유틸리티 함수로 분리하세요.
5. 상단에 클릭 가능한 다음 요약 카드를 표시하세요.

```text
전체
품절
주문 필요
주의
정상
기준 미설정
```

6. `오늘 확인할 품목`에는 품절, 주문 필요, 주의 품목을 우선순위대로 표시하세요.
7. `구매 목록 복사`에는 품절과 주문 필요 품목만 포함하세요. 목표 구매 수량을 임의 계산하지 말고 현재 수량과 주문 기준만 출력하세요.
8. 상태 필터와 카테고리 필터를 분리하고 동시에 적용 가능하게 하세요.
9. 정렬은 최소 다음을 지원하세요.

```text
부족한 순 — 기본
품목명 순
최근 수정 순
```

10. 데스크톱·iPad는 sticky header가 있는 단일 표로, 휴대전화 관리자 PWA는 카드 목록으로 표현하세요.
11. 행 또는 카드를 클릭하면 오른쪽 상세·편집 drawer를 여세요. 휴대전화에서는 전체 화면 sheet 또는 bottom sheet를 사용하세요.
12. 기존 상세 모달과 수정 모달의 2단계 흐름을 하나의 편집 패널로 통합하세요.
13. 기존 추가, 수정, 삭제, 메모, 단위, 정렬 순서 기능을 모두 유지하세요.
14. 인라인 `- / +`는 유지하되 수량 변경 요청에는 `current_stock`만 PATCH하세요.
15. 수량은 0 미만으로 내려가지 않아야 하며, optimistic update를 사용한다면 실패 시 반드시 rollback하세요.
16. React Query의 `dataUpdatedAt`을 이용해 마지막 갱신 시각을 표시하세요.
17. 로딩, API 오류, 전체 데이터 없음, 필터 결과 없음 상태를 각각 구분해 구현하세요.
18. 백엔드 스키마에서 `current_stock`, `alert_threshold`, `display_order`의 음수를 거부하세요.
19. 품목명의 앞뒤 공백을 제거하고 빈 이름을 거부하세요.
20. DB 테이블, 기존 API 경로, 소프트 삭제 정책, 관리자 인증, Query Key는 변경하지 마세요.

## 구현 품질

파생 데이터는 `useMemo`로 계산하고 상태 판정과 정렬 함수를 컴포넌트 밖으로 분리하세요.

`AdminIngredients.tsx` 하나에 모든 UI를 몰아넣지 말고, 현재 저장소 스타일에 맞게 요약 카드, 우선 품목 패널, 표, 모바일 카드, drawer를 적절히 분리하세요.

같은 오류에 전역 Axios 토스트와 페이지 토스트가 중복되지 않도록 현재 `apiClient` 정책을 확인하세요.

## 변경 금지

```text
재고 변경 이력 테이블
입고·사용·폐기 사유 저장
구매 주문 워크플로우
메뉴 레시피와 자동 차감
유통기한 또는 batch 관리
재고 WebSocket 이벤트
Ingredient DB 컬럼 추가
주문·결제·푸시·영업 상태 변경
관리자 전체 레이아웃 전면 개편
새 UI 라이브러리 도입
관련 없는 패키지 업데이트
```

범위 밖 문제를 발견하면 몰래 함께 구현하지 말고 후속 제안으로 보고하세요.

## 자동 검증

최소 실행:

```bash
pytest
cd frontend && npm run lint
cd frontend && npm run build
```

백엔드 테스트에는 다음을 포함하세요.

```text
활성 재고 목록 정렬
부족 알림 current_stock <= alert_threshold
음수 현재 재고 거부
음수 주문 기준 거부
current_stock 단독 부분 PATCH
소프트 삭제
```

프런트 테스트 환경이 이미 있다면 상태 함수 케이스를 검증하세요.

```text
0 / 3 → 품절
3 / 3 → 주문 필요
4 / 3 → 주의
5 / 3 → 정상
5 / 0 → 기준 미설정
```

새 프런트 테스트 프레임워크를 불필요하게 추가하지 마세요.

## 필수 수동 QA

다음 테스트 데이터를 준비하세요.

```text
우유         현재 0   기준 3   → 품절
일회용컵     현재 8   기준 10  → 주문 필요
바닐라시럽   현재 4   기준 3   → 주의
원두         현재 12  기준 5   → 정상
냅킨         현재 50  기준 0   → 기준 미설정
```

검증:

```text
각 품목이 한 번만 표시
요약 숫자 정확
요약 카드 필터 동작
상태 + 카테고리 복합 필터
부족 우선 정렬
검색 조합
부분 PATCH
음수 방지
직접 수량 입력
구매 목록 복사
편집 drawer
삭제와 추가
오류 rollback
empty/error UI
데스크톱 sticky table
아이패드 세로·가로
관리자 PWA 모바일 카드
기존 관리자 사이드바·주문 알림음·주문 보드 회귀 없음
```

## 완료 보고

계획만 작성하고 멈추지 말고 실제 코드 수정과 검증까지 완료하세요.

최종 보고에는 다음을 포함하세요.

```text
변경 파일
상태 판정 규칙
최종 화면 구조
필터·정렬 동작
구매 목록 복사 형식
수량 부분 PATCH와 rollback
백엔드 검증
pytest 결과
lint/build 결과
데스크톱·iPad·관리자 PWA QA
배포 순서
롤백 방법
범위 밖 후속 제안
```
