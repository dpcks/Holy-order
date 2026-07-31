# Antigravity 실행 프롬프트 — 32번 Cloudinary 반응형 이미지 최적화

당신은 Holy-order 운영 저장소를 유지보수하는 시니어 React/PWA 프런트엔드 엔지니어다.

저장소 루트에서 먼저 다음 문서를 읽어라.

```text
docs/antigravity/00_README.md
docs/antigravity/32_CLOUDINARY_RESPONSIVE_IMAGE_DELIVERY_OPTIMIZATION.md
```

이번 작업에서는 **32번 명세의 범위만 구현**하라. 다른 번호의 작업은 참고만 하고 함께 수정하지 마라.

---

## 현재 확인된 문제

현재 사용자 화면의 다음 위치가 Cloudinary `secure_url` 원본을 그대로 사용한다.

```text
frontend/src/pages/Home.tsx
→ MenuCard

frontend/src/pages/MenuDetail.tsx
→ 메뉴 상세 hero 이미지

frontend/src/pages/Cart.tsx
→ 72×72 장바구니 썸네일
```

현재는 `f_auto`, `q_auto`, `w/h`, `srcSet`, `sizes`, lazy/eager 우선순위가 없어 모바일 표시 크기보다 큰 원본 이미지가 다운로드될 수 있다.

`frontend/src/utils/uploadImage.ts`는 canonical `secure_url`을 반환한다. 이 동작은 유지하고, 렌더링 시점에 화면별 변환 URL을 생성하라.

---

## 반드시 구현할 사항

### 1. Cloudinary URL 유틸리티

다음 파일을 생성하라.

```text
frontend/src/utils/cloudinaryImage.ts
```

최소 프리셋:

```text
menu-card
- widths: 240, 360, 480, 720
- aspect ratio: 1:1
- fallback width: 480

menu-detail
- widths: 480, 768, 1024, 1280
- aspect ratio: 4:3
- fallback width: 1024

cart-thumbnail
- widths: 96, 144, 216, 288
- aspect ratio: 1:1
- fallback width: 216
```

각 변환 URL에는 다음을 포함하라.

```text
f_auto
q_auto
c_fill
g_auto
w_<width>
h_<height>
```

`/image/upload/` 뒤에 transformation을 삽입하라.

Cloudinary가 아닌 URL, 잘못된 URL, 정적 이미지 URL은 원본 그대로 반환하라.

### 2. 공용 이미지 컴포넌트

다음 파일을 생성하라.

```text
frontend/src/components/ui/CloudinaryImage.tsx
```

지원 항목:

```text
src
preset
priority
fallbackSrc
alt
className
width
height
```

렌더링 정책:

```text
priority=true
→ loading=eager
→ fetchPriority=high

priority=false
→ loading=lazy
→ fetchPriority=auto

모든 이미지
→ decoding=async
```

`srcSet` 이미지 실패 시에는 `srcset`과 `sizes`를 제거한 뒤 fallback URL을 적용하라. 무한 onError 반복을 방지하라.

### 3. Home 메뉴 이미지

`Home.tsx`의 일반 카테고리와 검색 결과 모두 다음 정책을 적용하라.

```text
index 0, 1
→ priority=true

index 2 이후
→ priority=false
```

`MenuCard`는 `menu-card` 프리셋을 사용해야 한다.

다음 `sizes` 의미를 유지하라.

```text
(max-width: 500px) calc((100vw - 48px) / 2), 226px
```

기존 품절 정렬, 품절 오버레이, FREE, NEW 배지, 클릭 로직은 변경하지 마라.

### 4. MenuDetail

메뉴 상세 hero 이미지는:

```text
preset=menu-detail
priority=true
loading=eager
fetchPriority=high
```

로 구성하라.

기존 4:3 레이아웃, 옵션 선택, 가격, 하단 주문 바, safe-area는 유지하라.

### 5. Cart

72×72 썸네일은 `cart-thumbnail` 프리셋을 사용하라.

첫 두 장은 priority, 나머지는 lazy로 처리하라.

주문 요청, 이벤트 가격, Toss, PWA 구독, 영업 상태 로직은 변경하지 마라.

### 6. Preconnect

`frontend/index.html`에 정확히 한 번씩 추가하라.

```html
<link rel="preconnect" href="https://res.cloudinary.com" crossorigin />
<link rel="dns-prefetch" href="//res.cloudinary.com" />
```

이번 작업에서 `admin.html`은 필수 수정 대상이 아니다.

### 7. 업로드 URL 정책

`uploadImageToCloudinary()`가 반환하는 `secure_url`은 그대로 유지하라.

DB에 변환 URL을 저장하지 마라.

주석만 canonical 원본 URL 정책에 맞게 정리할 수 있다.

---

## 변경 금지

다음은 수정하지 마라.

```text
backend/*
DB schema
Railway 환경변수
Vercel 환경변수
Cloudinary Upload Preset
frontend/src/sw.ts
관리자 PWA 구조
주문·결제·푸시·WebSocket
이벤트/공지 이미지
정적 SVG/PWA 아이콘
```

Cloudinary SDK나 새로운 이미지 라이브러리를 설치하지 마라.

Service Worker runtime image cache를 추가하지 마라.

모든 메뉴 이미지를 eager 또는 preload로 만들지 마라.

---

## 검증 명령

```bash
cd frontend
npm ci
npm run lint
npm run build
```

현재 자동 테스트 프레임워크가 없다면 이번 작업만을 위해 신규 테스트 프레임워크를 추가하지 마라.

---

## Network 검증

Vercel Preview 또는 로컬 production build에서 다음을 확인하라.

```text
Home 메뉴 이미지 URL
→ /image/upload/f_auto,q_auto,c_fill,g_auto,w_...,h_.../

Home 첫 두 장
→ eager/high

나머지
→ lazy/auto

MenuDetail
→ 4:3 responsive srcSet + eager/high

Cart
→ 72px 전용 작은 후보
```

Chrome DevTools에서 Disable cache와 Slow 4G를 사용해 대표 메뉴 이미지 최소 3장의 수정 전후를 기록하라.

기록 항목:

```text
Request URL
Transferred size
Resource size
Content-Type
선택된 width candidate
Waiting/TTFB
Content Download
```

브라우저가 viewport 주변 lazy 이미지를 미리 요청할 수 있으므로 “정확히 두 요청만 발생”을 완료 기준으로 삼지 마라. DOM 속성과 네트워크 우선순위를 함께 판단하라.

---

## 실기기 QA

다음을 검증하라.

```text
iPhone 홈 화면 PWA
Android Chrome/PWA
QR로 열린 일반 Safari/Chrome
```

시나리오:

```text
앱 새 실행
첫 카테고리 로드
아래로 스크롤
다른 카테고리 이동
검색 결과
메뉴 상세
장바구니
재진입
```

이미지 깨짐, 무한 fallback, 과도한 blur, 잘못된 crop, 품절 배지 회귀가 없어야 한다.

---

## 완료 보고

다음 순서로 보고하라.

1. 최종 원인
2. 실제 변경 파일
3. Cloudinary 프리셋과 후보 폭
4. URL transformation 구현
5. Home 첫 두 장 우선순위 처리
6. MenuDetail과 Cart 처리
7. preconnect 적용
8. fallback 안전성
9. 실행 명령
10. lint/build 결과
11. 수정 전후 Network 비교표
12. iPhone/Android QA 결과
13. 남은 위험
14. 배포 및 롤백 방법

단순히 “최적화 완료”라고 보고하지 말고 실제 Request URL과 transferred size를 근거로 제시하라.
