import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, CheckCircle, Phone, MessageSquare, Tag } from 'lucide-react';
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
  user_phone_snapshot: string | null;
  request: string | null;
  total_price: number;
  created_at: string;
  items: OrderItem[];
}

interface Stats {
  total_orders: number;
  total_sales: number;
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

// 전화번호 포맷팅 (01012345678 -> 010-1234-5678)
const formatPhone = (phone: string | null) => {
  if (!phone) return '';
  return phone.replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3');
};

export const AdminOrderManagement = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<Stats>({ total_orders: 0, total_sales: 0 });
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const fetchOrders = useCallback(async () => {
    try {
      const [boardRes, statsRes] = await Promise.all([
        apiClient.get<any, StandardResponse<Order[]>>('/admin/orders/board'),
        apiClient.get<any, StandardResponse<Stats>>('/admin/stats/today')
      ]);

      if (boardRes.success && boardRes.data) {
        setOrders(boardRes.data);
      }
      if (statsRes.success && statsRes.data) {
        setStats(statsRes.data);
      }
      setLastUpdated(new Date());
    } catch (err) {
      console.error('주문 조회 실패:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // 초기 로드 + WebSocket 연결
  useEffect(() => {
    fetchOrders();

    // WebSocket 설정
    const wsUrl = `ws://${window.location.hostname}:8000/ws`;
    let ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      if (event.data === 'ORDER_UPDATED') {
        fetchOrders(); // 즉시 데이터 갱신
      }
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected. Retrying in 3s...');
      setTimeout(() => {
        // 재연결 로직
      }, 3000);
    };

    return () => ws.close();
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

  return (
    <div className="flex flex-col h-full bg-[#F9FAFB]">
      <header className="bg-white border-b border-gray-200 px-8 py-5 flex items-center justify-between shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-black text-gray-900 tracking-tight">실시간 주문 현황</h1>
              <div className="flex items-center gap-2 bg-gray-50 px-3 py-1 rounded-full border border-gray-100">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                <span className="text-[12px] text-gray-900 font-bold uppercase tracking-wider">실시간</span>
              </div>
            </div>
            <p className="text-[12px] text-gray-400 font-medium">
              마지막 업데이트: {lastUpdated.toLocaleTimeString('ko-KR')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-0.5">Active Orders</p>
            <p className="text-2xl font-black text-[#1A0A0A]">{orders.length}<span className="text-sm font-bold ml-0.5 text-gray-400">건</span></p>
          </div>
          <button
            onClick={fetchOrders}
            className="p-3 rounded-xl text-gray-500 hover:bg-gray-100 hover:text-primary transition-all bg-gray-50 border border-gray-100"
          >
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-x-auto p-8">
        <div className="flex gap-8 h-full min-w-[1100px]">
          {COLUMNS.map((col) => {
            const colOrders = orders.filter(o => o.status === col.status);
            return (
              <div key={col.status} className="flex-1 flex flex-col min-w-[340px]">
                <div className="flex items-center justify-between mb-6 px-1">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full shadow-sm ${col.dot}`} />
                    <span className={`font-black text-[17px] tracking-tight ${col.color}`}>{col.label}</span>
                  </div>
                  <span className="bg-[#1A0A0A] text-white text-[12px] font-black px-3 py-1 rounded-full shadow-lg">
                    {colOrders.length}
                  </span>
                </div>

                <div className="flex flex-col gap-5 overflow-y-auto pr-2 custom-scrollbar">
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
                          className="bg-white rounded-3xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-gray-100 hover:shadow-[0_10px_30px_rgba(0,0,0,0.08)] transition-all group animate-in fade-in slide-in-from-bottom-4 duration-500"
                        >
                          {/* 헤더: 주문번호 & 경과시간 */}
                          <div className="flex items-center justify-between mb-5">
                            <span className="text-3xl font-black text-[#1A0A0A] tracking-tighter">
                              #{order.order_number}
                            </span>
                            <span className={`text-[11px] font-black px-3 py-1 rounded-full uppercase tracking-widest ${
                              order.status === 'PREPARING' ? 'bg-red-50 text-primary animate-pulse' : 'bg-gray-100 text-gray-500'
                            }`}>
                              {getElapsed(order.created_at)}
                            </span>
                          </div>

                          {/* 주문자 정보 (이름, 직분, 전화번호) */}
                          <div className="flex flex-col gap-1 mb-5 pb-5 border-b border-gray-50">
                            <div className="flex items-center gap-2">
                              <span className="text-[16px] font-black text-gray-900">{order.user_name_snapshot || '손님'}</span>
                              <span className="text-[11px] bg-gray-100 text-gray-500 font-bold px-1.5 py-0.5 rounded tracking-tighter">
                                {order.user_duty_snapshot}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 text-gray-400">
                              <Phone size={12} />
                              <span className="text-[13px] font-bold tracking-tight">{formatPhone(order.user_phone_snapshot)}</span>
                            </div>
                          </div>

                          {/* 메뉴 리스트 & 옵션 */}
                          <div className="flex flex-col gap-4 mb-5">
                            {order.items.map((item, idx) => (
                              <div key={idx} className="flex flex-col gap-1.5">
                                <div className="flex items-center justify-between">
                                  <p className="text-[15px] font-black text-gray-800 leading-snug">
                                    {item.menu_name_snapshot} <span className="text-primary text-[13px] ml-1">{item.quantity}개</span>
                                  </p>
                                </div>
                                {item.options_text && (
                                  <div className="flex items-start gap-1.5 text-gray-500">
                                    <Tag size={12} className="mt-0.5 shrink-0" />
                                    <span className="text-[12px] font-medium leading-tight">{item.options_text}</span>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>

                          {/* 고객 요청사항 */}
                          {order.request && (
                            <div className="mb-6 p-4 bg-orange-50/50 border border-orange-100 rounded-2xl flex gap-3">
                              <MessageSquare size={16} className="text-orange-500 shrink-0 mt-0.5" />
                              <div className="flex flex-col gap-1">
                                <span className="text-[11px] font-black text-orange-600 uppercase tracking-widest">요청사항</span>
                                <p className="text-[13px] font-bold text-orange-900 leading-relaxed whitespace-pre-wrap">
                                  {order.request}
                                </p>
                              </div>
                            </div>
                          )}

                          {/* 합계 금액 */}
                          <div className="flex items-center justify-between mb-6 pt-1">
                            <span className="text-[11px] text-gray-400 font-bold uppercase tracking-widest">Total Price</span>
                            <p className="text-[19px] font-black text-gray-900 tracking-tight">
                              ₩{order.total_price.toLocaleString()}
                            </p>
                          </div>

                          {/* 상태 변경 버튼 */}
                          <div className="flex gap-3">
                            {order.status === 'PENDING' && (
                              <button
                                onClick={() => handleCancel(order.id)}
                                disabled={isUpdating}
                                className="px-4 py-3 text-[13px] font-bold text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-2xl transition-all"
                              >
                                취소
                              </button>
                            )}
                            {transition && (
                              <button
                                onClick={() => handleStatusChange(order.id, transition.next)}
                                disabled={isUpdating}
                                className={`flex-1 py-4 text-[14px] font-black rounded-2xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 ${transition.color}`}
                              >
                                {isUpdating ? <RefreshCw size={16} className="animate-spin" /> : <CheckCircle size={18} />}
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

      <footer className="bg-[#1A0A0A] px-10 py-5 flex items-center justify-between shrink-0 text-white shadow-2xl">
        <div className="flex items-center gap-12">
          <div>
            <p className="text-[10px] text-white/40 font-black uppercase tracking-[0.2em] mb-1">Today Orders</p>
            <p className="text-2xl font-black">{orders.length}<span className="text-xs font-bold text-white/40 ml-1">Orders</span></p>
          </div>
          <div className="w-[1px] h-10 bg-white/10" />
          <div>
            <p className="text-[10px] text-white/40 font-black uppercase tracking-[0.2em] mb-1">Total Revenue</p>
            <p className="text-2xl font-black">₩{stats.total_sales.toLocaleString()}</p>
          </div>
          <div className="w-[1px] h-10 bg-white/10" />
          <div>
            <p className="text-[10px] text-white/40 font-black uppercase tracking-[0.2em] mb-1">Total Orders</p>
            <p className="text-2xl font-black">{stats.total_orders}<span className="text-xs font-bold text-white/40 ml-1">Total</span></p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-white/5 px-4 py-2 rounded-xl">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-white/60">Real-time Connected</span>
        </div>
      </footer>
    </div>
  );
};
