# 24. 사용자 PWA 스크롤·배경 연속성 개선

## 0. 문서 목적

사용자용 PWA의 다음 화면에서 콘텐츠 하단으로 스크롤할 때 흰색 화면이 자연스럽게 이어지지 않고, 중간 또는 하단에 검은 배경이 크게 노출되는 현상을 수정한다.

대상 화면:

- 메뉴 상세: `/menu/:id`
- 주문하기·장바구니: `/cart`
- 주문 상태: `/order/status/:id`

현재 사용자가 확인한 증상:

```text
메뉴 상세
→ 옵션 영역 아래부터 고정 주문 바 위까지 검은 공간 노출

주문하기
→ 결제 요약 카드 아래부터 고정 주문 버튼 위까지 검은 공간 노출

주문 상태
→ 흰색 카드 사이와 페이지 하단에 검은 배경 노출
```

목표:

```text
스크롤 가능한 전체 사용자 화면의 기본 캔버스는 흰색
하단까지 스크롤해도 검은색으로 끊기지 않음
고정 하단 버튼과 본문 사이가 자연스럽게 연결됨
iPhone PWA의 safe area와 overscroll에서도 흰색 유지
```

이번 작업은 **레이아웃·전역 배경·스크롤·safe-area만 수정하는 UI 안정화 작업**이다.
주문, 결제, 이벤트, 푸시, WebSocket, React Query, 관리자 기능의 비즈니스 로직은 변경하지 않는다.

---

# 1. 현재 코드에서 확인된 원인 후보

## 1-1. 전역 `body` 배경이 검은색으로 고정됨

현재 `frontend/src/index.css`에는 다음 설정이 있다.

```css
body {
  background-color: #0F0A0A;
}
```

사용자 페이지의 흰색 wrapper가 iOS 동적 viewport, fixed 요소, overscroll 또는 페이지 높이 계산으로 화면 전체를 덮지 못하는 순간 전역 body의 검은 배경이 그대로 노출된다.

특히 iPhone 홈 화면 PWA에서는 다음 상황에서 body 배경이 보일 수 있다.

```text
100vh와 실제 가시 viewport 높이 차이
fixed bottom bar가 문서 흐름에서 빠짐
페이지 끝 rubber-band overscroll
safe-area 영역
콘텐츠가 짧은 화면
라우트 전환 직후 레이아웃 재계산
```

## 1-2. `html`, `body`, `#root` 높이 정책이 동적 viewport에 최적화되지 않음

현재 구조에는 다음 조합이 있다.

```css
html, body {
  height: 100%;
  min-height: 100%;
}

#root {
  height: 100%;
  min-height: 100vh;
}
```

그리고 사용자 페이지는 주로 다음을 사용한다.

```tsx
min-h-screen
```

모바일 Safari·iOS PWA에서는 `100vh`가 실제 가시 영역 또는 safe area와 다르게 계산될 수 있다.
이번 작업에서는 `dvh` 기반 높이를 우선 사용하고 `vh` fallback을 유지한다.

## 1-3. MenuDetail과 Cart가 fixed 하단 바를 위해 210px 고정 스페이서를 사용함

현재 두 화면에는 다음 구조가 있다.

```tsx
<div className="h-[210px] ..." />
<div className="fixed bottom-0 ...">...</div>
```

문제점:

- 실제 하단 바 높이와 무관하게 210px를 항상 비움
- 가격 표시 여부, 이벤트 여부, safe-area 높이에 따라 실제 필요 공간이 달라짐
- 콘텐츠가 짧으면 비어 있는 공간이 과도하게 커 보임
- wrapper 또는 root 높이 계산이 어긋나면 그 공간에서 body의 검은색이 노출될 수 있음
- 페이지마다 별도 숫자를 사용하면 향후 UI 변경 시 다시 깨질 가능성이 큼

## 1-4. MenuDetail 하단 바 safe-area 처리가 Cart와 일치하지 않음

Cart는 하단 버튼에 safe-area padding이 있으나 MenuDetail의 하단 주문 바에는 동일한 정책이 일관되게 적용되지 않을 수 있다.

모든 사용자용 fixed bottom action bar는 다음 원칙을 공유해야 한다.

```text
배경: 흰색
하단 safe-area 포함
본문 가림 방지 padding 포함
검은 body가 home indicator 영역에 보이지 않음
```

## 1-5. OrderStatus는 fixed footer가 없지만 전역 body 검은색이 노출됨

OrderStatus 최상위에는 밝은 배경이 지정되어 있어도, 페이지 wrapper가 실제 문서 전체와 iOS overscroll 영역을 완전히 덮지 못하면 body 배경이 카드 사이 또는 하단에 보일 수 있다.

따라서 화면별 임시 흰색 div를 추가하는 방식이 아니라 **전역 public canvas와 viewport 정책을 함께 수정**해야 한다.

---

# 2. 목표 UX

## 2-1. 공통 기본 캔버스

사용자 앱의 기본 배경은 흰색이다.

```text
html 배경       → 흰색
body 배경       → 흰색
#root 배경      → 흰색
사용자 page root → 흰색
```

OrderStatus에서 아주 옅은 회색 배경을 유지하고 싶다면 카드 영역 내부에서만 사용하되, 페이지 끝과 overscroll canvas는 흰색이어야 한다.

## 2-2. 자연스러운 스크롤 끝

스크롤 마지막 상태:

```text
마지막 콘텐츠
→ 적정한 여백
→ 고정 하단 액션 바 또는 페이지 하단
→ 흰색 safe-area
```

다음 모습은 허용하지 않는다.

```text
마지막 콘텐츠
→ 수백 px 검은 빈 공간
→ 하단 버튼
```

## 2-3. 고정 하단 액션 바

MenuDetail과 Cart의 하단 액션 바는 계속 화면에 고정해도 된다.
단, 본문과 별개로 떠 있는 검은 띠처럼 보이지 않아야 한다.

요구사항:

- 배경 흰색
- `env(safe-area-inset-bottom)` 포함
- 하단 home indicator 주변도 흰색
- 본문이 액션 바 뒤에 가려지지 않음
- 액션 바 높이에 맞는 정확한 content padding
- 불필요한 210px 하드코딩 제거
- 스크롤 끝에서 액션 바와 본문이 자연스럽게 연결

---

# 3. 필수 수정 범위

## 3-1. `frontend/src/index.css`

### 필수 방향

1. 사용자 화면에 검은 전역 body가 노출되지 않도록 기본 캔버스를 흰색으로 변경한다.
2. `html`, `body`, `#root` 모두 흰색 배경을 가진다.
3. `#root`의 고정 `height: 100%` 의존을 제거하거나 재검토한다.
4. `100dvh` 기반 최소 높이를 사용한다.
5. 관리자 페이지는 자체 `AdminLayout` 배경으로 렌더링되므로 관리자 디자인을 깨뜨리지 않는지 확인한다.

권장 예시:

```css
html {
  min-height: 100%;
  background: #ffffff;
  color-scheme: light;
}

body {
  min-height: 100vh;
  min-height: 100dvh;
  margin: 0;
  padding: 0;
  background: #ffffff;
  font-family: var(--font-sans);
  color: var(--color-text-main);
  -webkit-font-smoothing: antialiased;
}

#root {
  width: 100%;
  min-height: 100vh;
  min-height: 100dvh;
  background: #ffffff;
}
```

주의:

- 실제 코드 구조를 확인한 뒤 필요한 기존 속성은 유지한다.
- 관리자 화면의 `overflow: hidden` 정책을 전역으로 옮기지 않는다.
- 사용자 화면 스크롤을 막는 `overflow: hidden`을 html/body에 추가하지 않는다.
- iOS rubber-band를 억지로 막기보다 노출되는 캔버스 색을 흰색으로 만든다.

## 3-2. 공통 사용자 페이지 shell 검토

다음 중 현재 구조에 가장 적합한 방식 하나를 선택한다.

### 선택 A — 전역 base + 각 페이지 root 통일

각 페이지 최상위에 다음 정책을 적용한다.

```tsx
className="min-h-[100dvh] w-full max-w-[500px] mx-auto bg-white"
```

### 선택 B — `PublicPageShell` 공용 컴포넌트

중복을 줄이는 것이 실제 저장소에 적합하다면 다음 역할의 공용 shell을 만든다.

```text
최소 높이 100dvh
최대 너비 500px
흰색 캔버스
중앙 정렬
페이지별 bottom inset 지원
safe-area 지원
```

예시 경로:

```text
frontend/src/components/layout/PublicPageShell.tsx
```

단, 단순 배경 수정만으로 충분하다면 불필요한 추상화를 추가하지 않는다.

## 3-3. `frontend/src/pages/MenuDetail.tsx`

필수 작업:

- 최상위 wrapper를 `min-h-[100dvh] bg-white`로 통일
- `<main>`에도 명시적인 흰색 배경 적용
- 210px 고정 spacer 제거
- 실제 하단 바 높이만큼 content bottom padding 적용
- 하단 bar에 safe-area padding 적용
- 하단 bar 전체 너비와 최대 너비 500px 정렬 유지
- 메뉴 옵션, 가격 계산, 장바구니 담기, 바로 주문 로직 변경 금지

권장 패턴:

```tsx
<div className="min-h-[100dvh] w-full max-w-[500px] mx-auto bg-white relative">
  <Header ... />

  <main className="bg-white pb-[calc(var(--menu-action-height)+env(safe-area-inset-bottom))]">
    ...
  </main>

  <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[500px] bg-white ... pb-[calc(16px+env(safe-area-inset-bottom))]">
    ...
  </div>
</div>
```

CSS custom property를 쓰지 않는다면 실제 액션 바 높이에 맞는 명확한 상수를 사용하되, 기존 210px처럼 과도한 임의 여백은 사용하지 않는다.

예:

```text
가격 표시 ON, 수량 선택 포함
→ 약 150~170px + safe area

품절 상태
→ 실제 표시 높이에 맞는 값
```

가능하면 ResizeObserver 또는 공용 레이아웃으로 실제 footer 높이에 맞춰 계산하되, 이번 작은 수정에 과도한 복잡성을 추가하지 않는다.

## 3-4. `frontend/src/pages/Cart.tsx`

필수 작업:

- 최상위 wrapper와 main의 배경을 흰색으로 명시
- 210px 고정 spacer 제거
- 고정 주문 버튼 높이만큼만 bottom padding 확보
- 하단 버튼 safe-area 유지
- 짧은 장바구니와 긴 장바구니 모두 자연스럽게 스크롤
- 결제 카드 끝과 주문 버튼 사이에 검은 영역이 없어야 함
- 주문, 결제, 사용자 모달, Toss, 이벤트 무료 주문 로직 변경 금지

Cart 하단 버튼은 MenuDetail보다 높이가 작으므로 동일한 210px를 재사용하지 않는다.

권장 예:

```tsx
<main className="flex-1 bg-white p-4 pb-[calc(112px+env(safe-area-inset-bottom))]">
  ...
</main>
```

실제 버튼 높이와 padding을 측정해 조정한다.

## 3-5. `frontend/src/pages/OrderStatus.tsx`

필수 작업:

- 최상위 wrapper를 `min-h-[100dvh]`로 변경
- 기본 페이지 canvas를 흰색으로 통일
- header와 main 사이, 카드 사이, 최종 카드 아래에서 검은 body가 노출되지 않게 함
- 상태 전환 flash 효과는 유지하되 flash 종료 후 흰색 또는 정의된 밝은 배경으로 복귀
- 페이지 마지막 `실시간 추적 중` 카드는 현재 어두운 카드 디자인을 유지할 수 있음
- 카드 바깥의 페이지 배경만 흰색으로 통일
- 주문 상태, WebSocket, 폴링, 푸시, 자동 이동 로직 변경 금지

권장 구조:

```tsx
<div className={`min-h-[100dvh] w-full max-w-[500px] mx-auto bg-white ...`}>
  <header className="bg-white/95 ..." />
  <main className="flex-1 bg-white ...">
    ...
  </main>
</div>
```

카드 구분이 약해질 경우 다음 중 하나를 사용한다.

```text
얇은 gray-100 border
아주 약한 shadow
카드 내부 gray-50 영역
```

페이지 전체를 다시 검거나 진한 회색으로 만들지 않는다.

## 3-6. Home 및 기타 사용자 화면 회귀 확인

전역 body 배경을 흰색으로 바꾸면 다음 화면도 확인한다.

- `/`
- 빈 장바구니
- 영업 종료 화면
- PWA 설치 가이드 모달
- 주문자 정보 bottom sheet

영업 종료 화면은 자체 green/fullscreen 배경을 유지해야 한다.

---

# 4. 구현 시 금지 사항

이번 작업에서 다음을 하지 않는다.

- 관리자 PWA 레이아웃 재설계
- 사용자 화면 색상 테마 전체 변경
- Header 디자인 변경
- 메뉴 옵션 UI 재설계
- 결제 카드 재설계
- STATUS 카드 콘텐츠 변경
- 주문·가격·이벤트 계산 로직 변경
- WebSocket 및 React Query 리팩터링
- 푸시 알림 코드 변경
- html/body 전체 스크롤 차단
- iOS 대응을 이유로 사용자 페이지에 `overflow: hidden` 적용
- 검은 영역을 흰색 절대 위치 div로 임시 덮기
- 의미 없는 대형 spacer 추가

검은 영역의 원인을 제거해야 하며, 단순 overlay로 숨기지 않는다.

---

# 5. 권장 공통 CSS 유틸리티

필요하면 아래와 유사한 클래스를 추가한다.

```css
.public-page-canvas {
  width: 100%;
  min-height: 100vh;
  min-height: 100dvh;
  background: #ffffff;
}

.public-bottom-bar {
  background: #ffffff;
  padding-bottom: calc(1rem + env(safe-area-inset-bottom, 0px));
}
```

Tailwind만으로 명확하게 표현 가능하다면 별도 CSS 클래스를 만들지 않아도 된다.

---

# 6. 접근성 및 모바일 세부 기준

- 버튼 터치 영역은 기존 크기 유지
- safe-area가 있는 iPhone에서 home indicator와 버튼이 겹치지 않음
- `viewport-fit=cover` 유지
- 화면 확대 제한 등 기존 viewport meta를 이번 작업에서 변경하지 않음
- prefers-color-scheme이 dark여도 사용자 주문 화면 canvas는 흰색 유지
- 시스템 다크 모드 때문에 폼이나 overscroll이 검게 바뀌지 않도록 `color-scheme: light` 적용 여부 검토
- 화면 회전 후에도 검은 배경 노출 없음

---

# 7. 자동 검증

프런트엔드에서 최소 다음 명령을 실행한다.

```bash
cd frontend
npm run lint
npm run build
```

빌드 산출물에서 기존 사용자 PWA와 관리자 PWA 매니페스트 구성이 깨지지 않았는지 확인한다.

새 테스트 프레임워크를 불필요하게 추가하지 않는다.
기존 E2E 또는 screenshot 테스트가 있다면 다음 경로의 모바일 viewport 캡처를 추가한다.

```text
/menu/:id
/cart
/order/status/:id
```

---

# 8. 수동 QA 시나리오

## 8-1. iPhone 사용자 PWA

환경:

```text
홈 화면에서 설치된 사용자 PWA 실행
iPhone 세로 모드
시스템 다크 모드 ON/OFF 각각 확인
```

### 메뉴 상세

1. 옵션이 적은 메뉴 진입
2. 페이지 최하단까지 스크롤
3. 상하로 천천히 스크롤
4. 화면 끝 rubber-band 수행
5. 장바구니 담기·바로 주문 바 확인

기대:

```text
옵션 아래 여백이 흰색
고정 바 위에 검은 띠 없음
home indicator 주변 흰색
본문이 버튼 뒤에 숨지 않음
```

### Cart

1. 상품 1개로 짧은 Cart 확인
2. 상품 여러 개로 긴 Cart 확인
3. 계좌이체·현금·Toss 각각 확인
4. 결제 요약 아래까지 스크롤

기대:

```text
결제 카드 다음 영역 흰색
주문 버튼까지 자연스럽게 연결
검은 큰 빈 공간 없음
```

### OrderStatus

다음 상태를 각각 확인한다.

```text
PENDING
PREPARING
READY
```

기대:

```text
카드 사이 흰색 또는 밝은 배경
마지막 실시간 추적 카드 이후 흰색
페이지 끝 overscroll도 흰색
```

## 8-2. iPhone Safari 일반 웹

동일 URL을 Safari 탭으로 열고 같은 테스트를 수행한다.

## 8-3. Android PWA·Chrome

- 설치형 PWA
- 일반 Chrome
- 짧은 콘텐츠와 긴 콘텐츠
- 하단 시스템 navigation bar가 있는 기기

## 8-4. 관리자 PWA 회귀

다음은 기존 디자인 그대로여야 한다.

```text
관리자 로그인
/admin 주문 관리
가로 모드
사이드바
관리자 페이지 자체 스크롤
```

---

# 9. 완료 기준

다음 조건을 모두 만족해야 완료다.

1. MenuDetail 최하단에서 검은 배경이 보이지 않는다.
2. Cart 결제 요약과 고정 주문 버튼 사이에 검은 배경이 보이지 않는다.
3. OrderStatus 카드 사이와 페이지 끝에서 검은 배경이 보이지 않는다.
4. iPhone PWA rubber-band overscroll 중에도 흰색 canvas가 보인다.
5. fixed bottom bar의 safe-area가 흰색이다.
6. 콘텐츠가 하단 바 뒤에 가려지지 않는다.
7. 불필요한 210px 고정 spacer가 제거되거나 실제 bar 높이에 맞게 대체된다.
8. 짧은 콘텐츠와 긴 콘텐츠 모두 자연스럽게 스크롤된다.
9. 사용자 주문·결제·푸시·상태 추적 기능에 회귀가 없다.
10. 관리자 PWA 화면에 회귀가 없다.
11. `npm run lint`와 `npm run build`가 성공한다.

---

# 10. 결과 보고 형식

작업 완료 후 다음 순서로 보고한다.

1. 최종 원인
2. 변경한 파일 목록
3. 전역 canvas·viewport 수정 내용
4. MenuDetail 하단 바 및 spacer 수정
5. Cart 하단 바 및 spacer 수정
6. OrderStatus 배경 수정
7. iPhone safe-area 처리
8. 실행한 명령
9. lint/build 결과
10. 실기기 QA 결과
11. 관리자 PWA 회귀 확인
12. 남은 위험
13. 롤백 방법

스크린샷 비교를 포함한다.

```text
수정 전 MenuDetail 하단
수정 후 MenuDetail 하단
수정 전 Cart 하단
수정 후 Cart 하단
수정 전 OrderStatus 하단
수정 후 OrderStatus 하단
```
