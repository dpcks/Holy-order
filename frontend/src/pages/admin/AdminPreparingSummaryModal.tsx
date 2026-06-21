import React, { useMemo } from 'react';
import { X, Coffee } from 'lucide-react';
import type { Order } from '../../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  orders: Order[];
}

export const AdminPreparingSummaryModal: React.FC<Props> = ({ isOpen, onClose, orders }) => {
  const summary = useMemo(() => {
    const preparing = orders.filter(o => o.status === 'PREPARING');
    const counts: Record<string, number> = {};
    const oldestTime: Record<string, number> = {};

    preparing.forEach(order => {
      const orderTime = new Date(order.created_at).getTime();
      order.items.forEach(item => {
        // 옵션이 있으면 "아메리카노 (ICE / 텀블러)" 형태로 표시
        const opts = item.options_text ? `(${item.options_text})` : '';
        const key = `${item.menu_name_snapshot} ${opts}`.trim();

        counts[key] = (counts[key] || 0) + item.quantity;

        // 해당 메뉴가 포함된 가장 오래된 주문 시간 기록
        if (!oldestTime[key] || orderTime < oldestTime[key]) {
          oldestTime[key] = orderTime;
        }
      });
    });

    // 가장 먼저 주문이 들어온(대기 시간이 가장 긴) 메뉴부터 우선적으로 표시
    return Object.entries(counts).sort((a, b) => oldestTime[a[0]] - oldestTime[b[0]]);
  }, [orders]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Coffee size={20} />
            </div>
            <div>
              <h2 className="text-xl font-black text-gray-900 tracking-tight"> 요약</h2>
              <p className="text-[12px] font-bold text-gray-500 tracking-tight">제조 중(PREPARING)인 모든 메뉴 합산</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-full transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-white">
          {summary.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-gray-300">
              <Coffee size={40} strokeWidth={1.5} className="mb-3 opacity-30" />
              <p className="text-[14px] font-bold">현재 제조 중인 메뉴가 없습니다.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {summary.map(([name, count]) => {
                // 옵션 텍스트가 포함된 경우 스타일 분리
                const hasOpts = name.includes('(');
                const baseName = hasOpts ? name.split('(')[0].trim() : name;
                const optsText = hasOpts ? '(' + name.split('(')[1] : '';

                return (
                  <div key={name} className="flex items-center justify-between p-4 rounded-2xl border border-gray-100 bg-gray-50/50">
                    <div className="flex items-center gap-2 flex-1">
                      <span className="font-black text-[16px] text-gray-900">{baseName}</span>
                      {optsText && (
                        <span className={`text-[12px] font-bold px-2 py-0.5 rounded ${
                          optsText.includes('ICE') ? 'text-blue-600 bg-blue-50' : 
                          optsText.includes('HOT') ? 'text-red-600 bg-red-50' : 
                          'text-gray-600 bg-gray-100'
                        }`}>
                          {optsText}
                        </span>
                      )}
                    </div>
                    <span className="bg-[#1A0A0A] text-white text-[16px] font-black px-3.5 py-1.5 rounded-xl min-w-[3rem] text-center shadow-md">
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 하단 닫기 버튼 */}
        <div className="p-4 border-t border-gray-100 bg-gray-50">
          <button onClick={onClose} className="w-full py-3.5 bg-gray-200 hover:bg-gray-300 text-gray-700 font-black rounded-xl transition-colors">
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
