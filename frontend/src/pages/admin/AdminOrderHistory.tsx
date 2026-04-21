import { useEffect, useState, useCallback } from 'react';
import { Search, ChevronLeft, ChevronRight, Calendar, Filter, X } from 'lucide-react';
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
  
  // 필터 상태
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      let url = `/admin/orders/history?page=${page}&limit=20`;
      if (startDate) url += `&start_date=${startDate}`;
      if (endDate) url += `&end_date=${endDate}`;
      if (statusFilter) url += `&status=${statusFilter}`;

      const res = await apiClient.get<any, StandardResponse<Order[]>>(url);
      if (res.success && res.data) {
        setOrders(res.data);
      }
    } catch (err) {
      console.error('히스토리 조회 실패:', err);
    } finally {
      setLoading(false);
    }
  }, [page, startDate, endDate, statusFilter]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleResetFilters = () => {
    setStartDate('');
    setEndDate('');
    setStatusFilter('');
    setPage(1);
  };

  const filteredOrders = orders.filter(o => 
    String(o.order_number).includes(searchQuery) || 
    (o.user_name_snapshot?.includes(searchQuery)) ||
    o.items.some(i => i.menu_name_snapshot.includes(searchQuery))
  );

  return (
    <div className="flex flex-col h-full bg-white">
      {/* 헤더 */}
      <header className="px-8 py-6 border-b border-gray-100 bg-white sticky top-0 z-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">주문 내역 히스토리</h1>
            <p className="text-[13px] text-gray-400 mt-1 font-medium">카페 전체 주문 이력을 조회하고 필터링할 수 있습니다.</p>
          </div>
          {(startDate || endDate || statusFilter) && (
            <button 
              onClick={handleResetFilters}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-bold text-primary bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
            >
              <X size={14} /> 필터 초기화
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {/* 검색바 */}
          <div className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5 w-full max-w-xs focus-within:ring-2 focus-within:ring-primary/20 transition-all">
            <Search size={18} className="text-gray-400" />
            <input 
              type="text" 
              placeholder="주문번호, 고객명 검색..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none outline-none text-[14px] flex-1 text-gray-700 placeholder-gray-400 font-medium"
            />
          </div>

          {/* 기간 필터 */}
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-xl px-3 py-1.5">
            <Calendar size={15} className="text-gray-400 ml-1" />
            <input 
              type="date" 
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
              className="bg-transparent border-none outline-none text-[13px] font-semibold text-gray-700"
            />
            <span className="text-gray-300">~</span>
            <input 
              type="date" 
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
              className="bg-transparent border-none outline-none text-[13px] font-semibold text-gray-700"
            />
          </div>

          {/* 상태 필터 */}
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-xl px-3 py-1.5">
            <Filter size={15} className="text-gray-400 ml-1" />
            <select 
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="bg-transparent border-none outline-none text-[13px] font-semibold text-gray-700 pr-2 cursor-pointer"
            >
              <option value="">전체 상태</option>
              {Object.entries(STATUS_LABELS).map(([val, { label }]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {/* 테이블 영역 */}
      <div className="flex-1 overflow-auto px-8 py-6">
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr className="text-left text-[12px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100">
              <th className="pb-4 pl-4 font-black">주문번호</th>
              <th className="pb-4">고객 정보</th>
              <th className="pb-4">주문 내역</th>
              <th className="pb-4">결제 금액</th>
              <th className="pb-4">상태</th>
              <th className="pb-4 pr-4">주문 시간</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr>
                <td colSpan={6} className="py-32 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
                    <p className="text-sm text-gray-400 font-medium">데이터를 불러오는 중...</p>
                  </div>
                </td>
              </tr>
            ) : filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-32 text-center">
                  <div className="flex flex-col items-center gap-2 text-gray-300">
                    <Search size={48} strokeWidth={1} />
                    <p className="text-[15px] font-semibold mt-2">검색 결과가 없습니다.</p>
                    <p className="text-[13px]">필터 조건을 변경해 보세요.</p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredOrders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50/80 transition-colors group cursor-default">
                  <td className="py-5 pl-4 font-black text-[#1A0A0A] text-[16px]">#{order.order_number}</td>
                  <td className="py-5">
                    <div className="flex flex-col">
                      <span className="text-[14px] font-bold text-gray-800">{order.user_name_snapshot || '손님'}</span>
                      <span className="text-[11px] text-gray-400 font-semibold tracking-tight">{order.user_duty_snapshot}</span>
                    </div>
                  </td>
                  <td className="py-5">
                    <div className="flex flex-col gap-0.5 max-w-[320px]">
                      <span className="text-[13px] font-bold text-gray-700 truncate">
                        {order.items.map(i => `${i.menu_name_snapshot} ${i.quantity}개`).join(', ')}
                      </span>
                      {order.items[0]?.options_text && (
                        <span className="text-[11px] text-gray-400 truncate italic font-medium">
                          {order.items.map(i => i.options_text).filter(Boolean).join(' / ')}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-5">
                    <span className="text-[15px] font-black text-gray-900">₩{order.total_price.toLocaleString()}</span>
                  </td>
                  <td className="py-5">
                    <span className={`px-2.5 py-1.5 rounded-lg text-[11px] font-black tracking-tight ${STATUS_LABELS[order.status]?.color || 'bg-gray-100 text-gray-400'}`}>
                      {STATUS_LABELS[order.status]?.label || order.status}
                    </span>
                  </td>
                  <td className="py-5 pr-4">
                    <span className="text-[12px] text-gray-500 font-medium">
                      {new Date(order.created_at).toLocaleString('ko-KR', { 
                        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' 
                      })}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 (가운데 정렬) */}
      <footer className="px-8 py-6 border-t border-gray-100 flex flex-col items-center gap-4 shrink-0 bg-white">
        <div className="flex items-center gap-6">
          <button 
            disabled={page === 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            className="flex items-center gap-1 px-4 py-2 border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-[13px] font-bold text-gray-600"
          >
            <ChevronLeft size={16} /> 이전
          </button>
          
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-black text-primary bg-primary/5 px-3 py-1 rounded-lg">
              {page}
            </span>
            <span className="text-[13px] text-gray-300 font-bold">페이지</span>
          </div>

          <button 
            disabled={orders.length < 20}
            onClick={() => setPage(p => p + 1)}
            className="flex items-center gap-1 px-4 py-2 border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-[13px] font-bold text-gray-600"
          >
            다음 <ChevronRight size={16} />
          </button>
        </div>
        <p className="text-[11px] text-gray-400 font-bold uppercase tracking-widest">
          Showing {filteredOrders.length} records in this view
        </p>
      </footer>
    </div>
  );
};
