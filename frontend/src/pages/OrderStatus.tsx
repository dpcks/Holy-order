import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle2, Coffee, PartyPopper, Copy, Check, Home, ChevronRight, ChevronLeft, Wallet } from 'lucide-react';
import { apiClient } from '../api/client';
import { getWsUrl } from '../utils/url';
import type { Order, SettingResponse, ActiveOrder, StandardResponse } from '../types';

export const OrderStatus = () => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [setting, setSetting] = useState<SettingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [activeOrders, setActiveOrders] = useState<ActiveOrder[]>([]);
  const [activeEvent, setActiveEvent] = useState<any>(null);

  // iOS 알림 관련 상태
  const [isAudioUnlocked, setIsAudioUnlocked] = useState(false);
  const [isReadyFlash, setIsReadyFlash] = useState(false);
  const [showIosNotice, setShowIosNotice] = useState(false);

  // iOS 감지 헬퍼
  const isIos = useCallback(() => {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }, []);

  // WebSocket 상태 관리
  type WsStatus = 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED';
  const [wsStatus, setWsStatus] = useState<WsStatus>('DISCONNECTED');
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryCountRef = useRef(0);
  const isUnmountingRef = useRef(false);
  const prevStatusRef = useRef<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const passedOrderNumber = location.state?.orderNumber;
  const passedTotal = location.state?.total;

  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const [orderRes, settingRes, eventRes] = await Promise.all([
        id ? apiClient.get<Order, StandardResponse<Order>>(`/orders/status/${id}`) : Promise.resolve(null),
        apiClient.get<SettingResponse, StandardResponse<SettingResponse>>('/settings'),
        apiClient.get<any, StandardResponse<any>>('/announcements/active'),
      ]);
      
      if (orderRes?.success) {
        setOrder(orderRes.data);
        
        // 수령 완료 시 (COMPLETED) 로컬 스토리지의 활성 주문 목록에서 자동으로 제거
        if (orderRes.data.status === 'COMPLETED') {
          const orders = JSON.parse(localStorage.getItem('activeOrders') || '[]');
          const filteredOrders = orders.filter((o: ActiveOrder) => String(o.id) !== String(id));
          localStorage.setItem('activeOrders', JSON.stringify(filteredOrders));
          
          setActiveOrders(filteredOrders);

          if (filteredOrders.length > 0) {
            console.log('🔄 [Auto-Nav] 주문 완료. 다음 활성 주문으로 이동합니다.');
            navigate(`/order/status/${filteredOrders[0].id}`, { replace: true });
          } else {
            navigate('/', { replace: true });
          }
        }
      }
      if (settingRes?.success) {
        setSetting(settingRes.data);
      }
      if (eventRes?.success) {
        setActiveEvent(eventRes.data);
      }
    } catch (error) {
      console.error('Failed to fetch order status', error);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [id, navigate]);

  // WebSocket 연결 함수 (지수 백오프 및 폴링 폴백 포함)
  const connectWebSocket = useCallback(() => {
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
    }

    const wsUrl = getWsUrl();

    setWsStatus('RECONNECTING');
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    // 하트비트 타이머 변수
    let heartbeatInterval: ReturnType<typeof setInterval>;

    ws.onopen = () => {
      console.log('✅ [WebSocket] 주문 추적 연결 성공');
      setWsStatus('CONNECTED');
      retryCountRef.current = 0;
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }

      // 사파리 등 모바일 브라우저 연결 유지를 위한 하트비트 시작 (25초마다)
      heartbeatInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 25000);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // 서버에서 오는 핑은 무시
        if (data.type === 'ping') return;

        if (data.type === 'ORDER_UPDATED') {
          // 1. 현재 보고 있는 주문 정보 갱신
          fetchData(false);

          // 2. 만약 다른 내 주문의 상태가 변경되었다면 해당 주문으로 자동 이동
          if (String(data.order_id) !== String(id)) {
            const orders = JSON.parse(localStorage.getItem('activeOrders') || '[]');
            const isMyOrder = orders.some((o: any) => String(o.id) === String(data.order_id));
            
            if (isMyOrder) {
              console.log(`🚀 [Auto-Nav] 주문 #${data.order_id} 상태 변경 감지! 페이지를 이동합니다.`);
              navigate(`/order/status/${data.order_id}`);
            }
          }
        }
      } catch (e) {
        console.error('Failed to parse WS message', e);
      }
    };

    ws.onclose = (event) => {
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      
      // 1. 실제로 페이지를 나가는 중이라면 재연결하지 않음
      if (isUnmountingRef.current) {
        setWsStatus('DISCONNECTED');
        return;
      }

      console.log(`❌ [WebSocket] 연결 종료 (Clean: ${event.wasClean}). 추적 폴백 활성화...`);
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
    
    // 신규 주문으로 변경 시 이전 데이터 초기화
    setOrder(null);
    fetchData(true);
    connectWebSocket();

    // 알림음 설정 (로컬 파일 우선)
    // TODO: public/mp3/ready.mp3 파일이 존재하지 않으면 에러가 발생할 수 있습니다.
    // 기존 대체 URL: https://t1.daumcdn.net/kakaopay/tesla/20210105/sounds/pebble.mp3
    audioRef.current = new Audio('/mp3/ready.mp3');
    audioRef.current.load();

    // 알림 권한 요청 (지원 환경에서만 실행)
    if ('Notification' in window) {
      try {
        if (Notification.permission === 'default') {
          Notification.requestPermission();
        }
      } catch (e) {
        console.warn('Notification 권한 요청 실패:', e);
      }
    }

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

  // iOS 안내 배너 노출 타이밍 제어
  useEffect(() => {
    if (isIos() && !isAudioUnlocked) {
      setShowIosNotice(true);
    }
  }, [isIos, isAudioUnlocked]);

  // 오디오 언락 메커니즘 (첫 터치 시 무음 재생 후 해제)
  useEffect(() => {
    if (isAudioUnlocked) return;

    const unlockAudio = () => {
      if (!audioRef.current) return;
      audioRef.current.play().then(() => {
        audioRef.current?.pause();
        if (audioRef.current) audioRef.current.currentTime = 0;
        setIsAudioUnlocked(true);
        setShowIosNotice(false);
        console.log('🔊 [Audio] 브라우저 오디오 재생 잠금 해제 성공');
        window.removeEventListener('click', unlockAudio);
        window.removeEventListener('touchstart', unlockAudio);
      }).catch(err => {
        console.warn('🔊 [Audio] 언락 대기 중 (사용자 상호작용 필요)');
      });
    };

    window.addEventListener('click', unlockAudio);
    window.addEventListener('touchstart', unlockAudio);

    return () => {
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
    };
  }, [isAudioUnlocked]);

  // 주문 상태 변경 감지 및 알림 발송 (진동/소리/시각적 피드백)
  useEffect(() => {
    if (!order) return;

    // 상태가 READY로 변경되는 순간 감지 (중복 실행 방지)
    if (order.status === 'READY' && prevStatusRef.current !== 'READY' && prevStatusRef.current !== null) {
      console.log('🔔 [Alert] 주문 완료 알림 발생!');

      // 시각적 피드백 (화면 깜빡임 등 - iOS 고려)
      setIsReadyFlash(true);
      setTimeout(() => setIsReadyFlash(false), 3000);

      // 1. 진동 (지원 브라우저 및 iOS 제외)
      if ('vibrate' in navigator && !isIos()) {
        try {
          navigator.vibrate([200, 100, 200, 100, 500]);
        } catch (e) {
          console.warn('진동 재생 불가', e);
        }
      }

      // 2. 소리 알림 (재시도 로직 포함)
      const playAudio = (retry = false) => {
        if (!audioRef.current) return;
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(err => {
          if (!retry) {
            console.warn('🔊 [Audio] 1차 재생 실패, 200ms 후 재시도합니다.');
            setTimeout(() => playAudio(true), 200);
          } else {
            console.warn('🔊 [Audio] 최종 소리 재생 실패. 브라우저 정책에 의해 차단됨.', err);
          }
        });
      };
      playAudio();

      // 3. 브라우저 알림 (권한이 있는 경우만 안전하게 호출)
      if ('Notification' in window) {
        try {
          if (Notification.permission === 'granted') {
            new Notification('평택중앙교회 카페', {
              body: `주문하신 메뉴가 준비되었습니다! #${order.order_number}번 픽업대로 오세요.`,
              icon: '/logo192.png',
              tag: `order-${order.id}`
            });
          }
        } catch (err) {
          console.error('Notification error:', err);
        }
      }
    }

    // 현재 상태를 ref에 보관하여 다음 업데이트 시 비교
    prevStatusRef.current = order.status;
  }, [order]);

  const handleCopyAccount = async () => {
    if (!setting?.account_number) return;
    const textToCopy = setting.account_number;

    try {
      // 1. 현대적인 Clipboard API 시도 (HTTPS 또는 localhost에서만 작동)
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(textToCopy);
      } else {
        // 2. HTTP 환경을 위한 Fallback (textarea 생성 방식)
        const textArea = document.createElement("textarea");
        textArea.value = textToCopy;
        // 화면에 보이지 않도록 설정
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        if (!successful) throw new Error('Fallback copy failed');
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      // 복사 실패 시 안내 메시지와 함께 수동 복사 유도
      alert('자동 복사에 실패했습니다. 직접 입력해 주세요: ' + textToCopy);
    }
  };

  const handleGoHome = () => {
    // 수령 완료된 주문은 홈으로 갈 때 로컬스토리지에서 정리
    if (order?.status === 'COMPLETED') {
      const orders = JSON.parse(localStorage.getItem('activeOrders') || '[]');
      const filteredOrders = orders.filter((o: ActiveOrder) => String(o.id) !== String(id));
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
  const storedOrder = activeOrders.find(o => String(o.id) === String(id));
  const orderNumber = order?.order_number || storedOrder?.orderNumber || passedOrderNumber || '-';
  const status = order?.status || 'PENDING';
  const totalAmount = order?.total_price || passedTotal || 0;

  const isPending = status === 'PENDING';
  const isPreparing = status === 'PREPARING';
  const isReady = status === 'READY';
  const isCompleted = status === 'COMPLETED';

  const currentIndex = activeOrders.findIndex(o => o.id === id);

  return (
    <div className={`flex flex-col min-h-screen w-full max-w-[500px] mx-auto pb-8 shadow-2xl relative transition-colors duration-700 ${isReadyFlash ? 'bg-primary/10' : 'bg-[#F9FAFB]'}`}>
      
      {/* iOS 안내 배너 */}
      {showIosNotice && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-gray-900/95 backdrop-blur text-white text-center py-3.5 text-[13px] font-bold animate-in slide-in-from-top flex items-center justify-center gap-2 shadow-xl cursor-pointer">
          <PartyPopper size={16} className="text-amber-400" />
          알림음을 받으려면 화면을 한 번 터치해주세요
        </div>
      )}

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
                String(activeOrder.id) === String(id) 
                  ? 'bg-[#1A0A0A] text-white shadow-md' 
                  : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
              } ${
                // 완료된 주문은 체크 표시나 다른 색상으로 구분 가능
                String(activeOrder.id) !== String(id) && activeOrders.find(o => String(o.id) === String(activeOrder.id))?.id === id ? 'opacity-50' : ''
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

        {isPending && (
          <div className="w-full bg-white rounded-3xl border-2 border-primary/20 shadow-sm overflow-hidden animate-in fade-in slide-in-from-top-4 duration-500">
            <div className={`px-6 py-3.5 flex items-center gap-2.5 ${(order?.payment_method === 'FREE' || totalAmount === 0) ? 'bg-amber-100' : 'bg-primary/10'}`}>
              <div className={`w-2 h-2 rounded-full animate-pulse ${(order?.payment_method === 'FREE' || totalAmount === 0) ? 'bg-amber-600' : 'bg-primary'}`} />
              <span className={`font-black text-[13px] tracking-wide uppercase ${(order?.payment_method === 'FREE' || totalAmount === 0) ? 'text-amber-700' : 'text-primary'}`}>
                {(order?.payment_method === 'FREE' || totalAmount === 0) ? '섬김의 시간 안내' : order?.payment_method === 'CASH' ? '현금 결제 대기' : '입금 확인 대기'}
              </span>
            </div>
            <div className="px-6 py-6 flex flex-col gap-5">
              <div className="text-center">
                <p className="text-[12px] text-gray-500 font-bold uppercase tracking-widest mb-1.5">Total Amount Due</p>
                <p className="text-[42px] font-black text-[#1A0A0A] tracking-tight leading-none">
                  {totalAmount.toLocaleString()}<span className="text-[20px] font-bold ml-1 text-gray-400">원</span>
                </p>
              </div>
              
              <div className="h-[1px] w-full bg-gray-50 border-t border-dashed border-gray-200" />
              
              {(order?.payment_method === 'FREE' || totalAmount === 0) ? (
                <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5 text-center">
                  <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3 text-amber-600">
                    <PartyPopper size={24} />
                  </div>
                  <p className="text-[14px] font-bold text-amber-800 leading-relaxed break-keep">
                    오늘은 <span className="text-orange-600 font-black">{activeEvent?.sponsor_name || '섬기는 분'} {activeEvent?.sponsor_duty || ''}</span>께서 섬겨주십니다.<br />감사 인사를 전해주세요~ ❤️
                  </p>
                  {activeEvent?.sponsor_name && (
                    <p className="text-[11px] text-amber-600 font-bold mt-2 pt-2 border-t border-amber-200/50">
                      후원: {activeEvent.sponsor_name} {activeEvent.sponsor_duty || ''}
                    </p>
                  )}
                </div>
              ) : order?.payment_method === 'CASH' ? (
                <div className="flex flex-col items-center gap-4 py-2">
                  <div className="w-16 h-16 bg-orange-50 rounded-full flex items-center justify-center text-orange-500">
                    <Wallet size={32} />
                  </div>
                  <div className="text-center">
                    <p className="font-black text-gray-900 text-[17px]">카운터에서 결제해 주세요</p>
                    <p className="text-[13px] text-gray-500 font-medium mt-1">현금을 준비해 주시면 빠른 접수가 가능합니다.</p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  <div className="flex justify-between items-center text-[14px]">
                    <span className="text-gray-400 font-bold uppercase tracking-wider text-[11px]">Bank</span>
                    <span className="font-black text-gray-900">{setting?.bank_name}</span>
                  </div>
                  <div className="flex justify-between items-center text-[14px]">
                    <span className="text-gray-400 font-bold uppercase tracking-wider text-[11px]">Holder</span>
                    <span className="font-black text-gray-900">{setting?.account_holder}</span>
                  </div>
                  <div className="flex items-center justify-between bg-gray-50 rounded-2xl px-5 py-4 mt-1 border border-gray-100">
                    <span className="text-[17px] font-black text-[#1A0A0A] tracking-wide">{setting?.account_number}</span>
                    <button onClick={handleCopyAccount} className={`flex items-center gap-1.5 text-[12px] font-bold px-3.5 py-2 rounded-xl transition-all shadow-sm ${copied ? 'bg-green-500 text-white' : 'bg-[#1A0A0A] text-white hover:bg-gray-800'}`}>
                      {copied ? <Check size={14} /> : <Copy size={14} />}
                      {copied ? '복사됨!' : '복사'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="text-center py-2">
          <h3 className="text-[24px] font-black text-[#2D1616] mb-3 tracking-tight transition-all duration-500">
            {isCompleted ? '수령이 완료되었습니다! ☺️' : 
             isReady ? '메뉴가 준비되었습니다! 🎉' : 
             isPreparing ? '맛있게 만들고 있어요! ☕️' : 
             ((order?.payment_method === 'FREE' || totalAmount === 0) ? '주문이 정상 접수되었습니다 ❤️' : order?.payment_method === 'CASH' ? '카운터에서 결제해 주세요 💵' : '입금을 기다리고 있어요 💳')}
          </h3>
          <div className="inline-flex items-center gap-2.5 bg-white border border-gray-100 shadow-md px-6 py-3 rounded-full">
            <div className={`w-3 h-3 rounded-full animate-pulse ${isReady || isCompleted ? 'bg-green-500' : isPreparing ? 'bg-primary' : 'bg-orange-400'}`} />
            <span className="text-gray-800 font-black text-[15px] tracking-tight">
              {isCompleted ? '이용해 주셔서 감사합니다' : 
               isReady ? '픽업대에서 가져가세요' : 
               isPreparing ? '잠시만 기다려 주세요' : 
               ((order?.payment_method === 'FREE' || totalAmount === 0) ? '곧 맛있게 만들어 드릴게요' : order?.payment_method === 'CASH' ? '결제 후 제조가 시작됩니다' : '입금 확인 시 제조 시작')}
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
              <span className="text-[15px] font-black text-gray-900">
                ₩{(order?.payment_method === 'FREE' || order?.total_price === 0) ? 0 : item.sub_total.toLocaleString()}
              </span>
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
