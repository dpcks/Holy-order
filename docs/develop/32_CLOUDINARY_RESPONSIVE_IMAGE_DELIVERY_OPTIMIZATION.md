# 32. 사용자 PWA Cloudinary 반응형 이미지 전달 최적화

## 0. 작업 목적

Holy-order 사용자 PWA의 메뉴 목록, 메뉴 상세, 장바구니에서 Cloudinary 원본 이미지를 그대로 요청하는 구조를 개선한다.

이번 작업의 핵심 목표는 다음 네 가지다.

1. Cloudinary 전달 URL에 `f_auto`, `q_auto`, `w/h`, `c_fill`, `g_auto`를 적용한다.
2. 메뉴 목록의 첫 두 이미지는 `eager + high priority`, 나머지는 `lazy`로 로딩한다.
3. `srcSet`과 `sizes`를 사용해 기기 화면과 DPR에 맞는 크기의 이미지만 내려받는다.
4. 사용자 HTML에서 `res.cloudinary.com` 연결을 미리 준비한다.

이 작업은 이미지 전달 최적화 작업이다. 이미지 업로드 방식, DB 스키마, Railway API, 주문 로직, 이벤트 로직, PWA 푸시, WebSocket은 변경하지 않는다.

---

## 1. 현재 코드 기준 문제 정의

현재 저장소의 사용자 화면은 메뉴 이미지를 다음과 같이 원본 URL로 직접 렌더링한다.

### `frontend/src/pages/Home.tsx`

```tsx
<img
  src={menu.image_url}
  alt={menu.name}
/>
```

현재 문제:

- 메뉴 카드 표시 크기는 약 200~230 CSS px인데 원본 이미지 전체를 받을 수 있다.
- `srcSet`과 `sizes`가 없다.
- `loading="lazy"`가 없다.
- 첫 화면 이미지와 아래쪽 이미지의 우선순위가 동일하다.
- `decoding="async"`와 `fetchPriority`가 없다.

### `frontend/src/pages/MenuDetail.tsx`

```tsx
<img
  src={menu.image_url}
  alt={menu.name}
/>
```

현재 문제:

- 약 468px 폭의 4:3 영역에 원본 이미지를 사용한다.
- 상세 화면의 주요 이미지이지만 높은 요청 우선순위가 명시되지 않았다.
- 반응형 후보 이미지가 없다.

### `frontend/src/pages/Cart.tsx`

```tsx
<img
  src={item.image_url}
  alt={item.name}
/>
```

현재 문제:

- 실제 표시 크기는 72×72px인데 원본 이미지를 사용할 수 있다.
- 장바구니 항목이 여러 개면 원본 요청이 반복될 수 있다.

### `frontend/src/utils/uploadImage.ts`

현재 Cloudinary 업로드 응답의 `secure_url`을 그대로 DB 저장용 URL로 반환한다.

```ts
return data.secure_url;
```

이 동작은 유지해야 한다. DB에는 한 가지 canonical 원본 URL을 저장하고, 화면별 변환 URL은 렌더링 시 생성하는 것이 이번 작업의 원칙이다.

### `frontend/index.html`

현재 `res.cloudinary.com`에 대한 `preconnect`와 `dns-prefetch`가 없다.

---

## 2. 최종 동작 기준

### 사용자 홈 메뉴 목록

```text
첫 번째 메뉴 이미지   eager + fetchPriority=high
두 번째 메뉴 이미지   eager + fetchPriority=high
세 번째 이후 이미지   lazy + fetchPriority=auto
```

각 메뉴 카드에는 화면 크기와 DPR에 따라 다음 후보 중 적절한 이미지가 선택되어야 한다.

```text
240px
360px
480px
720px
```

### 메뉴 상세

상세 이미지 하나는 화면의 주요 이미지이므로 다음 정책을 사용한다.

```text
loading=eager
fetchPriority=high
decoding=async
```

후보 크기:

```text
480px
768px
1024px
1280px
```

### 장바구니

장바구니 썸네일은 72px 표시 영역에 맞춰 작은 변환 이미지를 사용한다.

후보 크기:

```text
96px
144px
216px
288px
```

장바구니에서도 화면 상단에 바로 보이는 첫 두 이미지는 eager로 두고 나머지는 lazy로 처리할 수 있다.

### Cloudinary가 아닌 URL

다음 URL은 기존 동작을 유지한다.

- Unsplash fallback
- 정적 `/img/...` 경로
- Cloudinary가 아닌 외부 이미지
- 잘못된 형식의 URL

Cloudinary 변환 유틸리티는 비 Cloudinary URL을 변경하지 않아야 한다.

---

## 3. 구현 원칙

### 3.1 DB에는 변환 URL을 저장하지 않는다

DB의 `menu.image_url`에는 업로드 후 받은 canonical `secure_url`을 그대로 유지한다.

잘못된 방향:

```text
DB에 menu-card용 480px URL 저장
DB에 menu-detail용 1024px URL 저장
```

올바른 방향:

```text
DB
→ 원본 canonical URL 1개

프런트 렌더링
→ menu-card 변환 URL
→ menu-detail 변환 URL
→ cart-thumbnail 변환 URL
```

### 3.2 Cloudinary SDK를 새로 추가하지 않는다

이 작업은 URL transformation만으로 구현한다.

금지:

- `@cloudinary/react` 신규 도입
- `@cloudinary/url-gen` 신규 도입
- 백엔드 이미지 proxy 추가
- Cloudinary 환경변수 변경
- Upload Preset 변경

### 3.3 Service Worker 이미지 캐시는 이번 범위에서 제외한다

이번 작업에서는 다음만 적용한다.

- Cloudinary CDN 변환
- 브라우저 기본 캐시
- `srcSet`
- lazy/eager 우선순위
- preconnect

`sw.ts`에 Cloudinary runtime cache를 추가하지 않는다. 캐시 만료와 이미지 교체 정책은 별도 작업으로 다룬다.

### 3.4 첫 화면의 모든 이미지를 eager로 만들지 않는다

eager 대상은 각 메뉴 목록의 첫 두 장으로 제한한다.

```text
모든 이미지 eager
→ 초기 네트워크 경쟁 증가
→ 금지
```

---

## 4. 신규 Cloudinary URL 유틸리티

다음 파일을 신규 생성한다.

```text
frontend/src/utils/cloudinaryImage.ts
```

### 4.1 프리셋 정의

권장 프리셋:

```ts
export type CloudinaryImagePreset =
  | 'menu-card'
  | 'menu-detail'
  | 'cart-thumbnail';

export type CloudinaryImageConfig = {
  widths: readonly number[];
  fallbackWidth: number;
  aspectRatio: number; // width / height
  sizes: string;
};

export const CLOUDINARY_IMAGE_PRESETS = {
  'menu-card': {
    widths: [240, 360, 480, 720],
    fallbackWidth: 480,
    aspectRatio: 1,
    sizes: '(max-width: 500px) calc((100vw - 48px) / 2), 226px',
  },

  'menu-detail': {
    widths: [480, 768, 1024, 1280],
    fallbackWidth: 1024,
    aspectRatio: 4 / 3,
    sizes: '(max-width: 500px) calc(100vw - 32px), 468px',
  },

  'cart-thumbnail': {
    widths: [96, 144, 216, 288],
    fallbackWidth: 216,
    aspectRatio: 1,
    sizes: '72px',
  },
} as const satisfies Record<
  CloudinaryImagePreset,
  CloudinaryImageConfig
>;
```

후보 크기를 불필요하게 많이 만들지 않는다. 각 원본 이미지마다 과도한 파생 asset이 생성되지 않도록 위 후보 세트를 기본값으로 유지한다.

### 4.2 Cloudinary URL 판정

```ts
const CLOUDINARY_HOST = 'res.cloudinary.com';
const CLOUDINARY_UPLOAD_MARKER = '/image/upload/';

export const isCloudinaryImageUrl = (
  rawUrl: string,
): boolean => {
  try {
    const url = new URL(rawUrl);

    return (
      url.protocol === 'https:' &&
      url.hostname === CLOUDINARY_HOST &&
      url.pathname.includes(
        CLOUDINARY_UPLOAD_MARKER,
      )
    );
  } catch {
    return false;
  }
};
```

### 4.3 변환 URL 생성

변환 문자열은 `/image/upload/` 바로 뒤에 삽입한다.

```ts
const buildTransformation = (
  width: number,
  aspectRatio: number,
): string => {
  const height = Math.round(
    width / aspectRatio,
  );

  return [
    'f_auto',
    'q_auto',
    'c_fill',
    'g_auto',
    `w_${width}`,
    `h_${height}`,
  ].join(',');
};

export const getCloudinaryImageUrl = (
  rawUrl: string,
  preset: CloudinaryImagePreset,
  width?: number,
): string => {
  if (!isCloudinaryImageUrl(rawUrl)) {
    return rawUrl;
  }

  const config =
    CLOUDINARY_IMAGE_PRESETS[preset];

  const targetWidth =
    width ?? config.fallbackWidth;

  const transformation =
    buildTransformation(
      targetWidth,
      config.aspectRatio,
    );

  return rawUrl.replace(
    CLOUDINARY_UPLOAD_MARKER,
    `${CLOUDINARY_UPLOAD_MARKER}${transformation}/`,
  );
};
```

예상 URL 형식:

```text
https://res.cloudinary.com/<cloud>/image/upload/
f_auto,q_auto,c_fill,g_auto,w_480,h_480/
v1234/menu.jpg
```

### 4.4 `srcSet` 생성

```ts
export const getCloudinarySrcSet = (
  rawUrl: string,
  preset: CloudinaryImagePreset,
): string | undefined => {
  if (!isCloudinaryImageUrl(rawUrl)) {
    return undefined;
  }

  const config =
    CLOUDINARY_IMAGE_PRESETS[preset];

  return config.widths
    .map(
      (width) =>
        `${getCloudinaryImageUrl(
          rawUrl,
          preset,
          width,
        )} ${width}w`,
    )
    .join(', ');
};

export const getCloudinarySizes = (
  preset: CloudinaryImagePreset,
): string =>
  CLOUDINARY_IMAGE_PRESETS[preset].sizes;
```

### 4.5 안전 요구사항

- 빈 문자열이면 빈 문자열을 반환한다.
- URL 파싱 실패 시 원본을 반환한다.
- Cloudinary 외부 URL을 변환하지 않는다.
- query string과 hash를 손실하지 않는다.
- DB 값이나 `menu` 객체를 mutate하지 않는다.
- 같은 인자에는 항상 같은 문자열을 반환한다.

---

## 5. 공용 이미지 컴포넌트

중복 코드를 줄이기 위해 다음 파일을 권장한다.

```text
frontend/src/components/ui/CloudinaryImage.tsx
```

### 권장 Props

```ts
import type {
  ImgHTMLAttributes,
} from 'react';

import {
  getCloudinaryImageUrl,
  getCloudinarySizes,
  getCloudinarySrcSet,
  type CloudinaryImagePreset,
} from '../../utils/cloudinaryImage';

type CloudinaryImageProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  | 'src'
  | 'srcSet'
  | 'sizes'
  | 'loading'
  | 'fetchPriority'
  | 'decoding'
> & {
  src: string;
  preset: CloudinaryImagePreset;
  priority?: boolean;
  fallbackSrc?: string;
};
```

### 렌더링 정책

```tsx
export const CloudinaryImage = ({
  src,
  preset,
  priority = false,
  fallbackSrc,
  onError,
  ...props
}: CloudinaryImageProps) => {
  const optimizedSrc =
    getCloudinaryImageUrl(src, preset);

  const optimizedSrcSet =
    getCloudinarySrcSet(src, preset);

  const sizes = optimizedSrcSet
    ? getCloudinarySizes(preset)
    : undefined;

  return (
    <img
      {...props}
      src={optimizedSrc}
      srcSet={optimizedSrcSet}
      sizes={sizes}
      loading={
        priority ? 'eager' : 'lazy'
      }
      fetchPriority={
        priority ? 'high' : 'auto'
      }
      decoding="async"
      onError={(event) => {
        const target = event.currentTarget;

        if (
          fallbackSrc &&
          target.dataset.fallbackApplied
            !== 'true'
        ) {
          target.dataset.fallbackApplied =
            'true';

          // srcSet이 남으면 브라우저가 실패한 후보를
          // 다시 선택할 수 있으므로 반드시 제거한다.
          target.removeAttribute('srcset');
          target.removeAttribute('sizes');
          target.src = fallbackSrc;
        }

        onError?.(event);
      }}
    />
  );
};
```

Antigravity는 현재 React 19 타입 정의에서 `fetchPriority`가 정상 인식되는지 빌드로 확인한다. 타입 에러를 피하기 위해 `any`로 우회하지 않는다.

---

## 6. `Home.tsx` 적용

### 6.1 `MenuCard`에 priority 전달

현재:

```tsx
{currentMenus.map((menu) => (
  <MenuCard
    key={menu.id}
    menu={menu}
  />
))}
```

수정:

```tsx
{currentMenus.map((menu, index) => (
  <MenuCard
    key={menu.id}
    menu={menu}
    priority={index < 2}
    isEventMode={
      Boolean(activeEvent?.is_event_mode)
    }
    showPrice={
      shopSettings?.show_price ?? true
    }
    onClick={() =>
      navigate(`/menu/${menu.id}`, {
        state: {
          menu,
          isEventMode: Boolean(
            activeEvent?.is_event_mode,
          ),
        },
      })
    }
    onShowToast={showToast}
  />
))}
```

검색 결과도 동일하게 첫 두 장만 priority 처리한다.

```tsx
{filteredMenus.map((menu, index) => (
  <MenuCard
    key={menu.id}
    menu={menu}
    priority={index < 2}
    ...
  />
))}
```

### 6.2 `MenuCard` 이미지 변경

```tsx
const MENU_PLACEHOLDER =
  'https://images.unsplash.com/photo-1559525839-b184a4d698c7?w=400&q=80';

const MenuCard = ({
  menu,
  priority = false,
  ...rest
}: {
  menu: Menu;
  priority?: boolean;
  // 기존 props 유지
}) => {
  // 기존 click 로직 유지

  return (
    <div ...>
      <div className="relative aspect-square rounded-2xl overflow-hidden bg-gray-100 mb-3">
        {menu.image_url ? (
          <CloudinaryImage
            src={menu.image_url}
            preset="menu-card"
            priority={priority}
            fallbackSrc={MENU_PLACEHOLDER}
            alt={menu.name}
            width={480}
            height={480}
            className={`
              w-full h-full object-cover
              transition-transform duration-300
              ${menu.is_available
                ? 'group-hover:scale-105'
                : 'grayscale'}
            `}
          />
        ) : (
          <img
            src={MENU_PLACEHOLDER}
            alt="coffee placeholder"
            loading={
              priority ? 'eager' : 'lazy'
            }
            fetchPriority={
              priority ? 'high' : 'auto'
            }
            decoding="async"
            width={480}
            height={480}
            className="w-full h-full object-cover opacity-80"
          />
        )}

        {/* 기존 품절, FREE, NEW 배지 유지 */}
      </div>
    </div>
  );
};
```

### 6.3 카테고리 변경 시 동작

- 선택한 카테고리에서 렌더되는 첫 두 메뉴가 priority 대상이다.
- 숨겨진 다른 카테고리의 이미지를 미리 요청하지 않는다.
- 검색 결과 전환 시 검색 결과의 첫 두 메뉴만 priority 대상이다.
- 품절 메뉴가 하단 정렬된 기존 동작을 유지한다.

---

## 7. `MenuDetail.tsx` 적용

메뉴 상세의 단일 hero 이미지는 항상 priority 이미지다.

```tsx
const MENU_DETAIL_PLACEHOLDER =
  'https://images.unsplash.com/photo-1559525839-b184a4d698c7?w=800&q=80';

{menu.image_url ? (
  <CloudinaryImage
    src={menu.image_url}
    preset="menu-detail"
    priority
    fallbackSrc={
      MENU_DETAIL_PLACEHOLDER
    }
    alt={menu.name}
    width={1024}
    height={768}
    className="w-full h-full object-cover"
  />
) : (
  <img
    src={MENU_DETAIL_PLACEHOLDER}
    alt="coffee"
    loading="eager"
    fetchPriority="high"
    decoding="async"
    width={1024}
    height={768}
    className="w-full h-full object-cover"
  />
)}
```

기존 사항 유지:

- 4:3 aspect ratio
- 메뉴명과 설명 배치
- 이벤트 배너
- 옵션 선택
- 하단 fixed 주문 바
- safe area
- 주문 가능 여부 처리

---

## 8. `Cart.tsx` 적용

장바구니 72×72 이미지에 `cart-thumbnail` 프리셋을 적용한다.

```tsx
const CART_IMAGE_PLACEHOLDER =
  'https://images.unsplash.com/photo-1559525839-b184a4d698c7?w=100&q=80';

{items.map((item, index) => (
  <div key={item.cartItemId} ...>
    <div className="w-[72px] h-[72px] rounded-xl overflow-hidden bg-gray-100 shrink-0">
      {item.image_url ? (
        <CloudinaryImage
          src={item.image_url}
          preset="cart-thumbnail"
          priority={index < 2}
          fallbackSrc={
            CART_IMAGE_PLACEHOLDER
          }
          alt={item.name}
          width={216}
          height={216}
          className="w-full h-full object-cover"
        />
      ) : (
        <img
          src={CART_IMAGE_PLACEHOLDER}
          alt="coffee"
          loading={
            index < 2 ? 'eager' : 'lazy'
          }
          fetchPriority={
            index < 2 ? 'high' : 'auto'
          }
          decoding="async"
          width={216}
          height={216}
          className="w-full h-full object-cover opacity-80"
        />
      )}
    </div>

    {/* 기존 장바구니 UI 유지 */}
  </div>
))}
```

Cart의 주문·가격·이벤트·Toss·PWA 구독 로직은 변경하지 않는다.

---

## 9. Cloudinary preconnect

`frontend/index.html`의 `<head>`에 다음을 추가한다.

```html
<link
  rel="preconnect"
  href="https://res.cloudinary.com"
  crossorigin
/>
<link
  rel="dns-prefetch"
  href="//res.cloudinary.com"
/>
```

권장 위치:

```html
<meta name="theme-color" ... />

<link
  rel="preconnect"
  href="https://res.cloudinary.com"
  crossorigin
/>
<link
  rel="dns-prefetch"
  href="//res.cloudinary.com"
/>

<link rel="apple-touch-icon" ... />
```

요구사항:

- 사용자 `index.html`에 한 번만 추가한다.
- 중복 태그를 만들지 않는다.
- Cloudinary 업로드 endpoint인 `api.cloudinary.com`은 preconnect하지 않는다.
- 이번 작업에서는 `admin.html` 변경을 필수로 하지 않는다.

---

## 10. `uploadImage.ts` 문구 정리

업로드 함수 동작은 유지한다.

현재 주석의 “최적화된 URL을 반환”이라는 표현은 실제 동작과 다를 수 있으므로 다음처럼 수정한다.

```ts
/*
Cloudinary에 원본 이미지를 업로드하고,
DB 저장에 사용할 canonical secure_url을 반환한다.
화면별 크기·포맷·품질 최적화는
cloudinaryImage.ts에서 전달 시점에 적용한다.
*/
```

변경 금지:

```text
Upload Preset
Cloudinary cloud name
업로드 endpoint
secure_url 저장 방식
관리자 이미지 업로드 UI
```

---

## 11. 이미지 오류 처리

`srcSet`을 적용한 이미지의 fallback 처리 시 반드시 다음을 수행한다.

```text
1. srcset 제거
2. sizes 제거
3. fallback src 적용
4. fallback도 실패할 때 무한 반복 금지
```

단순히 `event.currentTarget.src = fallback`만 설정하면 브라우저가 남아 있는 `srcSet` 후보를 다시 선택할 수 있으므로 금지한다.

Cloudinary URL 생성 실패 자체는 사용자 화면을 깨뜨리면 안 된다.

```text
변환 불가
→ 원본 URL 사용

원본도 로드 실패
→ 기존 placeholder 사용
```

---

## 12. 변경 범위

### 신규 파일

```text
frontend/src/utils/cloudinaryImage.ts
frontend/src/components/ui/CloudinaryImage.tsx
```

### 수정 파일

```text
frontend/src/pages/Home.tsx
frontend/src/pages/MenuDetail.tsx
frontend/src/pages/Cart.tsx
frontend/src/utils/uploadImage.ts
frontend/index.html
```

### 변경하지 않을 파일

```text
backend/*
frontend/src/sw.ts
frontend/admin.html
frontend/vite.config.ts
Railway 환경변수
Vercel 환경변수
Cloudinary Upload Preset
DB image_url 데이터
```

---

## 13. 금지 사항

이번 작업에서 다음을 하지 않는다.

- 메뉴 API 응답 구조 변경
- DB 이미지 URL 일괄 변환
- 백엔드 image proxy 도입
- Cloudinary SDK 추가
- 모든 이미지 eager 로딩
- 모든 이미지 preload
- 원본 이미지와 변환 이미지를 중복 요청
- Service Worker runtime image caching 추가
- 이벤트/공지 이미지 최적화까지 범위 확대
- 정적 SVG/PWA 아이콘 변환
- 주문·결제·푸시·WebSocket 로직 수정
- 관리자 PWA 구조 수정
- Cloudinary 리전 또는 계정 설정 변경

---

## 14. 빌드 검증

```bash
cd frontend
npm ci
npm run lint
npm run build
```

완료 기준:

```text
TypeScript 오류 0
ESLint 오류 0
Vite build 성공
React fetchPriority 타입 오류 없음
unused import 없음
```

현재 프런트에 자동 테스트 프레임워크가 없다면 이번 작업만을 위해 Vitest를 신규 추가하지 않는다.

---

## 15. 브라우저 개발자 도구 검증

### 15.1 테스트 조건

Chrome DevTools:

```text
Network
Disable cache 활성화
Slow 4G 또는 Fast 3G 비교
Img 필터
```

최소 세 번 측정하고 첫 한 번의 결과만으로 결론을 내리지 않는다.

### 15.2 Home 요청 URL

정상적인 메뉴 카드 요청은 URL에 다음이 포함되어야 한다.

```text
/image/upload/f_auto,q_auto,c_fill,g_auto,w_...,h_.../
```

원본 `menu.image_url` 그대로의 대형 요청이 메뉴 카드에서 발생하면 실패다.

### 15.3 우선순위

첫 두 카드 DOM:

```text
loading="eager"
fetchpriority="high"
```

나머지 카드:

```text
loading="lazy"
fetchpriority="auto"
```

브라우저는 viewport 주변 lazy 이미지를 선행 요청할 수 있으므로 “네트워크 요청이 정확히 두 장만 발생”을 강제 기준으로 사용하지 않는다. 속성과 waterfall 우선순위를 함께 확인한다.

### 15.4 반응형 후보 선택

다음 환경에서 실제 선택된 URL 폭을 확인한다.

```text
iPhone 또는 390px 모바일 viewport
Android 또는 412px 모바일 viewport
Desktop 500px max-width wrapper
DPR 1
DPR 2
DPR 3
```

작은 화면에서 무조건 1280px 후보를 선택하면 실패다.

### 15.5 MenuDetail

상세 화면의 첫 이미지 요청은:

```text
menu-detail preset
loading=eager
fetchpriority=high
4:3 변환
```

이어야 한다.

### 15.6 Cart

72px 썸네일이 수백~수천 px 원본을 요청하지 않아야 한다.

---

## 16. 성능 비교 보고

Antigravity는 대표 메뉴 이미지 최소 세 장을 선택해 수정 전후를 기록한다.

표 예시:

| 화면 | 이미지 | 수정 전 transferred | 수정 후 transferred | 선택 폭 | 형식 |
|---|---|---:|---:|---:|---|
| Home | 아메리카노 | 1.8MB | 82KB | 480w | WebP/AVIF 등 |
| Home | 카페라떼 | 1.2MB | 76KB | 480w | WebP/AVIF 등 |
| Detail | 아메리카노 | 1.8MB | 210KB | 1024w | WebP/AVIF 등 |
| Cart | 아메리카노 | 1.8MB | 18KB | 216w | WebP/AVIF 등 |

위 숫자는 예시이며 실제 측정값을 사용한다.

보고 항목:

```text
Request URL
Transferred size
Resource size
Content-Type
Waiting/TTFB
Content download
첫 실행
두 번째 실행
```

첫 변환 요청은 파생 이미지 생성으로 인해 따뜻한 CDN 캐시보다 느릴 수 있으므로 cold/warm 결과를 구분한다.

---

## 17. 실기기 QA

### iPhone 홈 화면 PWA

```text
1. 앱 완전 종료
2. 네트워크 연결 상태 확인
3. 사용자 PWA 실행
4. 첫 카테고리 첫 두 이미지 표시 시점 확인
5. 아래로 스크롤하여 lazy 이미지 확인
6. 다른 카테고리로 이동
7. 메뉴 상세 진입
8. 장바구니 진입
9. 뒤로 가기 및 재진입
```

기대 결과:

- 첫 두 메뉴 이미지가 빠르게 표시된다.
- 아래쪽 메뉴 이미지는 스크롤 시 자연스럽게 표시된다.
- 이미지가 깨지거나 반복 깜빡이지 않는다.
- 메뉴 상세 이미지 품질이 과도하게 낮지 않다.
- 장바구니 썸네일이 빠르게 표시된다.

### Android Chrome/PWA

동일 시나리오를 확인한다.

### 일반 모바일 브라우저

QR로 Safari/Chrome에 접속한 사용자도 동일하게 최적화 URL을 사용해야 한다.

---

## 18. 회귀 테스트

다음 기능에 회귀가 없어야 한다.

```text
메뉴 카테고리 전환
검색 결과
품절 메뉴 하단 정렬
품절 오버레이
FREE 배지
NEW 배지
메뉴 상세 옵션 선택
장바구니 수량 변경
이벤트 무료 표시
Toss 결제
주문 생성
PWA 푸시
영업 상태 실시간 반영
관리자 메뉴 이미지 업로드
```

---

## 19. 완료 기준

다음 조건을 모두 충족해야 완료다.

- [ ] `cloudinaryImage.ts`가 추가되었다.
- [ ] Cloudinary 외부 URL은 원본 그대로 유지된다.
- [ ] Home 메뉴 카드가 `f_auto,q_auto,w/h` URL을 사용한다.
- [ ] Home 첫 두 장은 eager/high, 나머지는 lazy다.
- [ ] 검색 결과 첫 두 장도 동일한 우선순위 정책을 사용한다.
- [ ] Home에 올바른 `srcSet`과 `sizes`가 있다.
- [ ] MenuDetail이 4:3 반응형 Cloudinary 이미지를 사용한다.
- [ ] MenuDetail hero가 eager/high다.
- [ ] Cart가 72px 전용 반응형 썸네일을 사용한다.
- [ ] 이미지 오류 시 `srcSet` 제거 후 fallback이 적용된다.
- [ ] `index.html`에 Cloudinary preconnect와 dns-prefetch가 한 번씩 있다.
- [ ] DB의 기존 `image_url` 값은 변경되지 않았다.
- [ ] Cloudinary Upload Preset은 변경되지 않았다.
- [ ] `npm run lint`가 성공했다.
- [ ] `npm run build`가 성공했다.
- [ ] iPhone PWA QA를 통과했다.
- [ ] Android QA를 통과했다.
- [ ] 수정 전후 Network 비교 결과가 보고되었다.

---

## 20. 배포 순서

```text
1. 현재 Network baseline 기록
2. cloudinaryImage 유틸리티 추가
3. 공용 CloudinaryImage 컴포넌트 추가
4. Home 적용
5. MenuDetail 적용
6. Cart 적용
7. index.html preconnect 적용
8. lint/build
9. Vercel Preview 배포
10. iPhone/Android QA
11. Production 배포
12. Network 결과 재측정
```

백엔드와 Railway는 재배포할 필요가 없다.

---

## 21. 롤백 방법

문제 발생 시 다음 파일 변경만 되돌린다.

```text
frontend/src/utils/cloudinaryImage.ts
frontend/src/components/ui/CloudinaryImage.tsx
frontend/src/pages/Home.tsx
frontend/src/pages/MenuDetail.tsx
frontend/src/pages/Cart.tsx
frontend/src/utils/uploadImage.ts
frontend/index.html
```

DB와 Cloudinary 원본 URL은 변경하지 않으므로 롤백 시 데이터 복구는 필요하지 않다.

---

## 22. 완료 보고 형식

1. 최종 원인 요약
2. 실제 변경 파일
3. 추가한 이미지 프리셋
4. Home eager/lazy 정책
5. `srcSet`/`sizes` 정책
6. MenuDetail과 Cart 적용 내용
7. preconnect 적용 위치
8. 비 Cloudinary URL fallback 처리
9. 실행한 명령
10. lint/build 결과
11. 수정 전후 Network 측정표
12. iPhone/Android QA 결과
13. 남은 위험
14. 배포 및 롤백 방법
