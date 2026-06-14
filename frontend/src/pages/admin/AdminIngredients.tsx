/*
[File Role]
관리자 전용 재고 관리 페이지 (Kanban Board 스타일).
기존 CRUD(추가/수정/삭제) 및 세부 정보, 메모 관리 기능을 유지하면서
가로 스크롤 레이아웃과 퀵 필터를 제공하며, 개별 카드 내에서 인라인 수량 조절이 가능합니다.
*/

import { useState, useRef, useEffect } from 'react';
import {
  Package, Plus, Search, AlertTriangle, Minus, ChevronLeft, ChevronRight,
  Pencil, Trash2, X, Save, ChevronDown
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { QK, QK_DOMAIN } from '../../api/queryKeys';
import type { StandardResponse, Ingredient, IngredientCreate, IngredientUpdate } from '../../types';

// 카테고리 옵션 목록
const CATEGORY_OPTIONS = ['재료', '소모품'] as const;
type FilterType = '전체' | '소모품' | '재료' | '주문 필요';

export const AdminIngredients = () => {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('전체');
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  // 모달 상태
  const [showModal, setShowModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [editingItem, setEditingItem] = useState<Ingredient | null>(null);
  const [selectedItem, setSelectedItem] = useState<Ingredient | null>(null);

  // 폼 상태
  const [formData, setFormData] = useState<IngredientCreate>({
    name: '',
    category: '재료',
    unit: '',
    current_stock: 0,
    alert_threshold: 0,
    memo: '',
    display_order: 0,
  });

  // 메시지 상태
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // [React Query] 재고 목록 조회
  const { data: ingredients = [], isLoading: loading } = useQuery({
    queryKey: QK.ingredients.list,
    queryFn: async () => {
      const res = await apiClient.get<StandardResponse<Ingredient[]>, StandardResponse<Ingredient[]>>('/admin/ingredients');
      return (res.success && res.data) ? res.data : [];
    },
  });

  // [React Query] 저장(CRUD) Mutation
  const saveMutation = useMutation({
    mutationFn: async ({ editingItem, formData }: { editingItem: Ingredient | null; formData: IngredientCreate }) => {
      if (editingItem) {
        const updateData: IngredientUpdate = { ...formData };
        return apiClient.patch<StandardResponse<Ingredient>, StandardResponse<Ingredient>>(`/admin/ingredients/${editingItem.id}`, updateData);
      } else {
        return apiClient.post<StandardResponse<Ingredient>, StandardResponse<Ingredient>>('/admin/ingredients', formData);
      }
    },
    onSuccess: (res, { editingItem, formData }) => {
      if (res.success) {
        setMessage({ type: 'success', text: `'${formData.name}' 항목이 ${editingItem ? '수정' : '추가'}되었습니다.` });
        queryClient.invalidateQueries({ queryKey: QK_DOMAIN.ingredients });
        handleCloseModal();
        if (selectedItem && editingItem && selectedItem.id === editingItem.id) {
           // 상세 모달이 열려있었다면 닫기
           handleCloseDetailModal();
        }
      }
    },
    onError: () => setMessage({ type: 'error', text: '저장 중 오류가 발생했습니다.' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (item: Ingredient) => {
      return apiClient.delete<StandardResponse<null>, StandardResponse<null>>(`/admin/ingredients/${item.id}`);
    },
    onSuccess: (res, item) => {
      if (res.success) {
        setMessage({ type: 'success', text: `'${item.name}' 항목이 삭제되었습니다.` });
        queryClient.invalidateQueries({ queryKey: QK_DOMAIN.ingredients });
      }
    },
    onError: () => setMessage({ type: 'error', text: '삭제 중 오류가 발생했습니다.' }),
  });

  const saving = saveMutation.isPending;

  // 메시지 자동 제거
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  // 수량 조절 핸들러 (Inline Editing -> API 호출)
  const handleUpdateStock = (e: React.MouseEvent, item: Ingredient, delta: number) => {
    e.stopPropagation(); // 카드 클릭 이벤트(상세보기) 방지
    const newStock = Math.max(0, item.current_stock + delta);
    if (newStock === item.current_stock) return;

    saveMutation.mutate({
      editingItem: item,
      formData: {
        name: item.name,
        category: item.category || '재료',
        unit: item.unit || '',
        current_stock: newStock,
        alert_threshold: item.alert_threshold,
        memo: item.memo || '',
        display_order: item.display_order,
      }
    });
  };

  // 모달 제어 함수들
  const handleOpenModal = (item?: Ingredient) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        name: item.name,
        category: item.category || '재료',
        unit: item.unit || '',
        current_stock: item.current_stock,
        alert_threshold: item.alert_threshold,
        memo: item.memo || '',
        display_order: item.display_order,
      });
    } else {
      setEditingItem(null);
      setFormData({
        name: '',
        category: '재료',
        unit: '',
        current_stock: 0,
        alert_threshold: 0,
        memo: '',
        display_order: 0,
      });
    }
    setShowModal(true);
  };

  const handleOpenDetail = (item: Ingredient) => {
    setSelectedItem(item);
    setShowDetailModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingItem(null);
  };

  const handleCloseDetailModal = () => {
    setShowDetailModal(false);
    setSelectedItem(null);
  };

  const handleEditFromDetail = () => {
    if (!selectedItem) return;
    const itemToEdit = selectedItem;
    handleCloseDetailModal();
    handleOpenModal(itemToEdit);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      setMessage({ type: 'error', text: '품목명을 입력해주세요.' });
      return;
    }
    saveMutation.mutate({ editingItem, formData });
  };

  const handleDelete = async (item: Ingredient) => {
    if (!confirm(`'${item.name}' 항목을 삭제하시겠습니까?`)) return;
    deleteMutation.mutate(item);
  };

  // 재고 상태 확인 헬퍼
  const getStockStatus = (item: Ingredient) => {
    if (item.alert_threshold <= 0) return 'NORMAL';
    const ratio = item.current_stock / item.alert_threshold;
    if (ratio <= 0.2 || item.current_stock === 0) return 'CRITICAL';
    if (ratio <= 0.5) return 'WARNING';
    return 'NORMAL';
  };

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

  const scrollByAmount = (amount: number) => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: amount, behavior: 'smooth' });
    }
  };

  // 통계 계산
  const totalItemsCount = ingredients.length;
  const criticalItemsCount = ingredients.filter(i => getStockStatus(i) === 'CRITICAL').length;
  const safeItemsCount = totalItemsCount - criticalItemsCount;

  // 필터링 적용
  const filteredItems = ingredients.filter(item => {
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
    <div className="flex flex-col h-full bg-[#F3F4F6] overflow-hidden font-sans select-none relative">
      {/* 알림 메시지 팝업 */}
      {message && (
        <div className={`absolute top-6 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-full flex items-center gap-3 animate-in fade-in slide-in-from-top-4 ${
          message.type === 'success'
            ? 'bg-emerald-500 text-white shadow-xl shadow-emerald-500/20'
            : 'bg-red-500 text-white shadow-xl shadow-red-500/20'
        }`}>
          <span className="text-sm font-black">{message.text}</span>
        </div>
      )}

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
          <div className="flex items-center gap-4">
            <div className="relative w-64">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="품목 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-3 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-black/5 focus:bg-white transition-all"
              />
            </div>
            {/* 기존 재고 추가 버튼 복구 */}
            <button
              onClick={() => handleOpenModal()}
              className="bg-black text-white px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-gray-800 transition-all active:scale-[0.97] shadow-lg shadow-black/10"
            >
              <Plus size={18} />
              재고 추가
            </button>
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
          {loading ? (
             <div className="w-full flex items-center justify-center text-gray-400 font-bold">로딩 중...</div>
          ) : columns.map((col, idx) => (
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
                      className={`bg-white rounded-2xl p-4 shadow-sm border transition-all hover:shadow-md cursor-pointer ${
                        isCritical ? 'border-red-200 shadow-red-100' : 'border-gray-100'
                      }`}
                      onMouseDown={(e) => e.stopPropagation()} // 드래그 방지
                      onClick={() => handleOpenDetail(item)} // 카드 클릭 시 상세(기존 기능) 모달
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
                          onClick={(e) => handleUpdateStock(e, item, -1)}
                          disabled={saving}
                          className="w-8 h-8 rounded-lg bg-white text-gray-600 shadow-sm flex items-center justify-center hover:bg-gray-100 hover:text-red-500 transition-colors active:scale-95 disabled:opacity-50"
                        >
                          <Minus size={16} />
                        </button>
                        <div className="flex items-baseline gap-0.5 px-2">
                          <span className={`text-lg font-black ${isCritical ? 'text-red-600' : 'text-gray-900'}`}>
                            {item.current_stock}
                          </span>
                          <span className="text-[11px] font-bold text-gray-400">{item.unit || '개'}</span>
                        </div>
                        <button 
                          onClick={(e) => handleUpdateStock(e, item, 1)}
                          disabled={saving}
                          className="w-8 h-8 rounded-lg bg-white text-gray-600 shadow-sm flex items-center justify-center hover:bg-gray-100 hover:text-blue-500 transition-colors active:scale-95 disabled:opacity-50"
                        >
                          <Plus size={16} />
                        </button>
                      </div>

                      {/* 프로그레스 바 */}
                      <div>
                        <div className="flex justify-between text-[10px] font-bold text-gray-400 mb-1">
                          <span>기준치 {item.alert_threshold}{item.unit || '개'}</span>
                          <span>{Math.round(ratio * 100)}%</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                          <div 
                            className={`h-full transition-all duration-500 ${progressColor}`}
                            style={{ width: `${ratio * 100}%` }}
                          />
                        </div>
                      </div>
                      
                      {item.memo && (
                        <p className="mt-3 text-[11px] text-gray-400 truncate w-full border-t border-gray-50 pt-2">
                          📝 {item.memo}
                        </p>
                      )}
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

      {/* ============================== */}
      {/* 1. 기존 상세 정보 모달 복구 */}
      {/* ============================== */}
      {showDetailModal && selectedItem && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={handleCloseDetailModal}
        >
          <div
            className="bg-white w-full max-w-lg rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 모달 헤더 */}
            <div className="px-8 py-7 border-b border-gray-50 flex items-center justify-between bg-gray-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center shadow-md">
                  <Package className="text-white" size={20} />
                </div>
                <div>
                  <h2 className="text-xl font-black text-gray-900 leading-tight">상세 정보</h2>
                  <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wider">Item Details</p>
                </div>
              </div>
              <button
                onClick={handleCloseDetailModal}
                className="w-10 h-10 bg-white border border-gray-100 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-600 shadow-sm transition-all"
              >
                <X size={20} />
              </button>
            </div>

            {/* 모달 본문 */}
            <div className="px-8 py-8 space-y-8">
              <div className="flex items-start justify-between">
                <div>
                  <span className={`text-[11px] font-black px-2.5 py-1 rounded-full mb-2 inline-block ${
                    selectedItem.category === '재료' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                  }`}>
                    {selectedItem.category}
                  </span>
                  <h3 className="text-2xl font-black text-gray-900 tracking-tight">{selectedItem.name}</h3>
                </div>
                {getStockStatus(selectedItem) === 'CRITICAL' && (
                  <div className="bg-red-100 text-red-600 px-3 py-1.5 rounded-xl flex items-center gap-1.5 animate-pulse">
                    <AlertTriangle size={16} />
                    <span className="text-[12px] font-black">주문필요</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100">
                  <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-2">현재 재고</p>
                  <div className="flex items-baseline gap-1">
                    <span className={`text-3xl font-black ${
                      getStockStatus(selectedItem) === 'CRITICAL' ? 'text-red-600' : 'text-gray-900'
                    }`}>
                      {selectedItem.current_stock}
                    </span>
                    <span className="text-gray-400 font-bold text-sm">{selectedItem.unit || '개'}</span>
                  </div>
                </div>
                <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100">
                  <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-2">기준 수량</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black text-gray-900">{selectedItem.alert_threshold}</span>
                    <span className="text-gray-400 font-bold text-sm">{selectedItem.unit || '개'}</span>
                  </div>
                </div>
              </div>

              {selectedItem.memo && (
                <div className="bg-amber-50/50 rounded-2xl p-5 border border-amber-100">
                  <p className="text-[11px] font-black text-amber-600 uppercase tracking-widest mb-2">메모</p>
                  <p className="text-[14px] text-gray-700 font-medium leading-relaxed whitespace-pre-wrap">
                    {selectedItem.memo}
                  </p>
                </div>
              )}
            </div>

            {/* 모달 하단 */}
            <div className="px-8 py-6 bg-gray-50/50 border-t border-gray-100 flex items-center gap-3">
              <button
                onClick={() => {
                  if (confirm(`'${selectedItem.name}' 항목을 삭제하시겠습니까?`)) {
                    deleteMutation.mutate(selectedItem);
                    handleCloseDetailModal();
                  }
                }}
                className="w-14 h-14 bg-white border border-gray-200 text-gray-400 rounded-2xl flex items-center justify-center hover:bg-red-50 hover:text-red-500 hover:border-red-100 transition-all shadow-sm"
                title="삭제"
              >
                <Trash2 size={22} />
              </button>
              <button
                onClick={handleEditFromDetail}
                className="flex-1 bg-black text-white h-14 rounded-2xl font-black text-base flex items-center justify-center gap-2 hover:bg-gray-800 transition-all active:scale-[0.98] shadow-lg shadow-black/10"
              >
                <Pencil size={18} />
                정보 수정하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================== */}
      {/* 2. 기존 추가/수정 모달 복구 */}
      {/* ============================== */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={handleCloseModal}
        >
          <div
            className="bg-white w-full max-w-lg rounded-[28px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 모달 헤더 */}
            <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-xl font-black text-gray-900">
                {editingItem ? '재고 항목 수정' : '재고 항목 추가'}
              </h2>
              <button
                onClick={handleCloseModal}
                className="w-9 h-9 bg-gray-100 rounded-xl flex items-center justify-center text-gray-400 hover:bg-gray-200 hover:text-gray-600 transition-all"
                aria-label="모달 닫기"
              >
                <X size={18} />
              </button>
            </div>

            {/* 모달 본문 */}
            <div className="px-8 py-6 space-y-5 max-h-[60vh] overflow-y-auto">
              {/* 품목명 */}
              <div>
                <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest block mb-2 px-1">
                  품목명 <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-gray-50 border-none rounded-2xl px-5 py-4 text-sm font-bold focus:bg-white focus:ring-4 focus:ring-black/5 transition-all outline-none"
                  placeholder="예: 우유, 일회용컵"
                  autoFocus
                />
              </div>

              {/* 카테고리 & 단위 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest block mb-2 px-1">
                    카테고리
                  </label>
                  <div className="relative">
                    <select
                      value={formData.category || '재료'}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className="w-full appearance-none bg-gray-50 border-none rounded-2xl px-5 py-4 text-sm font-bold focus:bg-white focus:ring-4 focus:ring-black/5 transition-all outline-none cursor-pointer"
                    >
                      {CATEGORY_OPTIONS.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                    <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest block mb-2 px-1">
                    단위
                  </label>
                  <input
                    type="text"
                    value={formData.unit || ''}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    className="w-full bg-gray-50 border-none rounded-2xl px-5 py-4 text-sm font-bold focus:bg-white focus:ring-4 focus:ring-black/5 transition-all outline-none"
                    placeholder="예: 팩, 개, kg"
                  />
                </div>
              </div>

              {/* 현재 재고 & 기준 수량 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest block mb-2 px-1">
                    현재 재고
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.current_stock}
                    onChange={(e) => setFormData({ ...formData, current_stock: parseInt(e.target.value) || 0 })}
                    onFocus={(e) => e.target.select()}
                    className="w-full bg-gray-50 border-none rounded-2xl px-5 py-4 text-sm font-bold focus:bg-white focus:ring-4 focus:ring-black/5 transition-all outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest block mb-2 px-1">
                    기준 수량 (알림 임계값)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.alert_threshold}
                    onChange={(e) => setFormData({ ...formData, alert_threshold: parseInt(e.target.value) || 0 })}
                    onFocus={(e) => e.target.select()}
                    className="w-full bg-gray-50 border-none rounded-2xl px-5 py-4 text-sm font-bold focus:bg-white focus:ring-4 focus:ring-black/5 transition-all outline-none"
                  />
                </div>
              </div>

              {/* 메모 */}
              <div>
                <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest block mb-2 px-1">
                  메모
                </label>
                <textarea
                  value={formData.memo || ''}
                  onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
                  className="w-full bg-gray-50 border-none rounded-2xl px-5 py-4 text-sm font-bold focus:bg-white focus:ring-4 focus:ring-black/5 transition-all outline-none resize-none"
                  rows={2}
                  placeholder="구매처, 유통기한 등 참고 사항"
                />
              </div>
            </div>

            {/* 모달 하단 */}
            <div className="px-8 py-5 border-t border-gray-100 flex items-center gap-3">
              <button
                onClick={handleCloseModal}
                className="flex-1 bg-gray-100 text-gray-600 py-4 rounded-2xl font-black text-sm hover:bg-gray-200 transition-all active:scale-[0.98]"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-black text-white py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 hover:bg-gray-800 transition-all active:scale-[0.98] disabled:opacity-50"
              >
                <Save size={16} />
                {saving ? '저장 중...' : editingItem ? '수정 완료' : '추가'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
