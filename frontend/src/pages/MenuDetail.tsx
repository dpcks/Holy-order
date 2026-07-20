import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Gift } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Button } from '../components/ui/Button';
import { QuantitySelector } from '../components/ui/QuantitySelector';
import { useCart } from '../context/CartContext';
import { Toast } from '../components/ui/Toast';
import type { ToastType } from '../components/ui/Toast';
import type { Menu, MenuOption, SettingResponse, StandardResponse } from '../types';
import { apiClient } from '../api/client';
import { useEffect } from 'react';

// ICE/HOT 옵션인지 판별하는 상수 - 백엔드 name 값 기준
const TEMP_OPTION_NAMES = ['ICE', 'HOT'];
// 컵 종류 옵션인지 판별하는 상수 - 백엔드 name 값 기준
const CUP_OPTION_NAMES = ['텀블러', '일회용컵'];
// 텀블러 선택 시 적용되는 고정 할인 금액 (원)
const TUMBLER_DISCOUNT = 500;

export const MenuDetail = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { menu, isEventMode = false } = location.state as { menu: Menu; isEventMode?: boolean };

  const { addItem } = useCart();

  const [quantity, setQuantity] = useState(1);

  // 토스트 상태
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  
  // 설정 상태
  const [settings, setSettings] = useState<SettingResponse | null>(null);
  const showPrice = settings?.show_price ?? true;

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type });
  };

  useEffect(() => {
    const checkStoreStatus = async () => {
      try {
        const res = await apiClient.get<SettingResponse, StandardResponse<SettingResponse>>('/settings');
        if (res.success && res.data) {
          setSettings(res.data);
          if (!res.data.is_open) {
            navigate('/', { replace: true });
          }
        }
      } catch (err) {
        console.warn('설정 정보를 불러오지 못했습니다.', err);
      }
    };
    checkStoreStatus();
  }, [navigate]);

  // ────────────────────────────────────────────────────────────────
  // [동적 매핑] 백엔드에서 받은 options 배열을 name 기준으로 그룹화
  // 하드코딩 없이 백엔드 데이터 변경만으로 UI가 자동으로 업데이트됨
  // ────────────────────────────────────────────────────────────────
  const tempOptions = menu.options.filter(o => TEMP_OPTION_NAMES.includes(o.name));
  const cupOptions = menu.options.filter(o => CUP_OPTION_NAMES.includes(o.name));

  // 위 두 그룹에 해당하지 않는 나머지는 '추가 옵션'으로 분류
  const extraOptions = menu.options.filter(
    o => !TEMP_OPTION_NAMES.includes(o.name) && !CUP_OPTION_NAMES.includes(o.name)
  );

  const sortedTempOptions = [...tempOptions].sort((a, b) => {
    if (a.name === 'ICE') return -1;
    if (b.name === 'ICE') return 1;
    return 0;
  });

  const sortedCupOptions = [...cupOptions].sort((a, b) => {
    if (a.name === '일회용컵') return -1;
    if (b.name === '일회용컵') return 1;
    return 0;
  });

  // 선택된 옵션 상태 (단일 선택) - ICE가 있으면 기본값으로 설정
  const [selectedTemp, setSelectedTemp] = useState<MenuOption | null>(
    tempOptions.find(o => o.name === 'ICE') || (tempOptions.length > 0 ? tempOptions[0] : null)
  );
  const [selectedCup, setSelectedCup] = useState<MenuOption | null>(
    cupOptions.find(o => o.name === '일회용컵') || (cupOptions.length > 0 ? cupOptions[0] : null)
  );

  // 추가 옵션 (다중 선택 가능)
  const [selectedExtras, setSelectedExtras] = useState<MenuOption[]>([]);

  const handleToggleExtra = (option: MenuOption) => {
    setSelectedExtras(prev =>
      prev.some(p => p.id === option.id)
        ? prev.filter(p => p.id !== option.id)
        : [...prev, option]
    );
  };

  // ────────────────────────────────────────────────────────────────
  // 총액 계산 - 선택된 모든 옵션의 extra_price를 합산
  // 텀블러 선택 시 TUMBLER_DISCOUNT(500원)를 추가로 차감한다.
  // extra_price와 별도로 관리하여 백엔드 데이터와 독립적으로 유지
  // ────────────────────────────────────────────────────────────────
  const isTumblerSelected = selectedCup?.name === '텀블러';
  const tumblerDiscount = isTumblerSelected ? TUMBLER_DISCOUNT : 0;

  const extraPriceSum =
    (selectedTemp?.extra_price ?? 0) +
    (selectedCup?.extra_price ?? 0) +
    selectedExtras.reduce((sum, opt) => sum + opt.extra_price, 0);

  // 원가(할인 전) 단가: 장바구니에 저장될 기준 단가
  const originalUnitPrice = menu.price + extraPriceSum;
  // 실제 결제 단가: 텀블러 할인 적용
  const unitPrice = Math.max(0, originalUnitPrice - tumblerDiscount);
  // 실제 결제 총액 (할인 후)
  const totalPrice = unitPrice * quantity;

  const handleAddToCart = (shouldNavigate = true) => {
    // 혹시 모를 품절 재확인 (state가 stale할 경우 대비)
    if (!menu.is_available) {
      showToast('현재 품절된 메뉴입니다.', 'error');
      return;
    }

    // 선택된 옵션들을 '/' 구분자로 이어붙여 텍스트 요약 생성
    const optionsTextParts: string[] = [];
    if (selectedTemp) optionsTextParts.push(selectedTemp.name);
    if (selectedCup) optionsTextParts.push(selectedCup.name);
    if (selectedExtras.length > 0) {
      optionsTextParts.push(selectedExtras.map(o => o.name).join(', '));
    }

    addItem({
      menu_id: menu.id,
      name: menu.name,
      image_url: menu.image_url || undefined,
      quantity,
      // price/sub_total은 원가(할인 전) 기준 저장 → Cart에서 할인을 분리 표시하기 위함
      price: originalUnitPrice,
      sub_total: originalUnitPrice * quantity,
      // 텀블러 할인은 단가 기준으로 저장 (quantity는 CartContext에서 걱은)
      tumbler_discount: tumblerDiscount,
      options_text: optionsTextParts.join(' / ') || null,
    });

    if (shouldNavigate) {
      navigate(-1);
    } else {
      showToast('장바구니에 담겼습니다.', 'success');
    }
  };

  const handleOrderNow = () => {
    if (!menu.is_available) {
      showToast('현재 품절된 메뉴입니다.', 'error');
      return;
    }
    handleAddToCart(false); // 바로 주문 시에는 뒤로 가지 않고
    setTimeout(() => navigate('/cart'), 500); // 토스트를 보여주기 위해 약간의 지연
  };

  return (
    <div className="flex flex-col min-h-screen w-full max-w-[500px] mx-auto bg-white pb-48 shadow-2xl relative">
      <Header title="메뉴상세" showBack showCart />

      <main className="flex-1">
        {/* 이벤트 안내 배너 (상세 페이지용) */}
        {isEventMode && (
          <div className="mx-4 mt-4 bg-gradient-to-r from-amber-400 to-orange-500 rounded-2xl p-4 text-white shadow-md animate-in slide-in-from-top-2">
            <div className="flex items-center gap-3">
              <div className="bg-white/20 p-2 rounded-xl">
                <Gift size={18} className="text-white" />
              </div>
              <p className="text-[13px] font-black leading-tight">
                섬김의 시간<br />
                <span className="text-[11px] opacity-90 font-bold">모든 메뉴와 옵션이 무료로 제공됩니다 🎁</span>
              </p>
            </div>
          </div>
        )}

        {/* 상단 메뉴 이미지 */}
        <div className="px-4 py-4">
          <div className="relative w-full aspect-[4/3] rounded-3xl overflow-hidden shadow-lg bg-[#0F0A0A]">
            {menu.image_url ? (
              <img
                src={menu.image_url}
                alt={menu.name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = "https://images.unsplash.com/photo-1559525839-b184a4d698c7?w=800&q=80";
                  e.currentTarget.classList.add('opacity-70');
                }}
              />
            ) : (
              <img
                src="https://images.unsplash.com/photo-1559525839-b184a4d698c7?w=800&q=80"
                alt="coffee"
                className="w-full h-full object-cover opacity-70"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
            <div className="absolute bottom-6 left-6 pr-6">
              <h2 className="text-white text-3xl font-bold mb-1">
                {menu.name}
              </h2>
              {menu.description && (
                <p className="text-white/70 text-[13px] font-medium leading-relaxed mt-2 line-clamp-2">
                  {menu.description}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* 옵션 선택 섹션 */}
        <div className="px-4 py-4 pb-32 flex flex-col gap-8">

          {/* ICE & HOT - 백엔드에서 해당 옵션이 있을 때만 렌더링 */}
          {tempOptions.length > 0 && (
            <div className="flex flex-col gap-3">
              <h3 className="font-bold text-gray-900 text-[15px]">ICE&HOT</h3>
              <div className="flex bg-[#F3F4F6] rounded-full p-1 border border-gray-100 shadow-inner">
                {sortedTempOptions.map((opt) => {
                  const isSelected = selectedTemp?.id === opt.id;
                  const isIce = opt.name === 'ICE';
                  return (
                    <button
                      key={opt.id}
                      onClick={() => setSelectedTemp(opt)}
                      className={`flex-1 py-3 text-[15px] font-black rounded-full transition-all duration-300 tracking-wider ${isSelected
                        ? isIce
                          ? 'bg-blue-500 text-white shadow-[0_4px_12px_rgba(59,130,246,0.3)] scale-[1.02]'
                          : 'bg-red-500 text-white shadow-[0_4px_12px_rgba(239,68,68,0.3)] scale-[1.02]'
                        : 'text-gray-400 hover:text-gray-600 hover:bg-gray-200/50'
                        }`}
                    >
                      {opt.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 컵 선택 - 백엔드에서 해당 옵션이 있을 때만 렌더링 */}
          {cupOptions.length > 0 && (
            <div className="flex flex-col gap-3">
              <h3 className="font-bold text-gray-900 text-[15px]">컵 선택</h3>
              <div className="flex bg-[#F3F4F6] rounded-xl p-1 gap-1">
                {sortedCupOptions.map((opt) => {
                  const isSelected = selectedCup?.id === opt.id;
                  const isTumbler = opt.name === '텀블러';
                  return (
                    <button
                      key={opt.id}
                      onClick={() => setSelectedCup(opt)}
                      className={`relative flex-1 flex flex-col items-center justify-center py-3 rounded-lg transition-all ${isSelected
                        ? 'bg-[#2D1616] text-white shadow-md'
                        : 'text-gray-600 hover:bg-gray-200'
                        }`}
                    >
                      <span className="text-[13px] font-bold leading-tight">{opt.name}</span>
                      {/* 텀블러 전용 할인 배지 - 버튼 우상단 절대 위치 */}
                      {isTumbler && showPrice && (
                        <span
                          className={`absolute -top-2 -right-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-black tracking-tight shadow-sm transition-all ${isSelected
                            ? 'bg-emerald-400 text-[#0d3321]'
                            : 'bg-emerald-100 text-emerald-700'
                            }`}
                        >
                          -{TUMBLER_DISCOUNT.toLocaleString()}원
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 추가 옵션 (샷 추가 등 나머지) - 있을 때만 렌더링 */}
          {extraOptions.length > 0 && (
            <div className="flex flex-col gap-3">
              <h3 className="font-bold text-gray-900 text-[15px]">추가 옵션</h3>
              <div className="flex flex-col gap-2">
                {extraOptions.map((opt) => {
                  const isSelected = selectedExtras.some(p => p.id === opt.id);
                  return (
                    <button
                      key={opt.id}
                      onClick={() => handleToggleExtra(opt)}
                      className={`flex items-center justify-between p-4 rounded-xl border transition-all ${isSelected
                        ? 'border-primary bg-red-50/30'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                        }`}
                    >
                      <span className={`font-semibold text-sm ${isSelected ? 'text-primary' : 'text-gray-800'}`}>
                        {opt.name}
                      </span>
                      {opt.extra_price > 0 && !isEventMode && showPrice && (
                        <span className="text-gray-500 text-sm font-medium">
                          +{opt.extra_price.toLocaleString()}원
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* 여백 확보용 스페이서 - 하단 고정 탭바 높이보다 더 여유있게 확보 */}
        <div className="h-40 w-full" />
      </main>

      {/* 하단 Sticky 주문 바 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4 max-w-[500px] mx-auto shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-50">
        {!menu.is_available ? (
          <div className="flex flex-col gap-3">
            <div className="bg-gray-100 text-gray-500 py-4 rounded-2xl text-center font-bold text-sm">
              현재 품절된 메뉴입니다
            </div>
            <Button variant="secondary" className="w-full" onClick={() => navigate(-1)}>
              다른 메뉴 보기
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <QuantitySelector
                quantity={quantity}
                onIncrease={() => setQuantity(q => q + 1)}
                onDecrease={() => setQuantity(q => q - 1)}
              />
              <div className="text-right">
                {showPrice ? (
                  <>
                    <p className="text-[11px] text-gray-500 font-medium mb-0.5">총 주문 금액</p>
                    {isEventMode ? (
                      <div className="flex items-center gap-1.5 justify-end">
                        <span className="text-[14px] text-gray-400 line-through font-medium">{totalPrice.toLocaleString()}원</span>
                        <span className="text-xl font-black text-amber-600">0원</span>
                      </div>
                    ) : isTumblerSelected ? (
                      <div className="flex flex-col items-end gap-0.5">
                        <div className="flex items-center gap-1">
                          <span className="text-[11px] bg-emerald-100 text-emerald-700 font-black px-1.5 py-0.5 rounded-full">
                            텀블러 -{(tumblerDiscount * quantity).toLocaleString()}원
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[13px] text-gray-400 line-through font-medium">
                            {((unitPrice + tumblerDiscount) * quantity).toLocaleString()}원
                          </span>
                          <span className="text-xl font-black text-emerald-600">{totalPrice.toLocaleString()}원</span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xl font-bold text-gray-900">{totalPrice.toLocaleString()}원</p>
                    )}
                  </>
                ) : (
                  // 가격 표시 OFF 시: 텀블러 선택했을 때만 할인 적용 안내 텍스트 표시
                  isTumblerSelected && (
                    <span className="inline-flex items-center gap-1 text-[11px] bg-emerald-100 text-emerald-700 font-black px-2 py-1 rounded-full">
                      ♻️ 텀블러 할인 적용중
                    </span>
                  )
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => handleAddToCart()}>
                장바구니 담기
              </Button>
              <Button variant="primary" className="flex-[1.5]" onClick={handleOrderNow}>
                바로 주문
              </Button>
            </div>
          </>
        )}
      </div>

      {/* 토스트 알림 */}
      <Toast
        message={toast?.message || ''}
        type={toast?.type}
        isVisible={!!toast}
        onClose={() => setToast(null)}
      />
    </div>
  );
};
