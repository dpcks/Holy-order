import { useEffect, useState } from 'react';
import { TrendingUp, ShoppingBag, Star, BarChart2, Download } from 'lucide-react';
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

// 시간대별 바 차트 (CSS)
const HourlyChart = ({ data }: { data: Record<string, number> }) => {
  const hours = Array.from({ length: 10 }, (_, i) => i + 9); // 9~18시
  const max = Math.max(...Object.values(data), 1);
  return (
    <div className="flex items-end gap-1 h-24 pt-2">
      {hours.map(h => {
        const count = data[String(h)] || 0;
        const height = (count / max) * 100;
        return (
          <div key={h} className="flex-1 flex flex-col items-center gap-1">
            <div className="w-full flex items-end justify-center" style={{ height: '72px' }}>
              <div
                className="w-full bg-primary/80 rounded-t-sm transition-all duration-700"
                style={{ height: `${height}%`, minHeight: count > 0 ? '4px' : '0' }}
              />
            </div>
            <span className="text-[9px] text-gray-400 font-medium">{h}</span>
          </div>
        );
      })}
    </div>
  );
};

// 직분 그룹 매핑 (간소화)
const groupDuty = (duty_breakdown: Record<string, number>) => {
  const groups: Record<string, number> = { '성도/학생': 0, '직분자': 0, '사역자': 0 };
  for (const [duty, count] of Object.entries(duty_breakdown)) {
    if (['성도', '학생', '청년'].includes(duty)) groups['성도/학생'] += count;
    else if (['집사', '안수집사', '권사', '장로'].includes(duty)) groups['직분자'] += count;
    else groups['사역자'] += count;
  }
  return [
    { label: '성도/학생', value: groups['성도/학생'], color: '#2D1616' },
    { label: '직분자', value: groups['직분자'], color: '#FF4B4B' },
    { label: '사역자', value: groups['사역자'], color: '#94a3b8' },
  ].filter(d => d.value > 0);
};

export const AdminSalesReports = () => {
  const [stats, setStats] = useState<ReportStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'일간' | '주간' | '월간'>('일간');

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await apiClient.get<ReportStats, StandardResponse<ReportStats>>('/admin/stats/today');
        if (res.success) setStats(res.data);
      } catch (err) {
        console.error('통계 조회 실패:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (loading) return <div className="flex h-full items-center justify-center"><div className="animate-spin h-8 w-8 rounded-full border-b-2 border-primary" /></div>;
  if (!stats) return <div className="flex h-full items-center justify-center text-gray-400">통계를 불러올 수 없습니다.</div>;

  const bankTransferTotal = Math.round(stats.total_sales * 0.7);
  const kakaoTotal = stats.total_sales - bankTransferTotal;
  const dutyData = groupDuty(stats.duty_breakdown);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* 헤더 */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-start justify-between shrink-0">
        <div>
          <p className="text-[11px] font-semibold text-primary tracking-widest uppercase mb-1">Reporting Center</p>
          <h1 className="text-2xl font-bold text-gray-900">정산 및 매출 통계</h1>
        </div>
        <div className="flex gap-1.5 bg-gray-100 p-1 rounded-xl">
          {(['일간', '주간', '월간'] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-[13px] font-semibold rounded-lg transition-all ${period === p ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
              {p}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 p-6 grid grid-cols-3 gap-5 auto-rows-min">

        {/* KPI 카드 4개 */}
        <div className="col-span-3 grid grid-cols-4 gap-4">
          {[
            { icon: TrendingUp, label: '총 매출액', value: `₩${stats.total_sales.toLocaleString()}`, sub: '취소 제외', color: 'text-gray-900' },
            { icon: ShoppingBag, label: '총 주문 건수', value: `${stats.total_orders}건`, sub: '오늘 접수 기준', color: 'text-gray-900' },
            { icon: BarChart2, label: '객단가', value: `₩${stats.avg_order_value.toLocaleString()}`, sub: '평균 주문 금액', color: 'text-gray-900' },
            { icon: Star, label: '최고 인기 메뉴', value: stats.top_menu || '-', sub: '오늘 판매 1위', color: 'text-white', bg: 'bg-primary' },
          ].map((card, i) => (
            <div key={i} className={`rounded-2xl p-5 shadow-sm border border-gray-100 ${card.bg || 'bg-white'}`}>
              <div className="flex items-center gap-2 mb-3">
                <card.icon size={16} className={card.bg ? 'text-white/70' : 'text-gray-400'} />
                <span className={`text-[11px] font-semibold ${card.bg ? 'text-white/70' : 'text-gray-400'}`}>{card.label}</span>
              </div>
              <p className={`text-xl font-black mb-0.5 ${card.color}`}>{card.value}</p>
              <p className={`text-[11px] font-medium ${card.bg ? 'text-white/60' : 'text-gray-400'}`}>{card.sub}</p>
            </div>
          ))}
        </div>

        {/* 결제 수단별 통계 */}
        <div className="col-span-1 bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <h2 className="font-bold text-gray-900 text-[14px] mb-4">결제 수단별 통계</h2>
          <div className="flex flex-col gap-4">
            {[
              { label: '계좌이체', amount: bankTransferTotal, total: stats.total_sales, color: 'bg-[#1A0A0A]' },
              { label: '카카오페이', amount: kakaoTotal, total: stats.total_sales, color: 'bg-primary' },
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

        {/* 시간대별 주문 현황 */}
        <div className="col-span-2 bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <h2 className="font-bold text-gray-900 text-[14px] mb-4">시간대별 주문 현황</h2>
          <HourlyChart data={stats.hourly_orders} />
        </div>

        {/* 인기 메뉴 TOP 5 */}
        <div className="col-span-2 bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-900 text-[14px]">인기 메뉴 TOP 5</h2>
          </div>
          {stats.top_menus.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-4">아직 주문 데이터가 없습니다.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {stats.top_menus.map((menu, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg overflow-hidden bg-gray-100 shrink-0">
                    <img src="https://images.unsplash.com/photo-1559525839-b184a4d698c7?w=80&q=80" alt="" className="w-full h-full object-cover opacity-80" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-gray-900 truncate">{menu.name}</p>
                    <p className="text-[11px] text-gray-400">누적 {menu.count}건</p>
                  </div>
                  <span className="text-[13px] font-bold text-gray-900">₩{menu.revenue.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 직분별 이용 현황 */}
        <div className="col-span-1 bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <h2 className="font-bold text-gray-900 text-[14px] mb-4">직분별 이용 현황</h2>
          {dutyData.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-4">데이터 없음</p>
          ) : (
            <DonutChart data={dutyData} />
          )}
        </div>

        {/* 하단 버튼 */}
        <div className="col-span-3 flex justify-end gap-3 pb-2">
          <button className="flex items-center gap-2 text-[13px] font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 px-4 py-2.5 rounded-xl transition-colors shadow-sm">
            <Download size={15} />CSV 내보내기
          </button>
          <button className="flex items-center gap-2 text-[13px] font-semibold text-white bg-[#1A0A0A] hover:bg-[#2D1616] px-4 py-2.5 rounded-xl transition-colors shadow-sm">
            <BarChart2 size={15} />일요일 마감 리포트 생성
          </button>
        </div>
      </div>
    </div>
  );
};
