import { useEffect, useState, useCallback, useRef } from 'react';
import { Search, Plus, Pencil, X, Check, Trash2, Image as ImageIcon, GripVertical } from 'lucide-react';
import { 
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { apiClient } from '../../api/client';
import type { Category, Menu, StandardResponse } from '../../types';


interface MenuOptionForm { name: string; extra_price: number; }
interface EditForm { 
  name: string; 
  price: string; 
  description: string; 
  category_id: number; 
  image_url: string;
  options: MenuOptionForm[];
}

/** 관리 도구에서 카테고리 정보가 포함된 메뉴 타입 */
interface AdminMenu extends Menu {
  categoryId: number;
  categoryName: string;
}

// 드래그 가능한 카테고리 아이템 컴포넌트
const SortableCategoryItem = ({ 
  cat, 
  index, 
  onRename, 
  onDelete 
}: { 
  cat: Category; 
  index: number; 
  onRename: (id: number, name: string) => void;
  onDelete: (id: number) => void;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: cat.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 60 : 'auto',
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style}
      className={`flex items-center gap-3 bg-white p-3 rounded-2xl border transition-all ${isDragging ? 'shadow-xl border-primary scale-[1.02] opacity-90 z-50' : 'border-gray-100 shadow-sm'}`}
    >
      <div 
        {...attributes} 
        {...listeners} 
        className="cursor-grab active:cursor-grabbing p-1 text-gray-300 hover:text-gray-500 transition-colors"
      >
        <GripVertical size={18} />
      </div>
      <span className="text-gray-300 font-black text-[14px] w-4">{index + 1}</span>
      <input 
        defaultValue={cat.name}
        onBlur={(e) => onRename(cat.id, e.target.value)}
        className="flex-1 bg-transparent font-bold text-gray-700 outline-none"
      />
      <button 
        onClick={() => onDelete(cat.id)}
        className="p-1.5 text-gray-300 hover:text-red-500 transition-colors"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
};

// 드래그 가능한 메뉴 카드 컴포넌트
const SortableMenuCard = ({ 
  menu, 
  onDelete, 
  onToggle, 
  onEdit, 
  isSaving,
  isDraggable
}: { 
  menu: AdminMenu;
  onDelete: (id: number) => void;
  onToggle: (menu: AdminMenu) => void;
  onEdit: (menu: AdminMenu) => void;
  isSaving: boolean;
  isDraggable: boolean;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: menu.id, disabled: !isDraggable });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
  };

  const optionTags = menu.options?.map(o => o.name).join(' / ') || '옵션 없음';

  return (
    <div 
      ref={setNodeRef} 
      style={style}
      className={`bg-white rounded-2xl shadow-sm border overflow-hidden transition-all group ${isDragging ? 'shadow-2xl border-primary scale-[1.03] opacity-90 z-50' : menu.is_available ? 'border-gray-100' : 'border-dashed border-gray-300 opacity-60'}`}
    >
      {/* 이미지 */}
      <div className="relative aspect-video bg-gray-100 overflow-hidden">
        {menu.image_url ? (
          <img src={menu.image_url} alt={menu.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-gray-300 gap-2">
            <ImageIcon size={32} />
            <span className="text-[10px] font-medium">이미지 없음</span>
          </div>
        )}
        
        {/* 드래그 핸들 (특정 카테고리 선택 시에만 노출) */}
        {isDraggable && (
          <div 
            {...attributes} 
            {...listeners} 
            className="absolute top-2 right-2 p-2 bg-white/80 backdrop-blur-sm rounded-lg text-gray-400 hover:text-primary cursor-grab active:cursor-grabbing shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <GripVertical size={16} />
          </div>
        )}

        <div className="absolute top-2 left-2">
          <span className="bg-black/60 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-1 rounded-md shadow-sm">
            {menu.categoryName}
          </span>
        </div>
        {!menu.is_available && (
          <div className="absolute inset-0 bg-gray-900/40 flex items-center justify-center backdrop-blur-[1px]">
            <span className="bg-gray-900 text-white text-[11px] font-bold px-4 py-1.5 rounded-full ring-2 ring-white/20">판매 중지</span>
          </div>
        )}
      </div>

      {/* 정보 */}
      <div className="p-4">
        <div className="flex justify-between items-start mb-1">
          <h3 className="font-bold text-gray-900 text-[15px]">{menu.name}</h3>
          <button 
            onClick={() => onDelete(menu.id)}
            className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all rounded-lg"
            title="메뉴 삭제"
          >
            <Trash2 size={14} />
          </button>
        </div>
        <p className="text-primary font-black text-[15px] mb-1">₩{menu.price.toLocaleString()}</p>
        <p className="text-[11px] text-gray-400 mb-4 line-clamp-1">{optionTags}</p>

        {/* 판매 토글 */}
        <div className="flex items-center justify-between mb-4 bg-gray-50 p-2 rounded-xl border border-gray-100">
          <span className="text-[12px] text-gray-600 font-bold">판매 상태</span>
          <button
            onClick={() => onToggle(menu)}
            disabled={isSaving}
            className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none ${menu.is_available ? 'bg-green-500' : 'bg-gray-300'}`}
          >
            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200 ${menu.is_available ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>

        {/* 수정 버튼 */}
        <button
          onClick={() => onEdit(menu)}
          className="w-full flex items-center justify-center gap-2 py-2.5 text-[12px] font-bold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 hover:border-gray-300 rounded-xl transition-all shadow-sm"
        >
          <Pencil size={13} />정보 수정
        </button>
      </div>
    </div>
  );
};

export const AdminMenuManagement = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState<number | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  
  // 모달 상태
  const [isMenuModalOpen, setIsMenuModalOpen] = useState(false);
  const [editingMenu, setEditingMenu] = useState<AdminMenu | null>(null);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  
  // 폼 상태
  const [editForm, setEditForm] = useState<EditForm>({ 
    name: '', price: '', description: '', category_id: 0, image_url: '', options: [] 
  });
  const [savingId, setSavingId] = useState<number | 'new' | null>(null);

  // WebSocket 상태 관리
  type WsStatus = 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED';
  const [wsStatus, setWsStatus] = useState<WsStatus>('DISCONNECTED');
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryCountRef = useRef(0);
  const isUnmountingRef = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // 드래그 종료 처리
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      const oldIndex = categories.findIndex((c) => c.id === active.id);
      const newIndex = categories.findIndex((c) => c.id === over.id);
      
      const newOrder = arrayMove(categories, oldIndex, newIndex);
      
      // 즉시 UI 반영 (Optimistic Update)
      setCategories(newOrder);
      
      // 서버 전송
      try {
        await apiClient.patch('/admin/categories/reorder', { 
          category_ids: newOrder.map(c => c.id) 
        });
      } catch (err) {
        console.error('순서 변경 실패:', err);
        fetchMenus(); // 실패 시 원복
      }
    }
  };

  // 메뉴 드래그 종료 처리
  const handleMenuDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // 현재 표시 중인 메뉴 리스트에서 위치 변경
    const oldIndex = displayedMenus.findIndex(m => m.id === active.id);
    const newIndex = displayedMenus.findIndex(m => m.id === over.id);
    
    const newOrder = arrayMove(displayedMenus, oldIndex, newIndex);
    
    // UI 즉시 업데이트를 위해 categories 상태 구조에 맞게 반영
    if (typeof activeCategory === 'number') {
      setCategories(prev => prev.map(cat => 
        cat.id === activeCategory ? { ...cat, menus: newOrder } : cat
      ));
    }

    try {
      await apiClient.patch('/admin/menus/reorder', { 
        menu_ids: newOrder.map(m => m.id) 
      });
    } catch (err) {
      console.error('메뉴 순서 변경 실패:', err);
      fetchMenus();
    }
  };


  const fetchMenus = useCallback(async () => {
    try {
      const res = await apiClient.get<Category[], StandardResponse<Category[]>>('/categories');
      if (res.success && res.data) {
        setCategories(res.data);
      }
    } catch (err) {
      console.error('메뉴 조회 실패:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // WebSocket 연결 함수 (지수 백오프 및 폴링 폴백 포함)
  const connectWebSocket = useCallback(() => {
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
    }

    const { hostname, protocol } = window.location;
    const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';
    const isLocal = hostname === 'localhost' || /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);
    const wsPort = isLocal ? ':8000' : '';
    const wsUrl = `${wsProtocol}//${hostname}${wsPort}/ws`;

    setWsStatus('RECONNECTING');
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('✅ [WebSocket] 메뉴 관리 연결 성공');
      setWsStatus('CONNECTED');
      retryCountRef.current = 0;
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'MENU_UPDATED' || data.type === 'MENU_CREATED' || data.type === 'MENU_DELETED') {
          console.log('🔔 [WebSocket] 메뉴 데이터 변경 감지:', data.type);
          fetchMenus();
        }
      } catch (e) {
        console.error('Failed to parse WS message', e);
      }
    };

    ws.onclose = (event) => {
      if (isUnmountingRef.current) {
        setWsStatus('DISCONNECTED');
        return;
      }

      console.log(`❌ [WebSocket] 연결 종료 (Clean: ${event.wasClean}). 메뉴 폴백 활성화...`);
      setWsStatus('DISCONNECTED');
      
      if (!pollingTimerRef.current) {
        pollingTimerRef.current = setInterval(fetchMenus, 30000);
      }

      const delay = Math.min(30000, 1000 * Math.pow(2, retryCountRef.current));
      reconnectTimerRef.current = setTimeout(() => {
        retryCountRef.current += 1;
        connectWebSocket();
      }, delay);
    };

    ws.onerror = () => ws.close();
  }, [fetchMenus]);

  useEffect(() => {
    isUnmountingRef.current = false;
    fetchMenus();
    connectWebSocket();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN)) {
        connectWebSocket();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isUnmountingRef.current = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
    };
  }, [fetchMenus, connectWebSocket]);

  const allMenus: AdminMenu[] = categories.flatMap(c => 
    c.menus.map(m => ({ ...m, categoryName: c.name, categoryId: c.id }))
  );
  
  const displayedMenus = allMenus.filter(m => {
    const matchCat = activeCategory === 'all' || m.categoryId === activeCategory;
    const matchSearch = m.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchSearch;
  });

  // 메뉴 추가 모달 열기
  const handleOpenAdd = () => {
    setEditingMenu(null);
    setEditForm({
      name: '',
      price: '',
      description: '',
      category_id: categories[0]?.id || 0,
      image_url: '',
      options: []
    });
    setIsMenuModalOpen(true);
  };

  // 메뉴 수정 모달 열기
  const handleOpenEdit = (menu: AdminMenu) => {
    setEditingMenu(menu);
    setEditForm({ 
      name: menu.name, 
      price: String(menu.price), 
      description: menu.description || '', 
      category_id: menu.categoryId,
      image_url: menu.image_url || '',
      options: menu.options?.map(o => ({ name: o.name, extra_price: o.extra_price })) || []
    });
    setIsMenuModalOpen(true);
  };

  // 옵션 추가/제거
  const handleAddOption = () => {
    setEditForm(prev => ({
      ...prev,
      options: [...prev.options, { name: '', extra_price: 0 }]
    }));
  };

  const handleRemoveOption = (index: number) => {
    setEditForm(prev => ({
      ...prev,
      options: prev.options.filter((_, i) => i !== index)
    }));
  };

  const handleUpdateOption = (index: number, field: keyof MenuOptionForm, value: string | number) => {
    setEditForm(prev => ({
      ...prev,
      options: prev.options.map((opt, i) => i === index ? { ...opt, [field]: value } : opt)
    }));
  };

  // 메뉴 저장 (생성/수정 통합)
  const handleSaveMenu = async () => {
    if (!editForm.name || !editForm.price || !editForm.category_id) {
      alert('필수 정보를 입력해 주세요.');
      return;
    }

    setSavingId(editingMenu ? editingMenu.id : 'new');
    try {
      const payload = {
        name: editForm.name,
        price: Number(editForm.price),
        description: editForm.description || null,
        category_id: editForm.category_id,
        image_url: editForm.image_url || null,
        options: editForm.options.filter(o => o.name.trim() !== '')
      };

      if (editingMenu) {
        await apiClient.patch(`/admin/menus/${editingMenu.id}`, payload);
      } else {
        await apiClient.post('/admin/menus', payload);
      }
      
      await fetchMenus();
      setIsMenuModalOpen(false);
    } catch (err) {
      console.error('메뉴 저장 실패:', err);
      alert('저장에 실패했습니다.');
    } finally {
      setSavingId(null);
    }
  };

  // 메뉴 삭제
  const handleDeleteMenu = async (id: number) => {
    if (!confirm('정말로 이 메뉴를 삭제하시겠습니까? 관련 데이터가 모두 삭제됩니다.')) return;
    
    setSavingId(id);
    try {
      await apiClient.delete(`/admin/menus/${id}`);
      await fetchMenus();
    } catch {
      alert('삭제에 실패했습니다.');
    } finally {
      setSavingId(null);
    }
  };

  // 판매 상태 토글
  const handleToggleAvailability = async (menu: AdminMenu) => {
    setSavingId(menu.id);
    try {
      await apiClient.patch(`/admin/menus/${menu.id}`, { is_available: !menu.is_available });
      await fetchMenus();
    } catch { 
      alert('상태 변경에 실패했습니다.'); 
    } finally { 
      setSavingId(null); 
    }
  };

  // 이미지 업로드 시뮬레이션
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    console.log('업로드 시도:', file.name);
    alert('이미지 업로드 기능은 현재 준비 중입니다. 임시로 이미지 URL을 사용해 주세요.');
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* 헤더 */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 shrink-0">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-3 mb-0.5">
              <h1 className="text-xl font-bold text-gray-900">메뉴 관리</h1>
              <div className="flex items-center gap-1.5 bg-gray-50 px-2.5 py-0.5 rounded-full border border-gray-100">
                <span className={`w-1 h-1 rounded-full ${
                  wsStatus === 'CONNECTED' ? 'bg-green-500 animate-pulse' : 
                  wsStatus === 'RECONNECTING' ? 'bg-orange-400 animate-pulse' : 
                  'bg-red-400'
                }`}></span>
                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                  {wsStatus === 'CONNECTED' ? 'Live' : wsStatus === 'RECONNECTING' ? 'Wait' : 'Off'}
                </span>
              </div>
            </div>
            <p className="text-[12px] text-gray-400">카페 메뉴의 가격, 옵션 및 판매 상태를 관리하세요.</p>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => setIsCategoryModalOpen(true)}
              className="flex items-center gap-1.5 text-[13px] font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 px-4 py-2.5 rounded-xl transition-colors"
            >
              카테고리 설정
            </button>
            <button 
              onClick={handleOpenAdd}
              className="flex items-center gap-1.5 text-[13px] font-semibold text-white bg-primary hover:bg-primary/90 px-4 py-2.5 rounded-xl transition-colors shadow-sm"
            >
              <Plus size={16} />메뉴 추가
            </button>
          </div>
        </div>

        {/* 검색 + 카테고리 필터 */}
        <div className="flex items-center gap-4">
          <div className="flex items-center bg-gray-100 rounded-xl px-4 py-2.5 gap-2 flex-1 max-w-[320px]">
            <Search size={16} className="text-gray-400" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="메뉴 이름 검색..."
              className="bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none flex-1"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            <button
              onClick={() => setActiveCategory('all')}
              className={`px-4 py-2 text-[13px] font-semibold rounded-xl whitespace-nowrap transition-all ${activeCategory === 'all' ? 'bg-[#1A0A0A] text-white shadow-md' : 'text-gray-500 hover:bg-gray-100'}`}
            >전체</button>
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`px-4 py-2 text-[13px] font-semibold rounded-xl whitespace-nowrap transition-all ${activeCategory === cat.id ? 'bg-[#1A0A0A] text-white shadow-md' : 'text-gray-500 hover:bg-gray-100'}`}
              >{cat.name}</button>
            ))}
          </div>
        </div>
      </header>

      {/* 메뉴 그리드 */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex justify-center items-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
            <DndContext 
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleMenuDragEnd}
            >
              <SortableContext 
                items={displayedMenus.map(m => m.id)}
                strategy={verticalListSortingStrategy}
              >
                {displayedMenus.map(menu => (
                  <SortableMenuCard 
                    key={menu.id}
                    menu={menu}
                    isDraggable={activeCategory !== 'all'}
                    isSaving={savingId === menu.id}
                    onDelete={handleDeleteMenu}
                    onToggle={handleToggleAvailability}
                    onEdit={handleOpenEdit}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>
        )}
      </div>

      {/* 메뉴 추가/수정 모달 */}
      {isMenuModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setIsMenuModalOpen(false)}>
          <div className="bg-white rounded-3xl p-8 w-full max-w-lg shadow-2xl overflow-y-auto max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{editingMenu ? '메뉴 수정' : '새 메뉴 추가'}</h2>
                <p className="text-[12px] text-gray-400 mt-0.5">상세 정보를 입력해 주세요.</p>
              </div>
              <button onClick={() => setIsMenuModalOpen(false)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-6">
              {/* 이미지 섹션 */}
              <div>
                <label className="text-[13px] font-bold text-gray-700 mb-2 block">메뉴 이미지</label>
                <div className="flex gap-4">
                  <div className="w-24 h-24 rounded-2xl bg-gray-100 border border-dashed border-gray-300 flex items-center justify-center overflow-hidden shrink-0 relative group">
                    {editForm.image_url ? (
                      <img src={editForm.image_url} alt="preview" className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon size={24} className="text-gray-300" />
                    )}
                    <label className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                      <span className="text-[10px] text-white font-bold">변경</span>
                      <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                    </label>
                  </div>
                  <div className="flex-1">
                    <p className="text-[11px] text-gray-400 mb-2">추후 Cloudinary 연동 예정입니다. 현재는 URL을 직접 입력해 주세요.</p>
                    <input
                      placeholder="이미지 URL을 입력하세요"
                      value={editForm.image_url}
                      onChange={e => setEditForm(f => ({ ...f, image_url: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 bg-gray-50"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 sm:col-span-1">
                  <label className="text-[13px] font-bold text-gray-700 mb-2 block">메뉴명</label>
                  <input
                    value={editForm.name}
                    onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder="예: 아이스 아메리카노"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="text-[13px] font-bold text-gray-700 mb-2 block">가격 (원)</label>
                  <input
                    type="number"
                    value={editForm.price}
                    onChange={e => setEditForm(f => ({ ...f, price: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder="2500"
                  />
                </div>
              </div>

              <div>
                <label className="text-[13px] font-bold text-gray-700 mb-2 block">카테고리</label>
                <select
                  value={editForm.category_id}
                  onChange={e => setEditForm(f => ({ ...f, category_id: Number(e.target.value) }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 bg-white"
                >
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-[13px] font-bold text-gray-700 mb-2 block">설명 (선택)</label>
                <textarea
                  value={editForm.description}
                  onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                  rows={2}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                  placeholder="메뉴에 대한 간단한 설명을 입력하세요."
                />
              </div>

              {/* 옵션 관리 섹션 */}
              <div className="bg-gray-50/50 border border-gray-100 rounded-2xl p-5">
                <div className="flex justify-between items-center mb-4">
                  <label className="text-[13px] font-bold text-gray-700 uppercase tracking-wider">추가 옵션 설정</label>
                  <button 
                    onClick={handleAddOption}
                    className="text-primary text-[12px] font-bold flex items-center gap-1 hover:underline bg-white px-3 py-1.5 rounded-lg border border-primary/20 shadow-sm"
                  >
                    <Plus size={14} />직접 입력
                  </button>
                </div>

                {/* 퀵 프리셋 버튼들 */}
                <div className="flex flex-wrap gap-2 mb-6 pb-4 border-b border-gray-200/50">
                  {[
                    { name: 'ICE', price: 0 },
                    { name: 'HOT', price: 0 },
                    { name: '일회용컵', price: 0 },
                    { name: '텀블러', price: 0 },
                    { name: '샷 추가', price: 0 }
                  ].map(preset => (
                    <button
                      key={preset.name}
                      onClick={() => {
                        if (editForm.options.some(o => o.name === preset.name)) return;
                        setEditForm(f => ({
                          ...f,
                          options: [...f.options, { name: preset.name, extra_price: preset.price }]
                        }));
                      }}
                      className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-[11px] font-bold text-gray-600 hover:border-primary hover:text-primary transition-all shadow-sm active:scale-95"
                    >
                      + {preset.name}
                    </button>
                  ))}
                </div>

                <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1 custom-scrollbar">
                  {editForm.options.map((opt, idx) => (
                    <div key={idx} className="flex gap-2 items-center bg-white p-2.5 rounded-xl border border-gray-200 shadow-sm group animate-in zoom-in-95 duration-200">
                      <input
                        placeholder="옵션명"
                        value={opt.name}
                        onChange={e => handleUpdateOption(idx, 'name', e.target.value)}
                        className="flex-[2] bg-gray-50 border border-transparent focus:border-primary/30 rounded-lg px-3 py-2 text-[12px] outline-none font-bold"
                      />
                      <div className="flex-[1] flex items-center gap-1 bg-gray-50 border border-transparent focus-within:border-primary/30 rounded-lg px-2 py-2">
                        <span className="text-[10px] text-gray-400 font-bold">₩</span>
                        <input
                          type="number"
                          placeholder="0"
                          value={opt.extra_price}
                          onChange={e => handleUpdateOption(idx, 'extra_price', Number(e.target.value))}
                          className="w-full text-[12px] outline-none bg-transparent font-black"
                        />
                      </div>
                      <button onClick={() => handleRemoveOption(idx)} className="p-1.5 text-gray-300 hover:text-red-500 transition-colors">
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                  {editForm.options.length === 0 && (
                    <div className="text-center py-8 text-[12px] text-gray-400 bg-gray-50 border border-dashed border-gray-200 rounded-xl">
                      상단의 프리셋을 선택하거나<br/>'직접 입력'을 눌러 옵션을 추가하세요.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-4 mt-10">
              <button onClick={() => setIsMenuModalOpen(false)} className="flex-1 py-3.5 text-[14px] font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-2xl transition-all">취소</button>
              <button
                onClick={handleSaveMenu}
                disabled={savingId !== null}
                className="flex-[2] py-3.5 text-[14px] font-bold text-white bg-primary hover:bg-primary/90 rounded-2xl transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {savingId !== null ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check size={18} />}
                {editingMenu ? '정보 수정하기' : '새 메뉴 등록하기'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 카테고리 설정 모달 */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setIsCategoryModalOpen(false)}>
          <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-bold text-gray-900">카테고리 설정</h2>
                <p className="text-[12px] text-gray-400 mt-0.5">드래그하여 순서를 변경할 수 있습니다.</p>
              </div>
              <button onClick={() => setIsCategoryModalOpen(false)} className="p-2 text-gray-400 hover:text-gray-600 transition-colors"><X size={20} /></button>
            </div>
            
            <div className="mb-8 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
              <DndContext 
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext 
                  items={categories.map(c => c.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-3">
                    {categories.map((cat, idx) => (
                      <SortableCategoryItem 
                        key={cat.id}
                        cat={cat}
                        index={idx}
                        onRename={async (id, name) => {
                          if (name === cat.name) return;
                          await apiClient.patch(`/admin/categories/${id}`, { name });
                          fetchMenus();
                        }}
                        onDelete={async (id) => {
                          if (!confirm('카테고리를 삭제하시겠습니까? (메뉴가 있으면 삭제 불가)')) return;
                          try {
                            await apiClient.delete(`/admin/categories/${id}`);
                            fetchMenus();
                          } catch (err: any) {
                            alert(err.response?.data?.detail || '삭제 실패');
                          }
                        }}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>

            <div className="bg-primary/5 p-5 rounded-2xl border border-primary/10">
              <label className="text-[12px] font-bold text-primary mb-3 block uppercase tracking-wider">새 카테고리 추가</label>
              <div className="flex gap-2">
                <input 
                  id="new-category-input"
                  placeholder="예: 시그니처"
                  className="flex-1 bg-white border border-primary/10 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 shadow-sm"
                />
                <button 
                  onClick={async () => {
                    const input = document.getElementById('new-category-input') as HTMLInputElement;
                    if (!input.value) return;
                    await apiClient.post('/admin/categories', { name: input.value, display_order: categories.length });
                    input.value = '';
                    fetchMenus();
                  }}
                  className="bg-primary text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-md shadow-primary/20 hover:bg-primary/90 transition-all active:scale-95"
                >추가</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
