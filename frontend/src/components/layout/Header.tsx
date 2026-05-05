import { useState, type ReactNode } from 'react';
import { ChevronLeft, ShoppingCart, Search, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../../context/CartContext';

interface HeaderProps {
  title?: string | ReactNode;
  showBack?: boolean;
  showCart?: boolean;
  showSearch?: boolean;
  onSearchChange?: (query: string) => void;
  rightElement?: ReactNode;
}

export const Header = ({
  title = 'Holy-Order',
  showBack = false,
  showCart = true,
  showSearch = false,
  onSearchChange,
  rightElement
}: HeaderProps) => {
  const navigate = useNavigate();
  const { totalCount } = useCart();
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearchToggle = () => {
    setIsSearching(!isSearching);
    if (isSearching) {
      setSearchQuery('');
      if (onSearchChange) onSearchChange('');
    }
  };

  const handleSearchInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (onSearchChange) onSearchChange(val);
  };

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-100 px-4 h-14 flex items-center justify-between gap-2">
      {!isSearching ? (
        <>
          <div className="flex-1 flex items-center">
            {showBack ? (
              <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-gray-800">
                <ChevronLeft size={24} />
              </button>
            ) : (
              <img
                src="/img/ptcc_logo.png"
                alt="평택중앙교회 로고"
                className="h-20 w-20 object-contain -ml-2"
              />
            )}
          </div>

          <div className="flex-1 flex justify-center">
            <h1 className="text-xl font-bold text-gray-900 tracking-tight whitespace-nowrap">{title}</h1>
          </div>

          <div className="flex-1 flex items-center justify-end gap-1">
            {showSearch && (
              <button onClick={handleSearchToggle} className="p-2 text-gray-800">
                <Search size={20} />
              </button>
            )}
            {showCart && (
              <button
                onClick={() => navigate('/cart')}
                className="p-2 -mr-2 relative text-gray-800"
              >
                <ShoppingCart size={22} />
                {totalCount > 0 && (
                  <span className="absolute top-1 right-0 bg-primary text-white text-[10px] font-bold h-4 w-4 rounded-full flex items-center justify-center">
                    {totalCount}
                  </span>
                )}
              </button>
            )}
            {rightElement}
          </div>
        </>
      ) : (
        <div className="flex-1 flex items-center bg-gray-100 rounded-full px-3 py-1.5 h-10 animate-in fade-in slide-in-from-right-4 duration-200">
          <Search size={18} className="text-gray-400 mr-2" />
          <input
            autoFocus
            type="text"
            value={searchQuery}
            onChange={handleSearchInput}
            placeholder="메뉴명을 입력하세요"
            className="flex-1 bg-transparent border-none outline-none text-sm text-gray-800 placeholder-gray-400"
          />
          <button onClick={handleSearchToggle} className="p-1 text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
      )}
    </header>
  );
};
