import { useEffect, useState } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { Menu as MenuIcon, User, CheckCircle2, Coffee, PartyPopper } from 'lucide-react';
import { apiClient } from '../api/client';
import type { StandardResponse } from '../api/client';

export const OrderStatus = () => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // URL state에서 가져오거나 (장바구니에서 막 넘어왔을 때), 없으면 API 호출
  const passedOrderNumber = location.state?.orderNumber;
  const passedTotal = location.state?.total;

  useEffect(() => {
    // 실제로는 웹소켓이나 폴링으로 주문 상태를 주기적으로 업데이트해야 합니다.
    const fetchOrder = async () => {
      try {
        const response = await apiClient.get<any, StandardResponse<any>>(`/orders/${id}`);
        if (response.success) {
          setOrder(response.data);
        }
      } catch (error) {
        console.error('Failed to fetch order', error);
      } finally {
        setLoading(false);
      }
    };
    
    if (id) {
      fetchOrder();
    }
  }, [id]);

  if (loading) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  const orderNumber = order?.order_number || passedOrderNumber || '105';
  const status = order?.status || 'PENDING'; // 'PENDING', 'PAID', 'PREPARING', 'COMPLETED', 'CANCELED'
  
  // 임시 매핑
  const isPending = status === 'PENDING' || status === 'PAID';
  const isPreparing = status === 'PREPARING';
  const isCompleted = status === 'COMPLETED';

  return (
    <div className="flex flex-col min-h-screen bg-[#F9FAFB] pb-8">
      {/* Custom Header for this page */}
      <header className="flex items-center justify-between px-4 h-14 bg-[#F9FAFB]">
        <button className="p-2 -ml-2 text-gray-800">
          <MenuIcon size={24} />
        </button>
        <h1 className="text-lg font-bold tracking-[0.2em] text-[#2D1616]">HOLY ORDER</h1>
        <button className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-white overflow-hidden border border-gray-200 shadow-sm">
          <User size={18} />
        </button>
      </header>

      <main className="flex-1 px-4 py-6 flex flex-col items-center">
        
        {/* Order Number Card */}
        <div className="bg-white w-full max-w-[280px] rounded-3xl shadow-[0_10px_40px_rgba(0,0,0,0.06)] flex flex-col items-center justify-center py-10 mb-8 border border-gray-50">
          <p className="text-gray-500 font-medium tracking-[0.2em] mb-2 text-sm">주문 번호</p>
          <h2 className="text-[80px] font-black text-[#2D1616] leading-none tracking-tighter">
            {orderNumber}
          </h2>
        </div>

        {/* Status Text */}
        <div className="text-center mb-10">
          <h3 className="text-[22px] font-bold text-[#2D1616] mb-3 tracking-tight">
            {isCompleted ? '메뉴가 준비되었습니다!' : isPreparing ? '맛있게 만들고 있어요!' : '주문이 접수되었습니다!'}
          </h3>
          <div className="inline-flex items-center gap-2 bg-gray-200/50 px-4 py-2 rounded-full">
            <div className="w-2 h-2 rounded-full bg-primary/60 animate-pulse" />
            <span className="text-gray-600 font-medium text-sm tracking-tight">내 앞에 3팀이 대기 중이에요</span>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="w-full max-w-[320px] flex justify-between items-center relative mb-12 px-2">
          {/* Connecting Line */}
          <div className="absolute top-1/2 left-6 right-6 h-0.5 bg-gray-200 -z-10 -translate-y-1/2"></div>
          <div className="absolute top-1/2 left-6 h-0.5 bg-primary -z-10 -translate-y-1/2 transition-all duration-500" style={{ width: isCompleted ? '100%' : isPreparing ? '50%' : '0%' }}></div>

          {/* Step 1 */}
          <div className="flex flex-col items-center gap-2 relative bg-[#F9FAFB]">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center z-10 ${isPending || isPreparing || isCompleted ? 'bg-[#2D1616] text-white shadow-md' : 'bg-gray-100 text-gray-400'}`}>
              <CheckCircle2 size={20} />
            </div>
            <span className={`text-[11px] font-bold ${isPending || isPreparing || isCompleted ? 'text-[#2D1616]' : 'text-gray-400'}`}>주문 완료</span>
          </div>

          {/* Step 2 */}
          <div className="flex flex-col items-center gap-2 relative bg-[#F9FAFB]">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center z-10 ${isPreparing ? 'bg-primary text-white shadow-[0_0_15px_rgba(255,75,75,0.4)]' : isCompleted ? 'bg-[#2D1616] text-white shadow-md' : 'bg-gray-100 text-gray-400 border border-gray-200'}`}>
              <Coffee size={20} />
            </div>
            <span className={`text-[11px] font-bold ${isPreparing ? 'text-primary' : isCompleted ? 'text-[#2D1616]' : 'text-gray-400'}`}>준비 중</span>
          </div>

          {/* Step 3 */}
          <div className="flex flex-col items-center gap-2 relative bg-[#F9FAFB]">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center z-10 ${isCompleted ? 'bg-primary text-white shadow-[0_0_15px_rgba(255,75,75,0.4)]' : 'bg-gray-100 text-gray-400 border border-gray-200'}`}>
              <PartyPopper size={20} />
            </div>
            <span className={`text-[11px] font-bold ${isCompleted ? 'text-primary' : 'text-gray-400'}`}>준비 완료</span>
          </div>
        </div>

        {/* Order Summary */}
        <div className="w-full bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-4">
          <div className="flex justify-between items-center mb-4 pb-4 border-b border-gray-50">
            <h4 className="font-bold text-gray-900 text-sm tracking-[0.2em]">주문 내역 요약</h4>
            <div className="text-gray-400">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17V7"/></svg>
            </div>
          </div>
          
          <div className="flex gap-4 items-center mb-6">
            <div className="w-16 h-16 rounded-xl overflow-hidden bg-gray-100 shrink-0">
              <div className="w-full h-full bg-[#1A1818] flex items-center justify-center">
                <img src="https://images.unsplash.com/photo-1559525839-b184a4d698c7?w=100&q=80" alt="coffee" className="w-full h-full object-cover opacity-80" />
              </div>
            </div>
            <div>
              <h5 className="font-bold text-[#2D1616] text-[15px] mb-1">
                {order?.items?.[0]?.menu?.name || '메뉴명'} {order?.items?.length > 1 ? `외 ${order?.items?.length - 1}건` : ''}
              </h5>
              <p className="text-gray-500 text-[13px] font-medium">수량: {order?.items?.reduce((acc: number, item: any) => acc + item.quantity, 0) || 1}</p>
            </div>
          </div>

          <div className="flex justify-between items-center pt-4 border-t border-gray-50">
            <span className="text-gray-500 text-[13px] font-medium">총 결제 금액</span>
            <span className="font-black text-[17px] text-[#2D1616]">
              {(order?.total_price || passedTotal || 4500).toLocaleString()} KRW
            </span>
          </div>
        </div>

        {/* Notification Alert */}
        <div className="w-full bg-gray-100/80 rounded-2xl p-4 flex gap-4 items-start">
          <div className="bg-white p-2 rounded-xl shadow-sm shrink-0">
            <div className="text-primary animate-pulse">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/></svg>
            </div>
          </div>
          <div>
            <h5 className="font-bold text-gray-900 text-[13px] mb-1">진동 및 사운드 알림</h5>
            <p className="text-gray-500 text-[11px] leading-relaxed">
              음료가 준비되면 진동과 함께 알림을 드립니다.<br/>
              원활한 수령을 위해 화면을 끄지 마세요.
            </p>
          </div>
        </div>

      </main>
    </div>
  );
};
