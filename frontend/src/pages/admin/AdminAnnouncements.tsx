/**
 * [File Role] 관리자 이벤트/공지 관리 페이지
 * - 이벤트 목록 조회, 생성, 수정, 삭제
 * - 이벤트 활성화/비활성화
 * - 정산 리포트 모달
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Megaphone, Power, PowerOff, Trash2, Edit3, BarChart3,
  X, PartyPopper, Bell, Calendar
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { Toast } from '../../components/ui/Toast';
import type { ToastType } from '../../components/ui/Toast';
import type { Announcement, AnnouncementReportResponse, StandardResponse } from '../../types';

// 이벤트 유형 옵션
const EVENT_TYPES = ['칠순감사', '결혼감사', '출산감사', '임직감사', '기타감사'];

export const AdminAnnouncements = () => {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);

  // 모달 상태
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingItem, setEditingItem] = useState<Announcement | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportData, setReportData] = useState<AnnouncementReportResponse | null>(null);
  const [reportTarget, setReportTarget] = useState<Announcement | null>(null);

  // 폼 상태
  const [formData, setFormData] = useState({
    title: '', content: '', banner_text: '', image_url: '',
    is_event_mode: true, sponsor_name: '', sponsor_duty: '',
    event_type: '', starts_at: '', ends_at: '',
  });

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type });
  };

  const fetchAnnouncements = useCallback(async () => {
    try {
      const res = await apiClient.get<Announcement[], StandardResponse<Announcement[]>>('/admin/announcements');
      if (res.success && res.data) setAnnouncements(res.data);
    } catch (err) {
      console.error('이벤트 목록 조회 실패:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAnnouncements(); }, [fetchAnnouncements]);

  const handleOpenCreate = () => {
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

  const handleSubmit = async () => {
    if (!formData.title.trim()) {
      showToast('제목을 입력해주세요.', 'error');
      return;
    }

    if (formData.is_event_mode) {
      if (!formData.sponsor_name.trim()) {
        showToast('후원자 성함을 입력해주세요.', 'error');
        return;
      }
      if (!formData.event_type) {
        showToast('이벤트 유형을 선택해주세요.', 'error');
        return;
      }
    }

    if (formData.starts_at && formData.ends_at) {
      if (new Date(formData.starts_at) > new Date(formData.ends_at)) {
        showToast('시작일시가 종료일시보다 늦을 수 없습니다.', 'error');
        return;
      }
    }

    try {
      const payload = {
        ...formData,
        starts_at: formData.starts_at || null,
        ends_at: formData.ends_at || null,
        content: formData.content || null,
        banner_text: formData.banner_text || null,
        image_url: formData.image_url || null,
        sponsor_name: formData.sponsor_name || null,
        sponsor_duty: formData.sponsor_duty || null,
        event_type: formData.event_type || null,
      };

      if (editingItem) {
        await apiClient.patch<any, StandardResponse<any>>(`/admin/announcements/${editingItem.id}`, payload);
        showToast('이벤트가 수정되었습니다.', 'success');
      } else {
        await apiClient.post<any, StandardResponse<any>>('/admin/announcements', payload);
        showToast('이벤트가 생성되었습니다.', 'success');
      }
      setShowFormModal(false);
      fetchAnnouncements();
    } catch (err: any) {
      const errorMsg = err.response?.data?.detail || '처리 중 오류가 발생했습니다.';
      showToast(errorMsg, 'error');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('정말 삭제하시겠습니까?')) return;
    try {
      await apiClient.delete<any, StandardResponse<any>>(`/admin/announcements/${id}`);
      showToast('이벤트가 삭제되었습니다.', 'success');
      fetchAnnouncements();
    } catch (err: any) {
      const errorMsg = err.response?.data?.detail || '삭제에 실패했습니다.';
      showToast(errorMsg, 'error');
    }
  };

  const handleToggleActive = async (item: Announcement) => {
    try {
      const endpoint = item.is_active ? 'deactivate' : 'activate';
      await apiClient.post<any, StandardResponse<any>>(`/admin/announcements/${item.id}/${endpoint}`, {});
      showToast(item.is_active ? '이벤트가 종료되었습니다.' : '이벤트가 활성화되었습니다.', 'success');
      fetchAnnouncements();
    } catch (err: any) {
      const errorMsg = err.response?.data?.detail || '상태 변경에 실패했습니다.';
      showToast(errorMsg, 'error');
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

  const activeEvent = announcements.find(a => a.is_active);

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <header className="shrink-0 flex items-center justify-between px-6 xl:px-8 py-5 border-b border-gray-100 bg-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
            <Megaphone className="text-amber-600" size={20} />
          </div>
          <div>
            <h1 className="text-[18px] font-black text-gray-900 tracking-tight">이벤트 & 공지</h1>
            <p className="text-[11px] text-gray-400 font-medium">섬김 골든벨 및 공지사항 관리</p>
          </div>
        </div>
        <button
          onClick={handleOpenCreate}
          className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2.5 rounded-xl text-[13px] font-bold hover:bg-gray-800 transition-all"
        >
          <Plus size={16} />
          새 이벤트
        </button>
      </header>

      <main className="flex-1 overflow-y-auto p-6 xl:p-8 space-y-6">
        {/* 현재 활성 이벤트 카드 */}
        {activeEvent && (
          <div className="bg-gradient-to-r from-amber-50 via-orange-50 to-rose-50 rounded-2xl p-5 border border-amber-100/50 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <PartyPopper size={18} className="text-amber-600" />
              <span className="text-[13px] font-black text-amber-700">현재 진행 중인 이벤트</span>
              <span className="ml-auto px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-full animate-pulse">LIVE</span>
            </div>
            <h3 className="text-[16px] font-black text-gray-900 mb-1">{activeEvent.title}</h3>
            {activeEvent.banner_text && (
              <p className="text-[13px] text-gray-600 font-medium">{activeEvent.banner_text}</p>
            )}
            {activeEvent.sponsor_name && (
              <p className="text-[12px] text-amber-600 font-bold mt-2">
                후원: {activeEvent.sponsor_name} {activeEvent.sponsor_duty || ''}
              </p>
            )}
            {(activeEvent.starts_at || activeEvent.ends_at) && (
              <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-amber-200/30 text-[11px] text-amber-700/70 font-bold">
                <Calendar size={12} />
                <span>
                  {activeEvent.starts_at ? new Date(activeEvent.starts_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '시작 미지정'}
                  {' ~ '}
                  {activeEvent.ends_at ? new Date(activeEvent.ends_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '종료 미지정'}
                </span>
              </div>
            )}
          </div>
        )}

        {/* 이벤트 목록 */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
          </div>
        ) : announcements.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Bell size={40} className="mb-4" />
            <p className="font-bold">등록된 이벤트가 없습니다.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {announcements.map((item) => (
              <div
                key={item.id}
                className={`bg-white rounded-2xl p-5 border shadow-sm transition-all ${item.is_active ? 'border-amber-200 ring-1 ring-amber-100' : 'border-gray-100'
                  }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <h3 className="text-[15px] font-black text-gray-900 truncate">{item.title}</h3>
                      {item.is_event_mode && (
                        <span className="shrink-0 px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded-full">골든벨</span>
                      )}
                      {item.is_active && (
                        <span className="shrink-0 px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-full">활성</span>
                      )}
                    </div>
                    {item.event_type && (
                      <span className="text-[11px] text-gray-500 font-medium">{item.event_type}</span>
                    )}
                    {item.sponsor_name && (
                      <span className="text-[11px] text-gray-500 font-medium ml-2">
                        후원: {item.sponsor_name} {item.sponsor_duty || ''}
                      </span>
                    )}
                    <p className="text-[11px] text-gray-400 mt-1">
                      {new Date(item.created_at).toLocaleDateString('ko-KR')} 생성
                    </p>
                  </div>

                  {/* 액션 버튼 */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleShowReport(item)}
                      className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition-colors"
                      title="정산 리포트"
                      aria-label="정산 리포트 보기"
                      tabIndex={0}
                    >
                      <BarChart3 size={16} />
                    </button>
                    <button
                      onClick={() => handleToggleActive(item)}
                      className={`p-2 rounded-lg transition-colors ${item.is_active
                        ? 'hover:bg-red-50 text-green-500 hover:text-red-500'
                        : 'hover:bg-green-50 text-gray-400 hover:text-green-500'
                        }`}
                      title={item.is_active ? '이벤트 종료' : '이벤트 활성화'}
                      aria-label={item.is_active ? '이벤트 종료' : '이벤트 활성화'}
                      tabIndex={0}
                    >
                      {item.is_active ? <PowerOff size={16} /> : <Power size={16} />}
                    </button>
                    <button
                      onClick={() => handleOpenEdit(item)}
                      className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                      title="수정"
                      aria-label="이벤트 수정"
                      tabIndex={0}
                    >
                      <Edit3 size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                      title="삭제"
                      aria-label="이벤트 삭제"
                      tabIndex={0}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* 생성/수정 모달 */}
      {showFormModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowFormModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-[16px] font-black text-gray-900">
                {editingItem ? '이벤트 수정' : '새 이벤트 생성'}
              </h2>
              <button onClick={() => setShowFormModal(false)} className="p-1 text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-[12px] font-bold text-gray-600 mb-1 block">제목 *</label>
                <input value={formData.title} onChange={(e) => setFormData(p => ({ ...p, title: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200"
                  placeholder="예: 김철수 장로님 칠순 감사" />
              </div>
              <div>
                <label className="text-[12px] font-bold text-gray-600 mb-1 block">배너 문구</label>
                <input value={formData.banner_text} onChange={(e) => setFormData(p => ({ ...p, banner_text: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200"
                  placeholder="오늘은 카페가 무료 운영됩니다!" />
              </div>
              <div>
                <label className="text-[12px] font-bold text-gray-600 mb-1 block">상세 내용</label>
                <textarea value={formData.content} onChange={(e) => setFormData(p => ({ ...p, content: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200 resize-none h-20"
                  placeholder="이벤트 상세 설명" />
              </div>
              <div>
                <label className="text-[12px] font-bold text-gray-600 mb-1 block">이미지 URL</label>
                <input value={formData.image_url} onChange={(e) => setFormData(p => ({ ...p, image_url: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200"
                  placeholder="https://..." />
              </div>
              {formData.is_event_mode && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[12px] font-bold text-gray-600 mb-1 block">후원자 성함 *</label>
                      <input value={formData.sponsor_name} onChange={(e) => setFormData(p => ({ ...p, sponsor_name: e.target.value }))}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200" />
                    </div>
                    <div>
                      <label className="text-[12px] font-bold text-gray-600 mb-1 block">후원자 직분</label>
                      <input value={formData.sponsor_duty} onChange={(e) => setFormData(p => ({ ...p, sponsor_duty: e.target.value }))}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[12px] font-bold text-gray-600 mb-1 block">이벤트 유형 *</label>
                    <select value={formData.event_type} onChange={(e) => setFormData(p => ({ ...p, event_type: e.target.value }))}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200">
                      <option value="">선택 안함</option>
                      {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[12px] font-bold text-gray-600 mb-1 block">시작일시</label>
                  <input type="datetime-local" value={formData.starts_at} onChange={(e) => setFormData(p => ({ ...p, starts_at: e.target.value }))}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200" />
                </div>
                <div>
                  <label className="text-[12px] font-bold text-gray-600 mb-1 block">종료일시</label>
                  <input type="datetime-local" value={formData.ends_at} onChange={(e) => setFormData(p => ({ ...p, ends_at: e.target.value }))}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200" />
                </div>
              </div>
              <label className="flex items-center gap-3 p-3 bg-amber-50 rounded-xl cursor-pointer">
                <input type="checkbox" checked={formData.is_event_mode} onChange={(e) => setFormData(p => ({ ...p, is_event_mode: e.target.checked }))}
                  className="w-4 h-4 rounded accent-amber-500" />
                <div>
                  <span className="text-[13px] font-bold text-gray-800">골든벨 모드 (무료 제공)</span>
                  <p className="text-[11px] text-gray-500">활성화 시 모든 메뉴가 0원으로 표시됩니다</p>
                </div>
              </label>
            </div>
            <div className="p-5 border-t border-gray-100 flex gap-3">
              <button onClick={() => setShowFormModal(false)}
                className="flex-1 py-3 rounded-xl text-[13px] font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors">
                취소
              </button>
              <button onClick={handleSubmit}
                className="flex-1 py-3 rounded-xl text-[13px] font-bold text-white bg-gray-900 hover:bg-gray-800 transition-colors">
                {editingItem ? '수정' : '생성'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 리포트 모달 */}
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

              {/* 요약 통계 */}
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

              {/* 메뉴별 현황 */}
              {reportData.menu_breakdown.length > 0 && (
                <div>
                  <h4 className="text-[13px] font-black text-gray-700 mb-2">메뉴별 판매 현황</h4>
                  <div className="space-y-2">
                    {reportData.menu_breakdown.map((m, i) => (
                      <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                        <span className="text-[12px] font-bold text-gray-800">{m.name}</span>
                        <div className="text-right">
                          <span className="text-[12px] font-bold text-gray-600">{m.count}개</span>
                          <span className="text-[11px] text-gray-900 font-bold ml-2">₩{m.revenue.toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 직분별 통계 */}
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

              {/* 요약 문구 */}
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-4 text-center">
                <p className="text-[13px] font-bold text-gray-700 leading-relaxed break-keep">
                  총 <strong className="text-amber-700">{reportData.total_items}개</strong>의 항목이 제공되었으며,
                  <br />가치 환산 총액은 <strong className="text-amber-700">{reportData.original_price_sum.toLocaleString()}원</strong>입니다.
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
