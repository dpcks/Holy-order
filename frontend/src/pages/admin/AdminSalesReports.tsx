/**
 * [File Role]
 * 역할: 관리자용 매출 통계 및 정산 리포트 페이지 (차트, 인기 메뉴, 마감 리포트 생성 기능 포함)
 * 위치: frontend/src/pages/admin/AdminSalesReports.tsx
 */
import { useState, useEffect, useRef } from 'react';
import { toPng } from 'html-to-image';
import { TrendingUp, ShoppingBag, Star, BarChart2, Download, X, ChevronRight, Calendar as CalendarIcon, Smartphone, HelpCircle } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { QK, QK_DOMAIN } from '../../api/queryKeys';
import { getWsUrl } from '../../utils/url';
import { Skeleton } from '../../components/ui/Skeleton';
import type { ReportStats, StandardResponse, PwaStatsResponse, PwaInstallationListResponse } from '../../types';

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

// 스켈레톤 컴포넌트들
const KpiCardSkeleton = () => (
  <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-3">
    <div className="flex items-center gap-2"><Skeleton className="h-4 w-4" /><Skeleton className="h-4 w-20" /></div>
    <div className="space-y-1"><Skeleton className="h-7 w-24" /><Skeleton className="h-3 w-16" /></div>
  </div>
);

const ChartSkeleton = () => (
  <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 h-full flex flex-col space-y-4">
    <Skeleton className="h-5 w-32" />
    <Skeleton className="flex-1 w-full" />
  </div>
);
const TrendChart = ({ data, periodType }: { data: Record<string, { count: number, revenue: number }>, periodType: '주일' | '주차별' | '월별' }) => {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  let keys: string[] = [];
  if (periodType === '주일') {
    keys = Array.from({ length: 7 }, (_, i) => String(i + 9));
  } else if (periodType === '주차별') {
    keys = Array.from({ length: 5 }, (_, i) => `${i + 1}주차`);
  } else if (periodType === '월별') {
    keys = Array.from({ length: 12 }, (_, i) => `${i + 1}월`);
  }

  const counts = Object.values(data).map(d => d?.count || 0);
  const max = Math.max(...counts, 1);

  return (
    <div className="flex items-end gap-1.5 h-32 pt-10 px-2 relative">
      {keys.map(k => {
        const count = data[k]?.count || 0;
        const revenue = data[k]?.revenue || 0;
        const height = (count / max) * 100;
        const isSelected = selectedKey === k;
        const displayLabel = periodType === '주일' ? `${k}시` : k;

        return (
          <div key={k} className="flex-1 flex flex-col items-center gap-2 group relative">
            {/* 말풍선 (선택 시 노출) */}
            {(isSelected || (count > 0 && !selectedKey)) && (
              <div className={`absolute -top-12 left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-black text-white text-[11px] rounded-lg shadow-xl z-10 whitespace-nowrap animate-in fade-in slide-in-from-bottom-2 duration-200 flex flex-col items-center gap-0.5 ${isSelected ? 'opacity-100 scale-100' : 'opacity-0 group-hover:opacity-100 group-hover:scale-100'}`}>
                <span className="font-black leading-none">{count}건</span>
                <span className="text-[9px] text-white/70 font-bold leading-none">{revenue.toLocaleString()}원</span>
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
  '부목사': '#23734A',
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
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<'주일' | '주차별' | '월별'>(() => (sessionStorage.getItem('adminSalesPeriod') as any) || '주일');
  const [selectedDate, setSelectedDate] = useState(() => {
    const saved = sessionStorage.getItem('adminSalesDate');
    if (saved) return saved;
    const today = new Date();
    const offset = today.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(today.getTime() - offset)).toISOString().split('T')[0];
    return localISOTime;
  });

  useEffect(() => {
    sessionStorage.setItem('adminSalesPeriod', period);
    sessionStorage.setItem('adminSalesDate', selectedDate);
  }, [period, selectedDate]);
  const [isMenuModalOpen, setIsMenuModalOpen] = useState(false);
  const [isTopCustomersModalOpen, setIsTopCustomersModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportActualCash, setReportActualCash] = useState('');
  const [reportMemo, setReportMemo] = useState('');
  const reportRef = useRef<HTMLDivElement>(null);

  // [WebSocket] 주문 발생 시 통계 실시간 갱신
  useEffect(() => {
    const ws = new WebSocket(getWsUrl());
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'NEW_ORDER' || data.type === 'ORDER_UPDATED') {
        queryClient.invalidateQueries({ queryKey: QK_DOMAIN.stats });
      }
    };
    return () => ws.close();
  }, [queryClient]);

  const handleDownloadReport = async () => {
    if (!reportRef.current) return;
    try {
      const dataUrl = await toPng(reportRef.current, { backgroundColor: '#ffffff', pixelRatio: 2 });
      const link = document.createElement('a');
      link.download = `마감리포트_${selectedDate}.png`;
      link.href = dataUrl;
      link.click();
    } catch (e) {
      console.error('리포트 저장 실패:', e);
      alert('이미지 저장에 실패했습니다.');
    }
  };

  // [React Query] 매운 통계 조회
  // period, selectedDate가 queryKey에 포함되어 필터 변경 시 자동 리페치
  // 한 번 조회한 데이터는 5분간 캐시되어 돌아와도 즉시 표시
  const typeMap = { '주일': 'daily', '주차별': 'weekly', '월별': 'monthly' } as const;
  const { data: stats, isLoading: loading } = useQuery({
    queryKey: QK.stats.sales(typeMap[period], selectedDate),
    queryFn: async () => {
      const res = await apiClient.get<ReportStats, StandardResponse<ReportStats>>(
        `/admin/stats?type=${typeMap[period]}&date=${selectedDate}`
      );
      return res.success ? res.data : null;
    },
    staleTime: 1000 * 60, // 매출 통계는 1분 캐시 (3시간대보다 자주 바뀌므로 짧게 설정)
  });

  const [activeTab, setActiveTab] = useState<'SALES' | 'PWA'>('SALES');

  const { data: pwaStats } = useQuery({
    queryKey: QK.pwaInstallations.stats(30),
    queryFn: async () => {
      const res = await apiClient.get<StandardResponse<PwaStatsResponse>, StandardResponse<PwaStatsResponse>>(
        '/admin/pwa/installations/stats'
      );
      return res.success ? res.data : null;
    },
    staleTime: 1000 * 15,
    refetchInterval: activeTab === 'PWA' ? 30_000 : false,
  });

  const { data: pwaInstallationsData } = useQuery({
    queryKey: QK.pwaInstallations.list(),
    queryFn: async () => {
      const res = await apiClient.get<StandardResponse<PwaInstallationListResponse>, StandardResponse<PwaInstallationListResponse>>(
        '/admin/pwa/installations'
      );
      return res.success ? res.data : null;
    },
    enabled: activeTab === 'PWA',
    staleTime: 1000 * 15,
    refetchInterval: activeTab === 'PWA' ? 30_000 : false,
  });

  const bankTransferTotal = stats?.payment_method_sales?.BANK_TRANSFER || 0;
  const tossTotal = stats?.payment_method_sales?.TOSS || 0;
  const cashTotal = stats?.payment_method_sales?.CASH || 0;
  // 섬김(이벤트) = FREE(사역자) + VOLUNTEER(식당봉사) 주문의 original_price 합산
  const eventServiceTotal = (stats?.payment_method_sales?.FREE || 0) + (stats?.payment_method_sales?.VOLUNTEER || 0);
  const dutyData = stats ? groupDuty(stats.duty_breakdown) : [];

  return (
    <div className="flex flex-col h-full min-h-0 overflow-y-auto">
      {/* 헤더 */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-start justify-between shrink-0">
        <div>
          <p className="text-[11px] font-semibold text-primary tracking-widest uppercase mb-1">Reporting Center</p>
          <h1 className="text-2xl font-bold text-gray-900">정산 및 매출 통계</h1>
        </div>

        {activeTab === 'SALES' ? (
          <div className="flex flex-col gap-2.5 items-end">
            <div className="flex gap-1.5 bg-gray-100 p-1 rounded-xl">
              {(['주일', '주차별', '월별'] as const).map(p => (
                <button key={p} onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 text-[13px] font-semibold rounded-lg transition-all ${period === p ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                  {p}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              {/* 상단 버튼 그룹 */}
              <div className="flex gap-1.5 mr-1">
                {period !== '주일' && (
                  <button
                    onClick={() => setIsTopCustomersModalOpen(true)}
                    className="flex items-center gap-1.5 text-[12px] font-bold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors shadow-sm"
                  >
                    🏆 단골 성도
                  </button>
                )}
                <button
                  onClick={() => setIsReportModalOpen(true)}
                  className="flex items-center gap-1.5 text-[12px] font-bold text-white bg-[#1A0A0A] hover:bg-[#23734A] px-3 py-1.5 rounded-lg transition-colors shadow-sm"
                >
                  <BarChart2 size={14} />마감 리포트
                </button>
              </div>

              <div className="flex items-center gap-2 bg-gray-50 px-2.5 py-1.5 rounded-lg border border-gray-200">
                <CalendarIcon size={14} className="text-gray-500" />
                {period === '주일' ? (
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
          </div>
        ) : (
          <div className="flex items-center gap-2 mt-2">
            <span className="text-[12px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-3.5 py-1.5 rounded-full flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              실시간 익명 기기 감지 중
            </span>
          </div>
        )}
      </header>

      {/* 탭 네비게이션 바 */}
      <div className="bg-white border-b border-gray-200 px-6 flex gap-6 shrink-0">
        <button
          onClick={() => setActiveTab('SALES')}
          className={`py-3 text-[14px] font-bold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'SALES'
              ? 'border-primary text-primary'
              : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          <BarChart2 size={16} />
          매출 및 정산 리포트
        </button>

        <button
          onClick={() => setActiveTab('PWA')}
          className={`py-3 text-[14px] font-bold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'PWA'
              ? 'border-primary text-primary'
              : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          <Smartphone size={16} />
          PWA 설치 및 활성 기기 현황
          {pwaStats && (
            <span className={`px-2 py-0.5 text-[11px] font-extrabold rounded-full transition-colors ${
              activeTab === 'PWA' ? 'bg-primary/10 text-primary' : 'bg-gray-100 text-gray-600'
            }`}>
              {pwaStats.detected_total}대
            </span>
          )}
        </button>
      </div>

      <div className="flex-1 p-6 grid grid-cols-3 gap-5 auto-rows-min relative min-h-[500px]">
        {activeTab === 'PWA' ? (
          <div className="col-span-3 space-y-6">
            {/* PWA 설치 감지 및 활성 기기 현황 (Analytics) */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                    <Smartphone size={20} />
                  </div>
                  <div>
                    <h2 className="font-bold text-gray-900 text-[15px] tracking-tight">PWA 설치 감지 및 활성 기기 현황</h2>
                    <p className="text-[11px] text-gray-400 font-medium">PWA Device Installation & Activity Analytics</p>
                  </div>
                </div>
                <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-3 py-1 rounded-full flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  30초 자동 갱신
                </span>
              </div>

              {/* 통계 요약 카드 4개 */}
              <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="bg-gray-50/80 rounded-xl p-4 border border-gray-100">
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">누적 설치 감지 인스턴스</p>
                  <p className="text-2xl font-black text-gray-900">{pwaStats ? pwaStats.detected_total.toLocaleString() : 0}<span className="text-[12px] text-gray-400 font-normal ml-1">개</span></p>
                  <p className="text-[10px] text-gray-400 font-medium mt-1">설치 증거(standalone 등) 확인 건수</p>
                </div>
                <div className="bg-gray-50/80 rounded-xl p-4 border border-gray-100">
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">최근 7일 활성 PWA</p>
                  <p className="text-2xl font-black text-emerald-600">{pwaStats ? pwaStats.active_7d.toLocaleString() : 0}<span className="text-[12px] text-gray-400 font-normal ml-1">개</span></p>
                  <p className="text-[10px] text-gray-400 font-medium mt-1">7일 이내 standalone 실행 기록</p>
                </div>
                <div className="bg-gray-50/80 rounded-xl p-4 border border-gray-100">
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">최근 30일 활성 PWA</p>
                  <p className="text-2xl font-black text-blue-600">{pwaStats ? pwaStats.active_30d.toLocaleString() : 0}<span className="text-[12px] text-gray-400 font-normal ml-1">개</span></p>
                  <p className="text-[10px] text-gray-400 font-medium mt-1">30일 이내 standalone 실행 기록</p>
                </div>
                <div className="bg-gray-50/80 rounded-xl p-4 border border-gray-100">
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">미사용 인스턴스 (90일 이상)</p>
                  <p className="text-2xl font-black text-gray-400">{pwaStats ? pwaStats.stale_90d.toLocaleString() : 0}<span className="text-[12px] text-gray-400 font-normal ml-1">개</span></p>
                  <p className="text-[10px] text-gray-400 font-medium mt-1">앱 삭제 추정 또는 오랜 미접속</p>
                </div>
              </div>

              {/* 상세 정보 2열 */}
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100">
                {/* 왼쪽: 앱 유형 & 플랫폼 분포 */}
                <div className="space-y-4">
                  <div>
                    <h3 className="text-[12px] font-bold text-gray-700 mb-2 uppercase tracking-wider">앱 유형별 감지 인스턴스</h3>
                    <div className="flex items-center gap-4 bg-gray-50 p-3 rounded-xl border border-gray-100">
                      <div className="flex-1 flex justify-between items-center">
                        <span className="text-[13px] font-bold text-gray-700">📱 사용자 주문 PWA</span>
                        <span className="text-[14px] font-black text-gray-900">{pwaStats?.by_app_type?.USER ?? 0}개</span>
                      </div>
                      <div className="w-[1px] h-6 bg-gray-200" />
                      <div className="flex-1 flex justify-between items-center">
                        <span className="text-[13px] font-bold text-gray-700">🛠️ 관리자 전용 PWA</span>
                        <span className="text-[14px] font-black text-gray-900">{pwaStats?.by_app_type?.ADMIN ?? 0}개</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-[12px] font-bold text-gray-700 mb-2 uppercase tracking-wider">플랫폼별 감지 분포</h3>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-100 text-center">
                        <p className="text-[11px] font-semibold text-gray-500">iOS (iPhone)</p>
                        <p className="text-[15px] font-black text-gray-900">{pwaStats?.by_platform?.IOS ?? 0}개</p>
                      </div>
                      <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-100 text-center">
                        <p className="text-[11px] font-semibold text-gray-500">Android</p>
                        <p className="text-[15px] font-black text-gray-900">{pwaStats?.by_platform?.ANDROID ?? 0}개</p>
                      </div>
                      <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-100 text-center">
                        <p className="text-[11px] font-semibold text-gray-500">Desktop / 기타</p>
                        <p className="text-[15px] font-black text-gray-900">{(pwaStats?.by_platform?.DESKTOP ?? 0) + (pwaStats?.by_platform?.UNKNOWN ?? 0)}개</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 오른쪽: 고유 유저/관리자 지표 & 주문 연동 & 안내 문구 */}
                <div className="space-y-4">
                  <div>
                    <h3 className="text-[12px] font-bold text-gray-700 mb-2 uppercase tracking-wider">최근 30일 PWA 연동 지표</h3>
                    <div className="grid grid-cols-2 gap-2 bg-gray-50 p-3 rounded-xl border border-gray-100">
                      <div className="flex justify-between items-center pr-2 border-r border-gray-200">
                        <span className="text-[12px] font-bold text-gray-700">PWA 실시간 주문</span>
                        <span className="text-[13px] font-black text-primary">{pwaStats?.pwa_orders_30d ?? 0}건</span>
                      </div>
                      <div className="flex justify-between items-center pl-2">
                        <span className="text-[12px] font-bold text-gray-700">주문 생성 인스턴스</span>
                        <span className="text-[13px] font-black text-primary">{pwaStats?.unique_ordering_installations_30d ?? 0}개</span>
                      </div>
                      <div className="flex justify-between items-center pr-2 border-r border-gray-200 pt-2 border-t border-gray-200">
                        <span className="text-[12px] font-bold text-gray-700">확인된 고유 사용자</span>
                        <span className="text-[13px] font-black text-emerald-700">{pwaStats?.confirmed_unique_users_30d ?? 0}명</span>
                      </div>
                      <div className="flex justify-between items-center pl-2 pt-2 border-t border-gray-200">
                        <span className="text-[12px] font-bold text-gray-700">확인된 고유 관리자</span>
                        <span className="text-[13px] font-black text-purple-700">{pwaStats?.confirmed_unique_admins_30d ?? 0}명</span>
                      </div>
                    </div>
                  </div>

                  {/* 수집 정책 및 한계 안내 박스 */}
                  <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-3.5 flex gap-2.5">
                    <HelpCircle size={16} className="text-blue-500 shrink-0 mt-0.5" />
                    <div className="text-[11px] text-blue-900/80 leading-relaxed font-medium space-y-1">
                      <p className="font-bold text-blue-900">💡 PWA 설치 및 기기 추적 안내</p>
                      <ul className="list-disc pl-3.5 space-y-0.5">
                        <li><strong>설치 감지 인스턴스</strong>: 브라우저 저장소 ID 기준입니다. 앱 삭제나 사이트 데이터 초기화 후 재설치하면 새 인스턴스로 기록될 수 있습니다.</li>
                        <li><strong>일반 QR 웹 방문</strong>: 일반 브라우저 QR 접속은 설치 수에 포함되지 않고 자동 제외됩니다.</li>
                        <li><strong>고유 사용자·관리자</strong>: 주문 사용자 ID와 로그인 관리자 계정 기준으로 별도 집계하여 재설치 중복 영향을 최소화합니다.</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 등록된 감지 기기 목록 테이블 */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-gray-900">등록된 PWA 설치 기기 목록</h3>
                <span className="text-[12px] font-semibold text-gray-500">
                  총 {pwaInstallationsData?.total_count ?? 0}개 등록됨
                </span>
              </div>

              {!pwaInstallationsData || pwaInstallationsData.items.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-8">아직 등록된 PWA 설치 기기가 없습니다.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-gray-100 text-[12px] font-bold text-gray-400 uppercase tracking-wider">
                        <th className="pb-3 pl-2">익명 기기 ID</th>
                        <th className="pb-3">앱 유형</th>
                        <th className="pb-3">플랫폼</th>
                        <th className="pb-3">푸시 권한</th>
                        <th className="pb-3">최초 감지시각</th>
                        <th className="pb-3">최근 활성시각</th>
                        <th className="pb-3 pr-2 text-right">상태</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 text-[13px]">
                      {pwaInstallationsData.items.map((item, idx) => (
                        <tr key={item.id ?? idx} className="hover:bg-gray-50/50 transition-colors">
                          <td className="py-3 pl-2 font-mono font-bold text-gray-800">
                            {item.masked_installation_id}
                          </td>
                          <td className="py-3 font-semibold">
                            {item.app_type === 'USER' ? (
                              <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[11px] font-bold">사용자</span>
                            ) : (
                              <span className="px-2 py-0.5 rounded bg-purple-50 text-purple-700 text-[11px] font-bold">
                                관리자 {item.admin_name ? `(${item.admin_name})` : ''}
                              </span>
                            )}
                          </td>
                          <td className="py-3 font-medium text-gray-700">{item.platform}</td>
                          <td className="py-3">
                            <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                              item.push_permission === 'GRANTED'
                                ? 'bg-blue-50 text-blue-700'
                                : 'bg-gray-100 text-gray-600'
                            }`}>
                              {item.push_permission}
                            </span>
                          </td>
                          <td className="py-3 text-gray-500 text-[12px]">
                            {item.first_standalone_at ? new Date(item.first_standalone_at).toLocaleString() : (item.first_seen_at ? new Date(item.first_seen_at).toLocaleString() : '-')}
                          </td>
                          <td className="py-3 text-gray-500 text-[12px]">
                            {item.last_standalone_at ? new Date(item.last_standalone_at).toLocaleString() : (item.last_seen_at ? new Date(item.last_seen_at).toLocaleString() : '-')}
                          </td>
                          <td className="py-3 pr-2 text-right">
                            {item.is_active_7d ? (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[11px]">7일내 활성</span>
                            ) : item.is_active_30d ? (
                              <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-bold text-[11px]">30일내 활성</span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium text-[11px]">미사용</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : loading ? (
          <>
            <div className="col-span-3 grid grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => <KpiCardSkeleton key={i} />)}
            </div>
            <div className="col-span-1 h-48"><ChartSkeleton /></div>
            <div className="col-span-2 h-48"><ChartSkeleton /></div>
            <div className="col-span-2 h-64"><ChartSkeleton /></div>
            <div className="col-span-1 h-64"><ChartSkeleton /></div>
          </>
        ) : !stats ? (
          <div className="col-span-3 flex items-center justify-center text-gray-400 py-20">통계를 불러올 수 없습니다.</div>
        ) : stats ? (
          <>
            {/* KPI 카드 4개 */}
            <div className="col-span-3 grid grid-cols-4 gap-4">
              {[
                { icon: TrendingUp, label: '총 매출액', value: `₩${stats.total_sales.toLocaleString()}`, sub: '이벤트 섬김 포함', color: 'text-gray-900' },
                {
                  icon: ShoppingBag,
                  label: '총 주문 건수',
                  value: `${stats.total_orders}건`,
                  sub: stats.total_orders > 0 && stats.order_type_counts
                    ? `앱주문 ${stats.order_type_counts.app || 0}건 • QR주문 ${stats.order_type_counts.qr}건 • 현장주문 ${stats.order_type_counts.direct}건`
                    : '기준 기간 내 접수',
                  color: 'text-gray-900'
                },
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

            <div className="col-span-1 bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <h2 className="font-bold text-gray-900 text-[14px] mb-4">결제 수단별 통계</h2>
              <div className="flex flex-col gap-4">
                {[
                  { label: '계좌이체', amount: bankTransferTotal, color: 'bg-[#1A0A0A]' },
                  { label: '토스송금', amount: tossTotal, color: 'bg-[#0064FF]' },
                  { label: '현금', amount: cashTotal, color: 'bg-orange-500' },
                  { label: '섬김(이벤트)', amount: eventServiceTotal, color: 'bg-emerald-500' },
                ].map((item, i) => {
                  // 게이지 최대값: 현금+계좌+토스+이벤트 전체 합계
                  const grandTotal = bankTransferTotal + tossTotal + cashTotal + eventServiceTotal;
                  const pct = grandTotal > 0 ? Math.round((item.amount / grandTotal) * 100) : 0;
                  return (
                    <div key={i}>
                      <div className="flex justify-between mb-1.5">
                        <span className="text-[13px] font-semibold text-gray-700 flex items-center gap-1.5">
                          {item.label === '섬김(이벤트)' && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-black">♥ 후원</span>}
                          {item.label}
                        </span>
                        <span className="text-[13px] font-bold text-gray-900">{pct}% (₩{item.amount.toLocaleString()})</span>
                      </div>
                      <ProgressBar value={item.amount} max={grandTotal} color={item.color} />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 트렌드 현황 */}
            <div className="col-span-2 bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex flex-col">
              <h2 className="font-bold text-gray-900 text-[14px] mb-4 shrink-0">
                {period === '주일' ? '주일별 시간대 주문 현황' : period === '주차별' ? '주차별 주문 추이' : '월별 주문 추이'}
              </h2>
              <div className="shrink-0 mb-4">
                <TrendChart data={stats.trend_data || {}} periodType={period} />
              </div>

              {/* 상세 요약 그리드 */}
              <div className="mt-auto pt-4 border-t border-gray-100 flex gap-2 overflow-x-auto hide-scrollbar">
                {Object.entries(stats.trend_data || {})
                  .filter(([_, d]) => d.count > 0 || period === '주차별') // 주차별은 비어있어도 구조 파악을 위해 보여줌
                  .map(([k, d]) => (
                    <div key={k} className="bg-gray-50 rounded-xl p-3 border border-gray-100/50 min-w-[80px] shrink-0 flex flex-col items-center text-center">
                      <p className="text-[10px] font-bold text-gray-500 mb-1">{period === '주일' ? `${k}시` : k}</p>
                      <p className="text-[14px] font-black text-gray-900 leading-tight mb-0.5">{d.count}건</p>
                      <p className="text-[10px] font-bold text-primary">₩{d.revenue.toLocaleString()}</p>
                    </div>
                  ))}
              </div>
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
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <p className="text-[11px] text-gray-500 font-medium">총 {menu.count}건</p>
                          {(menu.free_count ?? 0) > 0 && (
                            <span className="text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded-md font-semibold">
                              (무료 {menu.free_count}건 포함)
                            </span>
                          )}
                        </div>
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

                  <div className="flex-1 overflow-y-auto px-8 pb-8 custom-scrollbar">
                    <table className="w-full">
                      <thead className="sticky top-0 z-10">
                        <tr className="text-left border-b-2 border-gray-100 bg-white">
                          <th className="pt-6 pb-4 text-[12px] font-black text-gray-400 uppercase tracking-widest bg-white">순위</th>
                          <th className="pt-6 pb-4 text-[12px] font-black text-gray-400 uppercase tracking-widest bg-white">메뉴명</th>
                          <th className="pt-6 pb-4 text-[12px] font-black text-gray-400 uppercase tracking-widest text-right bg-white">수량</th>
                          <th className="pt-6 pb-4 text-[12px] font-black text-gray-400 uppercase tracking-widest text-right bg-white">매출액</th>
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
                            <td className="py-5 text-right flex flex-col items-end gap-1">
                              <span className="px-2.5 py-1 bg-primary/5 text-primary rounded-lg text-[13px] font-black">
                                총 {m.count.toLocaleString()}건
                              </span>
                              {(m.free_count ?? 0) > 0 && (
                                <span className="text-[11px] font-semibold text-gray-400 mt-1">
                                  사역자/봉사 {m.free_count}건 포함
                                </span>
                              )}
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

            {/* 마감 리포트 생성 모달 */}
            {isReportModalOpen && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsReportModalOpen(false)} />
                <div className="relative bg-white w-full max-w-sm rounded-[24px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-300">
                  <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 shrink-0">
                    <div>
                      <h3 className="text-xl font-black text-gray-900 tracking-tight">마감 리포트</h3>
                      <p className="text-[11px] text-gray-500 font-bold mt-0.5 uppercase tracking-wider">Closing Report</p>
                    </div>
                    <button
                      onClick={() => setIsReportModalOpen(false)}
                      className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-400 hover:text-gray-600"
                    >
                      <X size={24} />
                    </button>
                  </div>

                  {/* 캡처 대상 영역 */}
                  <div className="flex-1 overflow-y-auto custom-scrollbar bg-gray-100 p-5">
                    <div ref={reportRef} className="bg-white p-6 rounded-2xl shadow-sm">
                      <div className="text-center mb-6 pb-4 border-b-2 border-dashed border-gray-200">
                        <h2 className="text-lg font-black text-gray-900 mb-1">Mission-Cafe 마감 보고서</h2>
                        <p className="text-xs font-bold text-gray-500">마감 기준: {selectedDate} ({period})</p>
                      </div>

                      <div className="space-y-5">
                        <div>
                          <p className="text-[11px] font-black text-primary mb-2 tracking-widest uppercase">Overview</p>
                          <div className="flex justify-between items-end mb-1">
                            <span className="text-sm font-bold text-gray-700">총 주문 건수</span>
                            <span className="text-base font-black text-gray-900">{stats.total_orders}건</span>
                          </div>
                          <div className="flex justify-between items-end">
                            <span className="text-sm font-bold text-gray-700">총 매출액</span>
                            <span className="text-xl font-black text-gray-900">₩{stats.total_sales.toLocaleString()}</span>
                          </div>
                        </div>

                        <div className="pt-5 border-t border-gray-100">
                          <p className="text-[11px] font-black text-primary mb-2 tracking-widest uppercase">Payment</p>
                          <div className="flex justify-between mb-1.5">
                            <span className="text-[13px] font-semibold text-gray-600">계좌이체</span>
                            <span className="text-[13px] font-bold text-gray-900">₩{bankTransferTotal.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between mb-1.5">
                            <span className="text-[13px] font-semibold text-gray-600">토스송금</span>
                            <span className="text-[13px] font-bold text-gray-900">₩{tossTotal.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between mb-1.5">
                            <span className="text-[13px] font-semibold text-gray-600">현금 (시스템 상)</span>
                            <span className="text-[13px] font-bold text-gray-900">₩{cashTotal.toLocaleString()}</span>
                          </div>
                          {eventServiceTotal > 0 && (
                            <div className="flex justify-between mb-1.5">
                              <span className="text-[13px] font-semibold text-emerald-700">♥ 섬김(이벤트)</span>
                              <span className="text-[13px] font-bold text-emerald-700">₩{eventServiceTotal.toLocaleString()}</span>
                            </div>
                          )}
                          <div className="flex justify-between items-center bg-gray-50 p-2.5 rounded-lg mt-2 border border-gray-100">
                            <span className="text-[13px] font-bold text-gray-700">실제 현금 보유액</span>
                            <div className="flex items-center gap-1">
                              <span className="text-[13px] font-bold text-gray-900">₩</span>
                              <input
                                type="number"
                                placeholder="0"
                                value={reportActualCash}
                                onChange={e => setReportActualCash(e.target.value)}
                                className="w-20 text-right bg-white border border-gray-200 rounded px-1.5 py-1 text-[13px] font-bold focus:outline-none focus:border-primary placeholder:text-gray-300"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="pt-5 border-t border-gray-100">
                          <p className="text-[11px] font-black text-primary mb-2 tracking-widest uppercase">Top Menus</p>
                          {stats.top_menus.slice(0, 3).map((m, i) => (
                            <div key={i} className="flex justify-between items-center mb-1">
                              <span className="text-[13px] font-semibold text-gray-600 truncate mr-2">{i + 1}. {m.name}</span>
                              <span className="text-[13px] font-bold text-gray-900 shrink-0">{m.count}건</span>
                            </div>
                          ))}
                        </div>

                        <div className="pt-5 border-t border-gray-100">
                          <p className="text-[11px] font-black text-primary mb-2 tracking-widest uppercase">Memo</p>
                          <textarea
                            // placeholder="특이사항을 입력하세요..."
                            value={reportMemo}
                            onChange={e => setReportMemo(e.target.value)}
                            className="w-full bg-gray-50 border border-gray-100 rounded-lg p-3 text-[13px] resize-none focus:outline-none focus:bg-white focus:border-gray-300 transition-colors placeholder:text-gray-400"
                            rows={3}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-5 bg-white border-t border-gray-100 shrink-0">
                    <button
                      onClick={handleDownloadReport}
                      className="w-full py-3.5 bg-[#1A0A0A] text-white rounded-xl text-[14px] font-black hover:bg-[#23734A] transition-all flex items-center justify-center gap-2 shadow-sm"
                    >
                      <Download size={18} /> 이미지로 저장하기
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 단골 성도 랭킹 모달 */}
            {isTopCustomersModalOpen && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsTopCustomersModalOpen(false)} />
                <div className="relative bg-white w-full max-w-2xl rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in duration-300">
                  <div className="p-8 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 shrink-0">
                    <div>
                      <h3 className="text-2xl font-black text-gray-900 tracking-tight">단골 성도 랭킹</h3>
                      <p className="text-[13px] text-gray-500 font-bold mt-1 uppercase tracking-wider">Top Customers</p>
                    </div>
                    <button
                      onClick={() => setIsTopCustomersModalOpen(false)}
                      className="p-3 hover:bg-gray-200 rounded-full transition-colors text-gray-400 hover:text-gray-600"
                    >
                      <X size={28} />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-gray-50/30">
                    <div className="grid grid-cols-2 gap-8">
                      {/* 최다 방문자 */}
                      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col gap-4">
                        <h2 className="font-bold text-gray-900 text-[15px] flex items-center gap-2">
                          🏆 최다 방문자 TOP 3
                        </h2>
                        {(!stats.top_customers_by_count || stats.top_customers_by_count.length === 0) ? (
                          <p className="text-gray-400 text-sm text-center py-4">데이터가 없습니다.</p>
                        ) : (
                          <div className="flex flex-col gap-3">
                            {stats.top_customers_by_count.map((c, i) => (
                              <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100/50 hover:bg-primary/5 transition-colors">
                                <div className="flex items-center gap-3">
                                  <span className={`w-7 h-7 flex items-center justify-center rounded-lg text-[12px] font-black ${i === 0 ? 'bg-amber-100 text-amber-700 shadow-sm' : i === 1 ? 'bg-gray-200 text-gray-700' : 'bg-orange-100 text-orange-700'}`}>
                                    {i + 1}
                                  </span>
                                  <span className="text-[14px] font-bold text-gray-900">{c.name}</span>
                                </div>
                                <span className="text-[14px] font-black text-primary">{c.count}건</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* 최고 큰 손 */}
                      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col gap-4">
                        <h2 className="font-bold text-gray-900 text-[15px] flex items-center gap-2">
                          💎 최고 큰 손 TOP 3
                        </h2>
                        {(!stats.top_customers_by_amount || stats.top_customers_by_amount.length === 0) ? (
                          <p className="text-gray-400 text-sm text-center py-4">데이터가 없습니다.</p>
                        ) : (
                          <div className="flex flex-col gap-3">
                            {stats.top_customers_by_amount.map((c, i) => (
                              <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100/50 hover:bg-emerald-50 transition-colors">
                                <div className="flex items-center gap-3">
                                  <span className={`w-7 h-7 flex items-center justify-center rounded-lg text-[12px] font-black ${i === 0 ? 'bg-amber-100 text-amber-700 shadow-sm' : i === 1 ? 'bg-gray-200 text-gray-700' : 'bg-orange-100 text-orange-700'}`}>
                                    {i + 1}
                                  </span>
                                  <span className="text-[14px] font-bold text-gray-900">{c.name}</span>
                                </div>
                                <span className="text-[14px] font-black text-emerald-600">₩{c.amount.toLocaleString()}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
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

        {/* 하단 여백용 */}
        <div className="col-span-3 h-4" />
      </div>
    </div>
  );
};
