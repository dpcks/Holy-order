import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Building2, MessageSquare } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Button } from '../components/ui/Button';
import { useCart } from '../context/CartContext';
import { apiClient } from '../api/client';
import type { StandardResponse } from '../api/client';

export const Cart = () => {
  const navigate = useNavigate();
  const { items, removeItem, updateQuantity, totalPrice, clearCart } = useCart();
  
  const [requests, setRequests] = useState('');
  const [saveRequest, setSaveRequest] = useState(false);
  const [paymentMethod] = useState<'bank-transfer'>('bank-transfer');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const discount = 0;
  const finalPrice = totalPrice - discount;

  const handleOrder = async () => {
    if (items.length === 0) return;
    
    setIsSubmitting(true);
    try {
      const orderData = {
        user_id: 1, // TODO: 실제 로그인된 유저 ID로 교체 필요
        items: items.map(item => ({
          menu_id: item.menu_id,
          quantity: item.quantity,
          options_text: item.options_text
        })),
        requests: requests || null,
        payment_method: paymentMethod
      };

      const response = await apiClient.post<any, StandardResponse<any>>('/orders/', orderData);
      
      if (response.success) {
        clearCart();
        // 주문 완료 페이지로 이동 (주문 번호 전달)
        navigate(`/order/status/${response.data.id}`, { state: { orderNumber: response.data.order_number, total: finalPrice } });
      } else {
        alert(response.message || '주문에 실패했습니다.');
      }
    } catch (error: any) {
      console.error('Order submission failed:', error);
      alert(error.response?.data?.message || '주문 처리 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="flex flex-col min-h-screen bg-[#F9FAFB]">
        <Header title="장바구니" showBack showCart={false} />
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4 text-gray-400">
            <ShoppingBag size={32} />
          </div>
          <p className="text-gray-500 font-medium mb-6">장바구니가 비어있습니다.</p>
          <Button onClick={() => navigate('/')}>메뉴 보러가기</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#F9FAFB] pb-32">
      <Header 
        title={
          <div className="flex flex-col items-center">
            <span className="font-bold text-lg">주문하기</span>
            <span className="text-[11px] text-gray-500 font-normal">평택중앙교회</span>
          </div> as any
        } 
        showBack 
        showCart 
      />

      <main className="flex-1 p-4 flex flex-col gap-4">
        
        {/* 장바구니 리스트 */}
        <section className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-bold text-[15px] text-gray-900">장바구니</h2>
            <span className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
              {items.length}개 상품
            </span>
          </div>

          <div className="flex flex-col gap-4">
            {items.map((item) => (
              <div key={item.cartItemId} className="flex gap-3 pb-4 border-b border-gray-50 last:border-0 last:pb-0 relative">
                <button 
                  onClick={() => removeItem(item.cartItemId)}
                  className="absolute top-0 right-0 p-1 text-gray-300 hover:text-gray-500"
                >
                  <X size={16} />
                </button>
                
                <div className="w-[72px] h-[72px] rounded-xl overflow-hidden bg-gray-100 shrink-0">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-[#1A1818] flex items-center justify-center">
                      <img src="https://images.unsplash.com/photo-1559525839-b184a4d698c7?w=100&q=80" alt="coffee placeholder" className="w-full h-full object-cover opacity-80" />
                    </div>
                  )}
                </div>
                
                <div className="flex-1 flex flex-col pt-0.5">
                  <h3 className="font-bold text-gray-900 text-[14px] mb-1 pr-6">{item.name}</h3>
                  <p className="text-[12px] text-gray-500 leading-tight mb-2">
                    {item.options_text}
                  </p>
                  
                  <div className="flex items-center justify-between mt-auto">
                    <div className="flex items-center bg-gray-50 rounded-lg overflow-hidden border border-gray-100">
                      <button 
                        onClick={() => updateQuantity(item.cartItemId, item.quantity - 1)}
                        className="w-7 h-7 flex items-center justify-center text-gray-600 active:bg-gray-200"
                      >
                        -
                      </button>
                      <span className="w-7 text-center text-[13px] font-bold text-gray-800">{item.quantity}</span>
                      <button 
                        onClick={() => updateQuantity(item.cartItemId, item.quantity + 1)}
                        className="w-7 h-7 flex items-center justify-center text-gray-600 active:bg-gray-200"
                      >
                        +
                      </button>
                    </div>
                    <span className="font-bold text-gray-900 text-[15px]">
                      {item.sub_total.toLocaleString()}원
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 요청사항 */}
        <section className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare size={16} className="text-gray-700" />
            <h2 className="font-bold text-[15px] text-gray-900">요청사항</h2>
          </div>
          <textarea
            value={requests}
            onChange={(e) => setRequests(e.target.value)}
            placeholder="매장에 전달할 메시지를 입력해 주세요."
            className="w-full bg-[#F3F4F6] rounded-xl p-3 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-primary/30 resize-none h-20"
          />
          <label className="flex items-center gap-2 mt-3 cursor-pointer">
            <div className={`w-5 h-5 rounded flex items-center justify-center border ${saveRequest ? 'bg-primary border-primary' : 'border-gray-300'}`}>
              {saveRequest && <div className="w-2.5 h-2.5 bg-white rounded-sm" />}
            </div>
            <span className="text-[13px] text-gray-700 font-medium">다음에도 사용</span>
            <input 
              type="checkbox" 
              className="hidden" 
              checked={saveRequest} 
              onChange={(e) => setSaveRequest(e.target.checked)} 
            />
          </label>
        </section>

        {/* 결제수단 */}
        <section className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-3">
            <Building2 size={16} className="text-gray-700" />
            <h2 className="font-bold text-[15px] text-gray-900">결제수단</h2>
          </div>
          <div className="flex gap-2">
            <button 
              className="flex-1 py-4 flex flex-col items-center justify-center gap-2 rounded-xl bg-[#2D1616] text-white border border-transparent shadow-sm"
            >
              <Building2 size={20} />
              <span className="text-[12px] font-bold">계좌이체</span>
            </button>
            <button 
              disabled
              className="flex-1 py-4 flex flex-col items-center justify-center gap-2 rounded-xl bg-[#F3F4F6] text-gray-400 border border-transparent relative opacity-70"
            >
              <div className="absolute top-2 right-2 bg-gray-200 text-gray-500 text-[9px] px-1.5 py-0.5 rounded font-bold">
                준비 중
              </div>
              <MessageSquare size={20} />
              <span className="text-[12px] font-bold">카카오페이</span>
            </button>
          </div>
        </section>

        {/* 결제 요약 */}
        <section className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[13px] text-gray-500 font-medium">상품금액</span>
            <span className="text-[13px] font-semibold text-gray-800">{totalPrice.toLocaleString()}원</span>
          </div>
          <div className="flex justify-between items-center mb-4 pb-4 border-b border-gray-100">
            <span className="text-[13px] text-gray-500 font-medium">할인금액</span>
            <span className="text-[13px] font-semibold text-gray-800">-0원</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[14px] font-bold text-gray-900">최종 결제 금액</span>
            <span className="text-lg font-bold text-primary">{finalPrice.toLocaleString()}원</span>
          </div>
        </section>
        
      </main>

      {/* Bottom Sticky Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4 max-w-480px mx-auto shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
        <Button 
          variant="primary" 
          fullWidth 
          onClick={handleOrder}
          disabled={isSubmitting}
          className="text-[16px] h-14"
        >
          {isSubmitting ? '처리 중...' : `${finalPrice.toLocaleString()}원 주문하기`}
        </Button>
      </div>
    </div>
  );
};

function ShoppingBag(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
      <path d="M3 6h18" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  )
}
