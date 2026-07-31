import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { CartItem } from '../types';

interface CartContextType {
  items: CartItem[];
  addItem: (item: Omit<CartItem, 'cartItemId'>) => void;
  removeItem: (cartItemId: string) => void;
  updateQuantity: (cartItemId: string, quantity: number) => void;
  clearCart: () => void;
  totalPrice: number;          // 수량 반영한 원가 합계 (할인 미반영)
  totalTumblerDiscount: number; // 장바구니 전체의 텀블러 할인 총액
  totalCount: number;
  legacyNotice: string | null;
  clearLegacyNotice: () => void;
}

const CART_STORAGE_KEY = 'holy_order_cart_v2';
const LEGACY_STORAGE_KEY = 'holy_order_cart';

const normalizeOptionIds = (ids: number[] = []): string => {
  return [...new Set(ids)].sort((a, b) => a - b).join(',');
};

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider = ({ children }: { children: ReactNode }) => {
  const [legacyNotice, setLegacyNotice] = useState<string | null>(null);

  const [items, setItems] = useState<CartItem[]>(() => {
    // 31. 레거시 장바구니 감지 및 안전 초기화 (selected_option_ids 필수 검증)
    const legacySaved = localStorage.getItem(LEGACY_STORAGE_KEY);
    const saved = localStorage.getItem(CART_STORAGE_KEY);

    if (legacySaved) {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      localStorage.removeItem(CART_STORAGE_KEY);
      setLegacyNotice('가격 계산 방식이 업데이트되어 기존 장바구니를 초기화했습니다. 메뉴와 옵션을 다시 선택해 주세요.');
      return [];
    }

    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const isValidV2 = Array.isArray(parsed) && parsed.every(
          (item) => item && Array.isArray(item.selected_option_ids)
        );
        if (!isValidV2) {
          localStorage.removeItem(CART_STORAGE_KEY);
          setLegacyNotice('가격 계산 방식이 업데이트되어 기존 장바구니를 초기화했습니다. 메뉴와 옵션을 다시 선택해 주세요.');
          return [];
        }
        return parsed;
      } catch {
        localStorage.removeItem(CART_STORAGE_KEY);
        return [];
      }
    }
    return [];
  });

  useEffect(() => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const clearLegacyNotice = () => setLegacyNotice(null);

  const addItem = (newItem: Omit<CartItem, 'cartItemId'>) => {
    setItems((prev) => {
      // 31. 정렬된 selected_option_ids 기준으로 동일 항목 판정
      const targetNormalized = normalizeOptionIds(newItem.selected_option_ids);
      const existingItemIndex = prev.findIndex(
        (item) =>
          item.menu_id === newItem.menu_id &&
          normalizeOptionIds(item.selected_option_ids) === targetNormalized
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
  const totalTumblerDiscount = items.reduce(
    (sum, item) => sum + (item.tumbler_discount || 0) * item.quantity,
    0
  );
  const totalCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        totalPrice,
        totalTumblerDiscount,
        totalCount,
        legacyNotice,
        clearLegacyNotice,
      }}
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
