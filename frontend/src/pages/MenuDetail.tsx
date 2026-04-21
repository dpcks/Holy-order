import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { Button } from '../components/ui/Button';
import { QuantitySelector } from '../components/ui/QuantitySelector';
import { useCart } from '../context/CartContext';
import type { Menu, MenuOption } from './Home';

// ICE/HOT 옵션인지 판별하는 상수 - 백엔드 name 값 기준
const TEMP_OPTION_NAMES = ['ICE', 'HOT'];
// 컵 종류 옵션인지 판별하는 상수 - 백엔드 name 값 기준
const CUP_OPTION_NAMES = ['텀블러', '일회용컵'];

export const MenuDetail = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { menu } = location.state as { menu: Menu };
  
  const { addItem } = useCart();
  
  const [quantity, setQuantity] = useState(1);
  
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

  // 선택된 옵션 상태 (단일 선택)
  const [selectedTemp, setSelectedTemp] = useState<MenuOption | null>(
    tempOptions.length > 0 ? tempOptions[0] : null
  );
  const [selectedCup, setSelectedCup] = useState<MenuOption | null>(
    cupOptions.length > 0 ? cupOptions[0] : null
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
  // ────────────────────────────────────────────────────────────────
  const extraPriceSum =
    (selectedTemp?.extra_price ?? 0) +
    (selectedCup?.extra_price ?? 0) +
    selectedExtras.reduce((sum, opt) => sum + opt.extra_price, 0);
  const unitPrice = menu.price + extraPriceSum;
  const totalPrice = unitPrice * quantity;

  const handleAddToCart = () => {
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
      price: unitPrice,
      sub_total: totalPrice,
      options_text: optionsTextParts.join(' / ') || null,
    });

    navigate(-1);
  };

  const handleOrderNow = () => {
    handleAddToCart();
    navigate('/cart');
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#F9FAFB] pb-32">
      <Header title="메뉴상세" showBack showCart />

      <main className="flex-1">
        {/* 상단 메뉴 이미지 */}
        <div className="px-4 py-4">
          <div className="relative w-full aspect-[4/3] rounded-3xl overflow-hidden shadow-lg bg-[#0F0A0A]">
            {menu.image_url ? (
              <img src={menu.image_url} alt={menu.name} className="w-full h-full object-cover" />
            ) : (
              <img
                src="https://images.unsplash.com/photo-1559525839-b184a4d698c7?w=800&q=80"
                alt="coffee"
                className="w-full h-full object-cover opacity-70"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
            <div className="absolute bottom-6 left-6">
              <h2 className="text-white text-3xl font-bold mb-1">
                {menu.name.includes(' ') ? menu.name.split(' ')[0] : menu.name}
              </h2>
              <p className="text-gray-300 text-sm font-medium">{menu.name}</p>
            </div>
          </div>
        </div>

        {/* 옵션 선택 섹션 */}
        <div className="px-4 py-4 flex flex-col gap-8">

          {/* ICE & HOT - 백엔드에서 해당 옵션이 있을 때만 렌더링 */}
          {tempOptions.length > 0 && (
            <div className="flex flex-col gap-3">
              <h3 className="font-bold text-gray-900 text-[15px]">ICE&HOT</h3>
              <div className="flex bg-[#F3F4F6] rounded-full p-1">
                {tempOptions.map((opt) => {
                  const isSelected = selectedTemp?.id === opt.id;
                  const isIce = opt.name === 'ICE';
                  return (
                    <button
                      key={opt.id}
                      onClick={() => setSelectedTemp(opt)}
                      className={`flex-1 py-3 text-sm font-bold rounded-full transition-all ${
                        isSelected
                          ? `bg-white shadow-sm ${isIce ? 'text-blue-500' : 'text-orange-500'}`
                          : 'text-gray-400 hover:text-gray-600'
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
                {cupOptions.map((opt) => {
                  const isSelected = selectedCup?.id === opt.id;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => setSelectedCup(opt)}
                      className={`flex-1 py-3.5 text-[13px] font-bold rounded-lg transition-all ${
                        isSelected
                          ? 'bg-[#2D1616] text-white shadow-md'
                          : 'text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {opt.name}
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
                      className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                        isSelected
                          ? 'border-primary bg-red-50/30'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <span className={`font-semibold text-sm ${isSelected ? 'text-primary' : 'text-gray-800'}`}>
                        {opt.name}
                      </span>
                      {opt.extra_price > 0 && (
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
      </main>

      {/* 하단 Sticky 주문 바 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4 max-w-480px mx-auto shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
        <div className="flex items-center justify-between mb-4">
          <QuantitySelector
            quantity={quantity}
            onIncrease={() => setQuantity(q => q + 1)}
            onDecrease={() => setQuantity(q => q - 1)}
          />
          <div className="text-right">
            <p className="text-[11px] text-gray-500 font-medium mb-0.5">총 주문 금액</p>
            <p className="text-xl font-bold text-gray-900">{totalPrice.toLocaleString()}원</p>
          </div>
        </div>

        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={handleAddToCart}>
            장바구니 담기
          </Button>
          <Button variant="primary" className="flex-[1.5]" onClick={handleOrderNow}>
            바로 주문
          </Button>
        </div>
      </div>
    </div>
  );
};
