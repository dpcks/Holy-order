import { useEffect, useState, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle2, Coffee, PartyPopper, Copy, Check, Home } from 'lucide-react';
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
  const navigate = useNavigate();
  const [order, setOrder] = useState<any>(null);
  const [setting, setSetting] = useState<Setting | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const passedOrderNumber = location.state?.orderNumber;
  const passedTotal = location.state?.total;

  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const [orderRes, settingRes] = await Promise.all([
        id ? apiClient.get<any, StandardResponse<any>>(`/orders/status/${id}`) : Promise.resolve(null),
        apiClient.get<any, StandardResponse<Setting>>('/settings'),
      ]);
      
      if (orderRes?.success) {
        setOrder(orderRes.data);
        // 주문이 완료되었으면 로컬스토리지 정리
        if (orderRes.data.status === 'COMPLETED') {
          localStorage.removeItem('activeOrderId');
        }
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

  useEffect(() => {
    fetchData(true);

    // WebSocket 연결 (실시간 업데이트)
    const wsUrl = `ws://${window.location.hostname}:8000/ws`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      if (event.data === 'ORDER_UPDATED') {
        fetchData(false);
      }
    };

    const pollInterval = setInterval(() => {
      fetchData(false);
    }, 5000);

    return () => {
      ws.close();
      clearInterval(pollInterval);
    };
  }, [fetchData]);

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
      <header className="flex items-center justify-between px-6 h-16 bg-[#F9FAFB]/80 backdrop-blur-md sticky top-0 z-20 border-b border-gray-100/50">
        <div className="w-10" /> {/* 왼쪽 공백 (정렬용) */}
        <h1 className="text-lg font-black tracking-[0.2em] text-[#2D1616]">STATUS</h1>
        <button 
          onClick={() => navigate('/')}
          className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center text-gray-800 border border-gray-100 shadow-sm active:scale-95 transition-all"
        >
          <Home size={20} />
        </button>
      </header>

      <main className="flex-1 px-4 py-4 flex flex-col items-center gap-5">
        <div className="bg-white w-full rounded-3xl shadow-[0_10px_40px_rgba(0,0,0,0.06)] flex flex-col items-center justify-center py-8 border border-gray-50 transition-all duration-500">
          <p className="text-gray-500 font-medium tracking-[0.2em] mb-1 text-sm uppercase">Order Number</p>
          <h2 className="text-[84px] font-black text-[#2D1616] leading-none tracking-tighter">
            {orderNumber}
          </h2>
        </div>

        {isPending && setting?.account_number && (
          <div className="w-full bg-white rounded-3xl border-2 border-primary/20 shadow-sm overflow-hidden animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="bg-primary/10 px-6 py-3.5 flex items-center gap-2.5">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="text-primary font-black text-[13px] tracking-wide uppercase">입금 확인 대기</span>
            </div>
            <div className="px-6 py-6 flex flex-col gap-5">
              <div className="text-center">
                <p className="text-[12px] text-gray-500 font-bold uppercase tracking-widest mb-1.5">Total Amount Due</p>
                <p className="text-[42px] font-black text-[#1A0A0A] tracking-tight leading-none">
                  {totalAmount.toLocaleString()}<span className="text-[20px] font-bold ml-1 text-gray-400">원</span>
                </p>
              </div>
              <div className="h-[1px] w-full bg-gray-50 border-t border-dashed border-gray-200" />
              <div className="flex flex-col gap-2.5">
                <div className="flex justify-between items-center text-[14px]">
                  <span className="text-gray-400 font-bold uppercase tracking-wider text-[11px]">Bank</span>
                  <span className="font-black text-gray-900">{setting.bank_name}</span>
                </div>
                <div className="flex justify-between items-center text-[14px]">
                  <span className="text-gray-400 font-bold uppercase tracking-wider text-[11px]">Holder</span>
                  <span className="font-black text-gray-900">{setting.account_holder}</span>
                </div>
                <div className="flex items-center justify-between bg-gray-50 rounded-2xl px-5 py-4 mt-1 border border-gray-100">
                  <span className="text-[17px] font-black text-[#1A0A0A] tracking-wide">{setting.account_number}</span>
                  <button onClick={handleCopyAccount} className={`flex items-center gap-1.5 text-[12px] font-bold px-3.5 py-2 rounded-xl transition-all shadow-sm ${copied ? 'bg-green-500 text-white' : 'bg-[#1A0A0A] text-white hover:bg-gray-800'}`}>
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? '복사됨!' : '복사'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="text-center py-2">
          <h3 className="text-[24px] font-black text-[#2D1616] mb-3 tracking-tight transition-all duration-500">
            {isCompleted ? '수령이 완료되었습니다! ☺️' : isReady ? '메뉴가 준비되었습니다! 🎉' : isPreparing ? '맛있게 만들고 있어요! ☕️' : '입금을 기다리고 있어요 💳'}
          </h3>
          <div className="inline-flex items-center gap-2.5 bg-white border border-gray-100 shadow-md px-6 py-3 rounded-full">
            <div className={`w-3 h-3 rounded-full animate-pulse ${isReady || isCompleted ? 'bg-green-500' : isPreparing ? 'bg-primary' : 'bg-orange-400'}`} />
            <span className="text-gray-800 font-black text-[15px] tracking-tight">
              {isCompleted ? '이용해 주셔서 감사합니다' : isReady ? '픽업대에서 가져가세요' : isPreparing ? '잠시만 기다려 주세요' : '입금 확인 시 제조 시작'}
            </span>
          </div>
        </div>

        <div className="w-full max-w-[340px] flex justify-between items-center relative px-2 py-6">
          <div className="absolute top-[42px] left-10 right-10 h-1.5 bg-gray-100 -z-10 rounded-full" />
          <div className="absolute top-[42px] left-10 h-1.5 bg-primary -z-10 transition-all duration-1000 ease-in-out rounded-full shadow-[0_0_10px_rgba(255,75,75,0.3)]" style={{ width: (isReady || isCompleted) ? 'calc(100% - 5rem)' : isPreparing ? 'calc(50% - 2.5rem)' : '0%' }} />
          <div className="flex flex-col items-center gap-3">
            <div className={`w-16 h-16 rounded-3xl flex items-center justify-center z-10 transition-all duration-500 ${!isPending ? 'bg-[#1A0A0A] text-white shadow-xl rotate-0' : 'bg-white border-2 border-gray-100 text-gray-300'}`}><CheckCircle2 size={28} /></div>
            <span className={`text-[13px] font-black ${!isPending ? 'text-[#1A0A0A]' : 'text-gray-400'}`}>입금 확인</span>
          </div>
          <div className="flex flex-col items-center gap-3">
            <div className={`w-16 h-16 rounded-3xl flex items-center justify-center z-10 transition-all duration-500 ${isPreparing ? 'bg-primary text-white shadow-[0_10px_25px_rgba(255,75,75,0.4)] scale-110' : (isReady || isCompleted) ? 'bg-[#1A0A0A] text-white shadow-xl' : 'bg-white border-2 border-gray-100 text-gray-300'}`}><Coffee size={28} /></div>
            <span className={`text-[13px] font-black ${isPreparing ? 'text-primary' : (isReady || isCompleted) ? 'text-[#1A0A0A]' : 'text-gray-400'}`}>준비 중</span>
          </div>
          <div className="flex flex-col items-center gap-3">
            <div className={`w-16 h-16 rounded-3xl flex items-center justify-center z-10 transition-all duration-500 ${isReady ? 'bg-primary text-white shadow-[0_10px_25px_rgba(255,75,75,0.4)] scale-110' : isCompleted ? 'bg-[#1A0A0A] text-white shadow-xl' : 'bg-white border-2 border-gray-100 text-gray-300'}`}><PartyPopper size={28} /></div>
            <span className={`text-[13px] font-black ${isReady ? 'text-primary' : isCompleted ? 'text-[#1A0A0A]' : 'text-gray-400'}`}>준비 완료</span>
          </div>
        </div>

        <div className="w-full bg-white rounded-3xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-gray-100 mt-2">
          <h4 className="font-black text-gray-900 text-[16px] tracking-tight mb-5 pb-4 border-b border-gray-50 flex items-center justify-between">
            주문 내역 요약
            <span className="text-[11px] text-gray-400 font-bold uppercase tracking-widest">Receipt</span>
          </h4>
          {order?.items?.map((item: any, idx: number) => (
            <div key={idx} className="flex gap-4 items-center mb-4 last:mb-0">
              <div className="w-14 h-14 rounded-2xl overflow-hidden bg-gray-50 shrink-0 border border-gray-100"><img src="https://images.unsplash.com/photo-1559525839-b184a4d698c7?w=100&q=80" alt="coffee" className="w-full h-full object-cover" /></div>
              <div className="flex-1 min-w-0">
                <h5 className="font-black text-[#1A0A0A] text-[15px] truncate mb-0.5">{item.menu_name_snapshot}</h5>
                <p className="text-gray-400 text-[12px] font-bold">수량 {item.quantity}개 {item.options_text ? `· ${item.options_text}` : ''}</p>
              </div>
              <span className="text-[15px] font-black text-gray-900">₩{item.sub_total.toLocaleString()}</span>
            </div>
          ))}
          <div className="mt-6 pt-5 border-t border-gray-50 flex justify-between items-center">
            <span className="text-gray-400 text-[11px] font-black uppercase tracking-[0.2em]">Total Price</span>
            <span className="font-black text-[22px] text-primary tracking-tight">₩{totalAmount.toLocaleString()}</span>
          </div>
        </div>

        <div className="w-full bg-gray-900 rounded-3xl p-5 flex gap-4 items-center border border-gray-800 shadow-xl">
          <div className="bg-white/10 p-3 rounded-2xl shrink-0"><Coffee className="text-primary" size={22} /></div>
          <div>
            <h5 className="font-black text-white text-[14px] mb-0.5 tracking-tight">실시간 추적 중</h5>
            <p className="text-white/40 text-[12px] leading-relaxed font-bold">관리자가 주문을 승인하면 <span className="text-white underline">즉시</span> 알려드려요.</p>
          </div>
        </div>
      </main>
    </div>
  );
};
