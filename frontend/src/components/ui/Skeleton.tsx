/**
 * [File Role] 공통 Skeleton UI 컴포넌트
 * - shimmer 애니메이션이 적용된 로딩 베이스
 * - className을 통해 크기와 형태(둥글기 등) 조절 가능
 */
import React from 'react';

interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  circle?: boolean;
}

export const Skeleton: React.FC<SkeletonProps> = ({ 
  className = '', 
  width, 
  height, 
  circle = false 
}) => {
  const style: React.CSSProperties = {
    width: width,
    height: height,
  };

  return (
    <div
      style={style}
      className={`animate-shimmer bg-gray-100 ${circle ? 'rounded-full' : 'rounded-lg'} ${className}`}
      aria-hidden="true"
    />
  );
};
