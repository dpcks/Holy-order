# Antigravity 실행 프롬프트 — 사용자 PWA 스크롤·배경 연속성 개선

저장소 루트에서 아래 문서를 먼저 읽고, 문서에 정의된 범위만 구현해 주세요.

```text
docs/antigravity/24_PUBLIC_PWA_SCROLL_BACKGROUND_CONTINUITY_FIX.md
```

## 현재 증상

사용자 PWA의 다음 화면에서 하단으로 스크롤하면 흰색 UI가 자연스럽게 이어지지 않고 검은 배경이 크게 노출됩니다.

```text
/menu/:id
/cart
/order/status/:id
```

특히 다음 구간에서 재현됩니다.

```text
메뉴 상세 옵션 영역과 고정 주문 바 사이
Cart 결제 요약과 고정 주문 버튼 사이
OrderStatus 카드 사이 및 페이지 하단
```

## 우선 확인할 코드

```text
frontend/src/index.css
frontend/src/pages/MenuDetail.tsx
frontend/src/pages/Cart.tsx
frontend/src/pages/OrderStatus.tsx
frontend/src/pages/Home.tsx
frontend/src/components/layout/Header.tsx
frontend/index.html
frontend/admin.html
```

현재 `body`의 전역 배경이 `#0F0A0A`로 설정되어 있고, 사용자 페이지는 `min-h-screen`, fixed bottom bar, 210px 고정 spacer를 함께 사용하고 있습니다.

단순히 검은 부분 위에 흰색 div를 덮지 말고 다음 원인을 함께 해결하세요.

1. html/body/#root 기본 canvas를 흰색으로 통일
2. iOS PWA에 맞게 `100dvh` 최소 높이 사용
3. #root의 `height: 100%` 의존 재검토
4. MenuDetail·Cart의 210px 하드코딩 spacer 제거
5. 실제 fixed bottom bar 높이만큼만 본문 padding 확보
6. 모든 하단 바의 safe-area를 흰색으로 처리
7. OrderStatus 카드 바깥의 페이지 canvas를 흰색으로 통일

## 반드시 유지할 기능

- 메뉴 옵션 선택
- 텀블러 할인
- 장바구니 담기
- 바로 주문
- 결제수단
- Toss 딥링크
- 주문자 정보 모달
- 주문 상태 WebSocket과 폴링
- 푸시 알림
- 이벤트 무료 주문 표시
- 사용자·관리자 PWA 매니페스트
- 관리자 PWA 가로 모드와 `/admin` 화면

## 금지 사항

- 주문·결제·푸시·WebSocket 로직 수정
- 관리자 UI 재설계
- html/body 스크롤 전역 차단
- 임시 overlay로 검은 영역 가리기
- 의미 없는 대형 spacer 추가
- 사용자 화면 전체 디자인 변경

## 검증

다음을 실제로 실행하세요.

```bash
cd frontend
npm run lint
npm run build
```

다음 화면을 iPhone 홈 화면 PWA에서 검증하세요.

```text
MenuDetail: 옵션이 적은 메뉴와 많은 메뉴
Cart: 상품 1개와 여러 개
OrderStatus: PENDING, PREPARING, READY
```

검증 항목:

```text
하단 스크롤 시 검은 영역 없음
rubber-band overscroll 시 흰색 유지
home indicator 주변 흰색
본문이 fixed button 뒤에 가려지지 않음
짧은 화면과 긴 화면 모두 자연스럽게 스크롤
관리자 PWA 회귀 없음
```

완료 보고에는 최종 원인, 변경 파일, 수정 전후 스크린샷, lint/build 결과, iPhone·Android QA 결과, 롤백 방법을 포함하세요.
