import type { ReactNode } from 'react';
import { ChevronLeft, ShoppingCart, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../../context/CartContext';

interface HeaderProps {
  title?: string | ReactNode;
  showBack?: boolean;
  showCart?: boolean;
  showSearch?: boolean;
  rightElement?: ReactNode;
}

export const Header = ({ 
  title = 'Holy-Order', 
  showBack = false, 
  showCart = true, 
  showSearch = false,
  rightElement
}: HeaderProps) => {
  const navigate = useNavigate();
  const { totalCount } = useCart();

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-100 px-4 h-14 flex items-center justify-between">
      <div className="flex-1 flex items-center">
        {showBack && (
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-gray-800">
            <ChevronLeft size={24} />
          </button>
        )}
      </div>
      
      <div className="flex-1 flex justify-center">
        <h1 className="text-xl font-bold text-gray-900 tracking-tight">{title}</h1>
      </div>
      
      <div className="flex-1 flex items-center justify-end gap-2">
        {showSearch && (
          <button className="p-2 text-gray-800">
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
    </header>
  );
};
