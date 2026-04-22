import { useEffect, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Receipt, ArrowLeftRight, Building2, Wallet } from 'lucide-react';
import { apiClient } from '../../api/client';
import type { PaymentLog, StandardResponse, PaymentLogListResponse } from '../../types';

export const AdminPaymentLogs = () => {
  const [logs, setLogs] = useState<PaymentLog[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<PaymentLogListResponse, StandardResponse<PaymentLogListResponse>>(`/admin/payments/logs?page=${page}&limit=20`);
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
  }, [page]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return (
    <div className="flex flex-col h-full bg-white relative">
      {/* 헤더 */}
      <header className="px-8 py-6 border-b border-gray-100 bg-white sticky top-0 z-10">
        <div className="flex justify-between items-center max-w-[1200px] mx-auto">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
              <ArrowLeftRight size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-black text-gray-900 tracking-tight">입금 승인 내역</h1>
              <p className="text-gray-400 text-[13px] font-bold uppercase tracking-widest mt-0.5">Payment Audit Logs</p>
            </div>
          </div>
          <div className="bg-gray-50 px-4 py-2 rounded-xl border border-gray-100">
            <span className="text-[12px] text-gray-500 font-bold mr-2">총 로그 수</span>
            <span className="text-lg font-black text-primary">{totalCount.toLocaleString()}</span>
          </div>
        </div>
      </header>

      {/* 테이블 영역 */}
      <div className="flex-1 overflow-auto px-8 py-6">
        <table className="w-full max-w-[1200px] mx-auto text-left border-separate border-spacing-0">
          <thead>
            <tr className="text-gray-400 text-[11px] font-black uppercase tracking-[0.2em]">
              <th className="pb-4 font-black border-b border-gray-50 pl-2">ID</th>
              <th className="pb-4 font-black border-b border-gray-50">주문 ID</th>
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
                <td colSpan={6} className="py-20 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-20 text-center text-gray-400 font-bold">
                  기록된 입금 로그가 없습니다.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="group hover:bg-gray-50/50 transition-colors">
                  <td className="py-5 pl-2">
                    <span className="text-[14px] font-black text-gray-400">#{log.id}</span>
                  </td>
                  <td className="py-5">
                    <span className="text-[14px] font-black text-gray-900 underline decoration-gray-200 underline-offset-4">
                      Order #{log.order_id}
                    </span>
                  </td>
                  <td className="py-5">
                    <span className={`px-2 py-1 rounded-md text-[10px] font-black tracking-tight ${
                      log.log_type === 'APPROVED' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'
                    }`}>
                      {log.log_type}
                    </span>
                  </td>
                  <td className="py-5">
                    {log.raw_data?.payment_method ? (
                      <div className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-black border ${
                        log.raw_data.payment_method === 'CASH' 
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
      <footer className="px-8 py-6 border-t border-gray-100 flex flex-col items-center gap-4 shrink-0 bg-white">
        <div className="flex items-center gap-6">
          <button 
            disabled={page === 1 || loading}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            className="flex items-center gap-1 px-4 py-2 border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-[13px] font-bold text-gray-600"
          >
            <ChevronLeft size={16} /> 이전
          </button>
          
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-black text-primary bg-primary/5 px-3 py-1 rounded-lg">
              {page}
            </span>
            <span className="text-[13px] text-gray-300 font-bold">/ {totalPages} 페이지</span>
          </div>

          <button 
            disabled={page >= totalPages || loading}
            onClick={() => setPage(p => p + 1)}
            className="flex items-center gap-1 px-4 py-2 border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-[13px] font-bold text-gray-600"
          >
            다음 <ChevronRight size={16} />
          </button>
        </div>
      </footer>
    </div>
  );
};
