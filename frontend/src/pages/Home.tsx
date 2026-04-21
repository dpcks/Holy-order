import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, ChevronDown } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { apiClient } from '../api/client';
import type { StandardResponse } from '../api/client';

export interface MenuOption {
  id: number;
  name: string;
  extra_price: number;
}

export interface Menu {
  id: number;
  name: string;
  price: number;
  description: string | null;
  image_url: string | null;
  is_available: boolean;
  options: MenuOption[];
}

export interface Category {
  id: number;
  name: string;
  menus: Menu[];
}

export const Home = () => {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const fetchMenus = async () => {
      try {
        const response = await apiClient.get<any, StandardResponse<Category[]>>('/categories');
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
    <div className="flex flex-col min-h-screen bg-white pb-6 max-w-[480px] mx-auto shadow-lg relative">
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
    <h3 className="font-bold text-gray-900 text-[15px] mb-1 leading-snug">{menu.name}</h3>
    <p className="font-bold text-primary text-[15px]">{menu.price.toLocaleString()}원</p>
  </div>
);
