import { useEffect, useState } from 'react';
import { TrendingUp, ShoppingBag, Star, BarChart2, Download, X, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { apiClient } from '../../api/client';
import type { ReportStats, StandardResponse } from '../../types';

// CSS 진행 바 컴포넌트
const ProgressBar = ({ value, max, color = 'bg-[#1A0A0A]' }: { value: number; max: number; color?: string }) => (
  <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
    <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }} />
  </div>
);

// 도넛 차트 (SVG)
const DonutChart = ({ data }: { data: { label: string; value: number; color: string }[] }) => {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <div className="text-center text-gray-400 text-sm py-4">데이터 없음</div>;

  let offset = 0;
  const r = 40;
  const circumference = 2 * Math.PI * r;
  const segments = data.map(d => {
    const pct = d.value / total;
    const seg = { ...d, pct, offset, dash: pct * circumference };
    offset += pct * circumference;
    return seg;
  });

  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 100 100" className="w-24 h-24 -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#f3f4f6" strokeWidth="16" />
        {segments.map((seg, i) => (
          <circle key={i} cx="50" cy="50" r={r} fill="none" stroke={seg.color}
            strokeWidth="16" strokeDasharray={`${seg.dash} ${circumference}`}
            strokeDashoffset={-seg.offset} />
        ))}
        <text x="50" y="50" textAnchor="middle" dominantBaseline="middle" className="rotate-90 origin-center"
          fontSize="12" fontWeight="bold" fill="#1a0a0a"
          transform="rotate(90, 50, 50)">{total}</text>
      </svg>
      <div className="flex flex-col gap-1.5">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center gap-2 text-[12px]">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
            <span className="text-gray-600 font-medium">{seg.label}</span>
            <span className="text-gray-900 font-bold ml-auto pl-3">{Math.round(seg.pct * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// 동적 트렌드 바 차트 (일간, 주간, 월간 지원)
const TrendChart = ({ data, periodType }: { data: Record<string, number>, periodType: '일간' | '주간' | '월간' }) => {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  
  let keys: string[] = [];
  if (periodType === '일간') {
    keys = Array.from({ length: 7 }, (_, i) => String(i + 9));
  } else if (periodType === '주간') {
    keys = Array.from({ length: 5 }, (_, i) => `${i + 1}주차`);
  } else if (periodType === '월간') {
    keys = Array.from({ length: 12 }, (_, i) => `${i + 1}월`);
  }

  const max = Math.max(...Object.values(data), 1);

  return (
    <div className="flex items-end gap-1.5 h-32 pt-10 px-2 relative">
      {keys.map(k => {
        const count = data[k] || 0;
        const height = (count / max) * 100;
        const isSelected = selectedKey === k;
        const displayLabel = periodType === '일간' ? `${k}시` : k;

        return (
          <div key={k} className="flex-1 flex flex-col items-center gap-2 group relative">
            {/* 말풍선 (선택 시 노출) */}
            {(isSelected || (count > 0 && !selectedKey)) && (
              <div className={`absolute -top-10 left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-black text-white text-[10px] font-black rounded-lg shadow-xl z-10 whitespace-nowrap animate-in fade-in slide-in-from-bottom-2 duration-200 ${isSelected ? 'opacity-100 scale-100' : 'opacity-0 group-hover:opacity-100 group-hover:scale-100'}`}>
                {count}건
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-black rotate-45" />
              </div>
            )}

            <div 
              className="w-full flex items-end justify-center cursor-pointer" 
              style={{ height: '80px' }}
              onClick={() => setSelectedKey(isSelected ? null : k)}
            >
              <div
                className={`w-full rounded-t-md transition-all duration-300 ${isSelected ? 'bg-primary shadow-[0_0_15px_rgba(255,75,75,0.4)]' : 'bg-primary/30 group-hover:bg-primary/50'}`}
                style={{ height: `${height}%`, minHeight: count > 0 ? '6px' : '2px' }}
              />
            </div>
            <span className={`text-[10px] font-bold transition-colors ${isSelected ? 'text-primary' : 'text-gray-400'}`}>
              {displayLabel}
            </span>
          </div>
        );
      })}
    </div>
  );
};

// 직분별 고정 색상 맵
const DUTY_COLORS: Record<string, string> = {
  '목사': '#1A0A0A',
  '부목사': '#2D1616',
  '강도사': '#451A1A',
  '전도사': '#5C2424',
  '사모': '#753131',
  '장로': '#FF4B4B',
  '권사': '#FF6B6B',
  '안수집사': '#FF8B8B',
  '집사': '#FFAAAA',
  '청년': '#3B82F6',
  '학생': '#60A5FA',
  '성도': '#94A3B8'
};

const groupDuty = (duty_breakdown: Record<string, number>) => {
  return Object.entries(duty_breakdown)
    .map(([label, value]) => ({
      label,
      value,
      color: DUTY_COLORS[label] || '#CBD5E1'
    }))
    .filter(d => d.value > 0)
    .sort((a, b) => b.value - a.value);
};

export const AdminSalesReports = () => {
  const [stats, setStats] = useState<ReportStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'일간' | '주간' | '월간'>('일간');
  const [selectedDate, setSelectedDate] = useState(() => {
    // 기본값: 현재 로컬 시간 기준 YYYY-MM-DD
    const today = new Date();
    const offset = today.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(today.getTime() - offset)).toISOString().split('T')[0];
    return localISOTime;
  });
  const [isMenuModalOpen, setIsMenuModalOpen] = useState(false);

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      try {
        const typeMap = { '일간': 'daily', '주간': 'weekly', '월간': 'monthly' };
        const res = await apiClient.get<ReportStats, StandardResponse<ReportStats>>(`/admin/stats?type=${typeMap[period]}&date=${selectedDate}`);
        if (res.success) setStats(res.data);
      } catch (err) {
        console.error('통계 조회 실패:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [period, selectedDate]);

  const bankTransferTotal = stats?.payment_method_sales?.BANK_TRANSFER || 0;
  const cashTotal = stats?.payment_method_sales?.CASH || 0;
  const dutyData = stats ? groupDuty(stats.duty_breakdown) : [];

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* 헤더 */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-start justify-between shrink-0">
        <div>
          <p className="text-[11px] font-semibold text-primary tracking-widest uppercase mb-1">Reporting Center</p>
          <h1 className="text-2xl font-bold text-gray-900">정산 및 매출 통계</h1>
        </div>
        <div className="flex flex-col gap-2 items-end">
          <div className="flex gap-1.5 bg-gray-100 p-1 rounded-xl">
            {(['일간', '주간', '월간'] as const).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-[13px] font-semibold rounded-lg transition-all ${period === p ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                {p}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 bg-gray-50 px-2.5 py-1.5 rounded-lg border border-gray-200">
            <CalendarIcon size={14} className="text-gray-500" />
            {period === '일간' ? (
              <input 
                type="date" 
                value={selectedDate} 
                onChange={(e) => setSelectedDate(e.target.value)} 
                className="bg-transparent border-none text-[13px] font-semibold text-gray-700 outline-none p-0 cursor-pointer"
              />
            ) : (
              <input 
                type="month" 
                value={selectedDate.substring(0, 7)} 
                onChange={(e) => setSelectedDate(`${e.target.value}-01`)} 
                className="bg-transparent border-none text-[13px] font-semibold text-gray-700 outline-none p-0 cursor-pointer"
              />
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 p-6 grid grid-cols-3 gap-5 auto-rows-min relative min-h-[500px]">
        {loading && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-10 flex items-center justify-center rounded-xl">
            <div className="animate-spin h-8 w-8 rounded-full border-b-2 border-primary" />
          </div>
        )}
        
        {!stats && !loading ? (
          <div className="col-span-3 flex items-center justify-center text-gray-400 py-20">통계를 불러올 수 없습니다.</div>
        ) : stats ? (
          <>
            {/* KPI 카드 4개 */}
            <div className="col-span-3 grid grid-cols-4 gap-4">
              {[
                { icon: TrendingUp, label: '총 매출액', value: `₩${stats.total_sales.toLocaleString()}`, sub: '취소 제외', color: 'text-gray-900' },
                { icon: ShoppingBag, label: '총 주문 건수', value: `${stats.total_orders}건`, sub: '기준 기간 내 접수', color: 'text-gray-900' },
                { icon: BarChart2, label: '객단가', value: `₩${stats.avg_order_value.toLocaleString()}`, sub: '평균 주문 금액', color: 'text-gray-900' },
                { icon: Star, label: '최고 인기 메뉴', value: stats.top_menus?.[0]?.name || '-', sub: '해당 기간 1위', color: 'text-white', bg: 'bg-primary' },
              ].map((card, i) => (
                <div 
                  key={i} 
                  onClick={card.label === '최고 인기 메뉴' ? () => setIsMenuModalOpen(true) : undefined}
                  className={`rounded-2xl p-5 shadow-sm border border-gray-100 transition-all duration-200 ${card.bg || 'bg-white'} ${card.label === '최고 인기 메뉴' ? 'cursor-pointer hover:scale-[1.02] hover:shadow-md' : ''}`}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <card.icon size={16} className={card.bg ? 'text-white/70' : 'text-gray-400'} />
                    <span className={`text-[11px] font-semibold ${card.bg ? 'text-white/70' : 'text-gray-400'}`}>{card.label}</span>
                  </div>
                  <div className="flex items-end justify-between gap-2">
                    <div>
                      <p className={`text-xl font-black mb-0.5 ${card.color}`}>{card.value}</p>
                      <p className={`text-[11px] font-medium ${card.bg ? 'text-white/60' : 'text-gray-400'}`}>{card.sub}</p>
                    </div>
                    {card.label === '최고 인기 메뉴' && <ChevronRight size={20} className="text-white/50 mb-1" />}
                  </div>
                </div>
              ))}
            </div>

            {/* 결제 수단별 통계 */}
            <div className="col-span-1 bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <h2 className="font-bold text-gray-900 text-[14px] mb-4">결제 수단별 통계</h2>
              <div className="flex flex-col gap-4">
                {[
                  { label: '계좌이체', amount: bankTransferTotal, total: stats.total_sales, color: 'bg-[#1A0A0A]' },
                  { label: '현금', amount: cashTotal, total: stats.total_sales, color: 'bg-orange-500' },
                ].map((item, i) => {
                  const pct = stats.total_sales > 0 ? Math.round((item.amount / stats.total_sales) * 100) : 0;
                  return (
                    <div key={i}>
                      <div className="flex justify-between mb-1.5">
                        <span className="text-[13px] font-semibold text-gray-700">{item.label}</span>
                        <span className="text-[13px] font-bold text-gray-900">{pct}% (₩{item.amount.toLocaleString()})</span>
                      </div>
                      <ProgressBar value={item.amount} max={stats.total_sales} color={item.color} />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 트렌드 현황 */}
            <div className="col-span-2 bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <h2 className="font-bold text-gray-900 text-[14px] mb-4">
                {period === '일간' ? '시간대별 주문 현황' : period === '주간' ? '주차별 주문 추이' : '월별 주문 추이'}
              </h2>
              <TrendChart data={stats.trend_data || {}} periodType={period} />
            </div>

            {/* 인기 메뉴 TOP 5 */}
            <div className="col-span-2 bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-gray-900 text-[14px]">인기 메뉴 TOP 5</h2>
                <button 
                  onClick={() => setIsMenuModalOpen(true)}
                  className="text-[11px] font-bold text-primary hover:underline flex items-center gap-0.5"
                >
                  전체보기 <ChevronRight size={12} />
                </button>
              </div>
              {stats.top_menus.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-4">아직 주문 데이터가 없습니다.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {stats.top_menus.slice(0, 5).map((menu, i) => (
                    <div key={i} className="flex items-center gap-3 group">
                      <div className="w-8 h-8 rounded-lg overflow-hidden bg-gray-50 shrink-0 flex items-center justify-center text-[11px] font-black text-gray-400 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-bold text-gray-900 truncate">{menu.name}</p>
                        <p className="text-[11px] text-gray-400">판매 {menu.count}건</p>
                      </div>
                      <span className="text-[13px] font-black text-gray-900">₩{menu.revenue.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 메뉴별 상세 통계 모달 */}
            {isMenuModalOpen && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsMenuModalOpen(false)} />
                <div className="relative bg-white w-full max-w-lg rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in duration-300">
                  <div className="p-8 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                    <div>
                      <h3 className="text-2xl font-black text-gray-900 tracking-tight">메뉴별 통계 순위</h3>
                      <p className="text-[13px] text-gray-500 font-bold mt-1 uppercase tracking-wider">Menu Performance</p>
                    </div>
                    <button 
                      onClick={() => setIsMenuModalOpen(false)}
                      className="p-3 hover:bg-gray-200 rounded-full transition-colors text-gray-400 hover:text-gray-600"
                    >
                      <X size={28} />
                    </button>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                    <table className="w-full">
                      <thead className="sticky top-0 bg-white z-10">
                        <tr className="text-left border-b-2 border-gray-100">
                          <th className="pb-4 text-[12px] font-black text-gray-400 uppercase tracking-widest">순위</th>
                          <th className="pb-4 text-[12px] font-black text-gray-400 uppercase tracking-widest">메뉴명</th>
                          <th className="pb-4 text-[12px] font-black text-gray-400 uppercase tracking-widest text-right">수량</th>
                          <th className="pb-4 text-[12px] font-black text-gray-400 uppercase tracking-widest text-right">매출액</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {stats.top_menus.map((m, i) => (
                          <tr key={i} className="group hover:bg-gray-50 transition-all">
                            <td className="py-5">
                              <span className={`w-6 h-6 flex items-center justify-center rounded-md text-[11px] font-black ${i < 3 ? 'bg-black text-white' : 'text-gray-400'}`}>
                                {i + 1}
                              </span>
                            </td>
                            <td className="py-5">
                              <p className="text-[15px] font-black text-gray-900">{m.name}</p>
                            </td>
                            <td className="py-5 text-right">
                              <span className="px-2.5 py-1 bg-primary/5 text-primary rounded-lg text-[13px] font-black">
                                {m.count.toLocaleString()}건
                              </span>
                            </td>
                            <td className="py-5 text-right text-[15px] font-bold text-gray-900">
                              ₩{m.revenue.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  <div className="p-8 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
                    <div>
                      <p className="text-[12px] text-gray-400 font-bold uppercase tracking-tight">Total Variety</p>
                      <p className="text-[15px] font-black text-gray-900">총 {stats.top_menus.length}종 메뉴 판매됨</p>
                    </div>
                    <button 
                      onClick={() => setIsMenuModalOpen(false)}
                      className="px-8 py-3 bg-black text-white rounded-2xl text-[14px] font-black hover:bg-gray-800 transition-all active:scale-95 shadow-lg shadow-black/10"
                    >
                      확인
                    </button>
                  </div>
                </div>
              </div>
            )}
            
            {/* 직분별 이용 현황 */}
            <div className="col-span-1 bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <h2 className="font-bold text-gray-900 text-[14px] mb-4">직분별 이용 현황</h2>
              {dutyData.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-4">데이터 없음</p>
              ) : (
                <DonutChart data={dutyData} />
              )}
            </div>
          </>
        ) : null}

        {/* 하단 버튼 */}
        <div className="col-span-3 flex justify-end gap-3 pb-2 mt-4">
          <button className="flex items-center gap-2 text-[13px] font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 px-4 py-2.5 rounded-xl transition-colors shadow-sm">
            <Download size={15} />CSV 내보내기
          </button>
          <button className="flex items-center gap-2 text-[13px] font-semibold text-white bg-[#1A0A0A] hover:bg-[#2D1616] px-4 py-2.5 rounded-xl transition-colors shadow-sm">
            <BarChart2 size={15} />마감 리포트 생성
          </button>
        </div>
      </div>
    </div>
  );
};
