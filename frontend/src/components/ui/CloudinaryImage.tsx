/*
 * [File Role] Cloudinary 반응형 이미지 공용 컴포넌트
 *
 * 아키텍처 위치: frontend/src/components/ui/CloudinaryImage.tsx
 *
 * 설계 원칙:
 *   - src(원본 DB canonical URL)를 받아 preset에 맞는 변환 URL, srcSet, sizes를 자동 생성한다.
 *   - priority=true → loading=eager, fetchPriority=high
 *   - priority=false(기본값) → loading=lazy, fetchPriority=auto
 *   - 이미지 로딩 실패 시: srcset/sizes 제거 후 fallbackSrc 적용 (무한 반복 방지)
 *   - Cloudinary가 아닌 URL은 변환 없이 그대로 렌더링한다.
 */
import type { ImgHTMLAttributes } from 'react';
import {
  getCloudinaryImageUrl,
  getCloudinarySizes,
  getCloudinarySrcSet,
  type CloudinaryImagePreset,
} from '../../utils/cloudinaryImage';

type CloudinaryImageProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  'src' | 'srcSet' | 'sizes' | 'loading' | 'fetchPriority' | 'decoding'
> & {
  /** DB에 저장된 canonical secure_url */
  src: string;
  /** 화면별 이미지 프리셋 */
  preset: CloudinaryImagePreset;
  /** true 이면 eager/high, false(기본값) 이면 lazy/auto */
  priority?: boolean;
  /** 이미지 로딩 실패 시 대체 이미지 URL */
  fallbackSrc?: string;
};

/**
 * Cloudinary 반응형 이미지 컴포넌트.
 * 로딩 실패 시 srcset/sizes를 제거하여 브라우저가 실패한 후보를 반복 선택하지 않도록 한다.
 */
export const CloudinaryImage = ({
  src,
  preset,
  priority = false,
  fallbackSrc,
  onError,
  ...props
}: CloudinaryImageProps) => {
  // 변환 URL 및 srcSet 생성 (Cloudinary 비대상 URL은 원본 그대로)
  const optimizedSrc = getCloudinaryImageUrl(src, preset);
  const optimizedSrcSet = getCloudinarySrcSet(src, preset);
  const sizes = optimizedSrcSet ? getCloudinarySizes(preset) : undefined;

  return (
    <img
      {...props}
      src={optimizedSrc}
      srcSet={optimizedSrcSet}
      sizes={sizes}
      loading={priority ? 'eager' : 'lazy'}
      // fetchPriority는 React 19 / 최신 @types/react에서 지원된다.
      fetchPriority={priority ? 'high' : 'auto'}
      decoding="async"
      onError={(event) => {
        const target = event.currentTarget;

        // fallback을 이미 적용했으면 무한 루프 방지를 위해 중단한다.
        if (fallbackSrc && target.dataset.fallbackApplied !== 'true') {
          target.dataset.fallbackApplied = 'true';
          // srcSet이 남아 있으면 브라우저가 실패한 후보를 다시 선택할 수 있으므로 반드시 제거한다.
          target.removeAttribute('srcset');
          target.removeAttribute('sizes');
          target.src = fallbackSrc;
        }

        onError?.(event);
      }}
    />
  );
};
