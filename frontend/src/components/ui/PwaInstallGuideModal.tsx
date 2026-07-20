/**
 * [File Role] PWA 홈 화면 추가 가이드 모달 컴포넌트
 * - 아이폰(iOS)과 갤럭시(Android) 두 가지 OS별 설치 방법을 단계별로 안내합니다.
 * - 사용자가 앱을 설치하도록 유도하는 후킹 카피와 함께 알림 혜택을 강조합니다.
 */
import { useState, useCallback } from 'react';
import { X, Bell, Share, Plus, Globe, Smartphone } from 'lucide-react';

interface PwaInstallGuideModalProps {
  onClose: () => void;
}

type OsTab = 'ios' | 'android';

const IOS_STEPS = [
  {
    icon: Share,
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    step: 1,
    title: '공유 버튼 누르기',
    desc: '화면 하단 가운데 있는 공유 버튼을 눌러주세요.',
    tip: '사파리(Safari)에서만 동작합니다.',
    image: '/img/guide/ios-step1.png',
  },
  {
    icon: Plus,
    iconBg: 'bg-green-100',
    iconColor: 'text-green-600',
    step: 2,
    title: '홈 화면에 추가 선택',
    desc: '아래로 스크롤하여 "홈 화면에 추가"를 눌러주세요.',
    tip: '',
    image: '/img/guide/ios-step2.png',
  },
  {
    icon: Bell,
    iconBg: 'bg-primary/10',
    iconColor: 'text-primary',
    step: 3,
    title: '추가 후 앱 실행 & 알림 허용',
    desc: '홈 화면의 앱 아이콘을 눌러 실행한 뒤, 알림 허용 팝업에서 "허용"을 눌러주세요!',
    tip: '이제부터 음료가 완성되면 바로 알림이 울려요 🔔',
    image: '/img/guide/ios-step3.png',
  },
];

const ANDROID_STEPS = [
  {
    icon: Globe,
    iconBg: 'bg-yellow-100',
    iconColor: 'text-yellow-600',
    step: 1,
    title: '크롬 메뉴 열기',
    desc: '크롬(Chrome) 브라우저 주소창 우측의 ⋮ 버튼을 눌러주세요.',
    tip: '삼성 인터넷 등 다른 브라우저에서도 비슷한 방법으로 추가할 수 있어요.',
    image: '/img/guide/android-step1.png',
  },
  {
    icon: Smartphone,
    iconBg: 'bg-green-100',
    iconColor: 'text-green-600',
    step: 2,
    title: '홈 화면에 추가 선택',
    desc: '메뉴에서 "홈 화면에 추가" 또는 "앱 설치"를 선택하세요.',
    tip: '',
    image: '/img/guide/android-step2.png',
  },
  {
    icon: Bell,
    iconBg: 'bg-primary/10',
    iconColor: 'text-primary',
    step: 3,
    title: '앱 실행 & 알림 허용',
    desc: '홈 화면의 앱 아이콘으로 실행하면 알림 허용 팝업이 뜹니다. "허용"을 눌러주세요!',
    tip: '메뉴 준비 완료 알림이 바로 울려요 🔔',
    image: '/img/guide/android-step3.png',
  },
];

export const PwaInstallGuideModal = ({ onClose }: PwaInstallGuideModalProps) => {
  // iOS 기기 여부를 자동 감지하여 기본 탭 설정
  const defaultTab: OsTab = /iPad|iPhone|iPod/.test(navigator.userAgent) ? 'ios' : 'android';
  const [activeTab, setActiveTab] = useState<OsTab>(defaultTab);

  const steps = activeTab === 'ios' ? IOS_STEPS : ANDROID_STEPS;

  const handleBackdropClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center"
      onClick={handleBackdropClick}
    >
      <div
        className="bg-white w-full max-w-[480px] rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-8 sm:zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 - 후킹 카피 */}
        <div className="relative bg-gradient-to-br from-[#1A0A0A] via-[#2D1616] to-[#1A0A0A] px-6 pt-8 pb-6 text-white overflow-hidden">
          {/* 배경 장식 */}
          <div className="absolute top-0 right-0 w-40 h-40 bg-primary/20 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-primary/10 rounded-full blur-2xl" />

          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-all active:scale-90"
            aria-label="닫기"
          >
            <X size={16} />
          </button>

          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/30">
                <Bell size={16} className="text-white" />
              </div>
              <span className="text-primary font-black text-[12px] uppercase tracking-widest">앱 설치 가이드</span>
            </div>

            <h2 className="text-[22px] font-black leading-tight tracking-tight mb-2 break-keep">
              음료 준비되면<br />
              <span className="text-primary">바로 알림</span>을 받아보세요! 🔔
            </h2>

            <p className="text-white/60 text-[13px] font-medium leading-relaxed break-keep">
              홈 화면에 카페 앱을 추가하면 음료 준비 완료 알림이 바로 울립니다. 음료를 놓치지 마세요!
            </p>

            {/* 혜택 태그 */}
            <div className="flex flex-wrap gap-2 mt-4">
              {['📳 준비 완료 알림', '⚡ 빠른 주문', '🎯 내 주문 실시간 추적'].map((tag) => (
                <span
                  key={tag}
                  className="bg-white/10 border border-white/10 text-white/80 text-[11px] font-bold px-3 py-1 rounded-full"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* OS 탭 선택 */}
        <div className="flex gap-2 px-6 pt-5 pb-1">
          <button
            onClick={() => setActiveTab('ios')}
            className={`flex-1 py-2.5 rounded-2xl font-black text-[13px] transition-all ${activeTab === 'ios'
              ? 'bg-[#1A0A0A] text-white shadow-md'
              : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
              }`}
          >
            🍎 아이폰 (iPhone)
          </button>
          <button
            onClick={() => setActiveTab('android')}
            className={`flex-1 py-2.5 rounded-2xl font-black text-[13px] transition-all ${activeTab === 'android'
              ? 'bg-[#1A0A0A] text-white shadow-md'
              : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
              }`}
          >
            🤖 갤럭시 (Android)
          </button>
        </div>

        {/* 단계별 가이드 */}
        <div className="px-6 py-4 space-y-4 max-h-[420px] overflow-y-auto">
          {steps.map((s, index) => {
            const Icon = s.icon;
            return (
              <div
                key={s.step}
                className="bg-gray-50 rounded-2xl border border-gray-100 overflow-hidden"
              >
                {/* 스텝 이미지 */}
                <div className="relative w-full h-44 bg-gray-100 overflow-hidden">
                  <img
                    src={s.image}
                    alt={s.title}
                    className="w-full h-full object-cover object-top"
                  />
                  {/* 스텝 번호 뱃지 */}
                  <div className="absolute top-3 left-3 flex items-center gap-1.5">
                    <div className={`w-8 h-8 ${s.iconBg} rounded-xl flex items-center justify-center shadow-md border border-white/60`}>
                      <Icon size={16} className={s.iconColor} />
                    </div>
                    <span className="bg-[#1A0A0A]/80 backdrop-blur-sm text-white text-[11px] font-black px-2.5 py-1 rounded-full">
                      STEP {s.step}
                    </span>
                  </div>
                </div>

                {/* 설명 */}
                <div className="p-4">
                  <h4 className="font-black text-gray-900 text-[14px] mb-1">{s.title}</h4>
                  <p className="text-gray-500 text-[12px] font-medium leading-relaxed break-keep">{s.desc}</p>
                  {s.tip && (
                    <p className="mt-2 text-[11px] font-bold text-primary bg-primary/5 px-2.5 py-1.5 rounded-lg inline-block">
                      💡 {s.tip}
                    </p>
                  )}
                </div>

                {/* 다음 단계 화살표 */}
                {index < steps.length - 1 && (
                  <div className="flex justify-center pb-3 text-gray-300">
                    <span className="text-[20px]">↓</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

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
