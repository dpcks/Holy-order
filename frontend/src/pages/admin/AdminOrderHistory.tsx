import { useEffect, useState } from 'react';
import { Search, ChevronLeft, ChevronRight, Calendar, Filter } from 'lucide-react';
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

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  PENDING: { label: '입금대기', color: 'bg-orange-100 text-orange-600' },
  PREPARING: { label: '제조중', color: 'bg-blue-100 text-blue-600' },
  READY: { label: '수령대기', color: 'bg-green-100 text-green-600' },
  COMPLETED: { label: '완료', color: 'bg-gray-100 text-gray-600' },
  CANCELLED: { label: '취소', color: 'bg-red-100 text-red-600' },
};

export const AdminOrderHistory = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<any, StandardResponse<Order[]>>(`/admin/orders/history?page=${page}&limit=20`);
      if (res.success && res.data) {
        setOrders(res.data);
      }
    } catch (err) {
      console.error('히스토리 조회 실패:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [page]);

  const filteredOrders = orders.filter(o => 
    String(o.order_number).includes(searchQuery) || 
    o.user_name_snapshot?.includes(searchQuery) ||
    o.items.some(i => i.menu_name_snapshot.includes(searchQuery))
  );

  return (
    <div className="flex flex-col h-full bg-white">
      {/* 헤더 */}
      <header className="px-8 py-6 border-b border-gray-100">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">주문 내역 히스토리</h1>
            <p className="text-[13px] text-gray-400 mt-1">완료 및 취소된 주문을 포함한 전체 주문 이력입니다.</p>
          </div>
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-xl text-[13px] font-semibold text-gray-600 hover:bg-gray-200 transition-colors">
              <Calendar size={16} /> 기간 설정
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-xl text-[13px] font-semibold text-gray-600 hover:bg-gray-200 transition-colors">
              <Filter size={16} /> 필터
            </button>
          </div>
        </div>

        {/* 검색바 */}
        <div className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 max-w-md">
          <Search size={18} className="text-gray-400" />
          <input 
            type="text" 
            placeholder="주문번호, 고객명, 메뉴명 검색..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent border-none outline-none text-[14px] flex-1 text-gray-700 placeholder-gray-400"
          />
        </div>
      </header>

      {/* 테이블 영역 */}
      <div className="flex-1 overflow-auto px-8 py-6">
        <table className="w-full border-collapse">
          <thead>
            <tr className="text-left text-[12px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100">
              <th className="pb-4 pl-2">주문번호</th>
              <th className="pb-4">고객 정보</th>
              <th className="pb-4">주문 내역</th>
              <th className="pb-4">결제 금액</th>
              <th className="pb-4">상태</th>
              <th className="pb-4">주문 시간</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr>
                <td colSpan={6} className="py-20 text-center">
                  <div className="flex justify-center"><div className="animate-spin h-6 w-6 border-b-2 border-primary rounded-full" /></div>
                </td>
              </tr>
            ) : filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-20 text-center text-gray-400 text-sm">
                  검색 결과가 없습니다.
                </td>
              </tr>
            ) : (
              filteredOrders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50 transition-colors group">
                  <td className="py-4 pl-2 font-black text-gray-900">#{order.order_number}</td>
                  <td className="py-4">
                    <div className="flex flex-col">
                      <span className="text-[14px] font-bold text-gray-800">{order.user_name_snapshot || '손님'}</span>
                      <span className="text-[11px] text-gray-400 font-medium">{order.user_duty_snapshot}</span>
                    </div>
                  </td>
                  <td className="py-4">
                    <div className="flex flex-col gap-0.5 max-w-[300px]">
                      <span className="text-[13px] font-semibold text-gray-800 truncate">
                        {order.items.map(i => `${i.menu_name_snapshot} ${i.quantity}`).join(', ')}
                      </span>
                      {order.items[0]?.options_text && (
                        <span className="text-[11px] text-gray-400 truncate italic">
                          {order.items.map(i => i.options_text).filter(Boolean).join(' / ')}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-4">
                    <span className="text-[14px] font-bold text-gray-900">₩{order.total_price.toLocaleString()}</span>
                  </td>
                  <td className="py-4">
                    <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${STATUS_LABELS[order.status]?.color || 'bg-gray-100 text-gray-400'}`}>
                      {STATUS_LABELS[order.status]?.label || order.status}
                    </span>
                  </td>
                  <td className="py-4">
                    <span className="text-[12px] text-gray-500">
                      {new Date(order.created_at).toLocaleString('ko-KR', { 
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
                      })}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 */}
      <footer className="px-8 py-4 border-t border-gray-100 flex items-center justify-between shrink-0 bg-white">
        <p className="text-[12px] text-gray-400 font-medium">Showing {filteredOrders.length} orders on this page</p>
        <div className="flex items-center gap-2">
          <button 
            disabled={page === 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-30 transition-all"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-[13px] font-bold px-3">Page {page}</span>
          <button 
            disabled={orders.length < 20}
            onClick={() => setPage(p => p + 1)}
            className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-30 transition-all"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </footer>
    </div>
  );
};
