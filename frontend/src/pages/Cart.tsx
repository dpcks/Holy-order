import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Building2, MessageSquare, ChevronDown, Wallet } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Button } from '../components/ui/Button';
import { useCart } from '../context/CartContext';
import { Toast } from '../components/ui/Toast';
import type { ToastType } from '../components/ui/Toast';
import { apiClient } from '../api/client';
import type { Duty, StandardResponse, PaymentMethod, Announcement, SettingResponse } from '../types';

// 백엔드 DutyEnum과 동일하게 유지
const DUTY_OPTIONS: Duty[] = ['학생', '청년', '성도', '집사', '안수집사', '권사', '장로', '사모', '전도사', '강도사', '부목사', '목사'];

// 주문자 정보 입력 모달 컴포넌트
const UserInfoModal = ({ onConfirm, onClose, requirePhone = true }: { onConfirm: (userId: number) => void; onClose: () => void; requirePhone?: boolean }) => {
  // 저장된 정보가 있으면 초기값으로 사용
  const savedUser = JSON.parse(localStorage.getItem('userInfo') || '{}');
  const [name, setName] = useState(savedUser.name || '');
  const [phone, setPhone] = useState(savedUser.phone || '');
  const [duty, setDuty] = useState<Duty>(savedUser.duty || '성도');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('이름을 입력해 주세요.');
      return;
    }

    if (requirePhone && !phone.trim()) {
      setError('전화번호를 입력해 주세요.');
      return;
    }

    setIsLoading(true);
    setError('');
    try {
      // 필수 설정이 꺼져 있으면 전화번호를 보내지 않음
      const phoneToSubmit = requirePhone && phone.trim() 
        ? phone.trim().replace(/-/g, '') 
        : null;

      // 전화번호로 기존 유저 조회 또는 새 유저 생성
      const response = await apiClient.post<any, StandardResponse<{ id: number; name: string }>>('/users/', {
        name: name.trim(),
        phone: phoneToSubmit,
        duty,
      });

      if (response.success && response.data) {
        // ID뿐만 아니라 전체 정보를 저장하여 다음 주문 시 자동완성 지원
        localStorage.setItem('userInfo', JSON.stringify({
          id: response.data.id,
          name: name.trim(),
          phone: phone.trim(),
          duty,
        }));
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
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
            />
          </div>

          {/* 전화번호 - 필수 설정일 때만 표시 */}
          {requirePhone && (
            <div>
              <label className="text-[13px] font-semibold text-gray-600 mb-1.5 block">전화번호</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="01012345678"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
              />
            </div>
          )}

          {/* 직분 */}
          <div>
            <label className="text-[13px] font-semibold text-gray-600 mb-1.5 block">직분</label>
            <div className="relative">
              <select
                value={duty}
                onChange={(e) => setDuty(e.target.value as Duty)}
                className="w-full appearance-none bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
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
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('BANK_TRANSFER');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);

  // 토스트 상태
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const [settings, setSettings] = useState<SettingResponse | null>(null);

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type });
  };

  const discount = 0;
  const finalPrice = totalPrice - discount;

  // 이벤트 모드 상태 조회
  const [activeEvent, setActiveEvent] = useState<Announcement | null>(null);
  const isEventMode = !!activeEvent?.is_event_mode;
  // 이벤트 모드일 때는 최종 결제 금액을 0원으로 처리
  const eventFinalPrice = isEventMode ? 0 : finalPrice;

  useEffect(() => {
    const fetchEvent = async () => {
      try {
        const [eventRes, settingsRes] = await Promise.all([
          apiClient.get<Announcement | null, StandardResponse<Announcement | null>>('/announcements/active'),
          apiClient.get<SettingResponse, StandardResponse<SettingResponse>>('/settings')
        ]);
        
        if (eventRes.success && eventRes.data) setActiveEvent(eventRes.data);
        if (settingsRes.success && settingsRes.data) setSettings(settingsRes.data);
      } catch (err) {
        console.warn('정보를 불러오지 못했습니다.', err);
      }
    };
    fetchEvent();
  }, []);

  // 주문 버튼 클릭 → 사용자 정보 확인을 위해 항상 모달 오픈
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
        payment_method: paymentMethod,
        total_price: eventFinalPrice,
        request: requests.trim() || null,
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

        // 내 정보 저장 (이미 UserInfoModal에서 저장하지만, 여기서도 최신 상태를 유지하도록 확인)
        const savedUser = JSON.parse(localStorage.getItem('userInfo') || '{}');
        localStorage.setItem('userInfo', JSON.stringify({
          ...savedUser,
          id: userId,
        }));

        // 여러 주문을 추적하기 위해 {id, orderNumber} 객체 배열로 관리
        const existingOrders = JSON.parse(localStorage.getItem('activeOrders') || '[]');
        const newOrder = { id: String(response.data.id), orderNumber: response.data.order_number };

        // 중복 방지 및 추가 (타입 안정성을 위해 String으로 비교)
        const updatedOrders = [...existingOrders.filter((o: any) => String(o.id) !== String(newOrder.id)), newOrder];
        localStorage.setItem('activeOrders', JSON.stringify(updatedOrders));

        navigate(`/order/status/${response.data.id}`, {
          state: { orderNumber: response.data.order_number, total: eventFinalPrice }
        });
      } else {
        showToast(response.message || '주문에 실패했습니다.', 'error');
      }
    } catch (error: any) {
      const detail = error.response?.data?.detail;
      const message = Array.isArray(detail)
        ? detail.map((d: any) => d.msg).join(', ')
        : detail || '주문 처리 중 오류가 발생했습니다.';
      console.error('Order submission failed:', error.response?.data ?? error);
      showToast(message, 'error');
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
          requirePhone={settings?.require_phone ?? true}
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

          {/* 이벤트 안내 배너 */}
          {isEventMode && (
            <section className="bg-gradient-to-r from-amber-400 to-orange-500 rounded-2xl p-4 text-white shadow-md animate-in slide-in-from-top-2">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-2 rounded-xl">
                  <span className="text-xl">🎁</span>
                </div>
                <div>
                  <p className="text-[14px] font-black leading-tight">섬김의 시간 안내</p>
                  <p className="text-[11px] opacity-90 font-bold mt-0.5">장바구니에 담긴 모든 메뉴가 무료로 제공됩니다.</p>
                </div>
              </div>
            </section>
          )}

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
              className="w-full bg-[#F3F4F6] rounded-xl p-3 text-base text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-primary/30 resize-none h-20"
            />
          </section>

          {/* 결제수단 / 이벤트 안내 카드 */}
          <section className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-3">
              <Building2 size={16} className="text-gray-700" />
              <h2 className="font-bold text-[15px] text-gray-900">{isEventMode ? '주문 안내' : '결제수단'}</h2>
            </div>

            {isEventMode ? (
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                <p className="text-[13px] font-bold text-amber-800 leading-relaxed break-keep">
                  오늘은 <span className="text-orange-600 font-black">{activeEvent.sponsor_name} {activeEvent.sponsor_duty || ''}</span>께서 섬겨주십니다.<br />감사인사 나눠주세용~ ❤️
                </p>
                {activeEvent?.sponsor_name && (
                  <p className="text-[11px] text-amber-600 font-bold mt-2 pt-2 border-t border-amber-200/50">
                    후원: {activeEvent.sponsor_name} {activeEvent.sponsor_duty || ''}
                  </p>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setPaymentMethod('BANK_TRANSFER')}
                  className={`py-4 flex flex-col items-center justify-center gap-2 rounded-xl transition-all border ${paymentMethod === 'BANK_TRANSFER'
                    ? 'bg-[#2D1616] text-white border-transparent shadow-md'
                    : 'bg-white text-gray-400 border-gray-100 hover:bg-gray-50'
                    }`}
                >
                  <Building2 size={20} />
                  <span className="text-[12px] font-bold">계좌이체</span>
                </button>
                <button
                  onClick={() => setPaymentMethod('CASH')}
                  className={`py-4 flex flex-col items-center justify-center gap-2 rounded-xl transition-all border ${paymentMethod === 'CASH'
                    ? 'bg-[#2D1616] text-white border-transparent shadow-md'
                    : 'bg-white text-gray-400 border-gray-100 hover:bg-gray-50'
                    }`}
                >
                  <Wallet size={20} />
                  <span className="text-[12px] font-bold">현금 결제</span>
                </button>
                {/* 
                <button
                  disabled
                  className="py-4 flex flex-col items-center justify-center gap-2 rounded-xl bg-gray-50 text-gray-300 border border-gray-100 relative opacity-60 cursor-not-allowed"
                >
                  <div className="absolute top-1 right-1 bg-gray-200 text-gray-500 text-[8px] px-1 py-0.5 rounded font-bold scale-90">준비중</div>
                  <MessageSquare size={20} />
                  <span className="text-[12px] font-bold text-gray-300">카카오페이</span>
                </button>
                */}
              </div>
            )}
          </section>

          {/* 결제 요약 */}
          <section className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-4">
            <div className="flex justify-between items-center mb-3">
              <span className="text-[14px] text-gray-500 font-medium">상품금액</span>
              <span className="text-[14px] font-bold text-gray-800">{totalPrice.toLocaleString()}원</span>
            </div>

            {isEventMode ? (
              <div className="flex justify-between items-center mb-5 pb-5 border-b border-dashed border-gray-200">
                <span className="text-[14px] text-amber-600 font-extrabold flex items-center gap-1.5">
                  <span className="text-base">🎉</span> 이벤트 할인
                </span>
                <span className="text-[14px] font-black text-amber-600">-{totalPrice.toLocaleString()}원</span>
              </div>
            ) : (
              <div className="flex justify-between items-center mb-5 pb-5 border-b border-gray-100">
                <span className="text-[14px] text-gray-500 font-medium">할인금액</span>
                <span className="text-[14px] font-semibold text-gray-800">-0원</span>
              </div>
            )}

            <div className="flex justify-between items-end">
              <span className="text-[15px] font-black text-gray-900 mb-1">최종 결제 금액</span>
              <div className="text-right">
                {isEventMode && (
                  <div className="text-[13px] text-gray-400 line-through font-bold mb-0.5">
                    {totalPrice.toLocaleString()}원
                  </div>
                )}
                <div className="flex items-center justify-end gap-2">
                  <span className={`text-2xl font-black ${isEventMode ? 'text-amber-600' : 'text-primary'}`}>
                    {eventFinalPrice.toLocaleString()}원
                  </span>
                </div>
              </div>
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
            {isSubmitting ? '처리 중...' : isEventMode ? '무료 주문하기 🎉' : `${finalPrice.toLocaleString()}원 주문하기`}
          </Button>
        </div>

        {/* 토스트 알림 */}
        <Toast
          message={toast?.message || ''}
          type={toast?.type}
          isVisible={!!toast}
          onClose={() => setToast(null)}
        />
      </div>
    </>
  );
};

function ShoppingBag({ size = 24, ...props }: React.SVGProps<SVGSVGElement> & { size?: number | string }) {
  return (
    <svg
      {...props}
      width={size}
      height={size}
      xmlns="http://www.w3.org/2000/svg"
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
  );
}
