/**
 * [File Role] PWA 홈 화면 추가 가이드 모달 컴포넌트
 * - 아이폰(iOS)과 갤럭시(Android) 두 가지 OS별 설치 방법을 단계별로 안내합니다.
 * - 사용자가 앱을 설치하도록 유도하는 후킹 카피와 함께 알림 혜택을 강조합니다.
 */
import { useState, useCallback, useEffect } from 'react';
import { X } from 'lucide-react';

interface PwaInstallGuideModalProps {
  onClose: () => void;
}

type OsTab = 'ios' | 'android';

export const PwaInstallGuideModal = ({ onClose }: PwaInstallGuideModalProps) => {
  // iOS 기기 여부를 자동 감지하여 기본 탭 설정
  const defaultTab: OsTab = /iPad|iPhone|iPod/.test(navigator.userAgent) ? 'ios' : 'android';
  const [activeTab, setActiveTab] = useState<OsTab>(defaultTab);

  // 모달이 열려있는 동안 배경 페이지 스크롤 완전 차단
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const handleBackdropClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center"
      onClick={handleBackdropClick}
    >
      {/* 모달 패널: 전체를 하나의 스크롤로 통일 */}
      <div
        className="bg-white w-full max-w-[480px] rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-y-auto overscroll-contain animate-in slide-in-from-bottom-8 sm:zoom-in-95 duration-300"
        style={{ maxHeight: '92dvh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 - 통이미지 교체 */}
        <div className="relative overflow-hidden bg-[#d1b189]/20">
          <img
            src="/img/design/pwa_guide_header.svg"
            alt="앱 설치 가이드 - 음료 준비되면 바로 알림을 받아보세요"
            className="w-full h-auto object-cover"
          />
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 bg-black/20 hover:bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center transition-all active:scale-90 text-white"
            aria-label="닫기"
          >
            <X size={16} />
          </button>
        </div>

        {/* OS 탭 선택 */}
        <div className="flex gap-2 px-6 pt-5 pb-1">
          <button
            onClick={() => setActiveTab('android')}
            className={`flex-1 py-2.5 rounded-2xl font-black text-[13px] transition-all ${activeTab === 'android'
              ? 'bg-[#23734A] text-white shadow-md'
              : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
              }`}
          >
            안드로이드
          </button>
          <button
            onClick={() => setActiveTab('ios')}
            className={`flex-1 py-2.5 rounded-2xl font-black text-[13px] transition-all ${activeTab === 'ios'
              ? 'bg-[#23734A] text-white shadow-md'
              : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
              }`}
          >
            아이폰
          </button>
        </div>

        {/* 가이드 콘텐츠 */}
        {activeTab === 'android' ? (
          <div className="px-4 py-4">
            <img
              src="/img/design/andorid_guide.svg"
              alt="안드로이드 PWA 앱 설치 가이드"
              className="w-full h-auto object-contain rounded-2xl shadow-sm border border-gray-100"
            />
          </div>
        ) : (
          <div className="px-4 py-4">
            <img
              src="/img/design/iphone_guide.svg"
              alt="아이폰 PWA 앱 설치 가이드"
              className="w-full h-auto object-contain rounded-2xl shadow-sm border border-gray-100"
            />
          </div>
        )}

        {/* 하단 CTA */}
        <div className="px-6 pb-8 pt-2">
          <div className="bg-primary/5 border border-primary/10 rounded-2xl px-5 py-4 text-center mb-4">
            <p className="text-[13px] font-bold text-gray-700 break-keep leading-relaxed">
              📱 설치 후 <span className="text-primary font-black">알림 허용</span>만 누르면 끝!<br />
              음료가 나오면 스마트폰이 바로 알려드려요.
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-full bg-[#1A0A0A] text-white py-4 rounded-2xl font-black text-[15px] shadow-lg active:scale-95 transition-all"
          >
            확인했어요!
          </button>
        </div>
      </div>
    </div>
  );
};
