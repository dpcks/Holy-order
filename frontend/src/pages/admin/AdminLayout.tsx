import { useState, useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { 
  ClipboardList, UtensilsCrossed, BarChart2, LogOut, History, 
  Landmark, Calendar, ChevronsLeft, ChevronsRight, Church 
} from 'lucide-react';

const navItems = [
  { to: '/admin', label: '주문 관리', icon: ClipboardList, end: true },
  { to: '/admin/history', label: '주문 내역', icon: History },
  { to: '/admin/payments', label: '입금 내역', icon: Landmark },
  { to: '/admin/menus', label: '메뉴 관리', icon: UtensilsCrossed },
  { to: '/admin/reports', label: '매출 통계', icon: BarChart2 },
  { to: '/admin/schedules', label: '봉사 스케줄', icon: Calendar },
];

export const AdminLayout = () => {
  // 초기 상태를 로컬 스토리지에서 불러옴
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem('adminSidebarCollapsed');
    return saved === 'true';
  });

  // 상태 변경 시 로컬 스토리지에 저장
  useEffect(() => {
    localStorage.setItem('adminSidebarCollapsed', String(isCollapsed));
  }, [isCollapsed]);

  const toggleSidebar = () => setIsCollapsed(!isCollapsed);

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden font-sans">
      {/* 사이드바 */}
      <aside 
        className={`bg-[#0F0A0A] flex flex-col shrink-0 shadow-2xl z-20 transition-all duration-300 ease-in-out relative ${
          isCollapsed ? 'w-[80px]' : 'w-[260px]'
        }`}
      >
        {/* 로고 영역 */}
        <div className={`px-6 py-8 border-b border-white/5 transition-all ${isCollapsed ? 'px-4' : ''}`}>
          <div className="flex items-center justify-between gap-2">
            <div className={`flex items-center transition-all ${isCollapsed ? 'justify-center w-full' : 'gap-3'}`}>
              {isCollapsed ? (
                <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary animate-in zoom-in duration-300">
                  <Church size={24} />
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
              <p className="text-[10px] text-white/30 font-bold tracking-widest uppercase">Management Portal</p>
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
                `flex items-center rounded-xl text-[13px] font-semibold transition-all duration-200 group ${
                  isCollapsed ? 'justify-center px-0 py-3' : 'px-3 py-2.5 gap-3'
                } ${
                  isActive
                    ? 'bg-primary text-white shadow-md'
                    : 'text-white/50 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <item.icon size={18} className={`shrink-0 transition-transform ${!isCollapsed && 'group-hover:scale-110'}`} />
              {!isCollapsed && <span className="truncate animate-in slide-in-from-left-2 duration-300">{item.label}</span>}
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
      <main className="flex-1 overflow-auto bg-gray-50">
        <Outlet />
      </main>
    </div>
  );
};
