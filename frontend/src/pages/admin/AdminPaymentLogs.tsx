import { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Search, ChevronLeft, ChevronRight, Calendar, X, Building2, Wallet, Landmark } from 'lucide-react';
import { apiClient } from '../../api/client';
import type { PaymentLog, StandardResponse, PaymentLogListResponse } from '../../types';

// react-date-range 라이브러리 및 스타일
import { DateRangePicker } from 'react-date-range';
import type { Range, RangeKeyDict } from 'react-date-range';
import { ko } from 'date-fns/locale';
import { format, addDays, startOfYesterday, endOfYesterday, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from 'date-fns';
import 'react-date-range/dist/styles.css';
import 'react-date-range/dist/theme/default.css';

export const AdminPaymentLogs = () => {
  const [logs, setLogs] = useState<PaymentLog[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [searchQuery, setSearchQuery] = useState('');

  // 필터 상태
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const datePickerRef = useRef<HTMLDivElement>(null);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  // 반응형 너비 감지
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isMobile = windowWidth < 1024;

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

  // react-date-range 상태
  const [dateRange, setDateRange] = useState<Range[]>([
    {
      startDate: startOfWeek(new Date(), { weekStartsOn: 1 }),
      endDate: endOfWeek(new Date(), { weekStartsOn: 1 }),
      key: 'selection'
    }
  ]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const sDate = dateRange[0].startDate ? format(dateRange[0].startDate, 'yyyy-MM-dd') : '';
      const eDate = dateRange[0].endDate ? format(dateRange[0].endDate, 'yyyy-MM-dd') : '';

      let url = `/admin/payments/logs?page=${page}&limit=${limit}`;
      if (sDate) url += `&start_date=${sDate}`;
      if (eDate) url += `&end_date=${eDate}`;
      if (paymentMethodFilter) url += `&payment_method=${paymentMethodFilter}`;
      if (searchQuery) {
        // 검색어가 숫자인 경우 order_id로 검색 시도, 아니면 sender_name
        if (/^\d+$/.test(searchQuery)) {
          url += `&order_id=${searchQuery}`;
        } else {
          url += `&sender_name=${searchQuery}`;
        }
      }

      const res = await apiClient.get<PaymentLogListResponse, StandardResponse<PaymentLogListResponse>>(url);
      if (res.success && res.data) {
        setLogs(res.data.items);
        setTotalCount(res.data.total_count);
        setTotalPages(res.data.total_pages);
      }
    } catch (err) {
      console.error('입금 로그 조회 실패:', err);
    } finally {
      setLoading(false);
    }
  }, [page, limit, dateRange, paymentMethodFilter, searchQuery]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

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
    setPaymentMethodFilter('');
    setSearchQuery('');
    setPage(1);
  };

  const handleDateSelect = (ranges: RangeKeyDict) => {
    setDateRange([ranges.selection]);
    setPage(1);
  };

  return (
    <div className="flex flex-col h-full bg-white relative">
      {/* 헤더 */}
      <header className="px-8 py-6 border-b border-gray-100 bg-white sticky top-0 z-10">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
              <Landmark size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-black text-gray-900 tracking-tight">입금 승인 내역</h1>
              <p className="text-gray-400 text-[13px] font-bold uppercase tracking-widest mt-0.5">Payment Audit Logs</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {(dateRange[0].startDate || paymentMethodFilter || searchQuery) && (
              <button
                onClick={handleResetFilters}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-bold text-primary bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
              >
                <X size={14} /> 필터 초기화
              </button>
            )}
            <div className="bg-gray-50 px-4 py-2 rounded-xl border border-gray-100">
              <span className="text-[12px] text-gray-500 font-bold mr-2">검색 결과</span>
              <span className="text-lg font-black text-primary">{totalCount.toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {/* 검색바 */}
          <div className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5 w-full max-w-xs focus-within:ring-2 focus-within:ring-primary/20 transition-all">
            <Search size={18} className="text-gray-400" />
            <input
              type="text"
              placeholder="주문번호, 입금자명 검색"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="bg-transparent border-none outline-none text-[14px] flex-1 text-gray-700 placeholder-gray-400 font-medium"
            />
          </div>

          {/* 기간 필터 */}
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
              <div 
                className={`${isMobile 
                  ? 'fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm' 
                  : 'absolute top-full left-0 mt-2 z-50'}`}
                onClick={isMobile ? () => setShowDatePicker(false) : undefined}
              >
                <div 
                  className={`bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden ${isMobile ? 'animate-in zoom-in-95 duration-200' : ''}`}
                  onClick={e => e.stopPropagation()}
                >
                  <DateRangePicker
                    ranges={dateRange}
                    onChange={handleDateSelect}
                    locale={ko}
                    months={isMobile ? 1 : 2}
                    direction={isMobile ? 'vertical' : 'horizontal'}
                    rangeColors={['#2D1616']}
                    showDateDisplay={false}
                    staticRanges={[
                      { label: '오늘', range: () => ({ startDate: new Date(), endDate: new Date() }), isSelected: () => false },
                      { label: '어제', range: () => ({ startDate: startOfYesterday(), endDate: endOfYesterday() }), isSelected: () => false },
                      { label: '최근 7일', range: () => ({ startDate: addDays(new Date(), -7), endDate: new Date() }), isSelected: () => false },
                      { label: '이번 달', range: () => ({ startDate: startOfMonth(new Date()), endDate: endOfMonth(new Date()) }), isSelected: () => false },
                    ]}
                    inputRanges={[]}
                  />
                  <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-2">
                    <button
                      onClick={() => setShowDatePicker(false)}
                      className="px-4 py-2 text-[12px] font-bold text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                    >
                      닫기
                    </button>
                    <button
                      onClick={() => { setShowDatePicker(false); fetchLogs(); }}
                      className="px-4 py-2 text-[12px] font-bold text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors"
                    >
                      적용하기
                    </button>
                  </div>
                </div>
              </div>
            )}
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
        <table className="w-full max-w-[1200px] mx-auto text-left border-separate border-spacing-0">
          <thead>
            <tr className="text-gray-400 text-[11px] font-black uppercase tracking-[0.2em]">
              <th className="pb-4 font-black border-b border-gray-50 pl-2">순번</th>
              <th className="pb-4 font-black border-b border-gray-50">주문번호</th>
              <th className="pb-4 font-black border-b border-gray-50">유형</th>
              <th className="pb-4 font-black border-b border-gray-50">수단</th>
              <th className="pb-4 font-black border-b border-gray-50">입금자명</th>
              <th className="pb-4 font-black border-b border-gray-50">금액</th>
              <th className="pb-4 font-black border-b border-gray-50 pr-2">승인 시각</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr>
                <td colSpan={7} className="py-20 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-20 text-center text-gray-400 font-bold">
                  기록된 입금 로그가 없습니다.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="group hover:bg-gray-50/50 transition-colors">
                  <td className="py-5 pl-2">
                    <span className="text-[14px] font-black text-gray-400">{log.id}</span>
                  </td>
                  <td className="py-5">
                    <Link
                      to={`/admin/history?order_id=${log.order_id}`}
                      className="text-[14px] font-black text-gray-900 underline decoration-gray-200 underline-offset-4 hover:text-primary hover:decoration-primary/30 transition-all"
                    >
                      Order #{log.raw_data?.order_number || log.order_id}
                    </Link>
                  </td>
                  <td className="py-5">
                    <span className={`px-2 py-1 rounded-md text-[10px] font-black tracking-tight ${log.log_type === 'APPROVED' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'
                      }`}>
                      {log.log_type}
                    </span>
                  </td>
                  <td className="py-5">
                    {log.raw_data?.payment_method ? (
                      <div className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-black border ${log.raw_data.payment_method === 'CASH'
                        ? 'bg-orange-50 text-orange-600 border-orange-100'
                        : 'bg-blue-50 text-blue-600 border-blue-100'
                        }`}>
                        {log.raw_data.payment_method === 'CASH' ? <Wallet size={12} /> : <Building2 size={12} />}
                        {log.raw_data.payment_method === 'CASH' ? '현금' : '계좌'}
                      </div>
                    ) : (
                      <span className="text-[10px] text-gray-300 font-bold">-</span>
                    )}
                  </td>
                  <td className="py-5">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-[12px] font-black text-gray-500">
                        {log.sender_name?.charAt(0) || '?'}
                      </div>
                      <span className="text-[14px] font-black text-gray-900">{log.sender_name || '-'}</span>
                    </div>
                  </td>
                  <td className="py-5">
                    <span className="text-[15px] font-black text-primary">₩{log.amount.toLocaleString()}</span>
                  </td>
                  <td className="py-5 pr-2">
                    <span className="text-[12px] text-gray-500 font-medium">
                      {new Date(log.created_at).toLocaleString('ko-KR', {
                        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
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
            disabled={page === 1 || loading}
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
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary/30" />
            <p className="text-[12px] text-gray-400 font-bold tracking-tight">
              전체 {totalCount} 개 중 {totalCount > 0 ? (page - 1) * limit + 1 : 0}-{Math.min(totalCount, page * limit)}번째 입금 승인 내역
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};
