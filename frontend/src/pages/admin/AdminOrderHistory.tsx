import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, ChevronLeft, ChevronRight, Calendar, Filter, X, Building2, Wallet, MessageSquare } from 'lucide-react';
import { apiClient } from '../../api/client';
import type { Order, StandardResponse, OrderListResponse } from '../../types';

// react-date-range 라이브러리 및 스타일
import { DateRangePicker } from 'react-date-range';
import type { Range, RangeKeyDict } from 'react-date-range';
import { ko } from 'date-fns/locale';
import { format, addDays, startOfMonth, endOfMonth, startOfYesterday, endOfYesterday } from 'date-fns';
import 'react-date-range/dist/styles.css'; // 기본 스타일
import 'react-date-range/dist/theme/default.css'; // 테마 스타일

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  PENDING: { label: '입금대기', color: 'bg-orange-100 text-orange-600' },
  PREPARING: { label: '제조중', color: 'bg-blue-100 text-blue-600' },
  READY: { label: '수령대기', color: 'bg-green-100 text-green-600' },
  COMPLETED: { label: '완료', color: 'bg-gray-100 text-gray-600' },
  CANCELLED: { label: '취소', color: 'bg-red-100 text-red-600' },
};

// 옵션 텍스트 파싱 및 뱃지 렌더링 컴포넌트
const OptionBadges = ({ text }: { text: string | null }) => {
  if (!text) return null;
  const options = text.split(/ \/ |, /);
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {options.map((opt, i) => {
        const trimmed = opt.trim();
        if (!trimmed) return null;
        const isIce = trimmed.toUpperCase() === 'ICE';
        const isHot = trimmed.toUpperCase() === 'HOT';
        const isShot = trimmed.includes('샷 추가');
        const isTumblr = trimmed.includes('텀블러');
        return (
          <span key={i} className={`text-[10px] font-black px-2 py-0.5 rounded-md leading-none flex items-center h-5 border ${isIce ? 'bg-blue-100 text-blue-600 border-blue-200' :
              isHot ? 'bg-red-100 text-red-600 border-red-200' :
                isShot ? 'bg-yellow-100 text-yellow-700 border-yellow-300' :
                  isTumblr ? 'bg-green-100 text-green-700 border-green-300' :
                    'bg-gray-100 text-gray-500 border-gray-200'
            }`}>
            {trimmed}
          </span>
        );
      })}
    </div>
  );
};

// 전화번호 포맷팅
const formatPhone = (phone: string | null) => {
  if (!phone) return '';
  return phone.replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3');
};

export const AdminOrderHistory = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialOrderId = searchParams.get('order_id');
  const [orders, setOrders] = useState<Order[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [focusedOrderId, setFocusedOrderId] = useState<string | null>(initialOrderId);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // 필터 상태
  const [statusFilter, setStatusFilter] = useState('');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const datePickerRef = useRef<HTMLDivElement>(null);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;
    let start = Math.max(1, page - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);

    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  };

  // 반응형 너비 감지
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isMobile = windowWidth < 1024;

  // react-date-range 상태
  const [dateRange, setDateRange] = useState<Range[]>([
    {
      startDate: undefined,
      endDate: undefined,
      key: 'selection'
    }
  ]);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const sDate = dateRange[0].startDate ? format(dateRange[0].startDate, 'yyyy-MM-dd') : '';
      const eDate = dateRange[0].endDate ? format(dateRange[0].endDate, 'yyyy-MM-dd') : '';

      let url = `/admin/orders/history?page=${page}&limit=${limit}`;
      if (statusFilter) url += `&status=${statusFilter}`;
      if (paymentMethodFilter) url += `&payment_method=${paymentMethodFilter}`;

      // 특정 주문 ID로 조회 중일 때는 날짜 필터 무시
      if (focusedOrderId) {
        url += `&search=${focusedOrderId}`;
      } else {
        if (sDate) url += `&start_date=${sDate}`;
        if (eDate) url += `&end_date=${eDate}`;
        if (searchQuery) url += `&search=${encodeURIComponent(searchQuery)}`;
      }

      const res = await apiClient.get<OrderListResponse, StandardResponse<OrderListResponse>>(url);
      if (res.success && res.data) {
        setOrders(res.data.items);
        setTotalCount(res.data.total_count);
        setTotalPages(res.data.total_pages);
      }
    } catch (err) {
      console.error('히스토리 조회 실패:', err);
    } finally {
      setLoading(false);
    }
  }, [page, limit, dateRange, statusFilter, paymentMethodFilter, searchQuery, focusedOrderId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // 날짜 선택기 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (datePickerRef.current && !datePickerRef.current.contains(event.target as Node)) {
        setShowDatePicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleResetFilters = () => {
    setDateRange([{ startDate: undefined, endDate: undefined, key: 'selection' }]);
    setStatusFilter('');
    setPaymentMethodFilter('');
    setSearchQuery('');
    setFocusedOrderId(null);
    setSearchParams({});
    setPage(1);
  };

  const handleDateSelect = (ranges: RangeKeyDict) => {
    setDateRange([ranges.selection]);
    setPage(1);
    // 선택 완료 시 자동으로 닫지 않고 사용자가 확인하게 함 (또는 닫기 버튼 추가)
  };

  const handleOpenDetail = (order: Order) => {
    setSelectedOrder(order);
    setIsDetailModalOpen(true);
  };

  const handleCloseDetail = () => {
    setIsDetailModalOpen(false);
    setSelectedOrder(null);
  };

  return (
    <div className="flex flex-col h-full bg-white relative">
      {/* 헤더 */}
      <header className="px-8 py-6 border-b border-gray-100 bg-white sticky top-0 z-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">주문 내역 히스토리</h1>
            <p className="text-[13px] text-gray-400 mt-1 font-medium">카페 전체 주문 이력을 조회하고 필터링할 수 있습니다.</p>
          </div>
          {(dateRange[0].startDate || statusFilter || paymentMethodFilter || searchQuery) && (
            <button
              onClick={handleResetFilters}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-bold text-primary bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
            >
              <X size={14} /> 필터 초기화
            </button>
          )}
        </div>

        {focusedOrderId && (
          <div className="mb-6 flex items-center gap-3 bg-primary/5 text-primary px-4 py-3 rounded-2xl border border-primary/10 animate-in fade-in slide-in-from-top-2">
            <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
              <Filter size={14} className="animate-pulse" />
            </div>
            <div className="flex-1">
              <p className="text-[13px] font-black">특정 주문 집중 조회 모드</p>
              <p className="text-[11px] font-bold opacity-70">입금 내역에서 선택한 주문(고유 ID: {focusedOrderId})을 확인하고 있습니다.</p>
            </div>
            <button
              onClick={() => {
                setFocusedOrderId(null);
                setSearchParams({});
              }}
              className="text-[11px] font-black uppercase tracking-wider bg-white px-3 py-1.5 rounded-xl border border-primary/20 hover:bg-primary hover:text-white hover:border-transparent transition-all shadow-sm"
            >
              모든 주문 보기
            </button>
          </div>
        )}

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

          {/* 기간 필터 (react-date-range 적용) */}
          <div className="relative" ref={datePickerRef}>
            <button
              onClick={() => setShowDatePicker(!showDatePicker)}
              className={`flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5 text-[13px] font-bold transition-all ${showDatePicker ? 'ring-2 ring-primary/20 bg-white border-primary/30' : 'hover:bg-gray-100'}`}
            >
              <Calendar size={16} className={dateRange[0].startDate ? 'text-primary' : 'text-gray-400'} />
              {dateRange[0].startDate ? (
                <span className="text-gray-900">
                  {format(dateRange[0].startDate, 'yyyy.MM.dd')} ~ {dateRange[0].endDate ? format(dateRange[0].endDate, 'yyyy.MM.dd') : '...'}
                </span>
              ) : (
                <span className="text-gray-500">기간 설정</span>
              )}
            </button>

            {showDatePicker && (
              <div className="absolute top-full left-0 mt-2 bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 overflow-hidden scale-90 origin-top-left xl:scale-100">
                <DateRangePicker
                  locale={ko}
                  ranges={dateRange}
                  onChange={handleDateSelect}
                  months={isMobile ? 1 : 2}
                  direction={isMobile ? 'vertical' : 'horizontal'}
                  rangeColors={['#FF4B4B']}
                  staticRanges={[
                    { label: '오늘', range: () => ({ startDate: new Date(), endDate: new Date() }) },
                    { label: '어제', range: () => ({ startDate: startOfYesterday(), endDate: endOfYesterday() }) },
                    { label: '최근 7일', range: () => ({ startDate: addDays(new Date(), -7), endDate: new Date() }) },
                    { label: '이번 달', range: () => ({ startDate: startOfMonth(new Date()), endDate: endOfMonth(new Date()) }) },
                    { label: '지난 달', range: () => ({ startDate: startOfMonth(addDays(startOfMonth(new Date()), -1)), endDate: endOfMonth(addDays(startOfMonth(new Date()), -1)) }) },
                  ].map(r => ({ ...r, isSelected: () => false })) as any}
                  inputRanges={[]} // 하단 'days from today' 입력 필드 제거
                />
                <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-2">
                  <button
                    onClick={() => setShowDatePicker(false)}
                    className="px-4 py-2 text-[12px] font-bold text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                  >
                    닫기
                  </button>
                  <button
                    onClick={() => { setShowDatePicker(false); fetchHistory(); }}
                    className="px-4 py-2 text-[12px] font-bold text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors"
                  >
                    적용하기
                  </button>
                </div>
              </div>
            )}
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

          {/* 결제수단 필터 */}
          <div className="flex items-center gap-1 bg-gray-50 border border-gray-100 rounded-xl p-1">
            <button
              onClick={() => { setPaymentMethodFilter(''); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all ${paymentMethodFilter === '' ? 'bg-[#2D1616] text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
            >
              전체
            </button>
            <button
              onClick={() => { setPaymentMethodFilter('BANK_TRANSFER'); setPage(1); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all ${paymentMethodFilter === 'BANK_TRANSFER' ? 'bg-[#2D1616] text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <Building2 size={13} /> 계좌
            </button>
            <button
              onClick={() => { setPaymentMethodFilter('CASH'); setPage(1); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all ${paymentMethodFilter === 'CASH' ? 'bg-[#2D1616] text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <Wallet size={13} /> 현금
            </button>
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
              <th className="pb-4">결제수단</th>
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
            ) : orders.length === 0 ? (
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
              orders.map((order) => (
                <tr
                  key={order.id}
                  onClick={() => handleOpenDetail(order)}
                  className="hover:bg-gray-50 transition-colors group cursor-pointer"
                >
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
                    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-black border ${order.payment_method === 'CASH'
                      ? 'bg-orange-50 text-orange-600 border-orange-100'
                      : 'bg-blue-50 text-blue-600 border-blue-100'
                      }`}>
                      {order.payment_method === 'CASH' ? <Wallet size={12} /> : <Building2 size={12} />}
                      {order.payment_method === 'CASH' ? '현금' : '계좌'}
                    </div>
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

      {/* 페이지네이션 */}
      <footer className="px-8 py-3 border-t border-gray-100 flex flex-col items-center gap-3 shrink-0 bg-white">
        <div className="flex items-center gap-2">
          <button
            disabled={page === 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            className="w-10 h-10 flex items-center justify-center border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-gray-600 shadow-sm"
          >
            <ChevronLeft size={18} />
          </button>

          <div className="flex items-center gap-1">
            {getPageNumbers().map(p => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`w-10 h-10 rounded-xl text-[14px] font-black transition-all ${page === p
                  ? 'bg-primary text-white shadow-md shadow-primary/20'
                  : 'text-gray-500 hover:bg-gray-50 border border-transparent hover:border-gray-100'
                  }`}
              >
                {p}
              </button>
            ))}
          </div>

          <button
            disabled={page >= totalPages || loading}
            onClick={() => setPage(p => p + 1)}
            className="w-10 h-10 flex items-center justify-center border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-gray-600 shadow-sm"
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="flex items-center gap-4">
          <select
            value={limit}
            onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
            className="text-[12px] font-bold text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-primary/20 cursor-pointer"
          >
            <option value={20}>20개씩 보기</option>
            <option value={50}>50개씩 보기</option>
            <option value={100}>100개씩 보기</option>
          </select>
          <p className="text-[11px] text-gray-400 font-bold uppercase tracking-widest">
            전체 {totalCount}개 중 {orders.length}개의 주문내역
          </p>
        </div>
      </footer>

      {/* 주문 상세 모달 */}
      {isDetailModalOpen && selectedOrder && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm" onClick={handleCloseDetail}>
          <div className="bg-white rounded-[40px] w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            {/* 모달 헤더 */}
            <div className="bg-[#1A0A0A] p-8 text-white flex justify-between items-start">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-4xl font-black tracking-tighter">#{selectedOrder.order_number}</span>
                  <span className="bg-white/10 text-white/80 text-[12px] font-black px-3 py-1 rounded-full uppercase tracking-widest">
                    History Detail
                  </span>
                </div>
                <p className="text-white/40 text-[13px] font-medium">
                  주문 일시: {new Date(selectedOrder.created_at).toLocaleString('ko-KR')}
                </p>
              </div>
              <button onClick={handleCloseDetail} className="p-2 hover:bg-white/10 rounded-full transition-all">
                <X size={24} />
              </button>
            </div>

            <div className="p-10 space-y-10 max-h-[70vh] overflow-y-auto custom-scrollbar">
              {/* 고객 및 주문 정보 요약 */}
              <div className="grid grid-cols-2 gap-10">
                <div className="space-y-4">
                  <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em]">Customer Information</h4>
                  <div className="space-y-1">
                    <p className="text-2xl font-black text-gray-900 leading-tight">
                      {selectedOrder.user_name_snapshot || '손님'}
                      <span className="text-[13px] ml-2 font-bold text-gray-400">[{selectedOrder.user_duty_snapshot}]</span>
                    </p>
                    <p className="text-[15px] font-bold text-gray-500">{formatPhone(selectedOrder.user_phone_snapshot)}</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em]">Order Summary</h4>
                  <div className="space-y-1">
                    <p className="text-[15px] font-bold text-gray-900">결제수단: {selectedOrder.payment_method === 'CASH' ? '현금 결제' : '계좌 이체'}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-bold text-gray-500">주문 상태:</span>
                      <span className={`text-[12px] font-black px-2.5 py-0.5 rounded-lg ${STATUS_LABELS[selectedOrder.status]?.color}`}>
                        {STATUS_LABELS[selectedOrder.status]?.label}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 주문 아이템 테이블 */}
              <div className="space-y-4">
                <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em]">Order Items</h4>
                <div className="border border-gray-100 rounded-3xl overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-4 text-[11px] font-black text-gray-400 uppercase tracking-widest">Item</th>
                        <th className="px-6 py-4 text-[11px] font-black text-gray-400 uppercase tracking-widest text-center">Qty</th>
                        <th className="px-6 py-4 text-[11px] font-black text-gray-400 uppercase tracking-widest text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {selectedOrder.items.map((item, idx) => (
                        <tr key={idx} className="group hover:bg-gray-50/50 transition-colors">
                          <td className="px-6 py-5">
                            <p className="text-[15px] font-black text-gray-900 mb-1">{item.menu_name_snapshot}</p>
                            <OptionBadges text={item.options_text} />
                          </td>
                          <td className="px-6 py-5 text-center">
                            <span className="text-[14px] font-black text-gray-900">x {item.quantity}</span>
                          </td>
                          <td className="px-6 py-5 text-right">
                            <span className="text-[15px] font-black text-gray-900">₩{item.sub_total.toLocaleString()}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50/50">
                      <tr>
                        <td colSpan={2} className="px-6 py-6 text-right text-[13px] font-bold text-gray-500 uppercase tracking-widest">Total Amount</td>
                        <td className="px-6 py-6 text-right text-2xl font-black text-primary tracking-tight">₩{selectedOrder.total_price.toLocaleString()}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* 요청 사항 */}
              {selectedOrder.request && (
                <div className="space-y-4">
                  <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em]">Customer Request</h4>
                  <div className="p-6 bg-orange-50/50 border border-orange-100 rounded-3xl flex gap-4">
                    <MessageSquare size={20} className="text-orange-500 shrink-0 mt-0.5" />
                    <p className="text-[15px] font-bold text-orange-900 leading-relaxed whitespace-pre-wrap">
                      {selectedOrder.request}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* 모달 하단 액션 */}
            <div className="p-8 bg-gray-50 border-t border-gray-100">
              <button
                onClick={handleCloseDetail}
                className="w-full py-4 text-[15px] font-black text-gray-500 bg-white border border-gray-200 hover:bg-gray-100 rounded-2xl transition-all shadow-sm"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
