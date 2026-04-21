import { useEffect, useState } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { Menu as MenuIcon, User, CheckCircle2, Coffee, PartyPopper, Copy, Check } from 'lucide-react';
import { apiClient } from '../api/client';
import type { StandardResponse } from '../api/client';

interface Setting {
  bank_name: string | null;
  account_number: string | null;
  account_holder: string | null;
}

export const OrderStatus = () => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const [order, setOrder] = useState<any>(null);
  const [setting, setSetting] = useState<Setting | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const passedOrderNumber = location.state?.orderNumber;
  const passedTotal = location.state?.total;

  useEffect(() => {
    // 주문 정보 + 설정(계좌 정보) 병렬 조회
    const fetchData = async () => {
      try {
        const [orderRes, settingRes] = await Promise.all([
          id ? apiClient.get<any, StandardResponse<any>>(`/orders/status/${id}`) : Promise.resolve(null),
          apiClient.get<any, StandardResponse<Setting>>('/settings'),
        ]);
        if (orderRes?.success) setOrder(orderRes.data);
        if (settingRes?.success) setSetting(settingRes.data);
      } catch (error) {
        console.error('Failed to fetch order status', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  // 계좌번호 복사 핸들러
  const handleCopyAccount = async () => {
    if (!setting?.account_number) return;
    try {
      await navigator.clipboard.writeText(setting.account_number);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000); // 2초 후 원래 아이콘으로 복귀
    } catch {
      alert('계좌번호를 복사해 주세요: ' + setting.account_number);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const orderNumber = order?.order_number || passedOrderNumber || '-';
  const status = order?.status || 'PENDING';
  const totalAmount = passedTotal || order?.total_price || 0;

  const isPending = status === 'PENDING';
  const isPreparing = status === 'PREPARING';
  const isCompleted = status === 'COMPLETED' || status === 'READY';

  return (
    <div className="flex flex-col min-h-screen w-full max-w-[500px] mx-auto bg-[#F9FAFB] pb-8 shadow-2xl relative">
      {/* 커스텀 헤더 */}
      <header className="flex items-center justify-between px-4 h-14 bg-[#F9FAFB]">
        <button className="p-2 -ml-2 text-gray-800">
          <MenuIcon size={24} />
        </button>
        <h1 className="text-lg font-bold tracking-[0.2em] text-[#2D1616]">HOLY ORDER</h1>
        <button className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-white overflow-hidden border border-gray-200 shadow-sm">
          <User size={18} />
        </button>
      </header>

      <main className="flex-1 px-4 py-4 flex flex-col items-center gap-5">

        {/* 주문 번호 카드 */}
        <div className="bg-white w-full rounded-3xl shadow-[0_10px_40px_rgba(0,0,0,0.06)] flex flex-col items-center justify-center py-8 border border-gray-50">
          <p className="text-gray-500 font-medium tracking-[0.2em] mb-1 text-sm">주문 번호</p>
          <h2 className="text-[80px] font-black text-[#2D1616] leading-none tracking-tighter">
            {orderNumber}
          </h2>
        </div>

        {/* ──────────────────────────────────────────────── */}
        {/* 계좌이체 안내 카드 (PENDING 상태일 때만 강조 표시) */}
        {/* ──────────────────────────────────────────────── */}
        {(isPending || !isCompleted) && setting?.account_number && (
          <div className="w-full bg-white rounded-2xl border-2 border-primary/20 shadow-sm overflow-hidden">
            {/* 상단 헤더 바 */}
            <div className="bg-primary/10 px-5 py-3 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="text-primary font-bold text-[13px] tracking-wide">계좌이체 안내</span>
            </div>

            <div className="px-5 py-5 flex flex-col gap-4">
              {/* 입금 금액 (가장 크게 강조) */}
              <div className="text-center">
                <p className="text-[12px] text-gray-500 font-medium mb-1">입금하실 금액</p>
                <p className="text-[42px] font-black text-primary tracking-tight leading-none">
                  {totalAmount.toLocaleString()}
                  <span className="text-[22px] font-bold ml-1">원</span>
                </p>
              </div>

              {/* 구분선 */}
              <div className="border-t border-dashed border-gray-200" />

              {/* 계좌 정보 */}
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <span className="text-[13px] text-gray-500 font-medium">은행</span>
                  <span className="text-[14px] font-bold text-gray-900">{setting.bank_name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[13px] text-gray-500 font-medium">예금주</span>
                  <span className="text-[14px] font-bold text-gray-900">{setting.account_holder}</span>
                </div>

                {/* 계좌번호 + 복사 버튼 */}
                <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3 mt-1">
                  <span className="text-[16px] font-black text-[#2D1616] tracking-wide">
                    {setting.account_number}
                  </span>
                  <button
                    onClick={handleCopyAccount}
                    className={`flex items-center gap-1.5 text-[12px] font-bold px-3 py-1.5 rounded-lg transition-all ${
                      copied
                        ? 'bg-green-100 text-green-600'
                        : 'bg-primary/10 text-primary hover:bg-primary/20'
                    }`}
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? '복사됨!' : '복사'}
                  </button>
                </div>
              </div>

              {/* 안내 문구 */}
              <p className="text-[11px] text-gray-400 text-center leading-relaxed">
                입금 확인 후 제조가 시작됩니다. 입금자명은 자유롭게 입력하셔도 됩니다.
              </p>
            </div>
          </div>
        )}

        {/* 상태 텍스트 */}
        <div className="text-center">
          <h3 className="text-[20px] font-bold text-[#2D1616] mb-2 tracking-tight">
            {isCompleted
              ? '메뉴가 준비되었습니다! 🎉'
              : isPreparing
              ? '맛있게 만들고 있어요! ☕️'
              : '입금을 기다리고 있어요 💳'}
          </h3>
          {isPending && (
            <div className="inline-flex items-center gap-2 bg-gray-200/50 px-4 py-2 rounded-full">
              <div className="w-2 h-2 rounded-full bg-gray-400 animate-pulse" />
              <span className="text-gray-600 font-medium text-sm">입금 확인 후 바로 제조 시작</span>
            </div>
          )}
          {isPreparing && (
            <div className="inline-flex items-center gap-2 bg-gray-200/50 px-4 py-2 rounded-full">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="text-gray-600 font-medium text-sm">잠시만 기다려 주세요</span>
            </div>
          )}
        </div>

        {/* 진행 상태 바 */}
        <div className="w-full max-w-[320px] flex justify-between items-center relative px-2">
          <div className="absolute top-6 left-8 right-8 h-0.5 bg-gray-200 -z-10" />
          <div
            className="absolute top-6 left-8 h-0.5 bg-primary -z-10 transition-all duration-700"
            style={{ width: isCompleted ? 'calc(100% - 4rem)' : isPreparing ? 'calc(50% - 2rem)' : '0%' }}
          />

          {/* Step 1: 주문 완료 */}
          <div className="flex flex-col items-center gap-2">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center z-10 transition-all ${
              isPending || isPreparing || isCompleted
                ? 'bg-[#2D1616] text-white shadow-md'
                : 'bg-gray-100 text-gray-400'
            }`}>
              <CheckCircle2 size={20} />
            </div>
            <span className="text-[11px] font-bold text-[#2D1616]">주문 완료</span>
          </div>

          {/* Step 2: 준비 중 */}
          <div className="flex flex-col items-center gap-2">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center z-10 transition-all ${
              isPreparing
                ? 'bg-primary text-white shadow-[0_0_15px_rgba(255,75,75,0.4)]'
                : isCompleted
                ? 'bg-[#2D1616] text-white shadow-md'
                : 'bg-gray-100 text-gray-400 border border-gray-200'
            }`}>
              <Coffee size={20} />
            </div>
            <span className={`text-[11px] font-bold ${isPreparing ? 'text-primary' : isCompleted ? 'text-[#2D1616]' : 'text-gray-400'}`}>
              준비 중
            </span>
          </div>

          {/* Step 3: 준비 완료 */}
          <div className="flex flex-col items-center gap-2">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center z-10 transition-all ${
              isCompleted
                ? 'bg-primary text-white shadow-[0_0_15px_rgba(255,75,75,0.4)]'
                : 'bg-gray-100 text-gray-400 border border-gray-200'
            }`}>
              <PartyPopper size={20} />
            </div>
            <span className={`text-[11px] font-bold ${isCompleted ? 'text-primary' : 'text-gray-400'}`}>
              준비 완료
            </span>
          </div>
        </div>

        {/* 주문 내역 요약 */}
        <div className="w-full bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <h4 className="font-bold text-gray-900 text-sm tracking-[0.1em] mb-4 pb-4 border-b border-gray-50">
            주문 내역 요약
          </h4>
          <div className="flex gap-4 items-center mb-5">
            <div className="w-16 h-16 rounded-xl overflow-hidden bg-[#1A1818] shrink-0">
              <img
                src="https://images.unsplash.com/photo-1559525839-b184a4d698c7?w=100&q=80"
                alt="coffee"
                className="w-full h-full object-cover opacity-80"
              />
            </div>
            <div>
              <h5 className="font-bold text-[#2D1616] text-[15px] mb-1">
                {order?.menu_name || '주문 메뉴'}
              </h5>
              <p className="text-gray-500 text-[13px] font-medium">
                수량: {order?.quantity || 1}
              </p>
            </div>
          </div>
          <div className="flex justify-between items-center pt-4 border-t border-gray-50">
            <span className="text-gray-500 text-[13px] font-medium">총 결제 금액</span>
            <span className="font-black text-[17px] text-[#2D1616]">
              {totalAmount.toLocaleString()} KRW
            </span>
          </div>
        </div>

        {/* 알림 안내 */}
        <div className="w-full bg-gray-100/80 rounded-2xl p-4 flex gap-4 items-start">
          <div className="bg-white p-2 rounded-xl shadow-sm shrink-0">
            <div className="text-primary animate-pulse">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="14" height="20" x="5" y="2" rx="2" ry="2" />
                <path d="M12 18h.01" />
              </svg>
            </div>
          </div>
          <div>
            <h5 className="font-bold text-gray-900 text-[13px] mb-1">진동 및 사운드 알림</h5>
            <p className="text-gray-500 text-[11px] leading-relaxed">
              음료가 준비되면 진동과 함께 알림을 드립니다.<br />
              원활한 수령을 위해 화면을 끄지 마세요.
            </p>
          </div>
        </div>

      </main>
    </div>
  );
};
