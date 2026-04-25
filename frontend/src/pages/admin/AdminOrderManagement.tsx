import { useEffect, useState, useCallback, useRef } from 'react';
import { RefreshCw, CheckCircle, MessageSquare, Phone, MoreVertical, Coffee, Wallet, Building2, X } from 'lucide-react';
import { apiClient } from '../../api/client';
import type { StandardResponse } from '../../api/client';
import type { Order, DashboardStats } from '../../types';

// 상태 전이 정의
const STATUS_TRANSITIONS: Record<string, { label: string; next: string; color: string } | null> = {
  PENDING: { label: '입금 승인', next: 'PREPARING', color: 'bg-primary text-white' },
  PREPARING: { label: '준비완료', next: 'READY', color: 'bg-green-500 text-white' },
  READY: { label: '수령완료', next: 'COMPLETED', color: 'bg-blue-500 text-white' },
};

const COLUMNS = [
  { status: 'PENDING', label: '입금 확인대기', color: 'text-orange-600', dot: 'bg-orange-400' },
  { status: 'PREPARING', label: '제조 중', color: 'text-primary', dot: 'bg-primary' },
  { status: 'READY', label: '수령 대기', color: 'text-green-600', dot: 'bg-green-400' },
];

// 경과 시간 계산 헬퍼
const getElapsed = (createdAt: string, now: number) => {
  const diff = Math.floor((now - new Date(createdAt).getTime()) / 60000);
  if (diff < 1) return '방금 전';
  if (diff >= 60) {
    const hours = Math.floor(diff / 60);
    const mins = diff % 60;
    return `${hours}시간 ${mins}분 경과`;
  }
  return `${diff}분 경과`;
};

// 전화번호 포맷팅 (01012345678 -> 010-1234-5678)
const formatPhone = (phone: string | null) => {
  if (!phone) return '';
  return phone.replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3');
};

// 옵션 텍스트 파싱 및 뱃지 렌더링 컴포넌트
const OptionBadges = ({ text }: { text: string | null }) => {
  if (!text) return null;

  // ' / ' 또는 ', '로 구분된 옵션들을 분리
  const options = text.split(/ \/ |, /);

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {options.map((opt, i) => {
        const trimmed = opt.trim();
        if (!trimmed) return null;

        const isIce = trimmed.toUpperCase() === 'ICE';
        const isHot = trimmed.toUpperCase() === 'HOT';
        const isShot = trimmed.includes('샷 추가');
        const isTumblr = trimmed.includes('텀블러');

        return (
          <span
            key={i}
            className={`text-[10px] font-black px-2 py-0.5 rounded-md leading-none flex items-center h-5 border ${isIce ? 'bg-blue-100 text-blue-600 border-blue-200' :
                isHot ? 'bg-red-100 text-red-600 border-red-200' :
                  isShot ? 'bg-yellow-100 text-yellow-700 border-yellow-300' :
                    isTumblr ? 'bg-green-100 text-green-700 border-green-300' :
                      'bg-gray-100 text-gray-500 border-gray-200'
              }`}
          >
            {trimmed}
          </span>
        );
      })}
    </div>
  );
};

export const AdminOrderManagement = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<DashboardStats>({ total_orders: 0, total_sales: 0 });
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [now, setNow] = useState<number>(Date.now());

  // WebSocket 상태 관리
  type WsStatus = 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED';
  const [wsStatus, setWsStatus] = useState<WsStatus>('DISCONNECTED');

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryCountRef = useRef(0);
  const isUnmountingRef = useRef(false);

  const fetchOrders = useCallback(async () => {
    try {
      const [boardRes, statsRes] = await Promise.all([
        apiClient.get<Order[], StandardResponse<Order[]>>('/admin/orders/board'),
        apiClient.get<DashboardStats, StandardResponse<DashboardStats>>('/admin/stats/today')
      ]);

      if (boardRes.success && boardRes.data) {
        setOrders(boardRes.data);
      }
      if (statsRes.success && statsRes.data) {
        setStats(statsRes.data);
      }
      setLastUpdated(new Date());
    } catch (err) {
      console.error('주문 조회 실패:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // WebSocket 연결 함수 (지수 백오프 및 폴링 폴백 포함)
  const connectWebSocket = useCallback(() => {
    // 기존 타이머 및 연결 정리
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    if (wsRef.current) {
      wsRef.current.onclose = null; // 중복 호출 방지
      wsRef.current.close();
    }

    // WebSocket URL 설정 (HTTP -> WS, HTTPS -> WSS)
    // 로컬 개발 환경(8000포트)과 운영 환경을 모두 고려
    const { hostname, protocol } = window.location;
    const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';

    // 개발 환경(localhost 또는 IP 접속)에서는 8000 포트 사용
    const isLocal = hostname === 'localhost' || /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);
    const wsPort = isLocal ? ':8000' : '';

    const wsUrl = `${wsProtocol}//${hostname}${wsPort}/ws`;

    setWsStatus('RECONNECTING');
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('✅ [WebSocket] 연결 성공');
      setWsStatus('CONNECTED');
      retryCountRef.current = 0;

      // 연결 성공 시 REST 폴링 중단
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'ORDER_UPDATED') {
          console.log('🔔 [WebSocket] 새 주문 업데이트 감지:', data);
          fetchOrders();
        }
      } catch (e) {
        console.error('Failed to parse WS message', e);
      }
    };

    ws.onclose = (event) => {
      // 1. 실제로 페이지를 나가는 중이라면 재연결하지 않음
      if (isUnmountingRef.current) {
        setWsStatus('DISCONNECTED');
        return;
      }

      console.log(`❌ [WebSocket] 연결 종료 (Clean: ${event.wasClean}). 재연결 시도...`);
      setWsStatus('DISCONNECTED');

      // 1. REST Polling Fallback 시작 (WebSocket이 죽어도 30초마다 데이터 갱신)
      if (!pollingTimerRef.current) {
        console.log('🔄 [Fallback] REST Polling 활성화 (30s)');
        pollingTimerRef.current = setInterval(fetchOrders, 30000);
      }

      // 2. 지수 백오프(Exponential Backoff) 기반 재연결 시도 (최대 30초)
      const delay = Math.min(30000, 1000 * Math.pow(2, retryCountRef.current));
      reconnectTimerRef.current = setTimeout(() => {
        retryCountRef.current += 1;
        connectWebSocket();
      }, delay);
    };

    ws.onerror = (error) => {
      console.error('⚠️ [WebSocket] 에러 발생:', error);
      ws.close();
    };
  }, [fetchOrders]);

  // 실시간 경과 시간 업데이트 타이머 (30초마다)
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  // 초기 로드 + WebSocket 생명주기 관리
  useEffect(() => {
    isUnmountingRef.current = false;
    fetchOrders();
    connectWebSocket();

    // 페이지 가시성 변화 감지
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN)) {
        console.log('📱 [Visibility] 화면 활성화 - 주문 현황 즉시 갱신');
        fetchOrders();
        connectWebSocket();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isUnmountingRef.current = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
    };
  }, [fetchOrders, connectWebSocket]);

  // 5초마다 실제 소켓 상태 강제 확인 (UI 동기화 보정용 - 별도 이펙트로 분리하여 재연결 루프 방지)
  useEffect(() => {
    const statusCheckInterval = setInterval(() => {
      setWsStatus(prev => {
        // 1. 소켓 객체가 없거나 생성 전인 경우
        if (!wsRef.current) {
          return prev === 'CONNECTED' ? 'DISCONNECTED' : prev;
        }

        const realReadyState = wsRef.current.readyState;

        // 2. 실제 상태가 OPEN이면 무조건 CONNECTED
        if (realReadyState === WebSocket.OPEN) {
          return 'CONNECTED';
        }

        // 3. 연결 시도 중(CONNECTING)일 때는 이전 상태를 유지하여 UI 깜빡임 방지
        if (realReadyState === WebSocket.CONNECTING) {
          return prev;
        }

        // 4. 그 외(CLOSING, CLOSED) 상태인데 UI가 CONNECTED라면 DISCONNECTED로 보정
        if (prev === 'CONNECTED') {
          console.log('⚠️ [Sync] 소켓 끊김 감지 - 상태 업데이트');
          return 'DISCONNECTED';
        }

        return prev;
      });
    }, 5000);

    return () => clearInterval(statusCheckInterval);
  }, []);

  const handleStatusChange = async (orderId: number, nextStatus: string) => {
    setUpdatingId(orderId);
    try {
      await apiClient.patch(`/admin/orders/${orderId}/status`, { status: nextStatus });
      await fetchOrders();
    } catch (err) {
      alert('상태 변경에 실패했습니다.');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleCancel = async (orderId: number) => {
    if (!confirm('정말 주문을 취소하시겠습니까?')) return;
    setUpdatingId(orderId);
    try {
      await apiClient.patch(`/admin/orders/${orderId}/status`, { status: 'CANCELLED' });
      await fetchOrders();
    } catch (err) {
      alert('취소 처리에 실패했습니다.');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#F9FAFB] overflow-hidden">
      <header className="bg-white border-b border-gray-200 px-6 xl:px-8 py-3 xl:py-5 flex items-center justify-between shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-6">
          <div>
            <div className="flex items-center gap-2 xl:gap-3 mb-0.5 xl:mb-1">
              <h1 className="text-xl xl:text-2xl font-black text-gray-900 tracking-tight">실시간 주문 현황</h1>
              <div className="flex items-center gap-2 bg-gray-50 px-3 py-1 rounded-full border border-gray-100">
                <span className={`w-1.5 h-1.5 rounded-full ${wsStatus === 'CONNECTED' ? 'bg-green-500 animate-pulse' :
                    wsStatus === 'RECONNECTING' ? 'bg-orange-400 animate-pulse' :
                      'bg-red-400'
                  }`}></span>
                <span className="text-[12px] text-gray-900 font-bold uppercase tracking-wider">
                  {wsStatus === 'CONNECTED' ? '실시간' : wsStatus === 'RECONNECTING' ? '재연결중' : '오프라인'}
                </span>
              </div>
            </div>
            <p className="text-[12px] text-gray-400 font-medium">
              마지막 업데이트: {lastUpdated.toLocaleTimeString('ko-KR')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-0.5">Active Orders</p>
            <p className="text-2xl font-black text-[#1A0A0A]">{orders.length}<span className="text-sm font-bold ml-0.5 text-gray-400">건</span></p>
          </div>
          <button
            onClick={fetchOrders}
            className="p-3 rounded-xl text-gray-500 hover:bg-gray-100 hover:text-primary transition-all bg-gray-50 border border-gray-100"
          >
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-x-auto p-4 xl:p-8">
        <div className="flex gap-4 xl:gap-8 h-full min-w-0">
          {COLUMNS.map((col) => {
            const colOrders = orders.filter(o => o.status === col.status);
            return (
              <div key={col.status} className="flex-1 flex flex-col min-w-[260px] max-w-[480px]">
                <div className="flex items-center justify-between mb-6 px-1">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full shadow-sm ${col.dot}`} />
                    <span className={`font-black text-[17px] tracking-tight ${col.color}`}>{col.label}</span>
                  </div>
                  <span className="bg-[#1A0A0A] text-white text-[12px] font-black px-3 py-1 rounded-full shadow-lg">
                    {colOrders.length}
                  </span>
                </div>

                <div className="flex flex-col gap-5 overflow-y-auto pr-2 custom-scrollbar">
                  {colOrders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 bg-white/50 rounded-3xl border-2 border-dashed border-gray-100 text-gray-300">
                      <CheckCircle size={48} strokeWidth={1} className="mb-3 opacity-20" />
                      <p className="text-[14px] font-bold">진행 중인 주문 없음</p>
                    </div>
                  ) : (
                    colOrders.map((order) => {
                      const transition = STATUS_TRANSITIONS[order.status];
                      const isUpdating = updatingId === order.id;
                      return (
                        <div
                          key={order.id}
                          className="bg-white rounded-3xl p-4 xl:p-6 shadow-[0_4px_20_rgba(0,0,0,0.03)] border border-gray-100 hover:shadow-[0_10px_30px_rgba(0,0,0,0.08)] transition-all group animate-in fade-in slide-in-from-bottom-4 duration-500 relative"
                        >
                          {/* 헤더: 주문번호 & 결제수단 & 경과시간 */}
                          <div className="flex items-center justify-between mb-5">
                            <div className="flex items-center gap-3">
                              <span className="text-2xl xl:text-3xl font-black text-[#1A0A0A] tracking-tighter">
                                #{order.order_number}
                              </span>
                              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black border ${order.payment_method === 'CASH'
                                  ? 'bg-orange-50 text-orange-600 border-orange-100'
                                  : 'bg-blue-50 text-blue-600 border-blue-100'
                                }`}>
                                {order.payment_method === 'CASH' ? <Wallet size={12} /> : <Building2 size={12} />}
                                {order.payment_method === 'CASH' ? '현금' : '계좌'}
                              </div>
                            </div>
                            <span className={`text-[11px] font-black px-3 py-1 rounded-full uppercase tracking-widest ${order.status === 'PREPARING' ? 'bg-red-50 text-primary animate-pulse' : 'bg-gray-100 text-gray-500'
                              } ${Math.floor((now - new Date(order.created_at).getTime()) / 60000) >= 10 ? 'text-red-600 animate-pulse bg-red-50' : ''
                              }`}>
                              {getElapsed(order.created_at, now)}
                            </span>
                          </div>

                          {/* 주문자 정보 (이름, 직분, 전화번호) */}
                          <div className="flex flex-col gap-1 mb-5 pb-5 border-b border-gray-50">
                            <div className="flex items-center gap-2">
                              <span className="text-[16px] font-black text-gray-900">{order.user_name_snapshot || '손님'}</span>
                              <span className="text-[11px] bg-gray-100 text-gray-500 font-bold px-1.5 py-0.5 rounded tracking-tighter">
                                {order.user_duty_snapshot}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 text-gray-400">
                              <Phone size={12} />
                              <span className="text-[13px] font-bold tracking-tight">{formatPhone(order.user_phone_snapshot)}</span>
                            </div>
                          </div>

                          {/* 메뉴 리스트 & 옵션 */}
                          <div className="flex flex-col gap-4 mb-5">
                            {order.items.map((item, idx) => (
                              <div key={idx} className="flex flex-col gap-1">
                                <div className="flex items-center justify-between">
                                  <p className="text-[15px] font-black text-gray-800 leading-snug">
                                    {item.menu_name_snapshot} <span className="text-primary text-[13px] ml-1.5 font-black uppercase">x {item.quantity}</span>
                                  </p>
                                </div>
                                <OptionBadges text={item.options_text} />
                              </div>
                            ))}
                          </div>

                          {/* 고객 요청사항 */}
                          {order.request && (
                            <div className="mb-6 p-4 bg-orange-50/50 border border-orange-100 rounded-2xl flex gap-3">
                              <MessageSquare size={16} className="text-orange-500 shrink-0 mt-0.5" />
                              <div className="flex flex-col gap-1">
                                <span className="text-[11px] font-black text-orange-600 uppercase tracking-widest">요청사항</span>
                                <p className="text-[13px] font-bold text-orange-900 leading-relaxed whitespace-pre-wrap">
                                  {order.request}
                                </p>
                              </div>
                            </div>
                          )}

                          {/* 합계 금액 */}
                          <div className="flex items-center justify-between mb-6 pt-1">
                            <span className="text-[11px] text-gray-400 font-bold uppercase tracking-widest">Total Price</span>
                            <p className="text-[19px] font-black text-gray-900 tracking-tight">
                              ₩{order.total_price.toLocaleString()}
                            </p>
                          </div>

                          {/* 상태 변경 버튼 */}
                          <div className="flex gap-3">
                            {order.status === 'PENDING' && (
                              <button
                                onClick={() => handleCancel(order.id)}
                                disabled={isUpdating}
                                className="px-4 py-3 text-[13px] font-bold text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-2xl transition-all"
                              >
                                취소
                              </button>
                            )}
                            {transition && (
                              <button
                                onClick={() => handleStatusChange(order.id, transition.next)}
                                disabled={isUpdating}
                                className={`flex-1 py-4 text-[14px] font-black rounded-2xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 ${transition.color}`}
                              >
                                {isUpdating ? <RefreshCw size={16} className="animate-spin" /> : <CheckCircle size={18} />}
                                {transition.label}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>



      <footer className="bg-[#1A0A0A] px-6 xl:px-10 py-3 xl:py-5 flex items-center justify-between shrink-0 text-white shadow-2xl">
        <div className="flex items-center gap-6 xl:gap-12">
          <div>
            <p className="text-[9px] xl:text-[10px] text-white/40 font-black uppercase tracking-[0.2em] mb-1">Today Orders</p>
            <p className="text-xl xl:text-2xl font-black">{orders.length}<span className="text-[10px] xl:text-xs font-bold text-white/40 ml-1">Orders</span></p>
          </div>
          <div className="w-[1px] h-8 xl:h-10 bg-white/10" />
          <div>
            <p className="text-[9px] xl:text-[10px] text-white/40 font-black uppercase tracking-[0.2em] mb-1">Total Revenue</p>
            <p className="text-xl xl:text-2xl font-black">₩{stats.total_sales.toLocaleString()}</p>
          </div>
          <div className="w-[1px] h-8 xl:h-10 bg-white/10" />
          <div>
            <p className="text-[9px] xl:text-[10px] text-white/40 font-black uppercase tracking-[0.2em] mb-1">Total Orders</p>
            <p className="text-xl xl:text-2xl font-black">{stats.total_orders}<span className="text-[10px] xl:text-xs font-bold text-white/40 ml-1">Total</span></p>
          </div>
        </div>
        <div className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${wsStatus === 'CONNECTED' ? 'bg-white/5' : 'bg-red-500/10'
          }`}>
          <div className={`w-2 h-2 rounded-full ${wsStatus === 'CONNECTED' ? 'bg-green-500 animate-pulse' :
              wsStatus === 'RECONNECTING' ? 'bg-orange-400 animate-pulse' :
                'bg-red-500'
            }`} />
          <span className="text-[11px] font-bold uppercase tracking-widest text-white/60">
            {wsStatus === 'CONNECTED' ? 'Real-time Connected' :
              wsStatus === 'RECONNECTING' ? 'Attempting to Reconnect...' :
                'Disconnected (Auto-Polling Active)'}
          </span>
        </div>
      </footer>
    </div>
  );
};
