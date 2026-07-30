/**
 * [File Role] 관리자 이벤트 & 공지 관리 페이지 (22번 명세 개편)
 * - 일반 공지 작성 (가격 영향 없음) vs 무료 이벤트 만들기 (결제 금액 0원) 생성 흐름 분리
 * - 파생 상태 중심 탭 (LIVE / SCHEDULED / DRAFT / ENDED) 및 유형 필터, 검색
 * - 무료 이벤트 게시 전 필수 확인 모달 (9-8 명세)
 * - 진행 중(LIVE) 항목 상단 전용 섹션 표시
 */
import { useState, useMemo } from 'react';
import {
  Megaphone, Power, PowerOff, Trash2, Edit3, BarChart3,
  X, PartyPopper, Bell, Calendar, Image as ImageIcon, Eye, Search, MoreVertical, AlertTriangle
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { QK, QK_DOMAIN } from '../../api/queryKeys';
import { uploadImageToCloudinary } from '../../utils/uploadImage';
import { Skeleton } from '../../components/ui/Skeleton';
import { Toast } from '../../components/ui/Toast';
import type { ToastType } from '../../components/ui/Toast';
import type { Announcement, AnnouncementReportResponse, StandardResponse, PublicationStatus, ContentType } from '../../types';

// 이벤트 유형 옵션
const EVENT_TYPES = ['칠순감사', '결혼감사', '출산감사', '임직감사', '기타감사'];

// 직분 옵션
const DUTY_OPTIONS = ['학생', '청년', '성도', '집사', '안수집사', '권사', '장로', '사모', '전도사', '강도사', '부목사', '목사'];

const AnnouncementSkeleton = () => (
  <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm space-y-3">
    <div className="flex justify-between">
      <div className="space-y-2 flex-1">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-3 w-24" />
      </div>
      <div className="flex gap-1"><Skeleton className="h-8 w-8 rounded-lg" /><Skeleton className="h-8 w-8 rounded-lg" /></div>
    </div>
    <Skeleton className="h-3 w-16" />
  </div>
);

export const AdminAnnouncements = () => {
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);

  // 탭 및 필터 상태
  const [activeTab, setActiveTab] = useState<'ALL' | PublicationStatus>('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | ContentType>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // 모달 상태
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingItem, setEditingItem] = useState<Announcement | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportData, setReportData] = useState<AnnouncementReportResponse | null>(null);
  const [reportTarget, setReportTarget] = useState<Announcement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [previewItem, setPreviewItem] = useState<Announcement | null>(null);

  // 무료 이벤트 게시 확인 모달 상태
  const [confirmPublishTarget, setConfirmPublishTarget] = useState<Announcement | null>(null);
  const [showMenuForId, setShowMenuForId] = useState<number | null>(null);

  // 폼 상태
  const [formData, setFormData] = useState({
    title: '', content: '', banner_text: '', image_url: '',
    is_event_mode: false, sponsor_name: '', sponsor_duty: '',
    event_type: '', starts_at: '', ends_at: '',
  });

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type });
  };

  // [React Query] 목록 조회
  const { data: announcements = [], isLoading: loading } = useQuery({
    queryKey: QK.announcements.list,
    queryFn: async () => {
      const res = await apiClient.get<Announcement[], StandardResponse<Announcement[]>>('/admin/announcements');
      return (res.success && res.data) ? res.data : [];
    },
  });

  // [React Query] CRUD Mutation
  const submitMutation = useMutation({
    mutationFn: async ({ editingItem, payload }: { editingItem: Announcement | null; payload: object }) => {
      if (editingItem) {
        return apiClient.patch<any, StandardResponse<any>>(`/admin/announcements/${editingItem.id}`, payload);
      } else {
        return apiClient.post<any, StandardResponse<any>>('/admin/announcements', payload);
      }
    },
    onSuccess: (_, { editingItem }) => {
      showToast(editingItem ? '이벤트/공지가 수정되었습니다.' : '이벤트/공지가 생성되었습니다.', 'success');
      queryClient.invalidateQueries({ queryKey: QK_DOMAIN.announcements });
      setShowFormModal(false);
    },
    onError: (err: any) => showToast(err.response?.data?.detail || '처리 중 오류가 발생했습니다.', 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => apiClient.delete<any, StandardResponse<any>>(`/admin/announcements/${id}`),
    onSuccess: () => {
      showToast('이벤트/공지가 삭제되었습니다.', 'success');
      queryClient.invalidateQueries({ queryKey: QK_DOMAIN.announcements });
    },
    onError: (err: any) => showToast(err.response?.data?.detail || '삭제에 실패했습니다.', 'error'),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async (item: Announcement) => {
      const endpoint = item.is_active ? 'deactivate' : 'activate';
      return apiClient.post<any, StandardResponse<any>>(`/admin/announcements/${item.id}/${endpoint}`, {});
    },
    onSuccess: (_, item) => {
      showToast(item.is_active ? '게시가 중지되었습니다.' : '게시(활성화)되었습니다.', 'success');
      queryClient.invalidateQueries({ queryKey: QK_DOMAIN.announcements });
      setConfirmPublishTarget(null);
    },
    onError: (err: any) => showToast(err.response?.data?.detail || '상태 변경에 실패했습니다.', 'error'),
  });

  // 헤더 생성 버튼 핸들러 (분리된 생성 흐름)
  const handleOpenCreateNotice = () => {
    setEditingItem(null);
    setFormData({
      title: '', content: '', banner_text: '', image_url: '',
      is_event_mode: false, sponsor_name: '', sponsor_duty: '',
      event_type: '', starts_at: '', ends_at: '',
    });
    setShowFormModal(true);
  };

  const handleOpenCreateEvent = () => {
    setEditingItem(null);
    setFormData({
      title: '', content: '', banner_text: '', image_url: '',
      is_event_mode: true, sponsor_name: '', sponsor_duty: '',
      event_type: '', starts_at: '', ends_at: '',
    });
    setShowFormModal(true);
  };

  const handleOpenEdit = (item: Announcement) => {
    setEditingItem(item);
    setFormData({
      title: item.title,
      content: item.content || '',
      banner_text: item.banner_text || '',
      image_url: item.image_url || '',
      is_event_mode: item.is_event_mode,
      sponsor_name: item.sponsor_name || '',
      sponsor_duty: item.sponsor_duty || '',
      event_type: item.event_type || '',
      starts_at: item.starts_at ? item.starts_at.slice(0, 16) : '',
      ends_at: item.ends_at ? item.ends_at.slice(0, 16) : '',
    });
    setShowFormModal(true);
  };

  const handleSubmitForm = async () => {
    if (!formData.title.trim()) { showToast('제목을 입력해주세요.', 'error'); return; }
    if (formData.is_event_mode) {
      if (!formData.sponsor_name.trim()) { showToast('후원자 성함을 입력해주세요.', 'error'); return; }
      if (!formData.event_type) { showToast('이벤트 유형을 선택해주세요.', 'error'); return; }
    }
    if (formData.starts_at && formData.ends_at) {
      if (new Date(formData.starts_at) > new Date(formData.ends_at)) {
        showToast('시작일시가 종료일시보다 늦을 수 없습니다.', 'error'); return;
      }
    }
    const payload = {
      ...formData,
      starts_at: formData.starts_at || null,
      ends_at: formData.ends_at || null,
      content: formData.content || null,
      banner_text: formData.banner_text || null,
      image_url: formData.image_url || null,
      sponsor_name: formData.is_event_mode ? (formData.sponsor_name || null) : null,
      sponsor_duty: formData.is_event_mode ? (formData.sponsor_duty || null) : null,
      event_type: formData.is_event_mode ? (formData.event_type || null) : null,
    };
    submitMutation.mutate({ editingItem, payload });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const MAX_SIZE_MB = 10;
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      showToast(`이미지 크기가 ${MAX_SIZE_MB}MB를 초과합니다. 더 작은 파일을 선택해주세요.`, 'error');
      e.target.value = '';
      return;
    }

    setIsUploading(true);
    try {
      const url = await uploadImageToCloudinary(file);
      setFormData(p => ({ ...p, image_url: url }));
      showToast('이미지가 성공적으로 업로드되었습니다.', 'success');
    } catch (error) {
      console.error('업로드 실패:', error);
      showToast('이미지 업로드에 실패했습니다.', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('정말 삭제하시겠습니까? (주문이 연결된 항목은 삭제할 수 없습니다.)')) return;
    deleteMutation.mutate(id);
    setShowMenuForId(null);
  };

  // 게시/게시 중지 클릭 핸들러
  const handleToggleActiveClick = (item: Announcement) => {
    setShowMenuForId(null);
    // 게시하려는 대상이 무료 이벤트인 경우 9-8 확인 모달 팝업
    if (!item.is_active && item.is_event_mode) {
      setConfirmPublishTarget(item);
    } else {
      toggleActiveMutation.mutate(item);
    }
  };

  const handleShowReport = async (item: Announcement) => {
    try {
      const res = await apiClient.get<AnnouncementReportResponse, StandardResponse<AnnouncementReportResponse>>(`/admin/announcements/${item.id}/report`);
      if (res.success && res.data) {
        setReportData(res.data);
        setReportTarget(item);
        setShowReportModal(true);
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.detail || '리포트 조회에 실패했습니다.';
      showToast(errorMsg, 'error');
    }
  };

  // 상태 집계
  const counts = useMemo(() => {
    const total = announcements.length;
    let live = 0, scheduled = 0, draft = 0, ended = 0;
    announcements.forEach(a => {
      const status = a.publication_status || 'DRAFT';
      if (status === 'LIVE') live++;
      else if (status === 'SCHEDULED') scheduled++;
      else if (status === 'DRAFT') draft++;
      else if (status === 'ENDED') ended++;
    });
    return { total, live, scheduled, draft, ended };
  }, [announcements]);

  // 필터링 및 정렬 (LIVE -> SCHEDULED -> DRAFT -> ENDED)
  const filteredAnnouncements = useMemo(() => {
    return announcements.filter(item => {
      const status = item.publication_status || 'DRAFT';
      const ctype = item.content_type || (item.is_event_mode ? 'FREE_EVENT' : 'NOTICE');

      if (activeTab !== 'ALL' && status !== activeTab) return false;
      if (typeFilter !== 'ALL' && ctype !== typeFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const t = (item.title || '').toLowerCase();
        const b = (item.banner_text || '').toLowerCase();
        const s = (item.sponsor_name || '').toLowerCase();
        if (!t.includes(q) && !b.includes(q) && !s.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => {
      const orderMap: Record<string, number> = { LIVE: 1, SCHEDULED: 2, DRAFT: 3, ENDED: 4 };
      const statusA = orderMap[a.publication_status || 'DRAFT'] || 5;
      const statusB = orderMap[b.publication_status || 'DRAFT'] || 5;
      if (statusA !== statusB) return statusA - statusB;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [announcements, activeTab, typeFilter, searchQuery]);

  // 현재 진행 중 (LIVE) 항목들
  const liveItems = useMemo(() => announcements.filter(a => (a.publication_status === 'LIVE' || a.is_effective)), [announcements]);

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-gray-50">
      {/* Header */}
      <header className="shrink-0 flex flex-col md:flex-row md:items-center justify-between px-6 xl:px-8 py-5 border-b border-gray-200 bg-white gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center border border-amber-100">
            <Megaphone className="text-amber-600" size={20} />
          </div>
          <div>
            <h1 className="text-[18px] font-black text-gray-900 tracking-tight">이벤트 & 공지</h1>
            <p className="text-[11px] text-gray-400 font-medium">사용자에게 표시되는 일반 안내와 무료 제공 이벤트를 관리합니다.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenCreateNotice}
            className="flex items-center gap-2 bg-gray-100 text-gray-700 hover:bg-gray-200 px-4 py-2.5 rounded-xl text-[13px] font-bold transition-all"
          >
            <Megaphone size={15} />
            일반 공지 작성
          </button>
          <button
            onClick={handleOpenCreateEvent}
            className="flex items-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md hover:shadow-lg px-4 py-2.5 rounded-xl text-[13px] font-bold transition-all"
          >
            <PartyPopper size={15} />
            무료 이벤트 만들기
          </button>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto p-6 xl:p-8 space-y-6">
        {/* 9-4. 현재 진행 중 섹션 */}
        {liveItems.length > 0 && (
          <section className="bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-rose-500/10 rounded-2xl p-5 border border-amber-200/60 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PartyPopper size={18} className="text-amber-600 animate-bounce" />
                <h2 className="text-[15px] font-black text-amber-950">현재 진행 중 (LIVE)</h2>
                <span className="px-2 py-0.5 bg-green-500 text-white text-[10px] font-black rounded-full animate-pulse">
                  {liveItems.length}건 게시 중
                </span>
              </div>
              <span className="text-[11px] text-amber-700 font-medium">사용자 주문 화면에 실시간으로 표시됩니다.</span>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {liveItems.map(item => (
                <div key={item.id} className="bg-white rounded-xl p-4 border border-amber-200 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-1.5">
                        <span className={`px-2 py-0.5 text-[10px] font-black rounded-full ${item.is_event_mode ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>
                          {item.is_event_mode ? '무료 이벤트' : '일반 공지'}
                        </span>
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-black rounded-full">LIVE</span>
                      </div>
                      {(item.linked_order_count ?? 0) > 0 && (
                        <span className="text-[11px] font-bold text-gray-500">주문 {item.linked_order_count}건</span>
                      )}
                    </div>
                    <h3 className="text-[15px] font-black text-gray-900 mb-1">{item.title}</h3>
                    {item.banner_text && <p className="text-[12px] text-gray-600 font-medium">{item.banner_text}</p>}
                    {item.sponsor_name && (
                      <p className="text-[11px] text-amber-700 font-bold mt-2">
                        후원: {item.sponsor_name} {item.sponsor_duty || ''}
                      </p>
                    )}
                    {(item.starts_at || item.ends_at) && (
                      <p className="text-[10px] text-gray-400 font-bold mt-2 flex items-center gap-1">
                        <Calendar size={11} />
                        {item.starts_at ? new Date(item.starts_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '시작 미지정'}
                        {' ~ '}
                        {item.ends_at ? new Date(item.ends_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '종료 미지정'}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-gray-100">
                    <button
                      onClick={() => setPreviewItem(item)}
                      className="px-3 py-1.5 text-[11px] font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center gap-1"
                    >
                      <Eye size={13} /> 미리보기
                    </button>
                    {item.is_event_mode && (
                      <button
                        onClick={() => handleShowReport(item)}
                        className="px-3 py-1.5 text-[11px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg flex items-center gap-1"
                      >
                        <BarChart3 size={13} /> 정산 보기
                      </button>
                    )}
                    <button
                      onClick={() => handleToggleActiveClick(item)}
                      className="px-3 py-1.5 text-[11px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg flex items-center gap-1"
                    >
                      <PowerOff size={13} /> 게시 중지
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 9-2 & 9-3. 상태 요약 탭 및 검색/필터 Bar */}
        <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm space-y-4">
          {/* 탭 버튼 */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none border-b border-gray-100">
            {[
              { key: 'ALL', label: '전체', count: counts.total },
              { key: 'LIVE', label: '진행 중', count: counts.live, color: 'text-green-600' },
              { key: 'SCHEDULED', label: '예약', count: counts.scheduled, color: 'text-blue-600' },
              { key: 'DRAFT', label: '초안', count: counts.draft, color: 'text-gray-500' },
              { key: 'ENDED', label: '종료', count: counts.ended, color: 'text-gray-400' },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`px-3.5 py-2 rounded-xl text-[12px] font-black whitespace-nowrap transition-all flex items-center gap-1.5 ${
                  activeTab === tab.key
                    ? 'bg-gray-900 text-white shadow-sm'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <span>{tab.label}</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${activeTab === tab.key ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'}`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* 유형 필터 & 검색 */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            {/* 유형 필터 */}
            <div className="flex items-center gap-1.5 w-full sm:w-auto">
              <span className="text-[11px] font-bold text-gray-400 shrink-0">유형:</span>
              <button
                onClick={() => setTypeFilter('ALL')}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold ${typeFilter === 'ALL' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-500'}`}
              >
                전체
              </button>
              <button
                onClick={() => setTypeFilter('NOTICE')}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold ${typeFilter === 'NOTICE' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-500'}`}
              >
                일반 공지
              </button>
              <button
                onClick={() => setTypeFilter('FREE_EVENT')}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold ${typeFilter === 'FREE_EVENT' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-500'}`}
              >
                무료 이벤트
              </button>
            </div>

            {/* 검색창 */}
            <div className="relative w-full sm:w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="제목, 배너, 후원자 검색..."
                className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-3 py-1.5 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-300"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 9-5. 목록 카드 */}
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <AnnouncementSkeleton key={i} />)}
          </div>
        ) : filteredAnnouncements.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400 bg-white rounded-2xl border border-gray-200">
            <Bell size={40} className="mb-4 text-gray-300" />
            <p className="font-bold">조건에 해당하는 이벤트/공지가 없습니다.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredAnnouncements.map((item) => {
              const status = item.publication_status || 'DRAFT';
              const isEnded = status === 'ENDED';
              const isScheduled = status === 'SCHEDULED';
              const isLive = status === 'LIVE';

              return (
                <div
                  key={item.id}
                  className={`bg-white rounded-2xl p-5 border shadow-sm transition-all flex flex-col justify-between relative ${
                    isEnded ? 'opacity-60 bg-gray-50/70 border-gray-200' :
                    isLive ? 'border-amber-300 ring-2 ring-amber-100 bg-white' :
                    isScheduled ? 'border-blue-200 bg-blue-50/20' : 'border-gray-200 bg-white'
                  }`}
                >
                  <div>
                    {/* 상단 배지 & 메뉴 */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* 유형 배지 */}
                        <span className={`px-2 py-0.5 text-[10px] font-black rounded-full ${item.is_event_mode ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>
                          {item.is_event_mode ? '무료 이벤트' : '일반 공지'}
                        </span>
                        {/* 상태 배지 */}
                        {isLive && <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-black rounded-full">진행 중 (LIVE)</span>}
                        {isScheduled && <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-black rounded-full">예약 (SCHEDULED)</span>}
                        {status === 'DRAFT' && <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-[10px] font-black rounded-full">초안 (DRAFT)</span>}
                        {isEnded && <span className="px-2 py-0.5 bg-gray-200 text-gray-600 text-[10px] font-black rounded-full">종료 (ENDED)</span>}
                      </div>

                      {/* 더보기 (위험 행동 overflow 메뉴) */}
                      <div className="relative shrink-0">
                        <button
                          onClick={() => setShowMenuForId(showMenuForId === item.id ? null : item.id)}
                          className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                        >
                          <MoreVertical size={16} />
                        </button>
                        {showMenuForId === item.id && (
                          <div className="absolute right-0 top-7 bg-white border border-gray-200 rounded-xl shadow-lg z-20 py-1 w-28">
                            <button
                              onClick={() => handleDelete(item.id)}
                              className="w-full text-left px-3 py-2 text-[11px] font-bold text-rose-600 hover:bg-rose-50 flex items-center gap-1.5"
                            >
                              <Trash2 size={13} /> 삭제하기
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <h3 className="text-[15px] font-black text-gray-900 mb-1 leading-snug break-keep">{item.title}</h3>
                    {item.banner_text && <p className="text-[12px] text-gray-600 font-medium mb-2 break-keep">{item.banner_text}</p>}

                    {/* 기간 및 예약 안내 */}
                    <div className="space-y-1 mt-3 pt-3 border-t border-gray-100 text-[11px] text-gray-500 font-medium">
                      {isScheduled && item.starts_at && (
                        <p className="text-blue-600 font-bold flex items-center gap-1">
                          <Calendar size={12} />
                          {new Date(item.starts_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 자동 시작 (예약)
                        </p>
                      )}
                      {(item.starts_at || item.ends_at) && !isScheduled && (
                        <p className="flex items-center gap-1">
                          <Calendar size={12} className="text-gray-400" />
                          <span>
                            {item.starts_at ? new Date(item.starts_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '시작 미지정'}
                            {' ~ '}
                            {item.ends_at ? new Date(item.ends_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '종료 미지정'}
                          </span>
                        </p>
                      )}
                      {item.sponsor_name && (
                        <p className="text-amber-700 font-bold">
                          후원: {item.sponsor_name} {item.sponsor_duty || ''}
                        </p>
                      )}
                      {(item.linked_order_count ?? 0) > 0 && (
                        <p className="text-gray-600 font-bold">연결 주문: {item.linked_order_count}건</p>
                      )}
                    </div>
                  </div>

                  {/* 주요 행동 버튼 (텍스트 라벨 명시) */}
                  <div className="flex items-center justify-between gap-1.5 mt-4 pt-3 border-t border-gray-100">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setPreviewItem(item)}
                        className="px-2.5 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-[11px] font-bold text-gray-700 flex items-center gap-1"
                      >
                        <Eye size={13} /> 미리보기
                      </button>
                      <button
                        onClick={() => handleOpenEdit(item)}
                        className="px-2.5 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-[11px] font-bold text-gray-700 flex items-center gap-1"
                      >
                        <Edit3 size={13} /> 수정
                      </button>
                    </div>

                    <div className="flex items-center gap-1">
                      {item.is_event_mode && (
                        <button
                          onClick={() => handleShowReport(item)}
                          className="px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-[11px] font-bold text-blue-700 flex items-center gap-1"
                        >
                          <BarChart3 size={13} /> 정산
                        </button>
                      )}
                      <button
                        onClick={() => handleToggleActiveClick(item)}
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1 ${
                          item.is_active
                            ? 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                            : 'bg-green-50 text-green-700 hover:bg-green-100'
                        }`}
                      >
                        {item.is_active ? <PowerOff size={13} /> : <Power size={13} />}
                        {item.is_active ? '게시 중지' : (isScheduled ? '예약 게시' : '게시')}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* 9-8. 무료 이벤트 게시 확인 모달 */}
      {confirmPublishTarget && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setConfirmPublishTarget(null)}>
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto text-amber-600">
              <AlertTriangle size={24} />
            </div>
            <div className="text-center">
              <h2 className="text-lg font-black text-gray-900 mb-1">무료 제공 이벤트를 게시할까요?</h2>
              <p className="text-[13px] font-bold text-amber-700">[{confirmPublishTarget.title}]</p>
            </div>

            <div className="bg-amber-50 rounded-2xl p-4 text-[12px] font-medium text-amber-900 space-y-2 leading-relaxed">
              <p className="flex items-start gap-1.5">• <span>유효 시간 동안 신규 주문의 최종 결제 금액은 <strong>0원</strong>이 됩니다.</span></p>
              <p className="flex items-start gap-1.5">• <span>주문은 이 이벤트와 연결되어 정산 리포트에 포함됩니다.</span></p>
              <p className="flex items-start gap-1.5">• <span>같은 시간에 다른 무료 이벤트가 있으면 게시할 수 없습니다.</span></p>
              <p className="flex items-start gap-1.5">• <span>일반 공지는 계속 함께 노출될 수 있습니다.</span></p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setConfirmPublishTarget(null)}
                className="flex-1 py-3 rounded-xl text-[13px] font-bold text-gray-600 bg-gray-100 hover:bg-gray-200"
              >
                취소
              </button>
              <button
                onClick={() => toggleActiveMutation.mutate(confirmPublishTarget)}
                className="flex-1 py-3 rounded-xl text-[13px] font-bold text-white bg-gradient-to-r from-amber-500 to-orange-500 hover:brightness-95 shadow-md"
              >
                무료 이벤트 게시
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 9-6 & 9-7. 생성/수정 모달 */}
      {showFormModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowFormModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div className="flex items-center gap-2">
                {formData.is_event_mode ? <PartyPopper size={20} className="text-amber-600" /> : <Megaphone size={20} className="text-blue-600" />}
                <h2 className="text-[16px] font-black text-gray-900">
                  {editingItem ? (formData.is_event_mode ? '무료 이벤트 수정' : '일반 공지 수정') : (formData.is_event_mode ? '무료 이벤트 만들기' : '일반 공지 작성')}
                </h2>
              </div>
              <button onClick={() => setShowFormModal(false)} className="p-1 text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* 무료 이벤트 모드 영향 안내 */}
              {formData.is_event_mode && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-[12px] font-medium text-amber-900 leading-relaxed">
                  <p className="font-bold text-amber-700 mb-1 flex items-center gap-1">
                    <AlertTriangle size={14} /> 무료 이벤트 영향 안내
                  </p>
                  이 이벤트가 진행 중인 동안 서버가 신규 사용자 주문을 0원(FREE)으로 처리합니다. 일반 공지와 달리 결제 금액과 정산에 영향을 줍니다.
                </div>
              )}

              <div>
                <label className="text-[12px] font-bold text-gray-600 mb-1 block">제목 *</label>
                <input
                  value={formData.title}
                  onChange={(e) => setFormData(p => ({ ...p, title: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                  placeholder={formData.is_event_mode ? "예: 김철수 장로님 칠순 감사" : "예: 오늘 주문 마감 안내"}
                />
              </div>

              <div>
                <label className="text-[12px] font-bold text-gray-600 mb-1 block">상단 배너 문구</label>
                <input
                  value={formData.banner_text}
                  onChange={(e) => setFormData(p => ({ ...p, banner_text: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                  placeholder={formData.is_event_mode ? "오늘은 카페가 무료 운영됩니다!" : "오후 1시 30분 주문 마감"}
                />
              </div>

              <div>
                <label className="text-[12px] font-bold text-gray-600 mb-1 block">상세 내용</label>
                <textarea
                  value={formData.content}
                  onChange={(e) => setFormData(p => ({ ...p, content: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none h-20"
                  placeholder="사용자 화면 상세 모달 내용"
                />
              </div>

              <div>
                <label className="text-[12px] font-bold text-gray-600 mb-2 block">배너 이미지 (옵션)</label>
                <div className="flex gap-4">
                  <div className="w-20 h-20 rounded-2xl bg-gray-100 border border-dashed border-gray-300 flex items-center justify-center overflow-hidden shrink-0 relative group">
                    {formData.image_url ? (
                      <img src={formData.image_url} alt="preview" className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon size={20} className="text-gray-300" />
                    )}
                    {isUploading && (
                      <div className="absolute inset-0 bg-white/60 flex items-center justify-center z-10">
                        <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                    <label className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                      <span className="text-[10px] text-white font-bold">업로드</span>
                      <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} disabled={isUploading} />
                    </label>
                  </div>
                  <div className="flex-1">
                    <p className="text-[11px] text-gray-400 mb-2">클릭하여 이미지를 업로드하거나 URL을 입력하세요.</p>
                    <input
                      value={formData.image_url}
                      onChange={(e) => setFormData(p => ({ ...p, image_url: e.target.value }))}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none"
                      placeholder="https://..."
                    />
                  </div>
                </div>
              </div>

              {/* 무료 이벤트 전용 입력 필드 (9-7) */}
              {formData.is_event_mode && (
                <div className="space-y-3 bg-amber-50/50 p-4 rounded-xl border border-amber-200/60">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[12px] font-bold text-gray-600 mb-1 block">후원자 성함 *</label>
                      <input
                        value={formData.sponsor_name}
                        onChange={(e) => setFormData(p => ({ ...p, sponsor_name: e.target.value }))}
                        className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none"
                        placeholder="김철수"
                      />
                    </div>
                    <div>
                      <label className="text-[12px] font-bold text-gray-600 mb-1 block">후원자 직분</label>
                      <select
                        value={formData.sponsor_duty}
                        onChange={(e) => setFormData(p => ({ ...p, sponsor_duty: e.target.value }))}
                        className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none"
                      >
                        <option value="">선택 안함</option>
                        {DUTY_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-[12px] font-bold text-gray-600 mb-1 block">감사/이벤트 유형 *</label>
                    <select
                      value={formData.event_type}
                      onChange={(e) => setFormData(p => ({ ...p, event_type: e.target.value }))}
                      className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none"
                    >
                      <option value="">선택 안함</option>
                      {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {/* 시작/종료일시 분리형 */}
              <div className="flex flex-col gap-3">
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                  <label className="text-[12px] font-bold text-gray-600 mb-1.5 block">시작일시 (미지정 시 즉시)</label>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={formData.starts_at ? formData.starts_at.split('T')[0] : ''}
                      onChange={(e) => {
                        const time = formData.starts_at ? formData.starts_at.split('T')[1] : '00:00';
                        setFormData(p => ({ ...p, starts_at: e.target.value ? `${e.target.value}T${time}` : '' }))
                      }}
                      className="flex-1 min-w-0 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    />
                    <input
                      type="time"
                      value={formData.starts_at ? formData.starts_at.split('T')[1] : ''}
                      onChange={(e) => {
                        const date = formData.starts_at ? formData.starts_at.split('T')[0] : new Date().toISOString().split('T')[0];
                        setFormData(p => ({ ...p, starts_at: e.target.value ? `${date}T${e.target.value}` : '' }))
                      }}
                      className="flex-1 min-w-0 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                  <label className="text-[12px] font-bold text-gray-600 mb-1.5 block">종료일시 (미지정 시 무제한)</label>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={formData.ends_at ? formData.ends_at.split('T')[0] : ''}
                      onChange={(e) => {
                        const time = formData.ends_at ? formData.ends_at.split('T')[1] : '00:00';
                        setFormData(p => ({ ...p, ends_at: e.target.value ? `${e.target.value}T${time}` : '' }))
                      }}
                      className="flex-1 min-w-0 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    />
                    <input
                      type="time"
                      value={formData.ends_at ? formData.ends_at.split('T')[1] : ''}
                      onChange={(e) => {
                        const date = formData.ends_at ? formData.ends_at.split('T')[0] : new Date().toISOString().split('T')[0];
                        setFormData(p => ({ ...p, ends_at: e.target.value ? `${date}T${e.target.value}` : '' }))
                      }}
                      className="flex-1 min-w-0 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-gray-100 flex gap-3">
              <button
                onClick={() => setShowFormModal(false)}
                className="flex-1 py-3 rounded-xl text-[13px] font-bold text-gray-600 bg-gray-100 hover:bg-gray-200"
              >
                취소
              </button>
              <button
                onClick={handleSubmitForm}
                className="flex-1 py-3 rounded-xl text-[13px] font-bold text-white bg-gray-900 hover:bg-gray-800"
              >
                {editingItem ? '수정 저장' : (formData.starts_at && new Date(formData.starts_at) > new Date() ? '예약 저장' : '저장')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 미리보기 모달 */}
      {previewItem && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6" onClick={() => setPreviewItem(null)}>
          <div className="w-full max-w-[400px] animate-in zoom-in-95 duration-300" onClick={(e) => e.stopPropagation()}>
            <div className="bg-white w-full rounded-3xl shadow-2xl overflow-hidden">
              {previewItem.image_url && (
                <img src={previewItem.image_url} alt={previewItem.title} className="w-full h-48 object-cover" />
              )}
              <div className="p-6 text-center">
                <div className={`w-14 h-14 ${previewItem.is_event_mode ? 'bg-gradient-to-br from-amber-400 to-orange-500' : 'bg-gray-100'} rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg`}>
                  {previewItem.is_event_mode ? (
                    <PartyPopper size={28} className="text-white" />
                  ) : (
                    <Megaphone size={28} className="text-gray-600" />
                  )}
                </div>
                <h2 className="text-xl font-black text-gray-900 mb-2 break-keep">{previewItem.title}</h2>
                {previewItem.content && (
                  <p className="text-[13px] text-gray-600 leading-relaxed mb-3 break-keep whitespace-pre-wrap">{previewItem.content}</p>
                )}
                {previewItem.sponsor_name && (
                  <p className="text-[13px] font-bold text-amber-600 mb-4">
                    {previewItem.sponsor_name} {previewItem.sponsor_duty || ''}님의 사랑으로 준비되었습니다 ❤️
                  </p>
                )}
                <button
                  onClick={() => setPreviewItem(null)}
                  className="w-full bg-gradient-to-r from-amber-500 to-orange-500 text-white py-3.5 rounded-2xl font-black text-[14px] shadow-lg"
                >
                  {previewItem.is_event_mode ? '감사히 주문하기 ☕' : '주문하기'}
                </button>
              </div>
            </div>
            <p className="text-center text-white/60 text-[11px] font-bold mt-3">클릭하여 닫기</p>
          </div>
        </div>
      )}

      {/* 정산 리포트 모달 */}
      {showReportModal && reportData && reportTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowReportModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-[16px] font-black text-gray-900">정산 리포트</h2>
              <button onClick={() => setShowReportModal(false)} className="p-1 text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-5">
              <div className="bg-amber-50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-[14px] font-black text-gray-900">{reportTarget.title}</h3>
                  <div className="flex items-center gap-1 text-[11px] text-amber-600 font-bold">
                    <Calendar size={12} />
                    <span>{new Date(reportTarget.starts_at || reportTarget.created_at).toLocaleDateString('ko-KR')}</span>
                  </div>
                </div>
                {reportTarget.sponsor_name && (
                  <p className="text-[12px] text-amber-700 font-bold">
                    후원: {reportTarget.sponsor_name} {reportTarget.sponsor_duty || ''}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-gray-500 font-bold mb-1">총 주문</p>
                  <p className="text-[18px] font-black text-gray-900">{reportData.total_orders}</p>
                  <p className="text-[10px] text-gray-400">건</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-gray-500 font-bold mb-1">총 수량</p>
                  <p className="text-[18px] font-black text-gray-900">{reportData.total_items}</p>
                  <p className="text-[10px] text-gray-400">개</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-gray-500 font-bold mb-1">환산 총액</p>
                  <p className="text-[18px] font-black text-amber-600">{reportData.original_price_sum.toLocaleString()}</p>
                  <p className="text-[10px] text-gray-400">원</p>
                </div>
              </div>

              {(reportData.total_tumbler_discount ?? 0) > 0 && (
                <div className="flex items-center justify-between bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-base">♻️</span>
                    <span className="text-[13px] font-black text-emerald-700">텀블러 할인 합계</span>
                  </div>
                  <span className="text-[14px] font-black text-emerald-600">
                    -{reportData.total_tumbler_discount.toLocaleString()}원
                  </span>
                </div>
              )}

              {reportData.menu_breakdown.length > 0 && (
                <div>
                  <h4 className="text-[13px] font-black text-gray-700 mb-2">메뉴별 판매 현황</h4>
                  <div className="space-y-2">
                    {reportData.menu_breakdown.map((m, i) => (
                      <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2.5">
                        <span className="text-[12px] font-bold text-gray-800">{m.name}</span>
                        <div className="flex items-center gap-2">
                          {(m.tumbler_discount_total ?? 0) > 0 && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-black">
                              ♻️ -{m.tumbler_discount_total.toLocaleString()}원
                            </span>
                          )}
                          <div className="text-right">
                            <span className="text-[12px] font-bold text-gray-600">{m.count}개</span>
                            <span className="text-[11px] text-gray-900 font-bold ml-2">₩{m.revenue.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {Object.keys(reportData.duty_breakdown).length > 0 && (
                <div>
                  <h4 className="text-[13px] font-black text-gray-700 mb-2">직분별 주문</h4>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(reportData.duty_breakdown).map(([duty, count]) => (
                      <span key={duty} className="px-3 py-1.5 bg-gray-50 rounded-full text-[11px] font-bold text-gray-600">
                        {duty} {count}건
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-4 text-center">
                <p className="text-[13px] font-bold text-gray-700 leading-relaxed break-keep">
                  총 <strong className="text-amber-700">{reportData.total_items}개</strong>의 항목이 제공되었으며,
                  <br />주문 총액은 <strong className="text-amber-700">{reportData.original_price_sum.toLocaleString()}원</strong>입니다.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <Toast message={toast?.message || ''} type={toast?.type} isVisible={!!toast} onClose={() => setToast(null)} />
    </div>
  );
};
