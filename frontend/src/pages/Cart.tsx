import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Building2, MessageSquare, ChevronDown } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Button } from '../components/ui/Button';
import { useCart } from '../context/CartContext';
import { apiClient } from '../api/client';
import type { StandardResponse } from '../api/client';

// 백엔드 DutyEnum과 동일하게 유지
const DUTY_OPTIONS = ['학생', '청년', '성도', '집사', '안수집사', '권사', '장로', '사모', '전도사', '강도사', '부목사', '목사'] as const;
type Duty = typeof DUTY_OPTIONS[number];

// 주문자 정보 입력 모달 컴포넌트
const UserInfoModal = ({ onConfirm, onClose }: { onConfirm: (userId: number) => void; onClose: () => void }) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [duty, setDuty] = useState<Duty>('성도');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!name.trim() || !phone.trim()) {
      setError('이름과 전화번호를 입력해 주세요.');
      return;
    }

    setIsLoading(true);
    setError('');
    try {
      // 전화번호로 기존 유저 조회 또는 새 유저 생성
      const response = await apiClient.post<any, StandardResponse<{ id: number; name: string }>>('/users/', {
        name: name.trim(),
        phone: phone.trim().replace(/-/g, ''), // 하이픈 제거
        duty,
      });

      if (response.success && response.data) {
        onConfirm(response.data.id);
      } else {
        setError(response.message || '사용자 등록 중 오류가 발생했습니다.');
      }
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      const message = Array.isArray(detail)
        ? detail.map((d: any) => d.msg).join(', ')
        : detail || '사용자 등록 중 오류가 발생했습니다.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center" onClick={onClose}>
      <div
        className="bg-white w-full max-w-[480px] rounded-t-3xl p-6 pb-10 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 드래그 핸들 */}
        <div className="w-12 h-1 bg-gray-200 rounded-full mx-auto mb-6" />

        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-gray-900">주문자 정보 입력</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-col gap-4">
          {/* 이름 */}
          <div>
            <label className="text-[13px] font-semibold text-gray-600 mb-1.5 block">이름</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="홍길동"
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
            />
          </div>

          {/* 전화번호 */}
          <div>
            <label className="text-[13px] font-semibold text-gray-600 mb-1.5 block">전화번호</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="01012345678"
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
            />
          </div>

          {/* 직분 */}
          <div>
            <label className="text-[13px] font-semibold text-gray-600 mb-1.5 block">직분</label>
            <div className="relative">
              <select
                value={duty}
                onChange={(e) => setDuty(e.target.value as Duty)}
                className="w-full appearance-none bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
              >
                {DUTY_OPTIONS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* 에러 메시지 */}
          {error && (
            <p className="text-[12px] text-primary font-medium bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        <Button
          variant="primary"
          fullWidth
          className="mt-6 h-14 text-base"
          onClick={handleSubmit}
          disabled={isLoading}
        >
          {isLoading ? '확인 중...' : '주문 계속하기'}
        </Button>
      </div>
    </div>
  );
};

export const Cart = () => {
  const navigate = useNavigate();
  const { items, removeItem, updateQuantity, totalPrice, clearCart } = useCart();

  const [requests, setRequests] = useState('');
  const [saveRequest, setSaveRequest] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);

  const discount = 0;
  const finalPrice = totalPrice - discount;

  // 주문 버튼 클릭 → 유저 정보 모달 오픈
  const handleOrderClick = () => {
    if (items.length === 0) return;
    setShowUserModal(true);
  };

  // 유저 확인 완료 → 실제 주문 API 호출
  const handleOrderWithUser = async (userId: number) => {
    setShowUserModal(false);
    setIsSubmitting(true);
    try {
      const orderData = {
        user_id: userId,
        payment_method: 'BANK_TRANSFER',
        total_price: finalPrice,
        items: items.map(item => ({
          menu_id: item.menu_id,
          quantity: item.quantity,
          options_text: item.options_text,
          sub_total: item.sub_total,
        })),
      };

      const response = await apiClient.post<any, StandardResponse<any>>('/orders', orderData);

      if (response.success) {
        clearCart();
        
        // 여러 주문을 추적하기 위해 {id, orderNumber} 객체 배열로 관리
        const existingOrders = JSON.parse(localStorage.getItem('activeOrders') || '[]');
        const newOrder = { id: response.data.id.toString(), orderNumber: response.data.order_number };
        
        // 중복 방지 및 추가
        const updatedOrders = [...existingOrders.filter((o: any) => o.id !== newOrder.id), newOrder];
        localStorage.setItem('activeOrders', JSON.stringify(updatedOrders));
        
        navigate(`/order/status/${response.data.id}`);
      } else {
        alert(response.message || '주문에 실패했습니다.');
      }
    } catch (error: any) {
      const detail = error.response?.data?.detail;
      const message = Array.isArray(detail)
        ? detail.map((d: any) => d.msg).join(', ')
        : detail || '주문 처리 중 오류가 발생했습니다.';
      console.error('Order submission failed:', error.response?.data ?? error);
      alert(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="flex flex-col min-h-screen w-full max-w-[500px] mx-auto bg-white shadow-2xl relative">
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
    <>
      {/* 유저 정보 입력 모달 */}
      {showUserModal && (
        <UserInfoModal
          onConfirm={handleOrderWithUser}
          onClose={() => setShowUserModal(false)}
        />
      )}

      <div className="flex flex-col min-h-screen w-full max-w-[500px] mx-auto bg-[#F9FAFB] pb-32 shadow-2xl relative">
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
                      <div className="w-full h-full bg-[#1A1818]">
                        <img src="https://images.unsplash.com/photo-1559525839-b184a4d698c7?w=100&q=80" alt="coffee" className="w-full h-full object-cover opacity-80" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 flex flex-col pt-0.5">
                    <h3 className="font-bold text-gray-900 text-[14px] mb-1 pr-6">{item.name}</h3>
                    <p className="text-[12px] text-gray-500 leading-tight mb-2">{item.options_text}</p>

                    <div className="flex items-center justify-between mt-auto">
                      <div className="flex items-center bg-gray-50 rounded-lg overflow-hidden border border-gray-100">
                        <button
                          onClick={() => updateQuantity(item.cartItemId, item.quantity - 1)}
                          className="w-7 h-7 flex items-center justify-center text-gray-600 active:bg-gray-200"
                        >-</button>
                        <span className="w-7 text-center text-[13px] font-bold text-gray-800">{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item.cartItemId, item.quantity + 1)}
                          className="w-7 h-7 flex items-center justify-center text-gray-600 active:bg-gray-200"
                        >+</button>
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
              <input type="checkbox" className="hidden" checked={saveRequest} onChange={(e) => setSaveRequest(e.target.checked)} />
            </label>
          </section>

          {/* 결제수단 */}
          <section className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-3">
              <Building2 size={16} className="text-gray-700" />
              <h2 className="font-bold text-[15px] text-gray-900">결제수단</h2>
            </div>
            <div className="flex gap-2">
              <button className="flex-1 py-4 flex flex-col items-center justify-center gap-2 rounded-xl bg-[#2D1616] text-white border border-transparent shadow-sm">
                <Building2 size={20} />
                <span className="text-[12px] font-bold">계좌이체</span>
              </button>
              <button disabled className="flex-1 py-4 flex flex-col items-center justify-center gap-2 rounded-xl bg-[#F3F4F6] text-gray-400 border border-transparent relative opacity-70">
                <div className="absolute top-2 right-2 bg-gray-200 text-gray-500 text-[9px] px-1.5 py-0.5 rounded font-bold">준비 중</div>
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

        {/* 하단 주문 버튼 */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4 w-full max-w-[500px] mx-auto shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
          <Button
            variant="primary"
            fullWidth
            onClick={handleOrderClick}
            disabled={isSubmitting}
            className="text-[16px] h-14"
          >
            {isSubmitting ? '처리 중...' : `${finalPrice.toLocaleString()}원 주문하기`}
          </Button>
        </div>
      </div>
    </>
  );
};

function ShoppingBag(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
      <path d="M3 6h18" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
}
