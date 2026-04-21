import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, CheckCircle, XCircle, Bell } from 'lucide-react';
import { apiClient } from '../../api/client';
import type { StandardResponse } from '../../api/client';

interface OrderItem {
  id: number;
  menu_name_snapshot: string;
  quantity: number;
  options_text: string | null;
  sub_total: number;
}

interface Order {
  id: number;
  order_number: number;
  status: string;
  user_name_snapshot: string | null;
  user_duty_snapshot: string;
  total_price: number;
  created_at: string;
  items: OrderItem[];
}

// 상태 전이 정의
const STATUS_TRANSITIONS: Record<string, { label: string; next: string; color: string } | null> = {
  PENDING: { label: '입금 승인', next: 'PREPARING', color: 'bg-primary text-white' },
  PREPARING: { label: '준비완료', next: 'READY', color: 'bg-green-500 text-white' },
  READY: { label: '수령완료', next: 'COMPLETED', color: 'bg-blue-500 text-white' },
};

const COLUMNS = [
  { status: 'PENDING', label: '입금 확인대기', color: 'text-orange-600', dot: 'bg-orange-400' },
  { status: 'PREPARING', label: '제조 중', color: 'text-primary', dot: 'bg-primary' },
  { status: 'READY', label: '수령 대기', color: 'text-green-600', dot: 'bg-green-400' },
];

// 경과 시간 계산 헬퍼
const getElapsed = (createdAt: string) => {
  const diff = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
  return diff < 1 ? '방금 전' : `${diff}분 경과`;
};

// 주문 아이템 요약 텍스트
const summarizeItems = (items: OrderItem[]) =>
  items.map(i => `${i.menu_name_snapshot} ${i.quantity}`).join(', ');

export const AdminOrderManagement = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  
  // 카운트다운 상태 (5초)
  const [countdown, setCountdown] = useState(5);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await apiClient.get<any, StandardResponse<Order[]>>('/admin/orders/board');
      if (res.success && res.data) {
        setOrders(res.data);
        setLastUpdated(new Date());
        setCountdown(5); // 데이터 가져온 후 카운트다운 리셋
      }
    } catch (err) {
      console.error('주문 조회 실패:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // 초기 로드
  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // 실시간 카운트다운 (1초마다 실행)
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          fetchOrders(); // 0초가 되면 데이터 갱신
          return 5;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [fetchOrders]);

  const handleStatusChange = async (orderId: number, nextStatus: string) => {
    setUpdatingId(orderId);
    try {
      await apiClient.patch(`/admin/orders/${orderId}/status`, { status: nextStatus });
      await fetchOrders();
    } catch (err) {
      alert('상태 변경에 실패했습니다.');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleCancel = async (orderId: number) => {
    if (!confirm('정말 주문을 취소하시겠습니까?')) return;
    setUpdatingId(orderId);
    try {
      await apiClient.patch(`/admin/orders/${orderId}/status`, { status: 'CANCELLED' });
      await fetchOrders();
    } catch (err) {
      alert('취소 처리에 실패했습니다.');
    } finally {
      setUpdatingId(null);
    }
  };

  // 오늘 통계 요약
  const todayTotal = orders.reduce((sum, o) => sum + o.total_price, 0);

  return (
    <div className="flex flex-col h-full bg-[#F9FAFB]">
      {/* 상단 헤더 */}
      <header className="bg-white border-b border-gray-200 px-8 py-5 flex items-center justify-between shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-black text-gray-900 tracking-tight">실시간 주문 현황</h1>
              <div className="flex items-center gap-2 bg-green-50 px-3 py-1 rounded-full">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                <span className="text-[12px] text-green-700 font-bold uppercase tracking-wider">Live</span>
              </div>
            </div>
            <p className="text-[12px] text-gray-400 font-medium">
              마지막 업데이트: {lastUpdated.toLocaleTimeString('ko-KR')}
            </p>
          </div>

          {/* 카운트다운 타이틀 */}
          <div className="h-10 w-[1px] bg-gray-100 hidden md:block" />
          <div className="hidden md:flex flex-col">
            <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-0.5">Auto Refresh In</p>
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div 
                    key={i} 
                    className={`h-1.5 w-4 rounded-full transition-all duration-300 ${i <= countdown ? 'bg-primary' : 'bg-gray-100'}`} 
                  />
                ))}
              </div>
              <span className="text-[14px] font-black text-primary w-4">{countdown}s</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-0.5">Pending Orders</p>
            <p className="text-2xl font-black text-[#1A0A0A]">{orders.length}<span className="text-sm font-bold ml-0.5 text-gray-400">건</span></p>
          </div>
          <button
            onClick={() => { fetchOrders(); setCountdown(5); }}
            className="p-3 rounded-xl text-gray-500 hover:bg-gray-100 hover:text-primary transition-all bg-gray-50 border border-gray-100"
            title="즉시 새로고침"
          >
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          </button>
          <div className="relative">
            <button className="p-3 rounded-xl text-gray-500 hover:bg-gray-100 transition-all bg-gray-50 border border-gray-100">
              <Bell size={20} />
            </button>
            <span className="absolute top-0 right-0 w-3 h-3 bg-primary border-2 border-white rounded-full"></span>
          </div>
        </div>
      </header>

      {/* 칸반 보드 */}
      <div className="flex-1 overflow-x-auto p-8">
        <div className="flex gap-8 h-full min-w-[1100px]">
          {COLUMNS.map((col) => {
            const colOrders = orders.filter(o => o.status === col.status);
            return (
              <div key={col.status} className="flex-1 flex flex-col min-w-[320px]">
                {/* 컬럼 헤더 */}
                <div className="flex items-center justify-between mb-6 px-1">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full shadow-sm ${col.dot}`} />
                    <span className={`font-black text-[17px] tracking-tight ${col.color}`}>{col.label}</span>
                  </div>
                  <span className="bg-[#1A0A0A] text-white text-[12px] font-black px-3 py-1 rounded-full shadow-lg">
                    {colOrders.length}
                  </span>
                </div>

                {/* 주문 카드 목록 */}
                <div className="flex flex-col gap-4 overflow-y-auto pr-2 custom-scrollbar">
                  {colOrders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 bg-white/50 rounded-3xl border-2 border-dashed border-gray-100 text-gray-300">
                      <CheckCircle size={48} strokeWidth={1} className="mb-3 opacity-20" />
                      <p className="text-[14px] font-bold">진행 중인 주문 없음</p>
                    </div>
                  ) : (
                    colOrders.map((order) => {
                      const transition = STATUS_TRANSITIONS[order.status];
                      const isUpdating = updatingId === order.id;
                      return (
                        <div
                          key={order.id}
                          className="bg-white rounded-3xl p-5 shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-gray-100 hover:shadow-[0_10px_30px_rgba(0,0,0,0.08)] transition-all group animate-in fade-in slide-in-from-bottom-4 duration-500"
                        >
                          {/* 주문번호 + 경과시간 */}
                          <div className="flex items-center justify-between mb-4">
                            <span className="text-3xl font-black text-[#1A0A0A] tracking-tighter">
                              #{order.order_number}
                            </span>
                            <div className="flex flex-col items-end">
                              <span className={`text-[11px] font-black px-3 py-1 rounded-full uppercase tracking-widest ${
                                order.status === 'PREPARING' ? 'bg-red-50 text-primary animate-pulse' : 'bg-gray-100 text-gray-500'
                              }`}>
                                {getElapsed(order.created_at)}
                              </span>
                            </div>
                          </div>

                          {/* 메뉴 요약 */}
                          <div className="mb-4">
                            <p className="text-[15px] font-black text-gray-800 mb-1 leading-snug">
                              {summarizeItems(order.items)}
                            </p>
                            <div className="flex items-center gap-2">
                              <span className="text-[12px] text-gray-500 font-bold bg-gray-50 px-2 py-0.5 rounded italic">
                                {order.user_name_snapshot || '손님'} {order.user_duty_snapshot}
                              </span>
                            </div>
                          </div>

                          {/* 상세 옵션 (있을 경우) */}
                          {order.items.some(i => i.options_text) && (
                            <div className="mb-4 p-3 bg-gray-50 rounded-2xl">
                              {order.items.map((item, i) => item.options_text && (
                                <p key={i} className="text-[11px] text-gray-400 font-medium leading-tight mb-1 last:mb-0">
                                  • {item.menu_name_snapshot}: {item.options_text}
                                </p>
                              ))}
                            </div>
                          )}

                          {/* 금액 */}
                          <div className="flex items-center justify-between mb-5 border-t border-gray-50 pt-4">
                            <span className="text-[11px] text-gray-400 font-bold uppercase tracking-widest">Total Price</span>
                            <p className="text-[17px] font-black text-gray-900">
                              ₩{order.total_price.toLocaleString()}
                            </p>
                          </div>

                          {/* 액션 버튼 */}
                          <div className="flex gap-3">
                            {order.status === 'PENDING' && (
                              <button
                                onClick={() => handleCancel(order.id)}
                                disabled={isUpdating}
                                className="px-4 py-3 text-[13px] font-bold text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-2xl transition-all disabled:opacity-50"
                              >
                                취소
                              </button>
                            )}
                            {transition && (
                              <button
                                onClick={() => handleStatusChange(order.id, transition.next)}
                                disabled={isUpdating}
                                className={`flex-1 py-3.5 text-[14px] font-black rounded-2xl transition-all shadow-md active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 ${transition.color}`}
                              >
                                {isUpdating ? (
                                  <RefreshCw size={16} className="animate-spin" />
                                ) : (
                                  <CheckCircle size={18} />
                                )}
                                {transition.label}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 하단 요약 바 */}
      <footer className="bg-[#1A0A0A] px-10 py-5 flex items-center justify-between shrink-0 text-white shadow-2xl">
        <div className="flex items-center gap-12">
          <div>
            <p className="text-[10px] text-white/40 font-black uppercase tracking-[0.2em] mb-1">Today Orders</p>
            <p className="text-2xl font-black">{orders.length}<span className="text-xs font-bold text-white/40 ml-1">Orders</span></p>
          </div>
          <div className="w-[1px] h-10 bg-white/10" />
          <div>
            <p className="text-[10px] text-white/40 font-black uppercase tracking-[0.2em] mb-1">Total Revenue</p>
            <p className="text-2xl font-black">₩{todayTotal.toLocaleString()}</p>
          </div>
        </div>
        
        <div className="hidden lg:flex items-center gap-3 text-white/30 text-[12px] font-bold">
          <XCircle size={16} />
          취소 주문은 히스토리 페이지에서 확인할 수 있습니다.
        </div>

        <div className="flex items-center gap-2 bg-white/5 px-4 py-2 rounded-xl">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-white/60">System Online</span>
        </div>
      </footer>
    </div>
  );
};
