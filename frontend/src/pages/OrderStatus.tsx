import { useEffect, useState, useCallback } from 'react';
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

  // 데이터 가져오기 로직 (Polling을 위해 useCallback으로 감쌈)
  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const [orderRes, settingRes] = await Promise.all([
        id ? apiClient.get<any, StandardResponse<any>>(`/orders/status/${id}`) : Promise.resolve(null),
        apiClient.get<any, StandardResponse<Setting>>('/settings'),
      ]);
      
      if (orderRes?.success) {
        setOrder(orderRes.data);
      }
      if (settingRes?.success) {
        setSetting(settingRes.data);
      }
    } catch (error) {
      console.error('Failed to fetch order status', error);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [id]);

  // 초기 로드 및 Polling 설정
  useEffect(() => {
    fetchData(true); // 최초 1회 로딩 스피너 표시하며 로드

    // 3초마다 상태 체크 (실시간성 확보)
    const pollInterval = setInterval(() => {
      // 이미 완료되었거나 취소된 경우 폴링 중단 고려 가능하지만, 
      // 사용자가 페이지를 보고 있는 동안은 최신 상태 유지를 위해 계속 수행
      fetchData(false); 
    }, 3000);

    return () => clearInterval(pollInterval); // 언마운트 시 정리
  }, [fetchData]);

  // 계좌번호 복사 핸들러
  const handleCopyAccount = async () => {
    if (!setting?.account_number) return;
    try {
      await navigator.clipboard.writeText(setting.account_number);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert('계좌번호를 복사해 주세요: ' + setting.account_number);
    }
  };

  if (loading && !order) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F9FAFB]">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary border-t-transparent" />
          <p className="text-gray-500 font-bold animate-pulse">주문 정보를 불러오고 있습니다...</p>
        </div>
      </div>
    );
  }

  const orderNumber = order?.order_number || passedOrderNumber || '-';
  const status = order?.status || 'PENDING';
  const totalAmount = passedTotal || order?.total_price || 0;

  const isPending = status === 'PENDING';
  const isPreparing = status === 'PREPARING';
  const isReady = status === 'READY';
  const isCompleted = status === 'COMPLETED';

  return (
    <div className="flex flex-col min-h-screen w-full max-w-[500px] mx-auto bg-[#F9FAFB] pb-8 shadow-2xl relative">
      {/* 커스텀 헤더 */}
      <header className="flex items-center justify-between px-4 h-14 bg-[#F9FAFB] sticky top-0 z-20">
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
        <div className="bg-white w-full rounded-3xl shadow-[0_10px_40px_rgba(0,0,0,0.06)] flex flex-col items-center justify-center py-8 border border-gray-50 transition-all duration-500">
          <p className="text-gray-500 font-medium tracking-[0.2em] mb-1 text-sm uppercase">Order Number</p>
          <h2 className="text-[84px] font-black text-[#2D1616] leading-none tracking-tighter">
            {orderNumber}
          </h2>
        </div>

        {/* 계좌이체 안내 카드 (입금 대기 중일 때만 표시) */}
        {isPending && setting?.account_number && (
          <div className="w-full bg-white rounded-2xl border-2 border-primary/20 shadow-sm overflow-hidden animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="bg-primary/10 px-5 py-3 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="text-primary font-bold text-[13px] tracking-wide">입금 대기 중</span>
            </div>

            <div className="px-5 py-5 flex flex-col gap-4">
              <div className="text-center">
                <p className="text-[12px] text-gray-500 font-medium mb-1">입금하실 금액</p>
                <p className="text-[42px] font-black text-primary tracking-tight leading-none">
                  {totalAmount.toLocaleString()}
                  <span className="text-[22px] font-bold ml-1">원</span>
                </p>
              </div>

              <div className="border-t border-dashed border-gray-200" />

              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center text-[14px]">
                  <span className="text-gray-500 font-medium">은행</span>
                  <span className="font-bold text-gray-900">{setting.bank_name}</span>
                </div>
                <div className="flex justify-between items-center text-[14px]">
                  <span className="text-gray-500 font-medium">예금주</span>
                  <span className="font-bold text-gray-900">{setting.account_holder}</span>
                </div>

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
              <p className="text-[11px] text-gray-400 text-center leading-relaxed">
                입금 확인 버튼을 누르지 않아도 관리자가 확인 시 자동으로 변경됩니다.
              </p>
            </div>
          </div>
        )}

        {/* 상태 텍스트 (실시간 업데이트 반영) */}
        <div className="text-center py-2">
          <h3 className="text-[22px] font-black text-[#2D1616] mb-3 tracking-tight transition-all duration-500">
            {isCompleted
              ? '수령이 완료되었습니다! ☺️'
              : isReady
              ? '메뉴가 준비되었습니다! 🎉'
              : isPreparing
              ? '맛있게 만들고 있어요! ☕️'
              : '입금을 기다리고 있어요 💳'}
          </h3>
          <div className="inline-flex items-center gap-2 bg-white border border-gray-100 shadow-sm px-5 py-2.5 rounded-full transition-all">
            <div className={`w-2.5 h-2.5 rounded-full animate-pulse ${
              isReady || isCompleted ? 'bg-green-500' : isPreparing ? 'bg-primary' : 'bg-orange-400'
            }`} />
            <span className="text-gray-700 font-bold text-[14px]">
              {isCompleted ? '이용해 주셔서 감사합니다' : isReady ? '픽업대에서 가져가세요' : isPreparing ? '잠시만 기다려 주세요' : '입금 확인 시 제조 시작'}
            </span>
          </div>
        </div>

        {/* 진행 상태 바 (Visual Stepper) */}
        <div className="w-full max-w-[340px] flex justify-between items-center relative px-2 py-4">
          <div className="absolute top-[34px] left-10 right-10 h-1 bg-gray-200 -z-10 rounded-full" />
          <div
            className="absolute top-[34px] left-10 h-1 bg-primary -z-10 transition-all duration-1000 ease-in-out rounded-full"
            style={{ width: (isReady || isCompleted) ? 'calc(100% - 5rem)' : isPreparing ? 'calc(50% - 2.5rem)' : '0%' }}
          />

          {/* Step 1: 입금 확인 */}
          <div className="flex flex-col items-center gap-2.5 group">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center z-10 transition-all duration-500 ${
              !isPending
                ? 'bg-[#2D1616] text-white shadow-lg scale-100'
                : 'bg-white border-2 border-gray-200 text-gray-300 scale-90'
            }`}>
              <CheckCircle2 size={24} />
            </div>
            <span className={`text-[12px] font-bold ${!isPending ? 'text-[#2D1616]' : 'text-gray-400'}`}>입금 확인</span>
          </div>

          {/* Step 2: 준비 중 */}
          <div className="flex flex-col items-center gap-2.5">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center z-10 transition-all duration-500 ${
              isPreparing
                ? 'bg-primary text-white shadow-[0_0_20px_rgba(255,75,75,0.4)] scale-110'
                : (isReady || isCompleted)
                ? 'bg-[#2D1616] text-white shadow-lg scale-100'
                : 'bg-white border-2 border-gray-200 text-gray-300 scale-90'
            }`}>
              <Coffee size={24} />
            </div>
            <span className={`text-[12px] font-bold ${isPreparing ? 'text-primary' : (isReady || isCompleted) ? 'text-[#2D1616]' : 'text-gray-400'}`}>준비 중</span>
          </div>

          {/* Step 3: 준비 완료 */}
          <div className="flex flex-col items-center gap-2.5">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center z-10 transition-all duration-500 ${
              isReady
                ? 'bg-primary text-white shadow-[0_0_20px_rgba(255,75,75,0.4)] scale-110'
                : isCompleted
                ? 'bg-[#2D1616] text-white shadow-lg scale-100'
                : 'bg-white border-2 border-gray-200 text-gray-300 scale-90'
            }`}>
              <PartyPopper size={24} />
            </div>
            <span className={`text-[12px] font-bold ${isReady ? 'text-primary' : isCompleted ? 'text-[#2D1616]' : 'text-gray-400'}`}>준비 완료</span>
          </div>
        </div>

        {/* 주문 내역 요약 (카드 스타일 개선) */}
        <div className="w-full bg-white rounded-2xl p-6 shadow-sm border border-gray-50 mt-2">
          <div className="flex items-center justify-between mb-5 pb-4 border-b border-gray-50">
            <h4 className="font-black text-gray-900 text-[15px] tracking-tight">주문 내역 요약</h4>
            <span className="text-[11px] font-bold text-gray-400 bg-gray-50 px-2 py-1 rounded">Holy Coffee</span>
          </div>
          
          {order?.items?.map((item: any, idx: number) => (
            <div key={idx} className="flex gap-4 items-center mb-4 last:mb-0">
              <div className="w-14 h-14 rounded-xl overflow-hidden bg-gray-100 shrink-0 border border-gray-50">
                <img
                  src="https://images.unsplash.com/photo-1559525839-b184a4d698c7?w=100&q=80"
                  alt="coffee"
                  className="w-full h-full object-cover opacity-90"
                />
              </div>
              <div className="flex-1 min-w-0">
                <h5 className="font-bold text-[#2D1616] text-[15px] truncate mb-0.5">
                  {item.menu_name_snapshot}
                </h5>
                <p className="text-gray-400 text-[12px] font-semibold">
                  수량: {item.quantity}개 {item.options_text ? `· ${item.options_text}` : ''}
                </p>
              </div>
              <span className="text-[14px] font-black text-gray-800">
                ₩{item.sub_total.toLocaleString()}
              </span>
            </div>
          ))}

          <div className="mt-6 pt-5 border-t border-gray-100 flex justify-between items-center">
            <span className="text-gray-400 text-[13px] font-bold uppercase tracking-wider">Total Amount</span>
            <span className="font-black text-[20px] text-primary">
              ₩{totalAmount.toLocaleString()}
            </span>
          </div>
        </div>

        {/* 안내 문구 (푸터) */}
        <div className="w-full bg-gray-100/50 rounded-2xl p-5 flex gap-4 items-start border border-gray-200/50">
          <div className="bg-white p-2 rounded-xl shadow-sm shrink-0 border border-gray-100">
            <Coffee className="text-primary" size={22} />
          </div>
          <div>
            <h5 className="font-bold text-gray-900 text-[14px] mb-1">안내드립니다</h5>
            <p className="text-gray-500 text-[12px] leading-relaxed font-medium">
              주문 상태는 관리자가 변경하면 <span className="text-primary font-bold">새로고침 없이 자동으로 업데이트</span>됩니다. 화면을 유지해 주세요.
            </p>
          </div>
        </div>

      </main>
    </div>
  );
};
