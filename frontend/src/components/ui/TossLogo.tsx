/**
 * [File Role] 토스 로고 이미지 컴포넌트
 * 토스 결제 관련 UI 전반에서 재사용되는 공통 이미지 컴포넌트.
 * lucide-react의 Send 아이콘 대신 실제 토스 로고를 표시합니다.
 */

type TossLogoProps = {
  /** 로고 높이 (px 단위) */
  size?: number;
  /** 로고 너비 (px 단위 또는 'auto') */
  width?: number | 'auto';
  /** 추가 CSS 클래스 */
  className?: string;
  /** 로고 색상 반전 여부 (선택 시 검은색으로 표시) */
  invert?: boolean;
};

export const TossLogo = ({ size = 20, width = 'auto', className = '', invert = false }: TossLogoProps) => (
  <img
    src="/img/toss_logo.png"
    alt="토스"
    className={`object-contain transition-all ${className}`}
    style={{ 
      height: size,
      width: width,
      filter: invert ? 'grayscale(1) brightness(0)' : 'none'
    }}
  />
);
