import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Coffee, PartyPopper, Gift, Megaphone } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { useQuery } from '@tanstack/react-query';
import { QK } from '../api/queryKeys';
import { apiClient } from '../api/client';
import { usePublicSettings } from '../hooks/usePublicSettings';
import { Toast } from '../components/ui/Toast';
import { PwaInstallGuideModal } from '../components/ui/PwaInstallGuideModal';
import { useCurrentAnnouncements } from '../hooks/useCurrentAnnouncements';
import type { ToastType } from '../components/ui/Toast';
import type { Menu, Category, StandardResponse } from '../types';

export const Home = () => {
  const navigate = useNavigate();
  const categoryScrollRef = useRef<HTMLDivElement>(null);
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(() => {
    const saved = sessionStorage.getItem('lastActiveCategoryId');
    return saved ? Number(saved) : null;
  });
  const [activeOrders, setActiveOrders] = useState<{ id: string, orderNumber: number }[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [showInstallGuide, setShowInstallGuide] = useState(false);

  // PWA 독립 실행(standalone) 모드 여부 감지 - 설치된 앱에서는 배너를 숨김
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || (navigator as any).standalone === true;

  // 토스트 상태
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);

  // 푸시 알림 권한 상태 관리
  const [pushPermission, setPushPermission] = useState<NotificationPermission>(
    'Notification' in window ? Notification.permission : 'default'
  );

  const handleAllowPush = async () => {
    if (!('Notification' in window)) return;
    try {
      // 1. 권한 요청
      const permission = await Notification.requestPermission();
      setPushPermission(permission);

      if (permission !== 'granted') {
        showToast('알림이 차단되어 있습니다. 기기 설정에서 알림을 켜주세요!', 'error');
        return;
      }

      // 2. 실제 PushSubscription 생성까지 수행
      const { getOrCreatePushSubscription, isIosDevice, isStandalonePwa } = await import('../utils/push');

      // iOS Safari 탭에서는 홈 화면 설치 안내
      if (isIosDevice() && !isStandalonePwa()) {
        setShowInstallGuide(true);
        showToast('앱을 홈 화면에 설치하면 푸시 알림을 받을 수 있어요!', 'info');
        return;
      }

      const result = await getOrCreatePushSubscription();

      switch (result.status) {
        case 'subscribed':
          showToast('메뉴 완료 푸시 알림이 활성화되었습니다! 🔔', 'success');
          break;
        case 'unsupported':
          showToast('이 브라우저에서는 푸시 알림을 지원하지 않습니다.', 'error');
          break;
        case 'not-installed-ios-pwa':
          setShowInstallGuide(true);
          showToast('앱을 홈 화면에 설치하면 푸시 알림을 받을 수 있어요!', 'info');
          break;
        case 'failed':
          showToast('알림 설정 중 오류가 발생했습니다. 다시 시도해 주세요.', 'error');
          break;
        default:
          showToast('알림 설정에 실패했습니다.', 'error');
      }
    } catch (e) {
      console.error('Notification 요청 에러:', e);
      showToast('알림 설정 중 오류가 발생했습니다.', 'error');
    }
  };

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type });
  };

  // [React Query] 공개 설정 조회 (PublicRealtimeLayout의 WS가 SETTINGS_UPDATED 수신 시 재조회)
  const { data: shopSettings, isLoading: loadingSettings, isError: settingsError } = usePublicSettings();

  const { data: categories = [], isLoading: loadingCategories } = useQuery({
    queryKey: QK.categories.all,
    queryFn: async () => {
      const res = await apiClient.get<Category[], StandardResponse<Category[]>>('/categories');
      return (res.success && res.data) ? res.data : [];
    }
  });

  const { data: currentAnnouncements } = useCurrentAnnouncements();
  const activeEvent = currentAnnouncements?.free_event ?? null;
  const notices = currentAnnouncements?.notices ?? [];

  // 카테고리 로드 시 초기 선택 로직
  useEffect(() => {
    if (categories.length > 0) {
      const isValid = categories.some(c => c.id === activeCategoryId);
      if (!activeCategoryId || !isValid) {
        setActiveCategoryId(categories[0].id);
      }
    }
  }, [categories, activeCategoryId]);

  // 이벤트/공지 로드 시 웰컴 모달 로직 (무료 이벤트 우선, 없으면 첫 번째 일반 공지)
  const popupAnnouncement = activeEvent || notices[0] || null;
  useEffect(() => {
    if (popupAnnouncement) {
      const modalShown = sessionStorage.getItem(`event_modal_${popupAnnouncement.id}`);
      if (!modalShown) {
        setShowWelcomeModal(true);
        sessionStorage.setItem(`event_modal_${popupAnnouncement.id}`, 'true');
      }
    }
  }, [popupAnnouncement]);

  const loading = loadingCategories || loadingSettings;

  useEffect(() => {
    // 진행 중인 주문들 확인
    const orders = JSON.parse(localStorage.getItem('activeOrders') || '[]');
    setActiveOrders(orders);
  }, []);
  // Swipe Detection States
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchEndX, setTouchEndX] = useState<number | null>(null);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [touchEndY, setTouchEndY] = useState<number | null>(null);

  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEndX(null);
    setTouchEndY(null);
    setTouchStartX(e.targetTouches[0].clientX);
    setTouchStartY(e.targetTouches[0].clientY);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEndX(e.targetTouches[0].clientX);
    setTouchEndY(e.targetTouches[0].clientY);
  };

  const onTouchEndEvent = () => {
    if (!touchStartX || !touchEndX || !touchStartY || !touchEndY) return;

    const distanceX = touchStartX - touchEndX;
    const distanceY = touchStartY - touchEndY;

    // Y축 이동이 X축 이동보다 크면 위아래 스크롤로 간주하여 무시
    if (Math.abs(distanceY) > Math.abs(distanceX)) return;

    const isLeftSwipe = distanceX > minSwipeDistance;
    const isRightSwipe = distanceX < -minSwipeDistance;

    if (isLeftSwipe || isRightSwipe) {
      const currentIndex = categories.findIndex(c => c.id === activeCategoryId);
      if (currentIndex === -1) return;

      if (isLeftSwipe && currentIndex < categories.length - 1) {
        setActiveCategoryId(categories[currentIndex + 1].id);
      } else if (isRightSwipe && currentIndex > 0) {
        setActiveCategoryId(categories[currentIndex - 1].id);
      }
    }
  };

  // 선택된 카테고리가 화면 중앙에 오도록 스크롤 포커스 이동
  useEffect(() => {
    if (activeCategoryId !== null && categoryScrollRef.current) {
      const container = categoryScrollRef.current;
      const el = document.getElementById(`category-${activeCategoryId}`);
      if (el) {
        const containerRect = container.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();

        // 목표 스크롤 위치 계산 (현재 스크롤 + 엘리먼트 상대 위치 - 컨테이너 절반 + 엘리먼트 절반)
        let targetScroll = container.scrollLeft + (elRect.left - containerRect.left) - (containerRect.width / 2) + (elRect.width / 2);

        // 첫 번째 카테고리일 때 좌측에 공백이 생기지 않도록 음수 값을 0으로 강제 고정
        targetScroll = Math.max(0, targetScroll);

        container.scrollTo({
          left: targetScroll,
          behavior: 'smooth'
        });
      }
    }
  }, [activeCategoryId]);

  const activeCategory = categories.find((c) => c.id === activeCategoryId);

  // 선택된 카테고리 저장
  useEffect(() => {
    if (activeCategoryId !== null) {
      sessionStorage.setItem('lastActiveCategoryId', String(activeCategoryId));
    }
  }, [activeCategoryId]);

  // 영업 상태 오류 / 데이터 없음 → 영업 중으로 간주하지 않음
  if (!loading && (settingsError || !shopSettings)) {
    return (
      <div className="flex flex-col min-h-screen w-full max-w-[500px] mx-auto bg-gray-50 items-center justify-center px-6 text-center">
        <Coffee size={48} className="text-gray-300 mb-4" />
        <h2 className="text-xl font-black text-gray-700 mb-2">영업 상태를 확인할 수 없습니다</h2>
        <p className="text-sm text-gray-400 mb-6">네트워크 상태를 확인하거나 잠시 후 다시 시도해 주세요.</p>
        <button
          onClick={() => window.location.reload()}
          className="bg-primary text-white px-6 py-3 rounded-2xl font-bold text-sm"
        >
          다시 시도
        </button>
      </div>
    );
  }

  // 영업 종료 화면 렌더링
  if (!loading && shopSettings && !shopSettings.is_open) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col w-full max-w-[500px] mx-auto bg-[#144730] font-sans overflow-hidden touch-none">
        {/* 영업 종료 이미지 */}
        <div className="w-full flex-1 flex flex-col items-center justify-center">
          <img
            src="/img/design/cafe_closed.svg?v=2"
            alt="영업 종료"
            className="w-full h-full object-cover"
          />
        </div>

        {/* 안내 문구 영역 */}
        {/* <div className="relative flex-1 flex flex-col items-center justify-end pb-24 px-8 text-center">
          <div className="w-20 h-20 bg-white/10 backdrop-blur-xl rounded-3xl flex items-center justify-center mb-8 border border-white/20 animate-bounce">
            <Coffee className="text-white" size={40} />
          </div>

          <h1 className="text-4xl font-black text-white tracking-tighter mb-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
            지금은 영업 시간이<br />아닙니다
          </h1>

          <div className="w-12 h-1 bg-primary rounded-full mb-8" />

          <p className="text-lg font-bold text-white/80 leading-relaxed break-keep mb-10 animate-in fade-in slide-in-from-bottom-6 duration-1000">
            {shopSettings.notice || "더 맛있는 커피를 위해 준비 중입니다.\n영업 시간에 다시 방문해 주세요!"}
          </p>

          <div className="px-6 py-3 bg-white/5 backdrop-blur-md rounded-2xl border border-white/10">
            <p className="text-[12px] font-black text-primary uppercase tracking-[0.2em]">다음주에 만나요~~~</p>
          </div>
        </div> */}

        {/* 하단 푸터 (진행 중인 주문이 있다면 표시) */}
        {activeOrders.length > 0 && (
          <div className="relative p-6 border-t border-white/10 bg-black/50 backdrop-blur-2xl">
            <button
              onClick={() => navigate(`/order/status/${activeOrders[activeOrders.length - 1].id}`)}
              className="w-full bg-primary text-white py-4 px-6 rounded-2xl shadow-xl flex items-center justify-between"
            >
              <span className="font-black text-sm text-white">진행 중인 주문 확인하기</span>
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span>
                <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse delay-75"></span>
                <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse delay-150"></span>
              </div>
            </button>
          </div>
        )}
      </div>
    );
  }

  // 카테고리별 메뉴 정렬 (판매중 메뉴 상단, 품절(is_available=false) 메뉴 하단 정렬)
  const currentMenus = activeCategory?.menus
    ? [...activeCategory.menus].sort((a, b) => {
      if (a.is_available !== b.is_available) {
        return a.is_available ? -1 : 1;
      }
      return a.display_order - b.display_order;
    })
    : [];

  // 검색 결과 필터링 (전체 카테고리 대상 & 품절 메뉴 하단 정렬)
  const filteredMenus = categories
    .flatMap(cat => cat.menus)
    .filter(menu => menu.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      if (a.is_available !== b.is_available) {
        return a.is_available ? -1 : 1;
      }
      return a.display_order - b.display_order;
    });

  return (
    <div className="flex flex-col min-h-screen w-full max-w-[500px] mx-auto bg-white pb-32 shadow-2xl relative">
      <Header
        showSearch
        showCart
        onSearchChange={setSearchQuery}
      />

      {/* 이벤트 배너 (검색 여부와 상관없이 노출) */}
      {activeEvent && activeEvent.is_event_mode && (
        <div className="px-4 pb-2 animate-in slide-in-from-top-4 duration-500">
          <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 rounded-2xl p-4 text-white shadow-lg relative overflow-hidden">
            <div className="absolute top-[-20%] right-[-10%] w-24 h-24 bg-white/10 rounded-full blur-2xl" />
            <div className="relative flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                <PartyPopper size={20} />
              </div>
              <div className="flex-1">
                <p className="text-[13px] font-black leading-snug break-keep">
                  {activeEvent.banner_text || `${activeEvent.title} - 오늘은 카페가 무료 운영됩니다!`}
                </p>
                {activeEvent.sponsor_name && (
                  <p className="text-[11px] text-white/80 font-bold mt-0.5">
                    후원: {activeEvent.sponsor_name} {activeEvent.sponsor_duty || ''}
                  </p>
                )}
              </div>
              <Gift size={16} className="text-white/60 animate-bounce" />
            </div>
          </div>
        </div>
      )}

      {!searchQuery ? (
        <>

          {/* 알림 권한 상태에 따른 상단 표시 (PWA 앱 환경에서만 노출) */}
          {isStandalone && pushPermission !== 'granted' && 'Notification' in window && (
            <button
              onClick={handleAllowPush}
              className="w-full block active:opacity-80 transition-opacity shadow-sm border-b border-black/5 relative z-10"
              aria-label="알림 켜기"
            >
              <img
                src="/img/design/alram.svg"
                alt="알림 켜기 배너"
                className="w-full h-auto object-cover"
              />
            </button>
          )}

          {/* Category Tabs */}
          <div ref={categoryScrollRef} className="px-4 border-b border-gray-100 flex gap-6 overflow-x-auto hide-scrollbar min-h-[44px]">
            {categories.map((cat) => (
              <button
                key={cat.id}
                id={`category-${cat.id}`}
                onClick={() => setActiveCategoryId(cat.id)}
                className={`py-3 font-semibold text-base whitespace-nowrap transition-colors relative ${activeCategoryId === cat.id ? 'text-gray-900' : 'text-gray-400'
                  }`}
              >
                {cat.name}
                {activeCategoryId === cat.id && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-sm" />
                )}
              </button>
            ))}
          </div>

          {/* Normal Menu Grid */}
          <div
            className="flex-1 px-4 py-6 bg-white"
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEndEvent}
          >
            {loading ? (
              <div className="flex justify-center items-center h-40">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : currentMenus.length === 0 ? (
              <div className="text-center text-gray-500 mt-10">메뉴가 없습니다.</div>
            ) : (
              <div className="grid grid-cols-2 gap-4 gap-y-8">
                {currentMenus.map((menu) => (
                  <MenuCard
                    key={menu.id}
                    menu={menu}
                    isEventMode={!!activeEvent?.is_event_mode}
                    showPrice={shopSettings?.show_price ?? true}
                    onClick={() => navigate(`/menu/${menu.id}`, { state: { menu, isEventMode: !!activeEvent?.is_event_mode } })}
                    onShowToast={showToast}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        /* Search Results View */
        <div className="flex-1 px-4 py-6 bg-white">
          <h2 className="text-sm font-bold text-gray-400 mb-6 px-1">검색 결과 ({filteredMenus.length}건)</h2>
          {filteredMenus.length === 0 ? (
            <div className="text-center text-gray-500 mt-10">검색 결과가 없습니다.</div>
          ) : (
            <div className="grid grid-cols-2 gap-4 gap-y-8">
              {filteredMenus.map((menu) => (
                <MenuCard
                  key={menu.id}
                  menu={menu}
                  isEventMode={!!activeEvent?.is_event_mode}
                  showPrice={shopSettings?.show_price ?? true}
                  onClick={() => navigate(`/menu/${menu.id}`, { state: { menu, isEventMode: !!activeEvent?.is_event_mode } })}
                  onShowToast={showToast}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* PWA 설치 유도 배너 (설치 전 && 주문 없을 때만 노출) */}
      {!isStandalone && activeOrders.length === 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-full max-w-[460px] px-4 animate-in slide-in-from-bottom-8 duration-500">
          <button
            onClick={() => setShowInstallGuide(true)}
            className="w-full block active:scale-95 transition-all drop-shadow-2xl overflow-hidden"
            aria-label="앱 설치 가이드 열기"
          >
            <img
              src="/img/design/APP_install_btn.svg"
              alt="카페 주문 어플 설치하기 배너"
              className="w-full h-auto object-contain"
            />
          </button>
        </div>
      )}

      {/* 실시간 주문 추적 플로팅 버튼 */}
      {activeOrders.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-full max-w-[460px] px-4 animate-in slide-in-from-bottom-8 duration-500">
          <button
            onClick={() => navigate(`/order/status/${activeOrders[activeOrders.length - 1].id}`)}
            className="w-full bg-[#1A0A0A] text-white py-4 px-6 rounded-2xl shadow-2xl flex items-center justify-between group active:scale-95 transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="bg-primary p-2 rounded-xl">
                <Coffee size={20} className="text-white" />
              </div>
              <div className="text-left">
                <p className="text-[14px] font-black tracking-tight">
                  {activeOrders.length > 1 ? `진행 중인 주문이 ${activeOrders.length}건 있습니다` : '주문이 진행 중입니다'}
                </p>
                <p className="text-[11px] text-white/40 font-bold">내 주문 현황 바로가기</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                <span className="w-1 h-1 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                <span className="w-1 h-1 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                <span className="w-1 h-1 bg-primary rounded-full animate-bounce"></span>
              </div>
            </div>
          </button>
        </div>
      )}

      {/* 토스트 알림 */}
      <Toast
        message={toast?.message || ''}
        type={toast?.type}
        isVisible={!!toast}
        onClose={() => setToast(null)}
      />

      {/* PWA 설치 가이드 모달 */}
      {showInstallGuide && (
        <PwaInstallGuideModal onClose={() => setShowInstallGuide(false)} />
      )}

      {/* 웰컴 모달 */}
      {showWelcomeModal && popupAnnouncement && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6" onClick={() => setShowWelcomeModal(false)}>
          <div
            className="bg-white w-full max-w-[400px] rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            {popupAnnouncement.image_url && (
              <img src={popupAnnouncement.image_url} alt={popupAnnouncement.title} className="w-full h-48 object-cover" />
            )}
            <div className="p-6 text-center">
              <div className={`w-14 h-14 ${popupAnnouncement.is_event_mode ? 'bg-gradient-to-br from-amber-400 to-orange-500' : 'bg-gray-100'} rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg`}>
                {popupAnnouncement.is_event_mode ? (
                  <PartyPopper size={28} className="text-white" />
                ) : (
                  <Megaphone size={28} className="text-gray-600" />
                )}
              </div>
              <h2 className="text-xl font-black text-gray-900 mb-2 break-keep">{popupAnnouncement.title}</h2>
              {popupAnnouncement.content && (
                <p className="text-[13px] text-gray-600 leading-relaxed mb-3 break-keep whitespace-pre-wrap">{popupAnnouncement.content}</p>
              )}
              {popupAnnouncement.sponsor_name && (
                <p className="text-[13px] font-bold text-amber-600 mb-4">
                  {popupAnnouncement.sponsor_name} {popupAnnouncement.sponsor_duty || ''}님의 사랑으로 준비되었습니다 ❤️
                </p>
              )}
              <button
                onClick={() => setShowWelcomeModal(false)}
                className="w-full bg-gradient-to-r from-amber-500 to-orange-500 text-white py-3.5 rounded-2xl font-black text-[14px] shadow-lg hover:shadow-xl transition-all active:scale-95"
              >
                {popupAnnouncement.is_event_mode ? '감사히 주문하기 ☕' : '주문하기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// 재사용을 위한 MenuCard 컴포넌트
const MenuCard = ({ menu, isEventMode = false, showPrice = true, onClick, onShowToast }: { menu: Menu, isEventMode?: boolean, showPrice?: boolean, onClick: () => void, onShowToast: (msg: string, type: ToastType) => void }) => {
  const handleCardClick = () => {
    if (!menu.is_available) {
      onShowToast(`'${menu.name}' 메뉴는 현재 품절입니다.`, 'error');
      return;
    }
    onClick();
  };

  return (
    <div
      className={`group flex flex-col transition-opacity ${menu.is_available ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
      onClick={handleCardClick}
    >
      <div className="relative aspect-square rounded-2xl overflow-hidden bg-gray-100 mb-3">
        {menu.image_url ? (
          <img
            src={menu.image_url}
            alt={menu.name}
            className={`w-full h-full object-cover transition-transform duration-300 ${menu.is_available ? 'group-hover:scale-105' : 'grayscale'}`}
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = "https://images.unsplash.com/photo-1559525839-b184a4d698c7?w=400&q=80";
              e.currentTarget.classList.add('opacity-80');
            }}
          />
        ) : (
          <div className="w-full h-full bg-[#1A1818] flex items-center justify-center">
            <img src="https://images.unsplash.com/photo-1559525839-b184a4d698c7?w=400&q=80" alt="coffee placeholder" className={`w-full h-full object-cover opacity-80 ${menu.is_available ? '' : 'grayscale'}`} />
          </div>
        )}

        {/* 품절 오버레이 */}
        {!menu.is_available && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center backdrop-blur-[1px]">
            <span className="bg-white/90 text-gray-900 text-[12px] font-black px-4 py-1.5 rounded-full shadow-lg">품절</span>
          </div>
        )}

        {/* 이벤트 모드 무료 배지 */}
        {isEventMode && menu.is_available && (
          <div className="absolute top-2 left-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[10px] font-bold px-2.5 py-1 rounded-full shadow-md animate-pulse">
            FREE 🎉
          </div>
        )}

        {!isEventMode && menu.is_available && (() => {
          const createdDate = new Date(menu.created_at);
          const now = new Date();
          const diffTime = Math.abs(now.getTime() - createdDate.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          if (diffDays <= 8) {
            return (
              <div className="absolute top-2 left-2 bg-primary text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                NEW
              </div>
            );
          }
          return null;
        })()}
      </div>
      <h3 className="font-bold text-gray-900 text-[15px] mb-0.5 leading-snug">{menu.name}</h3>
      {menu.description && (
        <p className="text-[11px] text-gray-400 line-clamp-1 mb-1 font-medium">{menu.description}</p>
      )}
      {/* 이벤트 모드: 기존 가격 취소선 + 0원 표시 */}
      {isEventMode ? (
        showPrice && (
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] text-gray-400 line-through font-medium">{menu.price.toLocaleString()}원</span>
            <span className="font-black text-amber-600 text-[15px]">0원</span>
          </div>
        )
      ) : (
        showPrice && <p className="font-bold text-primary text-[15px]">{menu.price.toLocaleString()}원</p>
      )}
    </div>
  );
};
