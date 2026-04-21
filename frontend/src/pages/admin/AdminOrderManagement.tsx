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

  const fetchOrders = useCallback(async () => {
    try {
      const res = await apiClient.get<any, StandardResponse<Order[]>>('/admin/orders/board');
      if (res.success && res.data) {
        setOrders(res.data);
        setLastUpdated(new Date());
      }
    } catch (err) {
      console.error('주문 조회 실패:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // 초기 로드 + 5초 폴링
  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 5000);
    return () => clearInterval(interval);
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
    <div className="flex flex-col h-full">
      {/* 상단 헤더 */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shrink-0">
        <div>
          <div className="flex items-center gap-3 mb-0.5">
            <h1 className="text-xl font-bold text-gray-900">실시간 주문 현황</h1>
            <span className="flex items-center gap-1.5 text-[12px] text-green-600 font-semibold bg-green-50 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              실시간
            </span>
          </div>
          <p className="text-[12px] text-gray-400">
            마지막 업데이트: {lastUpdated.toLocaleTimeString('ko-KR')} · 5초마다 자동 갱신
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-[11px] text-gray-400 font-medium">대기 주문</p>
            <p className="text-lg font-black text-gray-900">{orders.length}건</p>
          </div>
          <button
            onClick={fetchOrders}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
            title="새로고침"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
          <button className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 relative">
            <Bell size={18} />
          </button>
        </div>
      </header>

      {/* 칸반 보드 */}
      <div className="flex-1 overflow-x-auto p-8">
        <div className="flex gap-8 h-full min-w-[1100px]">
          {COLUMNS.map((col) => {
            const colOrders = orders.filter(o => o.status === col.status);
            return (
              <div key={col.status} className="flex-1 flex flex-col min-w-[280px]">
                {/* 컬럼 헤더 */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${col.dot}`} />
                    <span className={`font-bold text-[15px] ${col.color}`}>{col.label}</span>
                  </div>
                  <span className="bg-gray-800 text-white text-[11px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                    {colOrders.length}
                  </span>
                </div>

                {/* 주문 카드 목록 */}
                <div className="flex flex-col gap-3 overflow-y-auto pr-1">
                  {colOrders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                      <CheckCircle size={32} strokeWidth={1.5} className="mb-2 opacity-40" />
                      <p className="text-[13px] font-medium">대기 주문 없음</p>
                    </div>
                  ) : (
                    colOrders.map((order) => {
                      const transition = STATUS_TRANSITIONS[order.status];
                      const isUpdating = updatingId === order.id;
                      return (
                        <div
                          key={order.id}
                          className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
                        >
                          {/* 주문번호 + 경과시간 */}
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-2xl font-black text-[#1A0A0A]">
                              #{order.order_number}
                            </span>
                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                              order.status === 'PREPARING' ? 'bg-red-50 text-primary' : 'bg-gray-100 text-gray-500'
                            }`}>
                              {getElapsed(order.created_at)}
                            </span>
                          </div>

                          {/* 메뉴 요약 */}
                          <p className="text-[13px] font-semibold text-gray-800 mb-1 leading-snug">
                            {summarizeItems(order.items)}
                          </p>
                          <p className="text-[12px] text-gray-500 mb-3">
                            {order.user_name_snapshot || '손님'} {order.user_duty_snapshot}
                          </p>

                          {/* 금액 */}
                          <p className="text-[13px] font-bold text-gray-900 mb-3">
                            {order.total_price.toLocaleString()}원
                          </p>

                          {/* 액션 버튼 */}
                          <div className="flex gap-2">
                            {order.status === 'PENDING' && (
                              <button
                                onClick={() => handleCancel(order.id)}
                                disabled={isUpdating}
                                className="flex-1 py-2 text-[12px] font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors disabled:opacity-50"
                              >
                                주문 취소
                              </button>
                            )}
                            {transition && (
                              <button
                                onClick={() => handleStatusChange(order.id, transition.next)}
                                disabled={isUpdating}
                                className={`flex-[2] py-2.5 text-[13px] font-bold rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 ${transition.color}`}
                              >
                                {isUpdating ? (
                                  <RefreshCw size={14} className="animate-spin" />
                                ) : (
                                  <CheckCircle size={14} />
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
      <footer className="bg-white border-t border-gray-200 px-6 py-3 flex items-center gap-8 shrink-0">
        <div>
          <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Today Orders</p>
          <p className="text-xl font-black text-gray-900">{orders.length}건</p>
        </div>
        <div>
          <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Active Sales</p>
          <p className="text-xl font-black text-gray-900">₩{todayTotal.toLocaleString()}</p>
        </div>
        <div className="ml-auto flex items-center gap-2 text-[12px] text-gray-500">
          <XCircle size={14} className="text-primary" />
          취소 주문은 목록에서 자동으로 제거됩니다.
        </div>
      </footer>
    </div>
  );
};
