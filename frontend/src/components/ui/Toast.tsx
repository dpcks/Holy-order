/**
 * [File Role]
 * 프런트엔드 전역에서 사용되는 공용 토스트 알림 컴포넌트입니다.
 * Tailwind CSS와 Framer Motion과 유사한 애니메이션 효과를 활용해 프리미엄한 느낌을 줍니다.
 */

import { useEffect } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

interface ToastProps {
  message: string;
  type?: ToastType;
  isVisible: boolean;
  onClose: () => void;
  duration?: number;
}

export const Toast = ({ 
  message, 
  type = 'info', 
  isVisible, 
  onClose, 
  duration = 3000 
}: ToastProps) => {
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => {
        onClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [isVisible, duration, onClose]);

  if (!isVisible) return null;

  const typeStyles = {
    success: {
      bg: 'bg-white/90 border-green-100',
      icon: <CheckCircle2 size={18} className="text-green-500" />,
      text: 'text-green-700',
      pulse: 'bg-green-500'
    },
    error: {
      bg: 'bg-white/90 border-red-100',
      icon: <AlertCircle size={18} className="text-red-500" />,
      text: 'text-red-700',
      pulse: 'bg-red-500'
    },
    info: {
      bg: 'bg-white/90 border-blue-100',
      icon: <Info size={18} className="text-blue-500" />,
      text: 'text-blue-700',
      pulse: 'bg-blue-500'
    }
  };

  const style = typeStyles[type];

  return (
    <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-[100] animate-in fade-in slide-in-from-bottom-4 duration-300 w-[90%] max-w-[400px]">
      <div className={`px-5 py-4 rounded-2xl shadow-2xl flex items-center gap-3 border backdrop-blur-md ${style.bg}`}>
        <div className="shrink-0">{style.icon}</div>
        <div className="flex-1">
          <p className={`text-[13px] font-bold tracking-tight leading-tight ${style.text}`}>
            {message}
          </p>
        </div>
        <button 
          onClick={onClose}
          className="p-1 hover:bg-gray-100 rounded-lg transition-colors text-gray-400"
        >
          <X size={14} />
        </button>
        {/* 프로그레스 바 형태의 애니메이션 효과 */}
        <div className="absolute bottom-0 left-0 h-[3px] bg-gray-100/50 w-full rounded-b-2xl overflow-hidden">
          <div 
            className={`h-full ${style.pulse} transition-all duration-[3000ms] ease-linear`}
            style={{ width: isVisible ? '0%' : '100%' }}
          />
        </div>
      </div>
    </div>
  );
};
