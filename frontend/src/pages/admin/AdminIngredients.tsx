/*
[File Role]
관리자 전용 재고 관리 페이지 (Kanban Board 스타일).
가로 스크롤 레이아웃과 퀵 필터를 제공하며, 개별 카드 내에서 인라인 수량 조절이 가능합니다.
*/

import { useState, useRef } from 'react';
import {
  Package, Plus, Search, AlertTriangle, Minus, ChevronLeft, ChevronRight
} from 'lucide-react';
import type { Ingredient } from '../../types';

// 임시 데이터 18개
const MOCK_DATA: Ingredient[] = [
  { id: 1, name: '에스프레소 원두', category: '재료', current_stock: 2, alert_threshold: 5, unit: 'kg', is_active: true, display_order: 1 },
  { id: 2, name: '서울우유 1L', category: '재료', current_stock: 12, alert_threshold: 10, unit: '팩', is_active: true, display_order: 2 },
  { id: 3, name: '바닐라 시럽', category: '재료', current_stock: 1, alert_threshold: 2, unit: '병', is_active: true, display_order: 3 },
  { id: 4, name: '헤이즐넛 시럽', category: '재료', current_stock: 3, alert_threshold: 2, unit: '병', is_active: true, display_order: 4 },
  { id: 5, name: '카라멜 소스', category: '재료', current_stock: 1, alert_threshold: 2, unit: '통', is_active: true, display_order: 5 },
  { id: 6, name: '초코 소스', category: '재료', current_stock: 4, alert_threshold: 2, unit: '통', is_active: true, display_order: 6 },
  { id: 7, name: '녹차 파우더', category: '재료', current_stock: 0, alert_threshold: 3, unit: '팩', is_active: true, display_order: 7 },
  { id: 8, name: '복숭아 파우더', category: '재료', current_stock: 5, alert_threshold: 3, unit: '팩', is_active: true, display_order: 8 },
  { id: 9, name: '레몬에이드 베이스', category: '재료', current_stock: 2, alert_threshold: 5, unit: '병', is_active: true, display_order: 9 },
  { id: 10, name: '종이컵 (HOT)', category: '소모품', current_stock: 50, alert_threshold: 100, unit: '개', is_active: true, display_order: 10 },
  { id: 11, name: '투명컵 (ICE)', category: '소모품', current_stock: 300, alert_threshold: 100, unit: '개', is_active: true, display_order: 11 },
  { id: 12, name: '컵 뚜껑 (HOT)', category: '소모품', current_stock: 80, alert_threshold: 100, unit: '개', is_active: true, display_order: 12 },
  { id: 13, name: '컵 뚜껑 (ICE)', category: '소모품', current_stock: 250, alert_threshold: 100, unit: '개', is_active: true, display_order: 13 },
  { id: 14, name: '빨대', category: '소모품', current_stock: 500, alert_threshold: 200, unit: '개', is_active: true, display_order: 14 },
  { id: 15, name: '냅킨', category: '소모품', current_stock: 150, alert_threshold: 300, unit: '장', is_active: true, display_order: 15 },
  { id: 16, name: '캐리어 (2구)', category: '소모품', current_stock: 20, alert_threshold: 50, unit: '개', is_active: true, display_order: 16 },
  { id: 17, name: '컵 홀더 (슬리브)', category: '소모품', current_stock: 400, alert_threshold: 150, unit: '개', is_active: true, display_order: 17 },
  { id: 18, name: '물티슈', category: '소모품', current_stock: 5, alert_threshold: 10, unit: '팩', is_active: true, display_order: 18 },
];

type FilterType = '전체' | '소모품' | '재료' | '주문 필요';

export const AdminIngredients = () => {
  const [items, setItems] = useState<Ingredient[]>(MOCK_DATA);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('전체');
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  // 수량 조절 핸들러 (Inline Editing)
  const handleUpdateStock = (id: number, delta: number) => {
    setItems(prev => prev.map(item => {
      if (item.id === id) {
        const newStock = Math.max(0, item.current_stock + delta);
        return { ...item, current_stock: newStock };
      }
      return item;
    }));
  };

  // 재고 상태 확인 헬퍼
  const getStockStatus = (item: Ingredient) => {
    if (item.alert_threshold <= 0) return 'NORMAL';
    const ratio = item.current_stock / item.alert_threshold;
    if (ratio <= 0.2 || item.current_stock === 0) return 'CRITICAL';
    if (ratio <= 0.5) return 'WARNING';
    return 'NORMAL';
  };

  // 통계 계산
  const totalItemsCount = items.length;
  const criticalItemsCount = items.filter(i => getStockStatus(i) === 'CRITICAL').length;
  const safeItemsCount = totalItemsCount - criticalItemsCount;

  // 마우스 드래그 스크롤 핸들러
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollContainerRef.current) return;
    setIsDragging(true);
    setStartX(e.pageX - scrollContainerRef.current.offsetLeft);
    setScrollLeft(scrollContainerRef.current.scrollLeft);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !scrollContainerRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollContainerRef.current.offsetLeft;
    const walk = (x - startX) * 2; // 스크롤 속도 배율
    scrollContainerRef.current.scrollLeft = scrollLeft - walk;
  };

  // 좌우 화살표 스크롤
  const scrollByAmount = (amount: number) => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: amount, behavior: 'smooth' });
    }
  };

  // 필터링 적용
  const filteredItems = items.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    let matchesFilter = true;
    if (activeFilter === '소모품') matchesFilter = item.category === '소모품';
    if (activeFilter === '재료') matchesFilter = item.category === '재료';
    if (activeFilter === '주문 필요') matchesFilter = getStockStatus(item) === 'CRITICAL';
    
    return matchesSearch && matchesFilter;
  });

  // 카테고리 기둥(Column)별 분리
  const columns = [
    { title: '🔴 주문 필요 (CRITICAL)', items: filteredItems.filter(i => getStockStatus(i) === 'CRITICAL'), color: 'bg-red-50', borderColor: 'border-red-100', headerColor: 'text-red-800' },
    { title: '🟡 재료 (INGREDIENTS)', items: filteredItems.filter(i => getStockStatus(i) !== 'CRITICAL' && i.category === '재료'), color: 'bg-blue-50/50', borderColor: 'border-blue-100', headerColor: 'text-blue-800' },
    { title: '📦 소모품 (SUPPLIES)', items: filteredItems.filter(i => getStockStatus(i) !== 'CRITICAL' && i.category === '소모품'), color: 'bg-purple-50/50', borderColor: 'border-purple-100', headerColor: 'text-purple-800' }
  ];

  return (
    <div className="flex flex-col h-full bg-[#F3F4F6] overflow-hidden font-sans select-none">
      {/* 헤더 및 요약 대시보드 */}
      <header className="bg-white px-8 py-5 border-b border-gray-200 shrink-0 z-20 shadow-sm flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-black rounded-2xl flex items-center justify-center shadow-lg shadow-black/10">
              <Package className="text-white" size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-black text-gray-900 tracking-tight">재고 관리 보드</h1>
              <p className="text-[13px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">Inventory Kanban</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative w-64">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="품목 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-black/5 focus:bg-white transition-all"
              />
            </div>
          </div>
        </div>

        {/* 미니 대시보드 & 퀵 필터 */}
        <div className="flex items-center justify-between mt-2">
          <div className="flex gap-3">
            <div className="bg-gray-50 px-4 py-2 rounded-xl border border-gray-100 flex items-center gap-3">
              <span className="text-xs font-bold text-gray-500">총 품목</span>
              <span className="text-base font-black text-gray-900">{totalItemsCount}</span>
            </div>
            <div className="bg-emerald-50 px-4 py-2 rounded-xl border border-emerald-100 flex items-center gap-3">
              <span className="text-xs font-bold text-emerald-600">안전 재고</span>
              <span className="text-base font-black text-emerald-700">{safeItemsCount}</span>
            </div>
            <div className="bg-red-50 px-4 py-2 rounded-xl border border-red-100 flex items-center gap-3">
              <span className="text-xs font-bold text-red-600 flex items-center gap-1"><AlertTriangle size={14} /> 주문 필요</span>
              <span className="text-base font-black text-red-700">{criticalItemsCount}</span>
            </div>
          </div>

          <div className="flex gap-1.5 bg-gray-100 p-1 rounded-xl">
            {(['전체', '소모품', '재료', '주문 필요'] as const).map(filter => (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={`px-4 py-1.5 text-[13px] font-bold rounded-lg transition-all ${
                  activeFilter === filter ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* 가로 스크롤 보드 영역 */}
      <main className="flex-1 relative overflow-hidden flex flex-col">
        {/* 좌우 스크롤 버튼 (PC용) */}
        <button 
          onClick={() => scrollByAmount(-350)}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 bg-white/80 backdrop-blur border border-gray-200 rounded-full flex items-center justify-center text-gray-600 shadow-lg hover:bg-white transition-all hidden md:flex"
        >
          <ChevronLeft size={20} />
        </button>
        <button 
          onClick={() => scrollByAmount(350)}
          className="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 bg-white/80 backdrop-blur border border-gray-200 rounded-full flex items-center justify-center text-gray-600 shadow-lg hover:bg-white transition-all hidden md:flex"
        >
          <ChevronRight size={20} />
        </button>

        <div 
          ref={scrollContainerRef}
          className="flex-1 overflow-x-auto overflow-y-hidden flex gap-6 p-6 snap-x custom-scrollbar cursor-grab active:cursor-grabbing"
          onMouseDown={handleMouseDown}
          onMouseLeave={handleMouseLeave}
          onMouseUp={handleMouseUp}
          onMouseMove={handleMouseMove}
        >
          {columns.map((col, idx) => (
            <div 
              key={idx} 
              className={`shrink-0 w-80 max-w-[85vw] flex flex-col rounded-3xl border shadow-sm snap-center ${col.color} ${col.borderColor}`}
            >
              {/* 기둥 헤더 */}
              <div className="px-5 py-4 border-b border-black/5 flex items-center justify-between shrink-0">
                <h2 className={`text-[14px] font-black tracking-tight ${col.headerColor}`}>{col.title}</h2>
                <span className="bg-white/60 px-2 py-0.5 rounded-md text-[12px] font-black text-gray-600 shadow-sm">
                  {col.items.length}
                </span>
              </div>

              {/* 기둥 내 세로 스크롤 영역 */}
              <div className="flex-1 overflow-y-auto p-3 custom-scrollbar space-y-3">
                {col.items.map(item => {
                  const status = getStockStatus(item);
                  const isCritical = status === 'CRITICAL';
                  // 프로그레스 바 계산
                  const ratio = Math.min(1, item.current_stock / Math.max(1, item.alert_threshold));
                  const progressColor = isCritical ? 'bg-red-500' : status === 'WARNING' ? 'bg-amber-500' : 'bg-emerald-500';

                  return (
                    <div 
                      key={item.id} 
                      className={`bg-white rounded-2xl p-4 shadow-sm border transition-all hover:shadow-md ${
                        isCritical ? 'border-red-200 shadow-red-100' : 'border-gray-100'
                      }`}
                      onMouseDown={(e) => e.stopPropagation()} // 개별 카드 조작 시 보드 드래그 방지
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div className="min-w-0 pr-2">
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full mb-1.5 inline-block ${
                            item.category === '재료' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'
                          }`}>
                            {item.category}
                          </span>
                          <h3 className="font-bold text-gray-900 text-sm truncate">{item.name}</h3>
                        </div>
                        {isCritical && (
                          <div className="bg-red-100 text-red-600 w-6 h-6 rounded-lg flex items-center justify-center shrink-0 animate-pulse">
                            <AlertTriangle size={14} />
                          </div>
                        )}
                      </div>

                      {/* 인라인 수량 조절 */}
                      <div className="flex items-center justify-between bg-gray-50 rounded-xl p-1 border border-gray-100 mb-3">
                        <button 
                          onClick={() => handleUpdateStock(item.id, -1)}
                          className="w-8 h-8 rounded-lg bg-white text-gray-600 shadow-sm flex items-center justify-center hover:bg-gray-100 hover:text-red-500 transition-colors active:scale-95"
                        >
                          <Minus size={16} />
                        </button>
                        <div className="flex items-baseline gap-0.5 px-2">
                          <span className={`text-lg font-black ${isCritical ? 'text-red-600' : 'text-gray-900'}`}>
                            {item.current_stock}
                          </span>
                          <span className="text-[11px] font-bold text-gray-400">{item.unit}</span>
                        </div>
                        <button 
                          onClick={() => handleUpdateStock(item.id, 1)}
                          className="w-8 h-8 rounded-lg bg-white text-gray-600 shadow-sm flex items-center justify-center hover:bg-gray-100 hover:text-blue-500 transition-colors active:scale-95"
                        >
                          <Plus size={16} />
                        </button>
                      </div>

                      {/* 프로그레스 바 */}
                      <div>
                        <div className="flex justify-between text-[10px] font-bold text-gray-400 mb-1">
                          <span>기준치 {item.alert_threshold}{item.unit}</span>
                          <span>{Math.round(ratio * 100)}%</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                          <div 
                            className={`h-full transition-all duration-500 ${progressColor}`}
                            style={{ width: `${ratio * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
                {col.items.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-32 text-gray-400">
                    <Package size={24} className="opacity-20 mb-2" />
                    <span className="text-xs font-bold">항목이 없습니다</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
};
