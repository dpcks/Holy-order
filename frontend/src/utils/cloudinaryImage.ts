/*
 * [File Role] Cloudinary 반응형 이미지 URL 생성 유틸리티
 *
 * 아키텍처 위치: frontend/src/utils/cloudinaryImage.ts
 *
 * 설계 원칙:
 *   - DB의 image_url(canonical secure_url)은 절대 변경하지 않는다.
 *   - 렌더링 시점에만 화면별 변환 URL을 생성한다.
 *   - Cloudinary가 아닌 URL은 원본 그대로 반환한다.
 *   - Cloudinary SDK, 백엔드 프록시, Service Worker 캐시는 이 파일의 범위 밖이다.
 */

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

/**
 * 화면별 이미지 프리셋.
 * widths는 srcSet 후보 px 목록이며, 불필요하게 늘리지 않는다.
 */
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
} as const satisfies Record<CloudinaryImagePreset, CloudinaryImageConfig>;

// ─────────────────────────────────────────────────
// Cloudinary URL 판정
// ─────────────────────────────────────────────────
const CLOUDINARY_HOST = 'res.cloudinary.com';
const CLOUDINARY_UPLOAD_MARKER = '/image/upload/';

/**
 * 주어진 URL이 Cloudinary 이미지 URL인지 판정한다.
 * URL 파싱 실패 시 false를 반환하여 원본을 그대로 사용하도록 유도한다.
 */
export const isCloudinaryImageUrl = (rawUrl: string): boolean => {
  if (!rawUrl) return false;
  try {
    const url = new URL(rawUrl);
    return (
      url.protocol === 'https:' &&
      url.hostname === CLOUDINARY_HOST &&
      url.pathname.includes(CLOUDINARY_UPLOAD_MARKER)
    );
  } catch {
    return false;
  }
};

// ─────────────────────────────────────────────────
// 변환 URL 생성
// ─────────────────────────────────────────────────

/**
 * f_auto,q_auto,c_fill,g_auto,w_N,h_N 변환 문자열을 생성한다.
 * /image/upload/ 바로 뒤에 삽입된다.
 */
const buildTransformation = (width: number, aspectRatio: number): string => {
  const height = Math.round(width / aspectRatio);
  return ['f_auto', 'q_auto', 'c_fill', 'g_auto', `w_${width}`, `h_${height}`].join(',');
};

/**
 * rawUrl을 Cloudinary 변환 URL로 변환한다.
 * - rawUrl이 비어 있거나 Cloudinary URL이 아니면 rawUrl을 그대로 반환한다.
 * - width 미지정 시 preset의 fallbackWidth를 사용한다.
 * - DB 값(menu 객체)을 mutate하지 않는다.
 */
export const getCloudinaryImageUrl = (
  rawUrl: string,
  preset: CloudinaryImagePreset,
  width?: number,
): string => {
  if (!rawUrl) return rawUrl;
  if (!isCloudinaryImageUrl(rawUrl)) return rawUrl;

  const config = CLOUDINARY_IMAGE_PRESETS[preset];
  const targetWidth = width ?? config.fallbackWidth;
  const transformation = buildTransformation(targetWidth, config.aspectRatio);

  // /image/upload/ 뒤에 변환 파라미터 + 슬래시를 삽입한다.
  return rawUrl.replace(
    CLOUDINARY_UPLOAD_MARKER,
    `${CLOUDINARY_UPLOAD_MARKER}${transformation}/`,
  );
};

// ─────────────────────────────────────────────────
// srcSet / sizes 생성
// ─────────────────────────────────────────────────

/**
 * 프리셋에 정의된 widths에 따라 srcSet 문자열을 생성한다.
 * Cloudinary가 아닌 URL은 undefined를 반환하여 srcSet 없이 src만 사용한다.
 */
export const getCloudinarySrcSet = (
  rawUrl: string,
  preset: CloudinaryImagePreset,
): string | undefined => {
  if (!rawUrl || !isCloudinaryImageUrl(rawUrl)) return undefined;

  const config = CLOUDINARY_IMAGE_PRESETS[preset];
  return config.widths
    .map((w) => `${getCloudinaryImageUrl(rawUrl, preset, w)} ${w}w`)
    .join(', ');
};

/**
 * 프리셋에 정의된 sizes 문자열을 반환한다.
 */
export const getCloudinarySizes = (preset: CloudinaryImagePreset): string =>
  CLOUDINARY_IMAGE_PRESETS[preset].sizes;
