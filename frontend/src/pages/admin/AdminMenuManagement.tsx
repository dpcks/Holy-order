import { useEffect, useState, useCallback, useRef } from 'react';
import { Search, Plus, Pencil, X, Check } from 'lucide-react';
import { apiClient } from '../../api/client';
import { Category, Menu, StandardResponse } from '../../types';


interface EditForm { name: string; price: string; description: string; category_id: number; }

export const AdminMenuManagement = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState<number | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [editingMenu, setEditingMenu] = useState<Menu | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ name: '', price: '', description: '', category_id: 0 });
  const [savingId, setSavingId] = useState<number | null>(null);

  // WebSocket 상태 관리
  type WsStatus = 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED';
  const [wsStatus, setWsStatus] = useState<WsStatus>('DISCONNECTED');
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryCountRef = useRef(0);

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

    const isDev = window.location.hostname === 'localhost';
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    const port = isDev ? ':8000' : '';
    const wsUrl = `${protocol}//${host}${port}/ws`;

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
        if (data.type === 'MENU_UPDATED') {
          console.log('🔔 [WebSocket] 메뉴 데이터 갱신 감지:', data);
          fetchMenus();
        }
      } catch (e) {
        console.error('Failed to parse WS message', e);
      }
    };

    ws.onclose = (event) => {
      if (event.wasClean) {
        setWsStatus('DISCONNECTED');
        return;
      }

      console.log('❌ [WebSocket] 연결 끊김. 메뉴 폴백 활성화...');
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
    fetchMenus();
    connectWebSocket();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN)) {
        connectWebSocket();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
    };
  }, [fetchMenus, connectWebSocket]);

  const allMenus = categories.flatMap(c => c.menus.map(m => ({ ...m, categoryName: c.name, categoryId: c.id })));
  const displayedMenus = allMenus.filter(m => {
    const matchCat = activeCategory === 'all' || m.categoryId === activeCategory;
    const matchSearch = m.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchSearch;
  });

  const handleToggleAvailability = async (menu: Menu) => {
    setSavingId(menu.id);
    try {
      await apiClient.patch(`/admin/menus/${menu.id}`, { is_available: !menu.is_available });
      await fetchMenus();
    } catch { alert('변경에 실패했습니다.'); }
    finally { setSavingId(null); }
  };

  const handleOpenEdit = (menu: Menu & { categoryId: number }) => {
    setEditingMenu(menu);
    setEditForm({ name: menu.name, price: String(menu.price), description: menu.description || '', category_id: menu.categoryId });
  };

  const handleSaveEdit = async () => {
    if (!editingMenu) return;
    setSavingId(editingMenu.id);
    try {
      await apiClient.patch(`/admin/menus/${editingMenu.id}`, {
        name: editForm.name,
        price: Number(editForm.price),
        description: editForm.description || null,
        category_id: editForm.category_id,
      });
      await fetchMenus();
      setEditingMenu(null);
    } catch { alert('저장에 실패했습니다.'); }
    finally { setSavingId(null); }
  };

  return (
    <div className="flex flex-col h-full">
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
            <button className="flex items-center gap-1.5 text-[13px] font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-xl transition-colors">
              카테고리 설정
            </button>
            <button className="flex items-center gap-1.5 text-[13px] font-semibold text-white bg-primary hover:bg-primary/90 px-3 py-2 rounded-xl transition-colors shadow-sm">
              <Plus size={15} />메뉴 추가
            </button>
          </div>
        </div>

        {/* 검색 + 카테고리 필터 */}
        <div className="flex items-center gap-4">
          <div className="flex items-center bg-gray-100 rounded-xl px-3 py-2 gap-2 flex-1 max-w-[320px]">
            <Search size={15} className="text-gray-400" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="메뉴 이름 검색..."
              className="bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none flex-1"
            />
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={() => setActiveCategory('all')}
              className={`px-3 py-1.5 text-[13px] font-semibold rounded-lg transition-all ${activeCategory === 'all' ? 'bg-[#1A0A0A] text-white' : 'text-gray-500 hover:bg-gray-100'}`}
            >전체</button>
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`px-3 py-1.5 text-[13px] font-semibold rounded-lg transition-all ${activeCategory === cat.id ? 'bg-[#1A0A0A] text-white' : 'text-gray-500 hover:bg-gray-100'}`}
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
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {displayedMenus.map(menu => {
              const isSaving = savingId === menu.id;
              const optionTags = menu.options.map(o => o.name).join(' / ') || '-';
              return (
                <div key={menu.id} className={`bg-white rounded-2xl shadow-sm border overflow-hidden transition-all ${menu.is_available ? 'border-gray-100' : 'border-dashed border-gray-300 opacity-60'}`}>
                  {/* 이미지 */}
                  <div className="relative aspect-[4/3] bg-gray-100 overflow-hidden">
                    {menu.image_url ? (
                      <img src={menu.image_url} alt={menu.name} className="w-full h-full object-cover" />
                    ) : (
                      <img src="https://images.unsplash.com/photo-1559525839-b184a4d698c7?w=400&q=80" alt="placeholder" className="w-full h-full object-cover opacity-70" />
                    )}
                    {/* 메뉴명 from active category */}
                    <div className="absolute top-2 right-2">
                      <span className="bg-white/90 text-gray-700 text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                        {categories.find(c => c.menus.some(m => m.id === menu.id))?.name}
                      </span>
                    </div>
                    {!menu.is_available && (
                      <div className="absolute inset-0 bg-gray-900/40 flex items-center justify-center">
                        <span className="bg-gray-900 text-white text-[11px] font-bold px-3 py-1 rounded-full">판매 중지</span>
                      </div>
                    )}
                  </div>

                  {/* 정보 */}
                  <div className="p-4">
                    <h3 className="font-bold text-gray-900 text-[14px] mb-0.5">{menu.name}</h3>
                    <p className="text-primary font-bold text-[14px] mb-1">₩{menu.price.toLocaleString()}</p>
                    <p className="text-[11px] text-gray-400 mb-3 truncate">{optionTags}</p>

                    {/* 판매 토글 */}
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[12px] text-gray-600 font-medium">판매 중</span>
                      <button
                        onClick={() => handleToggleAvailability(menu)}
                        disabled={isSaving}
                        className={`relative w-10 h-5 rounded-full transition-colors duration-200 focus:outline-none ${menu.is_available ? 'bg-primary' : 'bg-gray-300'}`}
                      >
                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${menu.is_available ? 'translate-x-5' : 'translate-x-0.5'}`} />
                      </button>
                    </div>

                    {/* 수정 버튼 */}
                    <button
                      onClick={() => handleOpenEdit(menu as any)}
                      className="w-full flex items-center justify-center gap-1.5 py-2 text-[12px] font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
                    >
                      <Pencil size={12} />수정
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 수정 모달 */}
      {editingMenu && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditingMenu(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-lg font-bold text-gray-900">메뉴 수정</h2>
              <button onClick={() => setEditingMenu(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="flex flex-col gap-4">
              <div>
                <label className="text-[12px] font-semibold text-gray-600 mb-1 block">메뉴명</label>
                <input
                  value={editForm.name}
                  onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="text-[12px] font-semibold text-gray-600 mb-1 block">가격 (원)</label>
                <input
                  type="number"
                  value={editForm.price}
                  onChange={e => setEditForm(f => ({ ...f, price: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="text-[12px] font-semibold text-gray-600 mb-1 block">설명</label>
                <textarea
                  value={editForm.description}
                  onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                />
              </div>
              <div>
                <label className="text-[12px] font-semibold text-gray-600 mb-1 block">카테고리</label>
                <select
                  value={editForm.category_id}
                  onChange={e => setEditForm(f => ({ ...f, category_id: Number(e.target.value) }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setEditingMenu(null)} className="flex-1 py-2.5 text-[13px] font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors">취소</button>
              <button
                onClick={handleSaveEdit}
                disabled={savingId !== null}
                className="flex-[2] py-2.5 text-[13px] font-bold text-white bg-primary hover:bg-primary/90 rounded-xl transition-colors flex items-center justify-center gap-1.5 disabled:opacity-60"
              >
                <Check size={14} />저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
