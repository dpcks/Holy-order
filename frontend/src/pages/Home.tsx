import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Coffee, PartyPopper, Gift, Megaphone, Bell, Smartphone } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { QK, QK_DOMAIN } from '../api/queryKeys';
import { apiClient } from '../api/client';
import { getWsUrl } from '../utils/url';
import { Toast } from '../components/ui/Toast';
import { PwaInstallGuideModal } from '../components/ui/PwaInstallGuideModal';
import type { ToastType } from '../components/ui/Toast';
import type { Menu, Category, StandardResponse, Announcement } from '../types';

export const Home = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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
      const permission = await Notification.requestPermission();
      setPushPermission(permission);
      if (permission === 'granted') {
        showToast('메뉴 완료 푸시 알림이 활성화되었습니다! 🔔', 'success');
      } else {
        showToast('알림이 차단되어 있습니다. 기기 설정에서 알림을 켜주세요!', 'error');
      }
    } catch (e) {
      console.error('Notification 요청 에러:', e);
    }
  };

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type });
  };

  // WebSocket 상태 관리
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);

  // [React Query] 데이터 조회
  const { data: shopSettings } = useQuery({
    queryKey: QK.settings.main,
    queryFn: async () => {
      const res = await apiClient.get<any, StandardResponse<any>>('/settings');
      return res.success ? res.data : null;
    }
  });

  const { data: categories = [], isLoading: loadingCategories } = useQuery({
    queryKey: QK.categories.all,
    queryFn: async () => {
      const res = await apiClient.get<Category[], StandardResponse<Category[]>>('/categories');
      return (res.success && res.data) ? res.data : [];
    }
  });

  const { data: activeEvent } = useQuery({
    queryKey: QK.announcements.active,
    queryFn: async () => {
      const res = await apiClient.get<Announcement | null, StandardResponse<Announcement | null>>('/announcements/active');
      return (res.success && res.data) ? res.data : null;
    }
  });

  // 카테고리 로드 시 초기 선택 로직
  useEffect(() => {
    if (categories.length > 0) {
      const isValid = categories.some(c => c.id === activeCategoryId);
      if (!activeCategoryId || !isValid) {
        setActiveCategoryId(categories[0].id);
      }
    }
  }, [categories, activeCategoryId]);

  // 이벤트 로드 시 웰컴 모달 로직
  useEffect(() => {
    if (activeEvent) {
      const modalShown = sessionStorage.getItem(`event_modal_${activeEvent.id}`);
      if (!modalShown) {
        setShowWelcomeModal(true);
        sessionStorage.setItem(`event_modal_${activeEvent.id}`, 'true');
      }
    }
  }, [activeEvent]);

  const loading = loadingCategories;

  // WebSocket 연결 함수
  const connectWebSocket = useCallback(() => {
    if (wsRef.current) wsRef.current.close();

    const wsUrl = getWsUrl();

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('✅ [WebSocket] 실시간 메뉴 업데이트 연결 성공');
      retryCountRef.current = 0;
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        // 메뉴 또는 이벤트 관련 업데이트가 있으면 데이터를 무효화하여 리페치 유도
        if (['MENU_UPDATED', 'MENU_CREATED', 'MENU_DELETED', 'CATEGORY_UPDATED'].includes(data.type)) {
          console.log(`🔔 [WebSocket] ${data.type} 감지, 메뉴 무효화 중...`);
          queryClient.invalidateQueries({ queryKey: QK_DOMAIN.categories });
        }
        if (data.type === 'ANNOUNCEMENT_UPDATED') {
          console.log(`🔔 [WebSocket] ${data.type} 감지, 공지사항 무효화 중...`);
          queryClient.invalidateQueries({ queryKey: QK_DOMAIN.announcements });
        }
        if (data.type === 'SETTINGS_UPDATED') {
          console.log(`🔔 [WebSocket] ${data.type} 감지, 설정 무효화 중...`);
          queryClient.invalidateQueries({ queryKey: QK_DOMAIN.settings });
        }
      } catch (e) {
        console.error('Failed to parse WS message', e);
      }
    };

    ws.onclose = () => {
      // 연결 끊기면 지수 백오프로 재연결 시도
      const delay = Math.min(30000, 1000 * Math.pow(2, retryCountRef.current));
      reconnectTimerRef.current = setTimeout(() => {
        retryCountRef.current += 1;
        connectWebSocket();
      }, delay);
    };

    ws.onerror = () => ws.close();
  }, [queryClient]);

  useEffect(() => {
    // 진행 중인 주문들 확인
    const orders = JSON.parse(localStorage.getItem('activeOrders') || '[]');
    setActiveOrders(orders);

    connectWebSocket();

    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, [connectWebSocket]);

  const activeCategory = categories.find((c) => c.id === activeCategoryId);

  // 선택된 카테고리 저장
  useEffect(() => {
    if (activeCategoryId !== null) {
      sessionStorage.setItem('lastActiveCategoryId', String(activeCategoryId));
    }
  }, [activeCategoryId]);

  // 영업 종료 화면 렌더링
  if (!loading && shopSettings && !shopSettings.is_open) {
    return (
      <div className="flex flex-col min-h-screen w-full max-w-[500px] mx-auto bg-black font-sans relative overflow-hidden">
        {/* 영업 종료 이미지 (배경) */}
        <div className="absolute inset-0">
          <img
            src="/img/closed.jpg"
            alt="Closed"
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

  // 검색 결과 필터링 (전체 카테고리 대상)
  const filteredMenus = categories.flatMap(cat => cat.menus).filter(menu =>
    menu.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col min-h-screen w-full max-w-[500px] mx-auto bg-white pb-6 shadow-2xl relative">
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

          {/* Store Selector & Push Permission */}
          <div className="px-4 py-4 flex justify-between items-center">
            <div className="flex-1">
              {pushPermission !== 'granted' && 'Notification' in window && (
                <button 
                  onClick={handleAllowPush}
                  className="flex items-center gap-1.5 bg-teal-50 text-teal-700 px-3 py-2 rounded-lg border border-teal-100 shadow-sm active:scale-95 transition-transform"
                >
                  <Bell size={16} className={pushPermission === 'default' ? 'animate-bounce' : ''} />
                  <span className="font-semibold text-sm">알림 허용</span>
                </button>
              )}
            </div>
            <button className="flex items-center gap-1.5 bg-gray-50 px-3 py-2 rounded-lg shrink-0">
              <MapPin size={16} className="text-primary" />
              <span className="font-semibold text-gray-800 text-sm">평택중앙교회</span>
            </button>
          </div>

          {/* Category Tabs */}
          <div className="px-4 border-b border-gray-100 flex gap-6 overflow-x-auto hide-scrollbar min-h-[44px]">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategoryId(cat.id)}
                className={`pb-3 font-semibold text-base whitespace-nowrap transition-colors relative ${activeCategoryId === cat.id ? 'text-gray-900' : 'text-gray-400'
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
          <div className="flex-1 px-4 py-6 bg-white">
            {loading ? (
              <div className="flex justify-center items-center h-40">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : activeCategory?.menus.length === 0 ? (
              <div className="text-center text-gray-500 mt-10">메뉴가 없습니다.</div>
            ) : (
              <div className="grid grid-cols-2 gap-4 gap-y-8">
                {activeCategory?.menus.map((menu) => (
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
            className="w-full bg-gradient-to-r from-[#1A0A0A] to-[#2D1616] text-white py-3.5 px-5 rounded-2xl shadow-2xl flex items-center justify-between group active:scale-95 transition-all border border-white/5"
            aria-label="앱 설치 가이드 열기"
          >
            <div className="flex items-center gap-3">
              <div className="bg-primary/20 border border-primary/30 p-2 rounded-xl">
                <Bell size={18} className="text-primary animate-pulse" />
              </div>
              <div className="text-left">
                <p className="text-[13px] font-black tracking-tight leading-none mb-0.5">
                  음료 준비 알림 받기 🔔
                </p>
                <p className="text-[11px] text-white/40 font-bold">홈 화면에 추가하면 바로 알림이 와요!</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 bg-primary text-white text-[11px] font-black px-3 py-1.5 rounded-xl shrink-0">
              <Smartphone size={12} />
              설치
            </div>
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
      {showWelcomeModal && activeEvent && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6" onClick={() => setShowWelcomeModal(false)}>
          <div
            className="bg-white w-full max-w-[400px] rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            {activeEvent.image_url && (
              <img src={activeEvent.image_url} alt={activeEvent.title} className="w-full h-48 object-cover" />
            )}
            <div className="p-6 text-center">
              <div className={`w-14 h-14 ${activeEvent.is_event_mode ? 'bg-gradient-to-br from-amber-400 to-orange-500' : 'bg-gray-100'} rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg`}>
                {activeEvent.is_event_mode ? (
                  <PartyPopper size={28} className="text-white" />
                ) : (
                  <Megaphone size={28} className="text-gray-600" />
                )}
              </div>
              <h2 className="text-xl font-black text-gray-900 mb-2 break-keep">{activeEvent.title}</h2>
              {activeEvent.content && (
                <p className="text-[13px] text-gray-600 leading-relaxed mb-3 break-keep whitespace-pre-wrap">{activeEvent.content}</p>
              )}
              {activeEvent.sponsor_name && (
                <p className="text-[13px] font-bold text-amber-600 mb-4">
                  {activeEvent.sponsor_name} {activeEvent.sponsor_duty || ''}님의 사랑으로 준비되었습니다 ❤️
                </p>
              )}
              <button
                onClick={() => setShowWelcomeModal(false)}
                className="w-full bg-gradient-to-r from-amber-500 to-orange-500 text-white py-3.5 rounded-2xl font-black text-[14px] shadow-lg hover:shadow-xl transition-all active:scale-95"
              >
                {activeEvent.is_event_mode ? '감사히 주문하기 ☕' : '주문하기'}
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
