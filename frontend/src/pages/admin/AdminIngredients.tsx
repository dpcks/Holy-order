/*
[File Role]
관리자 전용 재고 관리 페이지.
재료/소모품의 CRUD와 부족 재고 알림 카드를 제공합니다.
자동 차감이나 레시피 연동 없이, 관리자가 수동으로 재고를 관리하는 데 초점을 맞춥니다.
*/

import { useState, useEffect, useCallback } from 'react';
import {
  Package, Plus, Search, AlertTriangle, Pencil, Trash2,
  X, Save, ChevronDown
} from 'lucide-react';
import { apiClient } from '../../api/client';
import type { StandardResponse, Ingredient, IngredientCreate, IngredientUpdate } from '../../types';

// 카테고리 옵션 목록
const CATEGORY_OPTIONS = ['재료', '소모품'] as const;

export const AdminIngredients = () => {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [lowStockItems, setLowStockItems] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('전체');

  // 모달 상태
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<Ingredient | null>(null);
  const [saving, setSaving] = useState(false);

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

  // 데이터 조회
  const fetchData = useCallback(async () => {
    try {
      const [listRes, alertRes] = await Promise.all([
        apiClient.get<Ingredient[], StandardResponse<Ingredient[]>>('/admin/ingredients'),
        apiClient.get<Ingredient[], StandardResponse<Ingredient[]>>('/admin/ingredients/alerts'),
      ]);
      if (listRes.success && listRes.data) setIngredients(listRes.data);
      if (alertRes.success && alertRes.data) setLowStockItems(alertRes.data);
    } catch (err) {
      console.error('재고 데이터 조회 실패:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 메시지 자동 제거
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  // 모달 열기 (추가/수정)
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

  // 모달 닫기
  const handleCloseModal = () => {
    setShowModal(false);
    setEditingItem(null);
  };

  // 저장 (생성/수정)
  const handleSave = async () => {
    if (!formData.name.trim()) {
      setMessage({ type: 'error', text: '품목명을 입력해주세요.' });
      return;
    }

    setSaving(true);
    try {
      if (editingItem) {
        // 수정
        const updateData: IngredientUpdate = { ...formData };
        const res = await apiClient.patch<Ingredient, StandardResponse<Ingredient>>(
          `/admin/ingredients/${editingItem.id}`, updateData
        );
        if (res.success) {
          setMessage({ type: 'success', text: `'${formData.name}' 항목이 수정되었습니다.` });
        }
      } else {
        // 생성
        const res = await apiClient.post<IngredientCreate, StandardResponse<Ingredient>>(
          '/admin/ingredients', formData
        );
        if (res.success) {
          setMessage({ type: 'success', text: `'${formData.name}' 항목이 추가되었습니다.` });
        }
      }
      handleCloseModal();
      await fetchData();
    } catch (err) {
      console.error('저장 실패:', err);
      setMessage({ type: 'error', text: '저장 중 오류가 발생했습니다.' });
    } finally {
      setSaving(false);
    }
  };

  // 삭제
  const handleDelete = async (item: Ingredient) => {
    if (!confirm(`'${item.name}' 항목을 삭제하시겠습니까?`)) return;

    try {
      const res = await apiClient.delete<StandardResponse<null>>(`/admin/ingredients/${item.id}`);
      if (res.success) {
        setMessage({ type: 'success', text: `'${item.name}' 항목이 삭제되었습니다.` });
        await fetchData();
      }
    } catch (err) {
      console.error('삭제 실패:', err);
      setMessage({ type: 'error', text: '삭제 중 오류가 발생했습니다.' });
    }
  };

  // 검색 및 카테고리 필터링
  const filteredIngredients = ingredients.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = filterCategory === '전체' || item.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  // 부족 재고 여부 확인 헬퍼
  const isLowStock = (item: Ingredient) => item.current_stock <= item.alert_threshold;

  return (
    <div className="flex flex-col h-full bg-[#F3F4F6] overflow-hidden font-sans">
      {/* 헤더 */}
      <header className="bg-white px-8 py-5 flex items-center justify-between border-b border-gray-200 shrink-0 z-20 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-black rounded-2xl flex items-center justify-center shadow-lg shadow-black/10">
            <Package className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">재고 관리</h1>
            <p className="text-[13px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">Inventory Management</p>
          </div>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="bg-black text-white px-5 py-3 rounded-2xl font-bold text-sm flex items-center gap-2 hover:bg-gray-800 transition-all active:scale-[0.97] shadow-lg shadow-black/10"
        >
          <Plus size={18} />
          재고 추가
        </button>
      </header>

      <main className="flex-1 overflow-auto p-8 custom-scrollbar">
        <div className="max-w-6xl mx-auto space-y-6">

          {/* 부족 재고 알림 카드 */}
          {lowStockItems.length > 0 && (
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-[28px] p-6 border border-amber-200/60 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center">
                  <AlertTriangle size={22} />
                </div>
                <div>
                  <h2 className="text-lg font-black text-amber-900 tracking-tight">부족 재고 알림</h2>
                  <p className="text-[12px] text-amber-600 font-bold">
                    {lowStockItems.length}개 항목의 재고가 부족합니다
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {lowStockItems.map((item) => (
                  <div
                    key={item.id}
                    className="bg-white rounded-2xl p-4 border border-amber-200/50 flex items-center justify-between group hover:shadow-md transition-all cursor-pointer"
                    onClick={() => handleOpenModal(item)}
                    role="button"
                    tabIndex={0}
                    aria-label={`${item.name} 수정하기`}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleOpenModal(item); }}
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900 text-sm truncate">{item.name}</p>
                      <p className="text-[11px] text-amber-600 font-semibold mt-0.5">
                        {item.category && <span className="text-gray-400 mr-1">{item.category}</span>}
                        현재 {item.current_stock}{item.unit || '개'} / 기준 {item.alert_threshold}{item.unit || '개'}
                      </p>
                    </div>
                    <div className="w-8 h-8 bg-amber-100 text-amber-600 rounded-lg flex items-center justify-center shrink-0 ml-3 group-hover:bg-amber-200 transition-colors">
                      <Pencil size={14} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 검색 및 필터 */}
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="품목명 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-2xl pl-11 pr-4 py-3 text-sm font-medium focus:outline-none focus:ring-4 focus:ring-black/5 focus:border-gray-300 transition-all"
              />
            </div>
            <div className="relative">
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="appearance-none bg-white border border-gray-200 rounded-2xl px-5 py-3 pr-10 text-sm font-bold text-gray-700 focus:outline-none focus:ring-4 focus:ring-black/5 focus:border-gray-300 transition-all cursor-pointer"
              >
                <option value="전체">전체</option>
                {CATEGORY_OPTIONS.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* 재고 목록 테이블 */}
          <div className="bg-white rounded-[28px] shadow-sm border border-gray-100 overflow-hidden">
            {loading ? (
              <div className="flex justify-center items-center h-40">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : filteredIngredients.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <Package size={48} className="mb-3 opacity-30" />
                <p className="font-bold text-sm">
                  {searchQuery || filterCategory !== '전체' ? '검색 결과가 없습니다.' : '등록된 재고 항목이 없습니다.'}
                </p>
                {!searchQuery && filterCategory === '전체' && (
                  <button
                    onClick={() => handleOpenModal()}
                    className="mt-4 text-primary text-sm font-bold hover:underline"
                  >
                    + 첫 번째 항목 추가하기
                  </button>
                )}
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left text-[11px] font-black text-gray-400 uppercase tracking-widest px-6 py-4">품목명</th>
                    <th className="text-left text-[11px] font-black text-gray-400 uppercase tracking-widest px-6 py-4">카테고리</th>
                    <th className="text-center text-[11px] font-black text-gray-400 uppercase tracking-widest px-6 py-4">현재 재고</th>
                    <th className="text-center text-[11px] font-black text-gray-400 uppercase tracking-widest px-6 py-4">기준 수량</th>
                    <th className="text-left text-[11px] font-black text-gray-400 uppercase tracking-widest px-6 py-4">상태</th>
                    <th className="text-left text-[11px] font-black text-gray-400 uppercase tracking-widest px-6 py-4">메모</th>
                    <th className="text-center text-[11px] font-black text-gray-400 uppercase tracking-widest px-6 py-4">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredIngredients.map((item) => {
                    const low = isLowStock(item);
                    return (
                      <tr
                        key={item.id}
                        className={`border-b border-gray-50 transition-colors hover:bg-gray-50/50 ${
                          low ? 'bg-amber-50/40' : ''
                        }`}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            {low && (
                              <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse shrink-0" />
                            )}
                            <span className="font-bold text-gray-900 text-sm">{item.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {item.category && (
                            <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
                              item.category === '재료'
                                ? 'bg-blue-50 text-blue-600'
                                : 'bg-purple-50 text-purple-600'
                            }`}>
                              {item.category}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={`font-black text-sm ${low ? 'text-amber-600' : 'text-gray-900'}`}>
                            {item.current_stock}
                          </span>
                          <span className="text-gray-400 text-[11px] ml-1">{item.unit || '개'}</span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="font-bold text-sm text-gray-500">
                            {item.alert_threshold}
                          </span>
                          <span className="text-gray-400 text-[11px] ml-1">{item.unit || '개'}</span>
                        </td>
                        <td className="px-6 py-4">
                          {low ? (
                            <span className="text-[11px] font-black text-amber-600 bg-amber-100 px-2.5 py-1 rounded-full">
                              ⚠️ 부족
                            </span>
                          ) : (
                            <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
                              ✅ 정상
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-[12px] text-gray-500 truncate max-w-[120px] block">
                            {item.memo || '-'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleOpenModal(item)}
                              className="w-8 h-8 bg-gray-100 text-gray-500 rounded-lg flex items-center justify-center hover:bg-gray-200 hover:text-gray-700 transition-all"
                              aria-label={`${item.name} 수정`}
                              title="수정"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => handleDelete(item)}
                              className="w-8 h-8 bg-gray-100 text-gray-500 rounded-lg flex items-center justify-center hover:bg-red-50 hover:text-red-500 transition-all"
                              aria-label={`${item.name} 삭제`}
                              title="삭제"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* 하단 메시지 알림 */}
          {message && (
            <div className={`p-5 rounded-3xl flex items-center justify-center gap-3 animate-in slide-in-from-bottom-2 ${
              message.type === 'success'
                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                : 'bg-red-500 text-white shadow-lg shadow-red-500/20'
            }`}>
              <span className="text-[14px] font-black">{message.text}</span>
            </div>
          )}
        </div>
      </main>

      {/* 추가/수정 모달 */}
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
