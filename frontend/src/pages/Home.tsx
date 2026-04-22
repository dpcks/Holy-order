import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, ChevronDown, Coffee } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { apiClient } from '../api/client';
import { Category, StandardResponse } from '../types';

export const Home = () => {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
  const [activeOrders, setActiveOrders] = useState<{id: string, orderNumber: number}[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    // 진행 중인 주문들 확인
    const orders = JSON.parse(localStorage.getItem('activeOrders') || '[]');
    setActiveOrders(orders);

    const fetchMenus = async () => {
      try {
        const response = await apiClient.get<Category[], StandardResponse<Category[]>>('/categories');
        if (response.success && response.data) {
          setCategories(response.data);
          if (response.data.length > 0) {
            setActiveCategoryId(response.data[0].id);
          }
        }
      } catch (error) {
        console.error('Failed to fetch menus', error);
      } finally {
        setLoading(false);
      }
    };
    fetchMenus();
  }, []);

  const activeCategory = categories.find((c) => c.id === activeCategoryId);

  // 검색 결과 필터링 (전체 카테고리 대상)
  const filteredMenus = categories.flatMap(cat => cat.menus).filter(menu => 
    menu.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col min-h-screen w-full max-w-[500px] mx-auto bg-white pb-6 shadow-2xl relative">
      <Header showSearch showCart onSearchChange={setSearchQuery} />

      {!searchQuery ? (
        <>
          {/* Store Selector */}
          <div className="px-4 py-4">
            <button className="flex items-center gap-1.5 bg-gray-50 px-3 py-2 rounded-lg">
              <MapPin size={16} className="text-primary" />
              <span className="font-semibold text-gray-800 text-sm">평택중앙교회</span>
              <ChevronDown size={16} className="text-gray-500" />
            </button>
          </div>

          {/* Category Tabs */}
          <div className="px-4 border-b border-gray-100 flex gap-6 overflow-x-auto scrollbar-hide">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategoryId(cat.id)}
                className={`pb-3 font-semibold text-base whitespace-nowrap transition-colors relative ${
                  activeCategoryId === cat.id ? 'text-gray-900' : 'text-gray-400'
                }`}
              >
                {cat.name}
                {activeCategoryId === cat.id && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-sm" />
                )}
              </button>
            ))}
          </div>

          {/* Normal Menu Grid */}
          <div className="flex-1 px-4 py-6 bg-white">
            {loading ? (
              <div className="flex justify-center items-center h-40">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : activeCategory?.menus.length === 0 ? (
              <div className="text-center text-gray-500 mt-10">메뉴가 없습니다.</div>
            ) : (
              <div className="grid grid-cols-2 gap-4 gap-y-8">
                {activeCategory?.menus.map((menu) => (
                  <MenuCard key={menu.id} menu={menu} onClick={() => navigate(`/menu/${menu.id}`, { state: { menu } })} />
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        /* Search Results View */
        <div className="flex-1 px-4 py-6 bg-white">
          <h2 className="text-sm font-bold text-gray-400 mb-6 px-1">검색 결과 ({filteredMenus.length}건)</h2>
          {filteredMenus.length === 0 ? (
            <div className="text-center text-gray-500 mt-10">검색 결과가 없습니다.</div>
          ) : (
            <div className="grid grid-cols-2 gap-4 gap-y-8">
              {filteredMenus.map((menu) => (
                <MenuCard key={menu.id} menu={menu} onClick={() => navigate(`/menu/${menu.id}`, { state: { menu } })} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* 실시간 주문 추적 플로팅 버튼 */}
      {activeOrders.length > 0 && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 w-full max-w-[460px] px-4 animate-in slide-in-from-bottom-8 duration-500">
          <button 
            onClick={() => navigate(`/order/status/${activeOrders[activeOrders.length - 1].id}`)}
            className="w-full bg-[#1A0A0A] text-white py-4 px-6 rounded-2xl shadow-2xl flex items-center justify-between group active:scale-95 transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="bg-primary p-2 rounded-xl">
                <Coffee size={20} className="text-white" />
              </div>
              <div className="text-left">
                <p className="text-[14px] font-black tracking-tight">
                  {activeOrders.length > 1 ? `진행 중인 주문이 ${activeOrders.length}건 있습니다` : '주문이 진행 중입니다'}
                </p>
                <p className="text-[11px] text-white/40 font-bold">내 주문 현황 바로가기</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                <span className="w-1 h-1 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                <span className="w-1 h-1 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                <span className="w-1 h-1 bg-primary rounded-full animate-bounce"></span>
              </div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
};

// 재사용을 위한 MenuCard 컴포넌트
const MenuCard = ({ menu, onClick }: { menu: Menu, onClick: () => void }) => (
  <div 
    className="cursor-pointer group flex flex-col"
    onClick={onClick}
  >
    <div className="relative aspect-square rounded-2xl overflow-hidden bg-gray-100 mb-3">
      {menu.image_url ? (
        <img 
          src={menu.image_url} 
          alt={menu.name} 
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
        />
      ) : (
        <div className="w-full h-full bg-[#1A1818] flex items-center justify-center">
          <img src="https://images.unsplash.com/photo-1559525839-b184a4d698c7?w=400&q=80" alt="coffee placeholder" className="w-full h-full object-cover opacity-80" />
        </div>
      )}
      <div className="absolute top-2 left-2 bg-primary text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
        NEW
      </div>
    </div>
    <h3 className="font-bold text-gray-900 text-[15px] mb-0.5 leading-snug">{menu.name}</h3>
    {menu.description && (
      <p className="text-[11px] text-gray-400 line-clamp-1 mb-1 font-medium">{menu.description}</p>
    )}
    <p className="font-bold text-primary text-[15px]">{menu.price.toLocaleString()}원</p>
  </div>
);
