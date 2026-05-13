import React, { useState, useEffect } from 'react';
import { X, Plus, Minus, Coffee, Wallet, Building2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { QK } from '../../api/queryKeys';
import type { StandardResponse } from '../../api/client';
import type { Category } from '../../types';

interface AdminDirectOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SelectedItem {
  id: string;
  menuId: number;
  name: string;
  price: number;
  quantity: number;
  isDessert: boolean;
  selectedIceHot: string | null;
  selectedCup: string | null;
  selectedAddons: string[];
  availableOptions: { name: string; extra_price: number }[];
}

export const AdminDirectOrderModal: React.FC<AdminDirectOrderModalProps> = ({ isOpen, onClose }) => {
  const queryClient = useQueryClient();
  const [customerName, setCustomerName] = useState('');
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'BANK_TRANSFER'>('BANK_TRANSFER');
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setCustomerName('');
      setSelectedItems([]);
      setPaymentMethod('BANK_TRANSFER');
      setActiveCategoryId(null);
    }
  }, [isOpen]);

  // Fetch Menus
  const { data: categories = [] } = useQuery({
    queryKey: QK.menus.all,
    queryFn: async () => {
      const res = await apiClient.get<Category[], StandardResponse<Category[]>>('/categories');
      return (res.success && res.data) ? res.data.filter(c => c.is_active) : [];
    },
    enabled: isOpen,
  });

  useEffect(() => {
    if (categories.length > 0 && !activeCategoryId) {
      setActiveCategoryId(categories[0].id);
    }
  }, [categories, activeCategoryId]);

  // Fetch active event
  const { data: activeEvent } = useQuery({
    queryKey: ['activeEvent'],
    queryFn: async () => {
      const res = await apiClient.get<any, StandardResponse<any>>('/announcements/active');
      return res.success ? res.data : null;
    },
    enabled: isOpen,
  });

  const isEventMode = !!activeEvent?.is_event_mode;

  // Calculate totals
  const totalAmount = selectedItems.reduce((sum, item) => {
    let extraPrice = 0;
    if (item.selectedIceHot) extraPrice += item.availableOptions.find(o => o.name === item.selectedIceHot)?.extra_price || 0;
    if (item.selectedCup) extraPrice += item.availableOptions.find(o => o.name === item.selectedCup)?.extra_price || 0;
    item.selectedAddons.forEach(addon => {
      extraPrice += item.availableOptions.find(o => o.name === addon)?.extra_price || 0;
    });

    const itemTotal = (item.price + extraPrice) * item.quantity;
    const isTumbler = item.selectedCup?.includes('텀블러');
    const discount = isTumbler ? 500 * item.quantity : 0;
    return sum + itemTotal - discount;
  }, 0);

  const eventFinalPrice = isEventMode ? 0 : totalAmount;

  const createOrderMutation = useMutation({
    mutationFn: async () => {
      // 메뉴 ID와 옵션 텍스트가 동일한 항목들을 그룹화하여 병합
      const groupedItemsMap = new Map<string, any>();

      selectedItems.forEach(item => {
        let extraPrice = 0;
        const opts = [];
        if (item.selectedIceHot) {
          extraPrice += item.availableOptions.find(o => o.name === item.selectedIceHot)?.extra_price || 0;
          opts.push(item.selectedIceHot);
        }
        if (item.selectedCup) {
          extraPrice += item.availableOptions.find(o => o.name === item.selectedCup)?.extra_price || 0;
          opts.push(item.selectedCup);
        }
        item.selectedAddons.forEach(addon => {
          extraPrice += item.availableOptions.find(o => o.name === addon)?.extra_price || 0;
          opts.push(addon);
        });

        const optionsText = opts.join(', ') || null;
        const isTumbler = item.selectedCup?.includes('텀블러');
        const key = `${item.menuId}-${optionsText}`;
        
        const basePriceWithExtra = item.price + extraPrice;
        const itemDiscount = isTumbler ? 500 : 0;
        const subTotal = (basePriceWithExtra - itemDiscount) * item.quantity;

        if (groupedItemsMap.has(key)) {
          const existing = groupedItemsMap.get(key);
          existing.quantity += item.quantity;
          existing.sub_total += subTotal;
        } else {
          groupedItemsMap.set(key, {
            menu_id: item.menuId,
            quantity: item.quantity,
            tumbler_discount: itemDiscount,
            options_text: optionsText,
            sub_total: subTotal
          });
        }
      });

      const payload = {
        user_name_snapshot: customerName.trim() || '현장 주문',
        user_duty_snapshot: '성도',
        total_price: totalAmount,
        payment_method: paymentMethod,
        status: 'PREPARING',
        items: Array.from(groupedItemsMap.values())
      };
      
      const res = await apiClient.post<any, StandardResponse<any>>('/orders/admin', payload);
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK.orders.board });
      queryClient.invalidateQueries({ queryKey: QK.stats.summary });
      onClose();
      // Reset form
      setCustomerName('');
      setSelectedItems([]);
      setPaymentMethod('BANK_TRANSFER');
    },
    onError: (err: any) => {
      alert(err.message || '주문 추가에 실패했습니다.');
    }
  });

  const handleAddItem = (menu: any, isDessert: boolean) => {
    setSelectedItems(prev => {
      const options = menu.options || [];
      const iceHotOptions = options.filter((o: any) => o.name.toUpperCase().includes('ICE') || o.name.toUpperCase().includes('HOT'));
      const cupOptions = options.filter((o: any) => o.name.includes('텀블러') || o.name.includes('일회용'));

      const defaultIceHot = iceHotOptions.find((o: any) => o.name.toUpperCase().includes('ICE'))?.name
        || (iceHotOptions.length > 0 ? iceHotOptions[0].name : null);
      const defaultCup = cupOptions.find((o: any) => o.name.includes('일회용'))?.name
        || (cupOptions.length > 0 ? cupOptions[0].name : null);

      const existing = prev.find(i =>
        i.menuId === menu.id &&
        i.selectedIceHot === defaultIceHot &&
        i.selectedCup === defaultCup &&
        i.selectedAddons.length === 0
      );

      if (existing) {
        return prev.map(i => i.id === existing.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, {
        id: Math.random().toString(36).substring(2, 9),
        menuId: menu.id,
        name: menu.name,
        price: menu.price,
        quantity: 1,
        isDessert,
        selectedIceHot: defaultIceHot,
        selectedCup: defaultCup,
        selectedAddons: [],
        availableOptions: options.map((o: any) => ({ name: o.name, extra_price: o.extra_price })).sort((a: any, b: any) => {
          const getWeight = (name: string) => {
            const upper = name.toUpperCase();
            if (upper.includes('ICE')) return 1;
            if (upper.includes('HOT')) return 2;
            if (name.includes('일회용')) return 3;
            if (name.includes('텀블러')) return 4;
            return 5;
          };
          return getWeight(a.name) - getWeight(b.name);
        })
      }];
    });
  };

  const handleUpdateQuantity = (id: string, delta: number) => {
    setSelectedItems(prev => prev.map(item => {
      if (item.id === id) {
        const nextQty = item.quantity + delta;
        return nextQty > 0 ? { ...item, quantity: nextQty } : item;
      }
      return item;
    }));
  };

  const handleRemoveItem = (id: string) => {
    setSelectedItems(prev => prev.filter(item => item.id !== id));
  };

  const handleChangeOption = (id: string, optionName: string, type: 'icehot' | 'cup' | 'addon') => {
    setSelectedItems(prev => prev.map(item => {
      if (item.id === id) {
        if (type === 'icehot') return { ...item, selectedIceHot: optionName };
        if (type === 'cup') return { ...item, selectedCup: optionName };
        if (type === 'addon') {
          const has = item.selectedAddons.includes(optionName);
          return { ...item, selectedAddons: has ? item.selectedAddons.filter(a => a !== optionName) : [...item.selectedAddons, optionName] };
        }
      }
      return item;
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Plus size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black text-gray-900 tracking-tight">주문 추가</h2>
              <p className="text-[12px] font-bold text-gray-500 tracking-tight">관리자 직접 입력 및 결제 처리</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-full transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Left: Menu Selection */}
          <div className="flex-1 overflow-y-auto p-6 border-r border-gray-100 bg-white flex flex-col">
            <h3 className="text-[14px] font-black text-gray-800 mb-4 tracking-tight shrink-0">메뉴 선택</h3>
            
            {/* Category Tabs */}
            <div className="flex gap-2 mb-6 overflow-x-auto pb-2 shrink-0 scrollbar-hide">
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategoryId(cat.id)}
                  className={`px-4 py-2 rounded-xl whitespace-nowrap text-[13px] font-bold transition-all ${
                    activeCategoryId === cat.id
                      ? 'bg-gray-900 text-white shadow-md'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            <div className="space-y-6 flex-1 overflow-y-auto pr-2">
              {categories.filter(c => c.id === activeCategoryId).map(category => (
                <div key={category.id}>
                  <div className="grid grid-cols-2 gap-3">
                    {category.menus.filter(m => m.is_available).map(menu => {
                      const isDessert = category.name.includes('디저트') || category.name.includes('빵') || category.name.includes('쿠키');
                      return (
                        <button
                          key={menu.id}
                          onClick={() => handleAddItem(menu as any, isDessert)}
                          className="flex flex-col items-start p-4 rounded-2xl border border-gray-100 hover:border-primary/50 hover:bg-primary/5 transition-all text-left group"
                        >
                          <span className="font-bold text-gray-900 group-hover:text-primary transition-colors">{menu.name}</span>
                          <span className="text-[13px] font-black text-gray-500">₩{menu.price.toLocaleString()}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Order Summary & Form */}
          <div className="w-[380px] bg-[#F9FAFB] flex flex-col shrink-0">
            <div className="p-6 flex-1 overflow-y-auto space-y-6">
              {/* Customer Name */}
              <div>
                <label className="block text-[12px] font-black text-gray-600 uppercase tracking-widest mb-2">주문자 이름 (선택)</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  placeholder="미입력시 '현장 주문'으로 저장"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all font-bold text-[15px]"
                />
              </div>

              {/* Selected Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-[12px] font-black text-gray-600 uppercase tracking-widest">주문 내역</label>
                  <span className="text-[12px] font-bold text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">{selectedItems.length}개</span>
                </div>

                {selectedItems.length === 0 ? (
                  <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-gray-200">
                    <Coffee size={24} className="mx-auto text-gray-300 mb-2" />
                    <p className="text-[13px] font-bold text-gray-400">왼쪽에서 메뉴를 선택해주세요.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedItems.map((item) => {
                      let uiExtraPrice = 0;
                      if (item.selectedIceHot) uiExtraPrice += item.availableOptions.find(o => o.name === item.selectedIceHot)?.extra_price || 0;
                      if (item.selectedCup) uiExtraPrice += item.availableOptions.find(o => o.name === item.selectedCup)?.extra_price || 0;
                      item.selectedAddons.forEach(addon => {
                        uiExtraPrice += item.availableOptions.find(o => o.name === addon)?.extra_price || 0;
                      });

                      const isTumbler = item.selectedCup?.includes('텀블러');
                      const tumblerDiscount = isTumbler ? 500 : 0;

                      return (
                        <div key={item.id} className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <p className="font-black text-[14px] text-gray-900">{item.name}</p>
                              <p className="text-[12px] font-bold flex items-center gap-1.5">
                                {isEventMode ? (
                                  <>
                                    <span className="text-gray-400 line-through">
                                      ₩{((item.price + uiExtraPrice - tumblerDiscount) * item.quantity).toLocaleString()}
                                    </span>
                                    <span className="text-primary">₩0</span>
                                  </>
                                ) : (
                                  <span className="text-gray-500">
                                    ₩{((item.price + uiExtraPrice - tumblerDiscount) * item.quantity).toLocaleString()}
                                  </span>
                                )}
                                {isTumbler && !isEventMode && (
                                  <span className="text-[10px] bg-green-50 text-green-600 px-1.5 py-0.5 rounded-md font-bold">-500원 할인</span>
                                )}
                              </p>
                            </div>
                            <button onClick={() => handleRemoveItem(item.id)} className="text-gray-400 hover:text-red-500 transition-colors">
                              <X size={16} />
                            </button>
                          </div>

                          {item.availableOptions.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-3">
                              {item.availableOptions.map(opt => {
                                const isIceHotOpt = opt.name.toUpperCase().includes('ICE') || opt.name.toUpperCase().includes('HOT');
                                const isCupOpt = opt.name.includes('텀블러') || opt.name.includes('일회용');

                                let type: 'icehot' | 'cup' | 'addon' = 'addon';
                                let isSelected = false;

                                if (isIceHotOpt) {
                                  type = 'icehot';
                                  isSelected = item.selectedIceHot === opt.name;
                                } else if (isCupOpt) {
                                  type = 'cup';
                                  isSelected = item.selectedCup === opt.name;
                                } else {
                                  isSelected = item.selectedAddons.includes(opt.name);
                                }

                                const isIce = opt.name.toUpperCase().includes('ICE');
                                const isHot = opt.name.toUpperCase().includes('HOT');
                                const isTumbler = opt.name.includes('텀블러');

                                let activeClass = 'bg-gray-800 text-white border-gray-800';
                                if (isIce) activeClass = 'bg-blue-50 text-blue-600 border-blue-200';
                                if (isHot) activeClass = 'bg-red-50 text-red-600 border-red-200';
                                if (isTumbler) activeClass = 'bg-green-50 text-green-700 border-green-200';

                                return (
                                  <button
                                    key={opt.name}
                                    onClick={() => handleChangeOption(item.id, opt.name, type)}
                                    className={`text-[10px] font-black px-2 py-1 rounded-md border transition-all ${isSelected ? activeClass : 'bg-white text-gray-400 border-gray-200 hover:bg-gray-50'
                                      }`}
                                  >
                                    {opt.name} {opt.extra_price > 0 && `(+${opt.extra_price})`}
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          <div className="flex items-center justify-between">
                            <div className="flex items-center bg-gray-50 rounded-lg p-1 border border-gray-100">
                              <button onClick={() => handleUpdateQuantity(item.id, -1)} className="p-1 rounded-md hover:bg-white text-gray-500 transition-colors"><Minus size={14} /></button>
                              <span className="w-8 text-center font-bold text-[14px]">{item.quantity}</span>
                              <button onClick={() => handleUpdateQuantity(item.id, 1)} className="p-1 rounded-md hover:bg-white text-gray-500 transition-colors"><Plus size={14} /></button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-[12px] font-black text-gray-600 uppercase tracking-widest mb-2">결제 수단</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setPaymentMethod('BANK_TRANSFER')}
                    className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all font-black text-[14px] ${paymentMethod === 'BANK_TRANSFER'
                      ? 'border-blue-500 bg-blue-50 text-blue-600'
                      : 'border-gray-100 bg-white text-gray-500 hover:bg-gray-50'
                      }`}
                  >
                    <Building2 size={18} /> 계좌이체
                  </button>
                  <button
                    onClick={() => setPaymentMethod('CASH')}
                    className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all font-black text-[14px] ${paymentMethod === 'CASH'
                      ? 'border-orange-500 bg-orange-50 text-orange-600'
                      : 'border-gray-100 bg-white text-gray-500 hover:bg-gray-50'
                      }`}
                  >
                    <Wallet size={18} /> 현금
                  </button>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 bg-white border-t border-gray-100 mt-auto shrink-0">
              <div className="flex justify-between items-end mb-4">
                <span className="text-[13px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                  Total
                  {isEventMode && (
                    <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-md text-[10px] font-bold normal-case">
                      {activeEvent.title} (이벤트 적용)
                    </span>
                  )}
                </span>
                <span className="text-2xl font-black text-gray-900 tracking-tight">₩{eventFinalPrice.toLocaleString()}</span>
              </div>
              <button
                onClick={() => createOrderMutation.mutate()}
                disabled={selectedItems.length === 0 || createOrderMutation.isPending}
                className="w-full py-4 bg-[#1A0A0A] hover:bg-black text-white rounded-2xl font-black text-[16px] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg active:scale-[0.98]"
              >
                {createOrderMutation.isPending ? '처리 중...' : '결제 완료 및 주문 추가'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
