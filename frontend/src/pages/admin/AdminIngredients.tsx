/*
 * [File Role]
 * 관리자 재고 관리 페이지 — 재고 우선순위 점검표
 *
 * 기존 Kanban Board를 제거하고 아래 구조로 재구성:
 *   상단 요약 카드(클릭 가능 상태 필터)
 *   → 오늘 확인할 품목 패널 + 구매 목록 복사
 *   → 검색·상태·카테고리 필터·정렬 툴바
 *   → 데스크톱/iPad: sticky 헤더 단일 표, 모바일: 카드 목록
 *   → 우측 편집 Drawer (추가/수정 통합)
 *
 * 유지된 기능: 추가·수정·삭제·메모·단위·정렬 순서
 * 변경: 상태 판정 — alert_threshold 의미 일치, 수량 PATCH — current_stock 단독
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  Package, Plus, Search, RefreshCw, Copy, Check,
  X, Trash2, ChevronDown, AlertTriangle, Minus, ShoppingCart,
  Loader2,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { apiClient } from '../../api/client';
import { QK, QK_DOMAIN } from '../../api/queryKeys';
import type { StandardResponse, Ingredient, IngredientCreate, IngredientUpdate } from '../../types';
import {
  getInventoryStatus,
  sortIngredients,
  STATUS_META,
  buildPurchaseListText,
  formatUpdatedAt,
  getShortage,
} from './inventory/inventoryStatus';
import type { InventoryStatus, SortMode, StatusMeta } from './inventory/inventoryStatus';

// ─────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────
const CATEGORY_OPTIONS = ['재료', '소모품'] as const;
type CategoryFilter = '전체' | '재료' | '소모품';
type StatusFilter = '전체' | InventoryStatus;

const SORT_OPTIONS: { key: SortMode; label: string }[] = [
  { key: 'shortage', label: '부족한 순' },
  { key: 'name', label: '품목명 순' },
  { key: 'updated', label: '최근 수정 순' },
  { key: 'display_order', label: '관리자 지정 순' },
];

const EMPTY_FORM: IngredientCreate = {
  name: '',
  category: '재료',
  unit: '',
  current_stock: 0,
  alert_threshold: 0,
  memo: '',
  display_order: 0,
};

// ─────────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────────
export const AdminIngredients = () => {
  const queryClient = useQueryClient();

  // ── 필터·정렬 상태 ──
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('전체');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('전체');
  const [sortMode, setSortMode] = useState<SortMode>('shortage');

  // ── Drawer 상태 ──
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Ingredient | null>(null);
  const [formData, setFormData] = useState<IngredientCreate>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  // ── 품목별 수량 저장 중 상태 (id Set) ──
  const [savingIds, setSavingIds] = useState<Set<number>>(new Set());

  // ── 인라인 수량 직접 입력 상태 ──
  const [inlineEditId, setInlineEditId] = useState<number | null>(null);
  const [inlineValue, setInlineValue] = useState('');
  const inlineRef = useRef<HTMLInputElement>(null);

  // ── 구매 목록 복사 상태 ──
  const [copied, setCopied] = useState(false);

  // ─────────────────────────────────────────────
  // React Query: 재고 목록 조회
  // ─────────────────────────────────────────────
  const {
    data: ingredients = [],
    isLoading,
    isError,
    refetch,
    dataUpdatedAt,
  } = useQuery({
    queryKey: QK.ingredients.list,
    queryFn: async () => {
      const res = await apiClient.get<StandardResponse<Ingredient[]>, StandardResponse<Ingredient[]>>(
        '/admin/ingredients'
      );
      return res.success && res.data ? res.data : [];
    },
    staleTime: 30_000,
  });

  // ─────────────────────────────────────────────
  // React Query: 수량 부분 PATCH Mutation (품목별)
  // ─────────────────────────────────────────────
  const stockMutation = useMutation({
    mutationFn: async ({ id, nextStock }: { id: number; nextStock: number }) => {
      return apiClient.patch<StandardResponse<Ingredient>, StandardResponse<Ingredient>>(
        `/admin/ingredients/${id}`,
        { current_stock: nextStock }
      );
    },
    onMutate: async ({ id, nextStock }) => {
      // Optimistic update
      setSavingIds(prev => new Set(prev).add(id));
      await queryClient.cancelQueries({ queryKey: QK.ingredients.list });
      const snapshot = queryClient.getQueryData<Ingredient[]>(QK.ingredients.list);
      queryClient.setQueryData<Ingredient[]>(QK.ingredients.list, old =>
        old?.map(item => item.id === id ? { ...item, current_stock: nextStock } : item) ?? []
      );
      return { snapshot };
    },
    onError: (_err, { id }, ctx) => {
      // Rollback
      if (ctx?.snapshot) {
        queryClient.setQueryData(QK.ingredients.list, ctx.snapshot);
      }
      toast.error('재고 수량 저장에 실패했습니다.');
      setSavingIds(prev => { const s = new Set(prev); s.delete(id); return s; });
    },
    onSuccess: (_res, { id }) => {
      setSavingIds(prev => { const s = new Set(prev); s.delete(id); return s; });
      queryClient.invalidateQueries({ queryKey: QK_DOMAIN.ingredients });
    },
  });

  // ─────────────────────────────────────────────
  // React Query: 전체 정보 저장 Mutation (추가/수정)
  // ─────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async (payload: { item: Ingredient | null; form: IngredientCreate }) => {
      if (payload.item) {
        const update: IngredientUpdate = { ...payload.form };
        return apiClient.patch<StandardResponse<Ingredient>, StandardResponse<Ingredient>>(
          `/admin/ingredients/${payload.item.id}`, update
        );
      }
      return apiClient.post<StandardResponse<Ingredient>, StandardResponse<Ingredient>>(
        '/admin/ingredients', payload.form
      );
    },
    onSuccess: (res, { item, form }) => {
      if (res.success) {
        toast.success(`'${form.name}' 항목이 ${item ? '수정' : '추가'}되었습니다.`);
        queryClient.invalidateQueries({ queryKey: QK_DOMAIN.ingredients });
        handleCloseDrawer();
      }
    },
    onError: () => toast.error('저장 중 오류가 발생했습니다.'),
  });

  // ─────────────────────────────────────────────
  // React Query: 삭제 Mutation
  // ─────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async (item: Ingredient) =>
      apiClient.delete<StandardResponse<null>, StandardResponse<null>>(
        `/admin/ingredients/${item.id}`
      ),
    onSuccess: (_res, item) => {
      toast.success(`'${item.name}' 항목이 삭제되었습니다.`);
      queryClient.invalidateQueries({ queryKey: QK_DOMAIN.ingredients });
      handleCloseDrawer();
    },
    onError: () => toast.error('삭제 중 오류가 발생했습니다.'),
  });

  // ─────────────────────────────────────────────
  // 파생 데이터 (useMemo)
  // ─────────────────────────────────────────────

  // 전체 기준 요약 카드 숫자 (검색·카테고리 필터 무관)
  const summaryStats = useMemo(() => {
    const counts: Record<StatusFilter, number> = {
      '전체': ingredients.length,
      OUT_OF_STOCK: 0, ORDER_REQUIRED: 0, WARNING: 0, NORMAL: 0, UNSET: 0,
    };
    ingredients.forEach(item => {
      const s = getInventoryStatus(item);
      counts[s]++;
    });
    return counts;
  }, [ingredients]);

  // 오늘 확인할 품목 (품절·주문필요·주의)
  const urgentItems = useMemo(() =>
    sortIngredients(
      ingredients.filter((i: Ingredient) => {
        const s = getInventoryStatus(i);
        return s === 'OUT_OF_STOCK' || s === 'ORDER_REQUIRED' || s === 'WARNING';
      }),
      'shortage'
    ),
    [ingredients]
  );

  // 필터+정렬 적용된 목록
  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = ingredients.filter((item: Ingredient) => {
      const matchSearch = !query
        || item.name.toLowerCase().includes(query)
        || (item.memo ?? '').toLowerCase().includes(query)
        || (item.unit ?? '').toLowerCase().includes(query);

      const matchStatus = statusFilter === '전체' || getInventoryStatus(item) === statusFilter;
      const matchCategory = categoryFilter === '전체' || item.category === categoryFilter;

      return matchSearch && matchStatus && matchCategory;
    });
    return sortIngredients(filtered, sortMode);
  }, [ingredients, searchQuery, statusFilter, categoryFilter, sortMode]);

  // 마지막 갱신 시각
  const lastUpdated = useMemo(() => {
    if (!dataUpdatedAt) return null;
    const d = new Date(dataUpdatedAt);
    return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  }, [dataUpdatedAt]);

  // ─────────────────────────────────────────────
  // 이벤트 핸들러
  // ─────────────────────────────────────────────

  // Drawer 열기 (신규/수정)
  const handleOpenDrawer = useCallback((item?: Ingredient) => {
    setFormError(null);
    if (item) {
      setEditingItem(item);
      setFormData({
        name: item.name,
        category: item.category ?? '재료',
        unit: item.unit ?? '',
        current_stock: item.current_stock,
        alert_threshold: item.alert_threshold,
        memo: item.memo ?? '',
        display_order: item.display_order,
      });
    } else {
      setEditingItem(null);
      setFormData(EMPTY_FORM);
    }
    setDrawerOpen(true);
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setDrawerOpen(false);
    setEditingItem(null);
    setFormError(null);
  }, []);

  // 저장
  const handleSave = useCallback(() => {
    const trimmedName = formData.name.trim();
    if (!trimmedName) {
      setFormError('품목명을 입력해주세요.');
      return;
    }
    if ((formData.current_stock ?? 0) < 0) {
      setFormError('현재 재고는 0 이상이어야 합니다.');
      return;
    }
    if ((formData.alert_threshold ?? 0) < 0) {
      setFormError('부족 기준은 0 이상이어야 합니다.');
      return;
    }
    saveMutation.mutate({
      item: editingItem,
      form: {
        ...formData,
        name: trimmedName,
        unit: formData.unit?.trim() ?? '',
        memo: formData.memo?.trim() ?? '',
      },
    });
  }, [formData, editingItem, saveMutation]);

  // 삭제
  const handleDelete = useCallback((item: Ingredient) => {
    if (!confirm(`'${item.name}' 재고 항목을 삭제하시겠습니까?\n삭제 후 재고 목록에서 보이지 않습니다.`)) return;
    deleteMutation.mutate(item);
  }, [deleteMutation]);

  // ± 1 수량 조절
  const handleUpdateStock = useCallback((e: React.MouseEvent | React.KeyboardEvent, item: Ingredient, delta: number) => {
    e.stopPropagation();
    if (savingIds.has(item.id)) return;
    const next = Math.max(0, item.current_stock + delta);
    if (next === item.current_stock) return;
    stockMutation.mutate({ id: item.id, nextStock: next });
  }, [savingIds, stockMutation]);

  // 인라인 수량 직접 입력
  const handleStartInlineEdit = useCallback((e: React.MouseEvent, item: Ingredient) => {
    e.stopPropagation();
    if (savingIds.has(item.id)) return;
    setInlineEditId(item.id);
    setInlineValue(String(item.current_stock));
  }, [savingIds]);

  const handleInlineCommit = useCallback((item: Ingredient) => {
    const val = parseInt(inlineValue, 10);
    if (!isNaN(val) && val >= 0 && val !== item.current_stock) {
      stockMutation.mutate({ id: item.id, nextStock: val });
    }
    setInlineEditId(null);
    setInlineValue('');
  }, [inlineValue, stockMutation]);

  const handleInlineKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>, item: Ingredient) => {
    if (e.key === 'Enter') { e.preventDefault(); handleInlineCommit(item); }
    if (e.key === 'Escape') { setInlineEditId(null); setInlineValue(''); }
  }, [handleInlineCommit]);

  useEffect(() => {
    if (inlineEditId !== null) inlineRef.current?.focus();
  }, [inlineEditId]);

  // 구매 목록 복사
  const handleCopyPurchaseList = useCallback(async () => {
    const text = buildPurchaseListText(urgentItems);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('구매 목록이 클립보드에 복사되었습니다.');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // textarea fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      toast.success('구매 목록이 복사되었습니다.');
      setTimeout(() => setCopied(false), 2500);
    }
  }, [urgentItems]);

  // ESC 키로 Drawer 닫기
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleCloseDrawer(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleCloseDrawer]);

  // ─────────────────────────────────────────────
  // 렌더: 로딩
  // ─────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex flex-col h-full bg-[#F3F4F6]">
        <SkeletonHeader />
        <div className="flex-1 p-4 md:p-6 space-y-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-16 bg-white rounded-2xl animate-shimmer" />
          ))}
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────
  // 렌더: 오류
  // ─────────────────────────────────────────────
  if (isError) {
    return (
      <div className="flex flex-col h-full bg-[#F3F4F6] items-center justify-center gap-4 p-8">
        <AlertTriangle className="text-red-400" size={48} />
        <div className="text-center">
          <p className="text-lg font-black text-gray-800">재고 정보를 불러오지 못했습니다.</p>
          <p className="text-sm text-gray-500 mt-1">네트워크 상태를 확인한 후 다시 시도해 주세요.</p>
        </div>
        <button
          onClick={() => refetch()}
          className="bg-primary text-white px-6 py-3 rounded-2xl font-bold hover:bg-primary-hover transition-colors"
        >
          다시 시도
        </button>
      </div>
    );
  }

  // ─────────────────────────────────────────────
  // 렌더: 메인
  // ─────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-[#F3F4F6] overflow-hidden relative">

      {/* ── 헤더 ── */}
      <header className="bg-white px-4 md:px-8 py-4 md:py-5 border-b border-gray-200 shrink-0 z-20 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-black rounded-2xl flex items-center justify-center shadow-lg shadow-black/10 shrink-0">
              <Package className="text-white" size={20} />
            </div>
            <div>
              <h1 className="text-lg md:text-2xl font-black text-gray-900 tracking-tight leading-tight">재고 관리</h1>
              <p className="text-[11px] md:text-xs text-gray-400 font-medium hidden sm:block">
                이번 주 운영에 필요한 재료와 소모품을 점검합니다.
                {lastUpdated && <span className="ml-2">마지막 갱신 {lastUpdated}</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => refetch()}
              aria-label="새로고침"
              className="w-9 h-9 md:w-10 md:h-10 bg-gray-100 rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors"
            >
              <RefreshCw size={16} />
            </button>
            <button
              onClick={() => handleOpenDrawer()}
              className="bg-primary text-white px-3 md:px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-1.5 hover:bg-primary-hover transition-all active:scale-[0.97] shadow-md shadow-primary/20"
            >
              <Plus size={16} />
              <span className="hidden sm:inline">재고 추가</span>
              <span className="sm:hidden">추가</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── 스크롤 가능 본문 ── */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-4 md:p-6 space-y-4">

          {/* ── 상태 요약 카드 ── */}
          <SummaryCards
            stats={summaryStats}
            activeFilter={statusFilter}
            onFilterChange={setStatusFilter}
          />

          {/* ── 오늘 확인할 품목 패널 ── */}
          {urgentItems.length > 0 ? (
            <UrgentPanel
              items={urgentItems}
              onCopy={handleCopyPurchaseList}
              copied={copied}
              onClickItem={handleOpenDrawer}
            />
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 px-6 py-5 flex items-center gap-3 shadow-sm">
              <span className="text-2xl">✅</span>
              <div>
                <p className="font-black text-gray-800 text-sm">현재 바로 확인할 부족 재고가 없습니다.</p>
                <p className="text-xs text-gray-400 mt-0.5">모든 품목이 정상 범위입니다.</p>
              </div>
            </div>
          )}

          {/* ── 검색·필터·정렬 툴바 ── */}
          <Toolbar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            statusFilter={statusFilter}
            onStatusChange={setStatusFilter}
            categoryFilter={categoryFilter}
            onCategoryChange={setCategoryFilter}
            sortMode={sortMode}
            onSortChange={setSortMode}
          />

          {/* ── 빈 데이터 ── */}
          {ingredients.length === 0 ? (
            <EmptyAll onAdd={() => handleOpenDrawer()} />
          ) : filteredItems.length === 0 ? (
            <EmptyFiltered onReset={() => { setSearchQuery(''); setStatusFilter('전체'); setCategoryFilter('전체'); }} />
          ) : (
            <>
              {/* 데스크톱/iPad: 표 (md 이상) */}
              <div className="hidden md:block">
                <IngredientTable
                  items={filteredItems}
                  savingIds={savingIds}
                  inlineEditId={inlineEditId}
                  inlineValue={inlineValue}
                  inlineRef={inlineRef}
                  onUpdateStock={handleUpdateStock}
                  onStartInlineEdit={handleStartInlineEdit}
                  onInlineChange={setInlineValue}
                  onInlineKeyDown={handleInlineKeyDown}
                  onInlineBlur={handleInlineCommit}
                  onClickRow={handleOpenDrawer}
                />
              </div>

              {/* 모바일: 카드 목록 (md 미만) */}
              <div className="md:hidden space-y-3">
                {filteredItems.map(item => (
                  <MobileCard
                    key={item.id}
                    item={item}
                    isSaving={savingIds.has(item.id)}
                    inlineEditId={inlineEditId}
                    inlineValue={inlineValue}
                    inlineRef={inlineRef}
                    onUpdateStock={handleUpdateStock}
                    onStartInlineEdit={handleStartInlineEdit}
                    onInlineChange={setInlineValue}
                    onInlineKeyDown={handleInlineKeyDown}
                    onInlineBlur={handleInlineCommit}
                    onClickCard={handleOpenDrawer}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </main>

      {/* ── 편집 Drawer ── */}
      <EditorDrawer
        open={drawerOpen}
        editingItem={editingItem}
        formData={formData}
        formError={formError}
        isSaving={saveMutation.isPending}
        isDeleting={deleteMutation.isPending}
        onClose={handleCloseDrawer}
        onFormChange={setFormData}
        onSave={handleSave}
        onDelete={handleDelete}
      />

      {/* Drawer 배경 오버레이 */}
      {drawerOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 md:hidden"
          onClick={handleCloseDrawer}
          aria-hidden="true"
        />
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────
// 서브 컴포넌트: 로딩 스켈레톤 헤더
// ─────────────────────────────────────────────────────
const SkeletonHeader = () => (
  <div className="bg-white px-8 py-5 border-b border-gray-200 flex items-center justify-between animate-shimmer">
    <div className="flex items-center gap-4">
      <div className="w-12 h-12 bg-gray-200 rounded-2xl" />
      <div>
        <div className="h-6 w-24 bg-gray-200 rounded-lg" />
        <div className="h-3 w-48 bg-gray-100 rounded mt-1" />
      </div>
    </div>
    <div className="h-10 w-24 bg-gray-200 rounded-xl" />
  </div>
);

// ─────────────────────────────────────────────────────
// 서브 컴포넌트: 상태 요약 카드
// ─────────────────────────────────────────────────────
const SummaryCards = ({
  stats,
  activeFilter,
  onFilterChange,
}: {
  stats: Record<StatusFilter, number>;
  activeFilter: StatusFilter;
  onFilterChange: (f: StatusFilter) => void;
}) => {
  const cards: { key: StatusFilter; label: string; countKey: StatusFilter; color: string; activeColor: string }[] = [
    { key: '전체', label: '전체', countKey: '전체', color: 'bg-gray-50 border-gray-200 text-gray-700', activeColor: 'bg-gray-900 text-white border-gray-900' },
    { key: 'OUT_OF_STOCK', label: '품절', countKey: 'OUT_OF_STOCK', color: 'bg-red-50 border-red-100 text-red-700', activeColor: 'bg-red-600 text-white border-red-600' },
    { key: 'ORDER_REQUIRED', label: '주문 필요', countKey: 'ORDER_REQUIRED', color: 'bg-orange-50 border-orange-100 text-orange-700', activeColor: 'bg-orange-500 text-white border-orange-500' },
    { key: 'WARNING', label: '주의', countKey: 'WARNING', color: 'bg-yellow-50 border-yellow-100 text-yellow-700', activeColor: 'bg-yellow-500 text-white border-yellow-500' },
    { key: 'NORMAL', label: '정상', countKey: 'NORMAL', color: 'bg-emerald-50 border-emerald-100 text-emerald-700', activeColor: 'bg-emerald-600 text-white border-emerald-600' },
    { key: 'UNSET', label: '미설정', countKey: 'UNSET', color: 'bg-gray-50 border-gray-200 text-gray-500', activeColor: 'bg-gray-500 text-white border-gray-500' },
  ];

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
      {cards.map(card => {
        const isActive = activeFilter === card.key;
        return (
          <button
            key={card.key}
            onClick={() => onFilterChange(card.key)}
            className={`shrink-0 flex flex-col items-center px-3 md:px-4 py-2.5 rounded-2xl border font-bold text-xs md:text-sm transition-all ${
              isActive ? card.activeColor : card.color
            } hover:opacity-90 active:scale-95`}
          >
            <span className="text-lg md:text-2xl font-black leading-tight">{stats[card.countKey]}</span>
            <span className="mt-0.5 whitespace-nowrap">{card.label}</span>
          </button>
        );
      })}
    </div>
  );
};

// ─────────────────────────────────────────────────────
// 서브 컴포넌트: 오늘 확인할 품목 패널
// ─────────────────────────────────────────────────────
const UrgentPanel = ({
  items,
  onCopy,
  copied,
  onClickItem,
}: {
  items: Ingredient[];
  onCopy: () => void;
  copied: boolean;
  onClickItem: (item: Ingredient) => void;
}) => (
  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
    <div className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-gray-100">
      <div className="flex items-center gap-2">
        <AlertTriangle size={16} className="text-orange-500" />
        <span className="font-black text-gray-800 text-sm">오늘 확인할 품목</span>
        <span className="bg-orange-100 text-orange-700 text-xs font-black px-2 py-0.5 rounded-full">{items.length}개</span>
      </div>
      <button
        onClick={onCopy}
        disabled={items.length === 0}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
          copied
            ? 'bg-emerald-100 text-emerald-700'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        } disabled:opacity-40`}
        aria-label="구매 목록 클립보드에 복사"
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
        <span className="hidden sm:inline">{copied ? '복사됨' : '구매 목록 복사'}</span>
        <span className="sm:hidden">{copied ? '복사됨' : '복사'}</span>
      </button>
    </div>
    <div className="flex gap-3 p-4 overflow-x-auto hide-scrollbar">
      {items.map(item => {
        const status = getInventoryStatus(item);
        const meta = STATUS_META[status];
        const unit = item.unit ?? '개';
        const shortage = getShortage(item);
        return (
          <button
            key={item.id}
            onClick={() => onClickItem(item)}
            className={`shrink-0 flex flex-col gap-1.5 p-3 rounded-xl border ${meta.bgColor} ${meta.borderColor} text-left min-w-[130px] max-w-[160px] hover:shadow-md transition-all active:scale-95`}
          >
            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${meta.badgeBg} ${meta.badgeText}`}>
              {meta.emoji} {meta.label}
            </span>
            <p className="font-black text-gray-900 text-sm truncate">{item.name}</p>
            <p className="text-xs text-gray-500">
              현재 <span className={`font-black ${meta.textColor}`}>{item.current_stock}{unit}</span>
            </p>
            {item.alert_threshold > 0 && (
              <p className="text-xs text-gray-400">기준 {item.alert_threshold}{unit}</p>
            )}
            <p className={`text-[11px] font-bold ${meta.textColor}`}>
              {status === 'OUT_OF_STOCK' && '품절'}
              {status === 'ORDER_REQUIRED' && `${shortage}${unit} 부족`}
              {status === 'WARNING' && '곧 부족'}
            </p>
          </button>
        );
      })}
    </div>
  </div>
);

// ─────────────────────────────────────────────────────
// 서브 컴포넌트: 검색·필터·정렬 툴바
// ─────────────────────────────────────────────────────
const Toolbar = ({
  searchQuery, onSearchChange,
  categoryFilter, onCategoryChange,
  sortMode, onSortChange,
}: {
  searchQuery: string; onSearchChange: (v: string) => void;
  statusFilter?: StatusFilter; onStatusChange?: (v: StatusFilter) => void;
  categoryFilter: CategoryFilter; onCategoryChange: (v: CategoryFilter) => void;
  sortMode: SortMode; onSortChange: (v: SortMode) => void;
}) => (
  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 md:p-4 space-y-3">
    <div className="flex gap-2">
      {/* 검색 */}
      <div className="relative flex-1">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="text"
          placeholder="품목명, 메모, 단위 검색..."
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-3 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
        />
      </div>
      {/* 정렬 */}
      <div className="relative shrink-0">
        <select
          value={sortMode}
          onChange={e => onSortChange(e.target.value as SortMode)}
          className="appearance-none bg-gray-50 border border-gray-200 rounded-xl pl-3 pr-8 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer"
        >
          {SORT_OPTIONS.map(o => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>
        <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
      </div>
    </div>

    {/* 카테고리 필터 */}
    <div className="flex gap-1.5">
      {(['전체', '재료', '소모품'] as const).map(cat => (
        <button
          key={cat}
          onClick={() => onCategoryChange(cat)}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
            categoryFilter === cat
              ? 'bg-gray-900 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {cat}
        </button>
      ))}
    </div>
  </div>
);

// ─────────────────────────────────────────────────────
// 서브 컴포넌트: 인라인 수량 조절 (공통)
// ─────────────────────────────────────────────────────
interface StockControlProps {
  item: Ingredient;
  isSaving: boolean;
  inlineEditId: number | null;
  inlineValue: string;
  inlineRef: React.RefObject<HTMLInputElement | null>;
  onUpdateStock: (e: React.MouseEvent | React.KeyboardEvent, item: Ingredient, delta: number) => void;
  onStartInlineEdit: (e: React.MouseEvent, item: Ingredient) => void;
  onInlineChange: (v: string) => void;
  onInlineKeyDown: (e: React.KeyboardEvent<HTMLInputElement>, item: Ingredient) => void;
  onInlineBlur: (item: Ingredient) => void;
}

const StockControl = ({
  item, isSaving, inlineEditId, inlineValue, inlineRef,
  onUpdateStock, onStartInlineEdit, onInlineChange, onInlineKeyDown, onInlineBlur,
}: StockControlProps) => {
  const unit = item.unit ?? '개';
  const isEditing = inlineEditId === item.id;

  return (
    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
      <button
        onClick={e => onUpdateStock(e, item, -1)}
        disabled={isSaving || item.current_stock <= 0}
        aria-label={`${item.name} 재고 1 감소`}
        className="min-w-[36px] min-h-[36px] md:min-w-[32px] md:min-h-[32px] rounded-lg bg-gray-100 text-gray-600 flex items-center justify-center hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed active:scale-95"
      >
        <Minus size={14} />
      </button>

      {isEditing ? (
        <input
          ref={inlineRef}
          type="number"
          inputMode="numeric"
          min={0}
          value={inlineValue}
          onChange={e => onInlineChange(e.target.value)}
          onKeyDown={e => onInlineKeyDown(e, item)}
          onBlur={() => onInlineBlur(item)}
          className="w-16 text-center font-black text-sm border-2 border-primary/40 rounded-lg py-1 focus:outline-none focus:border-primary"
        />
      ) : (
        <button
          onClick={e => onStartInlineEdit(e, item)}
          disabled={isSaving}
          title="클릭하여 직접 입력"
          className="min-w-[48px] text-center font-black text-gray-900 text-sm hover:bg-gray-100 rounded-lg px-2 py-1 transition-colors disabled:opacity-50"
        >
          {isSaving ? <Loader2 size={14} className="animate-spin mx-auto" /> : `${item.current_stock}${unit}`}
        </button>
      )}

      <button
        onClick={e => onUpdateStock(e, item, 1)}
        disabled={isSaving}
        aria-label={`${item.name} 재고 1 증가`}
        className="min-w-[36px] min-h-[36px] md:min-w-[32px] md:min-h-[32px] rounded-lg bg-gray-100 text-gray-600 flex items-center justify-center hover:bg-blue-50 hover:text-blue-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed active:scale-95"
      >
        <Plus size={14} />
      </button>
    </div>
  );
};

// ─────────────────────────────────────────────────────
// 서브 컴포넌트: 데스크톱 표
// ─────────────────────────────────────────────────────
const IngredientTable = ({
  items, savingIds, inlineEditId, inlineValue, inlineRef,
  onUpdateStock, onStartInlineEdit, onInlineChange, onInlineKeyDown, onInlineBlur,
  onClickRow,
}: {
  items: Ingredient[];
  savingIds: Set<number>;
  inlineEditId: number | null;
  inlineValue: string;
  inlineRef: React.RefObject<HTMLInputElement | null>;
  onUpdateStock: (e: React.MouseEvent | React.KeyboardEvent, item: Ingredient, delta: number) => void;
  onStartInlineEdit: (e: React.MouseEvent, item: Ingredient) => void;
  onInlineChange: (v: string) => void;
  onInlineKeyDown: (e: React.KeyboardEvent<HTMLInputElement>, item: Ingredient) => void;
  onInlineBlur: (item: Ingredient) => void;
  onClickRow: (item: Ingredient) => void;
}) => (
  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-gray-50 border-b border-gray-100 sticky top-0 z-10">
          <th className="px-4 py-3 text-left text-xs font-black text-gray-400 uppercase tracking-wider w-24">상태</th>
          <th className="px-4 py-3 text-left text-xs font-black text-gray-400 uppercase tracking-wider">품목</th>
          <th className="px-4 py-3 text-left text-xs font-black text-gray-400 uppercase tracking-wider w-20">분류</th>
          <th className="px-4 py-3 text-left text-xs font-black text-gray-400 uppercase tracking-wider w-44">현재 재고</th>
          <th className="px-4 py-3 text-left text-xs font-black text-gray-400 uppercase tracking-wider w-24">기준</th>
          <th className="px-4 py-3 text-left text-xs font-black text-gray-400 uppercase tracking-wider hidden xl:table-cell">메모</th>
          <th className="px-4 py-3 text-left text-xs font-black text-gray-400 uppercase tracking-wider hidden xl:table-cell w-28">수정</th>
          <th className="px-4 py-3 w-12" />
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        {items.map(item => {
          const status = getInventoryStatus(item);
          const meta = STATUS_META[status];
          const unit = item.unit ?? '개';
          const isSaving = savingIds.has(item.id);
          return (
            <tr
              key={item.id}
              onClick={() => onClickRow(item)}
              className="hover:bg-gray-50/70 cursor-pointer transition-colors group"
            >
              <td className="px-4 py-3">
                <span className={`inline-flex items-center gap-1 text-xs font-black px-2 py-1 rounded-full ${meta.badgeBg} ${meta.badgeText}`}>
                  {meta.emoji} {meta.shortLabel}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="font-black text-gray-900">{item.name}</span>
              </td>
              <td className="px-4 py-3">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  item.category === '재료' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'
                }`}>
                  {item.category ?? '-'}
                </span>
              </td>
              <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                <StockControl
                  item={item}
                  isSaving={isSaving}
                  inlineEditId={inlineEditId}
                  inlineValue={inlineValue}
                  inlineRef={inlineRef}
                  onUpdateStock={onUpdateStock}
                  onStartInlineEdit={onStartInlineEdit}
                  onInlineChange={onInlineChange}
                  onInlineKeyDown={onInlineKeyDown}
                  onInlineBlur={onInlineBlur}
                />
              </td>
              <td className="px-4 py-3 text-gray-500 font-medium">
                {item.alert_threshold > 0 ? `${item.alert_threshold}${unit}` : <span className="text-gray-300">-</span>}
              </td>
              <td className="px-4 py-3 hidden xl:table-cell text-gray-400 text-xs max-w-[160px]">
                <span className="truncate block">{item.memo || <span className="text-gray-200">-</span>}</span>
              </td>
              <td className="px-4 py-3 hidden xl:table-cell text-gray-400 text-xs">
                {formatUpdatedAt(item.updated_at)}
              </td>
              <td className="px-4 py-3">
                <button
                  onClick={e => { e.stopPropagation(); onClickRow(item); }}
                  aria-label={`${item.name} 편집`}
                  className="w-8 h-8 rounded-lg bg-gray-100 text-gray-400 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-gray-200 transition-all"
                >
                  <ChevronDown size={14} className="-rotate-90" />
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

// ─────────────────────────────────────────────────────
// 서브 컴포넌트: 모바일 카드
// ─────────────────────────────────────────────────────
const MobileCard = ({
  item, isSaving, inlineEditId, inlineValue, inlineRef,
  onUpdateStock, onStartInlineEdit, onInlineChange, onInlineKeyDown, onInlineBlur,
  onClickCard,
}: StockControlProps & { item: Ingredient; isSaving: boolean; onClickCard: (item: Ingredient) => void }) => {
  const status = getInventoryStatus(item);
  const meta = STATUS_META[status];
  const unit = item.unit ?? '개';

  return (
    <div
      className={`bg-white rounded-2xl border shadow-sm p-4 transition-all ${meta.borderColor}`}
      onClick={() => onClickCard(item)}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0 pr-3">
          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full inline-block mb-1.5 ${meta.badgeBg} ${meta.badgeText}`}>
            {meta.emoji} {meta.label}
          </span>
          <h3 className="font-black text-gray-900 text-base leading-tight">{item.name}</h3>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
          item.category === '재료' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'
        }`}>
          {item.category ?? '-'}
        </span>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-500">
          {item.alert_threshold > 0 && (
            <span>기준 {item.alert_threshold}{unit}</span>
          )}
          {item.memo && (
            <p className="mt-1 text-amber-600 truncate max-w-[160px]">📝 {item.memo}</p>
          )}
        </div>
        <div onClick={e => e.stopPropagation()}>
          <StockControl
            item={item}
            isSaving={isSaving}
            inlineEditId={inlineEditId}
            inlineValue={inlineValue}
            inlineRef={inlineRef}
            onUpdateStock={onUpdateStock}
            onStartInlineEdit={onStartInlineEdit}
            onInlineChange={onInlineChange}
            onInlineKeyDown={onInlineKeyDown}
            onInlineBlur={onInlineBlur}
          />
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────
// 서브 컴포넌트: 편집 Drawer
// ─────────────────────────────────────────────────────
interface EditorDrawerProps {
  open: boolean;
  editingItem: Ingredient | null;
  formData: IngredientCreate;
  formError: string | null;
  isSaving: boolean;
  isDeleting: boolean;
  onClose: () => void;
  onFormChange: (d: IngredientCreate) => void;
  onSave: () => void;
  onDelete: (item: Ingredient) => void;
}

type DrawerContentMeta = StatusMeta | null;

const EditorDrawer = ({
  open, editingItem, formData, formError, isSaving, isDeleting,
  onClose, onFormChange, onSave, onDelete,
}: EditorDrawerProps) => {
  const status = editingItem ? getInventoryStatus(editingItem) : null;
  const meta = status ? STATUS_META[status] : null;

  return (
    <>
      {/* 데스크톱: 오른쪽 슬라이드 Drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-sm bg-white shadow-2xl z-40 flex flex-col transition-transform duration-300 ease-in-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        } hidden md:flex`}
        aria-modal="true"
        role="dialog"
        aria-label={editingItem ? '재고 편집' : '재고 추가'}
      >
        <DrawerContent
          editingItem={editingItem}
          formData={formData}
          formError={formError}
          isSaving={isSaving}
          isDeleting={isDeleting}
          meta={meta}
          status={status}
          onClose={onClose}
          onFormChange={onFormChange}
          onSave={onSave}
          onDelete={onDelete}
        />
      </div>

      {/* 모바일: 하단 시트 */}
      <div
        className={`fixed inset-x-0 bottom-0 bg-white rounded-t-3xl shadow-2xl z-40 flex flex-col max-h-[92vh] transition-transform duration-300 ease-in-out ${
          open ? 'translate-y-0' : 'translate-y-full'
        } md:hidden`}
        aria-modal="true"
        role="dialog"
        aria-label={editingItem ? '재고 편집' : '재고 추가'}
      >
        {/* 핸들 */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>
        <DrawerContent
          editingItem={editingItem}
          formData={formData}
          formError={formError}
          isSaving={isSaving}
          isDeleting={isDeleting}
          meta={meta}
          status={status}
          onClose={onClose}
          onFormChange={onFormChange}
          onSave={onSave}
          onDelete={onDelete}
        />
      </div>
    </>
  );
};

// Drawer 내용 공통 컴포넌트
const DrawerContent = ({
  editingItem, formData, formError, isSaving, isDeleting, meta, status,
  onClose, onFormChange, onSave, onDelete,
}: Omit<EditorDrawerProps, 'open'> & {
  meta: DrawerContentMeta;
  status: InventoryStatus | null;
}) => (
  <>
    {/* Drawer 헤더 */}
    <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
      <div>
        <h2 className="text-lg font-black text-gray-900">
          {editingItem ? editingItem.name : '새 품목 추가'}
        </h2>
        {status && meta && (
          <span className={`text-xs font-bold ${meta.textColor}`}>
            {meta.emoji} {meta.label}
          </span>
        )}
      </div>
      <button
        onClick={onClose}
        aria-label="편집 창 닫기"
        className="w-9 h-9 bg-gray-100 rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors"
      >
        <X size={18} />
      </button>
    </div>

    {/* Drawer 폼 */}
    <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
      {/* 품목명 */}
      <div>
        <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">
          품목명 <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={formData.name}
          onChange={e => onFormChange({ ...formData, name: e.target.value })}
          placeholder="예: 우유, 일회용컵"
          autoFocus={!editingItem}
          className="w-full bg-gray-50 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
        />
      </div>

      {/* 카테고리 & 단위 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">카테고리</label>
          <div className="relative">
            <select
              value={formData.category ?? '재료'}
              onChange={e => onFormChange({ ...formData, category: e.target.value })}
              className="w-full appearance-none bg-gray-50 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all cursor-pointer"
            >
              {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
        </div>
        <div>
          <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">단위</label>
          <input
            type="text"
            value={formData.unit ?? ''}
            onChange={e => onFormChange({ ...formData, unit: e.target.value })}
            placeholder="팩, 개, kg"
            className="w-full bg-gray-50 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
          />
        </div>
      </div>

      {/* 현재 재고 & 부족 기준 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">현재 재고</label>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={formData.current_stock}
            onChange={e => onFormChange({ ...formData, current_stock: Math.max(0, parseInt(e.target.value) || 0) })}
            onFocus={e => e.target.select()}
            className="w-full bg-gray-50 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
          />
        </div>
        <div>
          <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">
            부족 기준
            <span className="text-gray-300 font-normal ml-1">(0=미설정)</span>
          </label>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={formData.alert_threshold}
            onChange={e => onFormChange({ ...formData, alert_threshold: Math.max(0, parseInt(e.target.value) || 0) })}
            onFocus={e => e.target.select()}
            className="w-full bg-gray-50 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
          />
        </div>
      </div>

      {/* 메모 */}
      <div>
        <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">메모</label>
        <textarea
          value={formData.memo ?? ''}
          onChange={e => onFormChange({ ...formData, memo: e.target.value })}
          placeholder="구매처, 참고 사항"
          rows={2}
          className="w-full bg-gray-50 rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all resize-none"
        />
      </div>

      {/* 정렬 순서 */}
      <div>
        <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">정렬 순서</label>
        <input
          type="number"
          min={0}
          inputMode="numeric"
          value={formData.display_order}
          onChange={e => onFormChange({ ...formData, display_order: Math.max(0, parseInt(e.target.value) || 0) })}
          onFocus={e => e.target.select()}
          className="w-full bg-gray-50 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
        />
      </div>

      {/* 최근 수정 */}
      {editingItem && (
        <p className="text-xs text-gray-400">
          마지막 수정: {formatUpdatedAt(editingItem.updated_at)}
        </p>
      )}

      {/* 오류 */}
      {formError && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-2.5">
          <AlertTriangle size={14} />
          <span className="text-sm font-bold">{formError}</span>
        </div>
      )}
    </div>

    {/* Drawer 하단 */}
    <div className="px-6 py-4 border-t border-gray-100 flex items-center gap-3 shrink-0 pb-safe">
      {editingItem && (
        <button
          onClick={() => onDelete(editingItem)}
          disabled={isDeleting}
          aria-label={`'${editingItem.name}' 삭제`}
          className="w-12 h-12 bg-white border border-gray-200 text-gray-400 rounded-xl flex items-center justify-center hover:bg-red-50 hover:text-red-500 hover:border-red-100 transition-all disabled:opacity-50"
        >
          {isDeleting ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
        </button>
      )}
      <button
        onClick={onSave}
        disabled={isSaving}
        className="flex-1 bg-primary text-white h-12 rounded-xl font-black text-sm flex items-center justify-center gap-2 hover:bg-primary-hover transition-all active:scale-[0.98] disabled:opacity-50"
      >
        {isSaving ? <Loader2 size={16} className="animate-spin" /> : null}
        {isSaving ? '저장 중...' : editingItem ? '수정 완료' : '추가'}
      </button>
    </div>
  </>
);

// ─────────────────────────────────────────────────────
// 서브 컴포넌트: 빈 상태
// ─────────────────────────────────────────────────────
const EmptyAll = ({ onAdd }: { onAdd: () => void }) => (
  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 flex flex-col items-center gap-4">
    <ShoppingCart size={48} className="text-gray-200" />
    <div className="text-center">
      <p className="font-black text-gray-700">등록된 재고 품목이 없습니다.</p>
      <p className="text-sm text-gray-400 mt-1">첫 재고 품목을 추가해 주세요.</p>
    </div>
    <button
      onClick={onAdd}
      className="bg-primary text-white px-6 py-3 rounded-2xl font-bold text-sm hover:bg-primary-hover transition-colors flex items-center gap-2"
    >
      <Plus size={16} /> 재고 추가
    </button>
  </div>
);

const EmptyFiltered = ({ onReset }: { onReset: () => void }) => (
  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 flex flex-col items-center gap-4">
    <Search size={40} className="text-gray-200" />
    <div className="text-center">
      <p className="font-black text-gray-700">조건에 맞는 재고 품목이 없습니다.</p>
      <p className="text-sm text-gray-400 mt-1">검색어나 필터를 변경해 주세요.</p>
    </div>
    <button
      onClick={onReset}
      className="text-primary font-bold text-sm hover:underline"
    >
      필터 초기화
    </button>
  </div>
);
