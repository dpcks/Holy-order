import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { Button } from '../components/ui/Button';
import { QuantitySelector } from '../components/ui/QuantitySelector';
import { useCart } from '../context/CartContext';
import type { Menu, MenuOption } from './Home';

export const MenuDetail = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { menu } = location.state as { menu: Menu };
  
  const { addItem } = useCart();
  
  const [quantity, setQuantity] = useState(1);
  
  // 프론트엔드 임시 옵션 그룹화 로직
  const hasTemperatureOption = menu.options.some(o => o.name === 'HOT' || o.name.includes('ICE'));
  const tempOptions = menu.options.filter(o => o.name === 'HOT' || o.name.includes('ICE'));
  const extraOptions = menu.options.filter(o => o.name !== 'HOT' && !o.name.includes('ICE'));

  // 선택된 옵션 상태
  const [selectedTemp, setSelectedTemp] = useState<MenuOption | null>(
    tempOptions.length > 0 ? tempOptions[0] : null
  );
  
  // 시안에 있는 컵 선택 (프론트엔드 전용 하드코딩 - 향후 백엔드 연동)
  const cupOptions = ['일회용컵 사용', '개인컵 사용', '매장컵'];
  const [selectedCup, setSelectedCup] = useState(cupOptions[0]);

  // 추가 옵션 선택 (다중 선택 가능으로 가정)
  const [selectedExtras, setSelectedExtras] = useState<MenuOption[]>([]);

  const toggleExtra = (option: MenuOption) => {
    setSelectedExtras(prev => 
      prev.some(p => p.id === option.id) 
        ? prev.filter(p => p.id !== option.id)
        : [...prev, option]
    );
  };

  // 총액 계산
  const basePrice = menu.price;
  const tempPrice = selectedTemp?.extra_price || 0;
  const extrasPrice = selectedExtras.reduce((sum, opt) => sum + opt.extra_price, 0);
  const unitPrice = basePrice + tempPrice + extrasPrice;
  const totalPrice = unitPrice * quantity;

  const handleAddToCart = () => {
    const optionsTextParts = [];
    if (selectedTemp) optionsTextParts.push(selectedTemp.name);
    optionsTextParts.push(selectedCup);
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
      options_text: optionsTextParts.join(' / ')
    });
    
    navigate(-1); // 뒤로 가기 (또는 토스트 메시지 띄우기)
  };

  const handleOrderNow = () => {
    handleAddToCart();
    navigate('/cart');
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#F9FAFB] pb-32">
      <Header title="메뉴상세" showBack showCart />

      <main className="flex-1">
        {/* Top Image Section */}
        <div className="px-4 py-4">
          <div className="relative w-full aspect-[4/3] rounded-3xl overflow-hidden shadow-lg bg-[#0F0A0A]">
            {menu.image_url ? (
              <img src={menu.image_url} alt={menu.name} className="w-full h-full object-cover" />
            ) : (
              <img src="https://images.unsplash.com/photo-1559525839-b184a4d698c7?w=800&q=80" alt="coffee" className="w-full h-full object-cover opacity-70" />
            )}
            
            {/* Gradient Overlay for Text Visibility */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
            
            <div className="absolute bottom-6 left-6">
              <h2 className="text-white text-3xl font-bold mb-1">
                {/* 영문 이름이 없으므로 임시로 한글 이름을 영어처럼 쓰거나 그냥 둠 */}
                {menu.name.includes(' ') ? menu.name.split(' ')[0] : menu.name}
              </h2>
              <p className="text-gray-300 text-sm font-medium">{menu.name}</p>
            </div>
          </div>
        </div>

        {/* Options Section */}
        <div className="px-4 py-4 flex flex-col gap-8">
          
          {/* ICE & HOT */}
          {hasTemperatureOption && (
            <div className="flex flex-col gap-3">
              <h3 className="font-bold text-gray-900 text-[15px]">ICE&HOT</h3>
              <div className="flex bg-[#F3F4F6] rounded-full p-1">
                {tempOptions.map((opt) => {
                  const isSelected = selectedTemp?.id === opt.id;
                  const isIce = opt.name.includes('ICE');
                  return (
                    <button
                      key={opt.id}
                      onClick={() => setSelectedTemp(opt)}
                      className={`flex-1 py-3 text-sm font-bold rounded-full transition-all ${
                        isSelected 
                          ? 'bg-white shadow-sm text-gray-900' 
                          : 'text-gray-500 hover:text-gray-700'
                      } ${isSelected && isIce ? 'text-blue-500' : ''} ${isSelected && !isIce ? 'text-orange-500' : ''}`}
                    >
                      {opt.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 컵 선택 */}
          <div className="flex flex-col gap-3">
            <h3 className="font-bold text-gray-900 text-[15px]">컵 선택</h3>
            <div className="flex bg-[#F3F4F6] rounded-xl p-1 gap-1">
              {cupOptions.map((cup) => {
                const isSelected = selectedCup === cup;
                return (
                  <button
                    key={cup}
                    onClick={() => setSelectedCup(cup)}
                    className={`flex-1 py-3.5 text-[13px] font-bold rounded-lg transition-all ${
                      isSelected 
                        ? 'bg-[#2D1616] text-white shadow-md' // 시안의 진한 갈색 버튼
                        : 'text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {cup}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 추가 옵션 */}
          {extraOptions.length > 0 && (
            <div className="flex flex-col gap-3">
              <h3 className="font-bold text-gray-900 text-[15px]">추가 옵션</h3>
              <div className="flex flex-col gap-2">
                {extraOptions.map((opt) => {
                  const isSelected = selectedExtras.some(p => p.id === opt.id);
                  return (
                    <button
                      key={opt.id}
                      onClick={() => toggleExtra(opt)}
                      className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                        isSelected 
                          ? 'border-primary bg-red-50/30' 
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <span className={`font-semibold text-sm ${isSelected ? 'text-primary' : 'text-gray-800'}`}>
                        {opt.name}
                      </span>
                      <span className="text-gray-500 text-sm font-medium">
                        +{opt.extra_price.toLocaleString()}원
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Bottom Sticky Action Bar */}
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
