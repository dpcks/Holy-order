import { useState, useEffect, useCallback, useRef } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  ClipboardList, UtensilsCrossed, BarChart2, LogOut, History,
  Landmark, Calendar, ChevronsLeft, ChevronsRight, Church, Settings, Megaphone, Package
} from 'lucide-react';
import { getWsUrl } from '../../utils/url';

const navItems = [
  { to: '/admin', label: '주문 관리', icon: ClipboardList, end: true },
  { to: '/admin/history', label: '주문 내역', icon: History },
  { to: '/admin/payments', label: '입금 내역', icon: Landmark },
  { to: '/admin/menus', label: '메뉴 관리', icon: UtensilsCrossed },
  { to: '/admin/reports', label: '매출 통계', icon: BarChart2 },
  { to: '/admin/schedules', label: '봉사 스케줄', icon: Calendar },
  { to: '/admin/announcements', label: '이벤트/공지', icon: Megaphone },
  { to: '/admin/ingredients', label: '재고 관리', icon: Package },
  { to: '/admin/settings', label: '설정', icon: Settings },
];

export const AdminLayout = () => {
  const location = useLocation();
  const [hasNewOrder, setHasNewOrder] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const pathnameRef = useRef(location.pathname);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isClosingManualRef = useRef(false);

  // 경로 업데이트 시 Ref 동기화
  useEffect(() => {
    pathnameRef.current = location.pathname;
    if (location.pathname === '/admin') {
      setHasNewOrder(false);
    }
  }, [location.pathname]);

  // 초기 상태를 로컬 스토리지에서 불러옴
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem('adminSidebarCollapsed');
    return saved === 'true';
  });

  // 알림음 오디오 객체 싱글톤 관리
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // 오디오 객체 미리 생성
    audioRef.current = new Audio('/mp3/order.mp3');
    audioRef.current.load();

    // iOS/아이패드 오디오 잠금 해제 함수
    const unlockAudio = () => {
      if (audioRef.current) {
        // 무음으로 한 번 재생하여 브라우저의 오디오 차단을 해제
        audioRef.current.play()
          .then(() => {
            audioRef.current?.pause();
            if (audioRef.current) audioRef.current.currentTime = 0;
            console.log('🔊 [Audio] 오디오 잠금 해제 성공');
            window.removeEventListener('click', unlockAudio);
            window.removeEventListener('touchstart', unlockAudio);
          })
          .catch(() => {
            // 실패 시 다음 클릭을 위해 리스너 유지
          });
      }
    };

    window.addEventListener('click', unlockAudio);
    window.addEventListener('touchstart', unlockAudio);

    return () => {
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
    };
  }, []);

  // WebSocket 연결 (새 주문 알림용)
  const connectWebSocket = useCallback(() => {
    // 이미 연결 중이거나 열려 있으면 중복 연결 방지
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    // 기존 타이머 제거
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    const wsUrl = getWsUrl();

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      isClosingManualRef.current = false;

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          // 1. 새 주문이 들어왔을 때만 소리 재생 및 배지 표시
          if (data.type === 'NEW_ORDER') {
            if (audioRef.current) {
              audioRef.current.currentTime = 0; // 재생 위치 초기화
              audioRef.current.play().catch(e => console.warn('오디오 재생 실패:', e));
            }

            if (pathnameRef.current !== '/admin') {
              setHasNewOrder(true);
            }
          }
          // 2. 단순 상태 변경(ORDER_UPDATED)은 소리 없이 데이터 동기화 등 필요시 활용
        } catch (e) {
          // ping 등 처리
        }
      };

      ws.onclose = (event) => {
        // 수동 종료가 아니고 비정상 종료된 경우에만 재연결
        if (!isClosingManualRef.current && event.code !== 1000) {
          if (!reconnectTimeoutRef.current) {
            reconnectTimeoutRef.current = setTimeout(() => {
              reconnectTimeoutRef.current = null;
              connectWebSocket();
            }, 5000);
          }
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch (error) {
      console.error('WebSocket creation failed', error);
    }
  }, []);

  useEffect(() => {
    connectWebSocket();
    return () => {
      isClosingManualRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connectWebSocket]);

  // 상태 변경 시 로컬 스토리지에 저장
  useEffect(() => {
    localStorage.setItem('adminSidebarCollapsed', String(isCollapsed));
  }, [isCollapsed]);

  // 화면 너비에 따른 사이드바 자동 접힘 로직
  useEffect(() => {
    const handleResize = () => {
      // 1024px 미만(iPad Pro 이하)에서는 자동으로 사이드바를 접음
      if (window.innerWidth < 1024) {
        setIsCollapsed(true);
      }
    };

    handleResize(); // 초기 로드 시 실행
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleSidebar = () => setIsCollapsed(!isCollapsed);

  return (
    <div className="flex h-[100dvh] bg-gray-100 overflow-hidden font-sans text-gray-900">
      {/* 사이드바 */}
      <aside
        className={`bg-[#0F0A0A] flex flex-col shrink-0 shadow-2xl z-20 transition-all duration-300 ease-in-out relative ${isCollapsed ? 'w-[80px]' : 'w-[260px]'
          }`}
      >
        {/* 로고 영역 */}
        <div className={`px-6 py-8 border-b border-white/5 transition-all ${isCollapsed ? 'px-4' : ''}`}>
          <div className="flex items-center justify-between gap-2">
            <div className={`flex items-center transition-all ${isCollapsed ? 'justify-center w-full' : 'gap-3'}`}>
              {isCollapsed ? (
                <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary animate-in zoom-in duration-300 relative">
                  <Church size={24} />
                  {hasNewOrder && (
                    <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-[#0F0A0A] animate-pulse" />
                  )}
                </div>
              ) : (
                <h1 className="text-2xl font-black text-white tracking-tighter italic animate-in fade-in duration-500">
                  Holy-Order
                </h1>
              )}
            </div>

            {!isCollapsed && (
              <button
                onClick={toggleSidebar}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-white/30 hover:bg-white/10 hover:text-white transition-all animate-in slide-in-from-right-2"
                title="사이드바 접기"
              >
                <ChevronsLeft size={20} />
              </button>
            )}
          </div>

          {isCollapsed && (
            <button
              onClick={toggleSidebar}
              className="mt-4 w-full h-8 flex items-center justify-center rounded-lg text-white/20 hover:bg-white/5 hover:text-white transition-all"
              title="사이드바 펴기"
            >
              <ChevronsRight size={18} />
            </button>
          )}

          {!isCollapsed && (
            <div className="flex items-center gap-1.5 mt-1 animate-in fade-in duration-700">
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <p className="text-[10px] text-white/30 font-bold tracking-widest uppercase">평택중앙교회카페 관리자 페이지</p>
            </div>
          )}
        </div>

        {/* 네비게이션 */}
        <nav className="flex-1 px-3 py-5 flex flex-col gap-1 overflow-y-auto overflow-x-hidden">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              title={isCollapsed ? item.label : ''}
              className={({ isActive }) =>
                `flex items-center rounded-xl text-[13px] font-semibold transition-all duration-200 group relative ${isCollapsed ? 'justify-center px-0 py-3' : 'px-3 py-2.5 gap-3'
                } ${isActive
                  ? 'bg-primary text-white shadow-md'
                  : 'text-white/50 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <item.icon size={18} className={`shrink-0 transition-transform ${!isCollapsed && 'group-hover:scale-110'}`} />
              {!isCollapsed && (
                <div className="flex-1 flex items-center justify-between min-w-0">
                  <span className="truncate animate-in slide-in-from-left-2 duration-300">{item.label}</span>
                  {item.to === '/admin' && hasNewOrder && (
                    <span className="w-2 h-2 bg-red-500 rounded-full animate-bounce shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
                  )}
                </div>
              )}
              {isCollapsed && item.to === '/admin' && hasNewOrder && (
                <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              )}
            </NavLink>
          ))}
        </nav>

        {/* 푸터 영역 (관리자 정보) */}
        <div className={`px-4 py-4 border-t border-white/10 flex flex-col gap-3 overflow-hidden ${isCollapsed ? 'items-center' : ''}`}>
          <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-2.5'}`}>
            <div className="w-8 h-8 bg-primary/20 text-primary border border-primary/30 rounded-lg flex items-center justify-center font-bold text-xs shrink-0">
              관
            </div>
            {!isCollapsed && (
              <div className="min-w-0 animate-in fade-in duration-500">
                <p className="text-white text-[12px] font-semibold truncate">관리자</p>
                <p className="text-white/40 text-[10px]">Holy-Order Admin</p>
              </div>
            )}
          </div>
          <button className={`flex items-center text-white/40 hover:text-white text-[12px] py-1 transition-colors ${isCollapsed ? 'justify-center' : 'gap-2'}`}>
            <LogOut size={14} />
            {!isCollapsed && <span className="animate-in fade-in">로그아웃</span>}
          </button>
        </div>
      </aside>

      {/* 메인 콘텐츠 */}
      <main className="flex-1 overflow-hidden bg-gray-50 flex flex-col">
        <Outlet />
      </main>
    </div>
  );
};
