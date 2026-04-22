import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle2, Coffee, PartyPopper, Copy, Check, Home, ChevronRight, ChevronLeft } from 'lucide-react';
import { apiClient } from '../api/client';
import type { StandardResponse } from '../api/client';

interface Setting {
  bank_name: string | null;
  account_number: string | null;
  account_holder: string | null;
}

interface ActiveOrder {
  id: string;
  orderNumber: number;
}

interface OrderItem {
  id: number;
  menu_name_snapshot: string;
  quantity: number;
  options_text: string | null;
  sub_total: number;
}

interface Order {
  id: number;
  order_number: number;
  status: 'PENDING' | 'PREPARING' | 'READY' | 'COMPLETED' | 'CANCELLED';
  total_price: number;
  created_at: string;
  items: OrderItem[];
}

export const OrderStatus = () => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [setting, setSetting] = useState<Setting | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [activeOrders, setActiveOrders] = useState<ActiveOrder[]>([]);

  // WebSocket 상태 관리
  type WsStatus = 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED';
  const [wsStatus, setWsStatus] = useState<WsStatus>('DISCONNECTED');
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryCountRef = useRef(0);

  const passedOrderNumber = location.state?.orderNumber;
  const passedTotal = location.state?.total;

  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const [orderRes, settingRes] = await Promise.all([
        id ? apiClient.get<Order, StandardResponse<Order>>(`/orders/status/${id}`) : Promise.resolve(null),
        apiClient.get<Setting, StandardResponse<Setting>>('/settings'),
      ]);
      
      if (orderRes?.success) {
        setOrder(orderRes.data);
        
        // 수령 완료 시 (COMPLETED) 로컬 스토리지의 활성 주문 목록에서 자동으로 제거
        // 이를 통해 사용자가 홈 버튼을 누르지 않아도 홈 화면의 플로팅 버튼이 즉시 사라짐
        if (orderRes.data.status === 'COMPLETED') {
          const orders = JSON.parse(localStorage.getItem('activeOrders') || '[]');
          const filteredOrders = orders.filter((o: ActiveOrder) => o.id !== id);
          localStorage.setItem('activeOrders', JSON.stringify(filteredOrders));
          
          // 현재 페이지의 탭 목록 상태도 동기화
          setActiveOrders(filteredOrders);
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

  // WebSocket 연결 함수 (지수 백오프 및 폴링 폴백 포함)
  const connectWebSocket = useCallback(() => {
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
    }

    const isDev = window.location.hostname === 'localhost';
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    const port = isDev ? ':8000' : '';
    const wsUrl = `${protocol}//${host}${port}/ws`;

    setWsStatus('RECONNECTING');
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('✅ [WebSocket] 주문 추적 연결 성공');
      setWsStatus('CONNECTED');
      retryCountRef.current = 0;
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
    };

    ws.onmessage = (event) => {
      if (event.data === 'ORDER_UPDATED') {
        fetchData(false);
      }
    };

    ws.onclose = (event) => {
      if (event.wasClean) {
        setWsStatus('DISCONNECTED');
        return;
      }

      console.log('❌ [WebSocket] 연결 끊김. 추적 폴백 활성화...');
      setWsStatus('DISCONNECTED');
      
      // 사용자용 페이지는 좀 더 빈번하게 폴링 (10초)
      if (!pollingTimerRef.current) {
        pollingTimerRef.current = setInterval(() => fetchData(false), 10000);
      }

      const delay = Math.min(30000, 1000 * Math.pow(2, retryCountRef.current));
      reconnectTimerRef.current = setTimeout(() => {
        retryCountRef.current += 1;
        connectWebSocket();
      }, delay);
    };

    ws.onerror = () => ws.close();
  }, [fetchData]);

  useEffect(() => {
    const orders = JSON.parse(localStorage.getItem('activeOrders') || '[]');
    setActiveOrders(orders);
    fetchData(true);
    connectWebSocket();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN)) {
        console.log('📱 [Visibility] 화면 활성화 - 주문 상태 즉시 갱신');
        fetchData(false);
        connectWebSocket();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
    };
  }, [fetchData, connectWebSocket]);

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

  const handleGoHome = () => {
    // 수령 완료된 주문은 홈으로 갈 때 로컬스토리지에서 정리
    if (order?.status === 'COMPLETED') {
      const orders = JSON.parse(localStorage.getItem('activeOrders') || '[]');
      const filteredOrders = orders.filter((o: ActiveOrder) => o.id !== id);
      localStorage.setItem('activeOrders', JSON.stringify(filteredOrders));
    }
    navigate('/');
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

  // 데이터 우선순위: API 응답 > 로컬스토리지 저장값 > 내비게이션 state
  const storedOrder = activeOrders.find(o => o.id === id);
  const orderNumber = order?.order_number || storedOrder?.orderNumber || passedOrderNumber || '-';
  const status = order?.status || 'PENDING';
  const totalAmount = order?.total_price || passedTotal || 0;

  const isPending = status === 'PENDING';
  const isPreparing = status === 'PREPARING';
  const isReady = status === 'READY';
  const isCompleted = status === 'COMPLETED';

  const currentIndex = activeOrders.findIndex(o => o.id === id);

  return (
    <div className="flex flex-col min-h-screen w-full max-w-[500px] mx-auto bg-[#F9FAFB] pb-8 shadow-2xl relative">
      <header className="flex items-center justify-between px-6 h-16 bg-[#F9FAFB]/80 backdrop-blur-md sticky top-0 z-20 border-b border-gray-100/50">
        <div className="w-10">
          {activeOrders.length > 1 && currentIndex > 0 && (
            <button 
              onClick={() => navigate(`/order/status/${activeOrders[currentIndex - 1].id}`)}
              className="p-2 text-gray-400 hover:text-gray-800 transition-colors"
            >
              <ChevronLeft size={24} />
            </button>
          )}
        </div>
        <h1 className="text-lg font-black tracking-[0.2em] text-[#2D1616]">STATUS</h1>
        <div className="flex items-center gap-2">
          {activeOrders.length > 1 && currentIndex < activeOrders.length - 1 && (
            <button 
              onClick={() => navigate(`/order/status/${activeOrders[currentIndex + 1].id}`)}
              className="p-2 text-gray-400 hover:text-gray-800 transition-colors mr-2"
            >
              <ChevronRight size={24} />
            </button>
          )}
          <button 
            onClick={handleGoHome}
            className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center text-gray-800 border border-gray-100 shadow-sm active:scale-95 transition-all"
          >
            <Home size={20} />
          </button>
        </div>
      </header>

      {activeOrders.length > 1 && (
        <div className="px-6 py-3 flex gap-2 overflow-x-auto scrollbar-hide bg-white border-b border-gray-50">
          {activeOrders.map((activeOrder) => (
            <button
              key={activeOrder.id}
              onClick={() => navigate(`/order/status/${activeOrder.id}`)}
              className={`px-4 py-1.5 rounded-full text-[12px] font-black transition-all whitespace-nowrap ${
                activeOrder.id === id 
                  ? 'bg-[#1A0A0A] text-white shadow-md' 
                  : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
              } ${
                // 완료된 주문은 체크 표시나 다른 색상으로 구분 가능
                activeOrder.id !== id && activeOrders.find(o => o.id === activeOrder.id)?.id === id ? 'opacity-50' : ''
              }`}
            >
              #{activeOrder.orderNumber}
            </button>
          ))}
        </div>
      )}

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
          {order?.items?.map((item, idx) => (
            <div key={idx} className="flex gap-4 items-center mb-4 last:mb-0">
              <div className="w-14 h-14 rounded-2xl overflow-hidden bg-gray-50 shrink-0 border border-gray-100"><img src="https://images.unsplash.com/photo-1559525839-b184a4d698c7?w=100&q=80" alt="coffee" className="w-full h-full object-cover" /></div>
              <div className="flex-1 min-w-0">
                <h5 className="font-black text-[#1A0A0A] text-[15px] truncate mb-0.5">{item.menu_name_snapshot}</h5>
                <p className="text-gray-400 text-[12px] font-bold">수량 {item.quantity}개 {item.options_text ? `· ${item.options_text}` : ''}</p>
              </div>
              <span className="text-[15px] font-black text-gray-900">₩{item.sub_total.toLocaleString()}</span>
            </div>
          ))}
          <div className="mt-6 pt-5 border-t border-gray-100 flex justify-between items-center">
            <span className="text-gray-400 text-[11px] font-black uppercase tracking-[0.2em]">Total Price</span>
            <span className="font-black text-[22px] text-primary tracking-tight">₩{totalAmount.toLocaleString()}</span>
          </div>
        </div>

        <div className="w-full bg-gray-900 rounded-3xl p-5 flex gap-4 items-center border border-gray-800 shadow-xl relative overflow-hidden">
          <div className="bg-white/10 p-3 rounded-2xl shrink-0"><Coffee className="text-primary" size={22} /></div>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <h5 className="font-black text-white text-[14px] tracking-tight">실시간 추적 중</h5>
              <div className={`w-1.5 h-1.5 rounded-full ${wsStatus === 'CONNECTED' ? 'bg-green-500 animate-pulse' : 'bg-orange-400 animate-pulse'}`} />
            </div>
            <p className="text-white/40 text-[12px] leading-relaxed font-bold">
              {wsStatus === 'CONNECTED' 
                ? '관리자가 주문을 승인하면 즉시 알려드려요.' 
                : '연결이 불안정하여 10초마다 상태를 확인 중입니다.'}
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};
