import { NavLink, Outlet } from 'react-router-dom';
import { ClipboardList, UtensilsCrossed, BarChart2, LogOut, History, ArrowLeftRight } from 'lucide-react';

const navItems = [
  { to: '/admin', label: '주문 관리', icon: ClipboardList, end: true },
  { to: '/admin/history', label: '주문 내역', icon: History },
  { to: '/admin/payments', label: '입금 내역', icon: ArrowLeftRight },
  { to: '/admin/menus', label: '메뉴 관리', icon: UtensilsCrossed },
  { to: '/admin/reports', label: '매출 통계', icon: BarChart2 },
];


export const AdminLayout = () => (
  <div className="flex h-screen bg-gray-100 overflow-hidden font-sans">
    {/* 사이드바 */}
    <aside className="w-[240px] bg-[#0F0A0A] flex flex-col shrink-0 shadow-2xl z-20">
      <div className="px-6 py-8 border-b border-white/5">
        <h1 className="text-2xl font-black text-white tracking-tighter italic">Holy-Order</h1>
        <div className="flex items-center gap-1.5 mt-1">
          <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          <p className="text-[10px] text-white/30 font-bold tracking-widest uppercase">Management Portal</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-5 flex flex-col gap-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all ${
                isActive
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-white/50 hover:bg-white/10 hover:text-white'
              }`
            }
          >
            <item.icon size={17} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="px-4 py-4 border-t border-white/10 flex flex-col gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0">관</div>
          <div className="min-w-0">
            <p className="text-white text-[12px] font-semibold truncate">관리자</p>
            <p className="text-white/40 text-[10px]">Holy-Order Admin</p>
          </div>
        </div>
        <button className="flex items-center gap-2 text-white/40 hover:text-white text-[12px] py-1 transition-colors">
          <LogOut size={13} />로그아웃
        </button>
      </div>
    </aside>

    {/* 메인 콘텐츠 */}
    <main className="flex-1 overflow-auto">
      <Outlet />
    </main>
  </div>
);
