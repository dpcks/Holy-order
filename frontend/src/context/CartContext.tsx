import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';

// 백엔드의 OrderItemCreate 구조와 유사하지만 프론트에서 관리할 고유 ID가 필요함
export interface CartItem {
  cartItemId: string; // 로컬 식별용 고유 ID (수정/삭제용)
  menu_id: number;
  name: string;
  image_url?: string;
  quantity: number;
  options_text: string | null;
  price: number; // 메뉴 기본가 + 옵션 추가금액 합계 (단가)
  sub_total: number; // 단가 * 수량
}

interface CartContextType {
  items: CartItem[];
  addItem: (item: Omit<CartItem, 'cartItemId'>) => void;
  removeItem: (cartItemId: string) => void;
  updateQuantity: (cartItemId: string, quantity: number) => void;
  clearCart: () => void;
  totalPrice: number;
  totalCount: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider = ({ children }: { children: ReactNode }) => {
  const [items, setItems] = useState<CartItem[]>(() => {
    const saved = localStorage.getItem('holy_order_cart');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('holy_order_cart', JSON.stringify(items));
  }, [items]);

  const addItem = (newItem: Omit<CartItem, 'cartItemId'>) => {
    setItems((prev) => {
      // 완전히 동일한 옵션을 가진 동일 메뉴가 있다면 수량만 증가
      const existingItemIndex = prev.findIndex(
        (item) => item.menu_id === newItem.menu_id && item.options_text === newItem.options_text
      );

      if (existingItemIndex !== -1) {
        const updatedItems = [...prev];
        const existing = updatedItems[existingItemIndex];
        const newQuantity = existing.quantity + newItem.quantity;
        updatedItems[existingItemIndex] = {
          ...existing,
          quantity: newQuantity,
          sub_total: existing.price * newQuantity,
        };
        return updatedItems;
      }

      // 없으면 새 아이템 추가
      const cartItemId = Math.random().toString(36).substring(2, 9);
      return [...prev, { ...newItem, cartItemId }];
    });
  };

  const removeItem = (cartItemId: string) => {
    setItems((prev) => prev.filter((item) => item.cartItemId !== cartItemId));
  };

  const updateQuantity = (cartItemId: string, quantity: number) => {
    if (quantity <= 0) return;
    setItems((prev) =>
      prev.map((item) =>
        item.cartItemId === cartItemId
          ? { ...item, quantity, sub_total: item.price * quantity }
          : item
      )
    );
  };

  const clearCart = () => {
    setItems([]);
  };

  const totalPrice = items.reduce((sum, item) => sum + item.sub_total, 0);
  const totalCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <CartContext.Provider
      value={{ items, addItem, removeItem, updateQuantity, clearCart, totalPrice, totalCount }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};
