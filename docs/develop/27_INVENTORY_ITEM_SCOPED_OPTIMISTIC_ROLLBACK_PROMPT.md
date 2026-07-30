# Antigravity 실행 프롬프트: 재고 품목 단위 Optimistic Rollback

저장소 루트에서 다음 문서를 읽고, 문서 범위만 구현해 주세요.

```text
docs/antigravity/27_INVENTORY_ITEM_SCOPED_OPTIMISTIC_ROLLBACK.md
```

현재 재고 수량 optimistic update가 변경 전 전체 `Ingredient[]`를 snapshot으로 저장하고, 한 요청 실패 시 전체 목록을 복원할 가능성이 있습니다. 서로 다른 두 품목을 빠르게 수정하면 실패한 요청의 rollback이 이미 성공한 다른 품목의 화면 값까지 되돌릴 수 있습니다.

이번 작업은 재고 UI를 다시 디자인하는 작업이 아니라, rollback 범위를 실패한 품목 하나로 제한하는 안정화 작업입니다.

## 필수 구현

```text
1. 전체 배열 snapshot context 제거
2. onMutate context에는 id와 previousStock만 저장
3. onError에서 해당 id의 current_stock만 복원
4. 다른 품목의 성공 값은 유지
5. savingIds로 동일 품목의 중복 요청 차단
6. 다른 품목은 동시에 수정 가능
7. onSettled에서 해당 saving ID 제거
8. ingredients Query invalidate로 서버 최종 값 재확인
9. 오류 토스트 중복 방지
10. Desktop 표, Mobile 카드, Drawer의 모든 수량 수정 경로 확인
```

현재 재고 상태 계산, 필터, 요약 카드, 구매 목록 복사, 백엔드 API 경로와 DB 모델은 변경하지 마세요.

## 필수 테스트

```text
우유 요청 실패 + 컵 요청 성공
→ 우유만 이전 값
→ 컵 성공 값 유지

같은 품목 빠른 연타
→ pending 중 두 번째 mutation 차단

다른 품목 동시 수정
→ 둘 다 요청 가능

settled
→ 서버 refetch
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
기존 전체 snapshot 경쟁 조건 설명
새 mutation context 구조
동시 요청 테스트 결과
수동 네트워크 throttling QA
lint/build/pytest 결과
배포 및 롤백 방법
```
