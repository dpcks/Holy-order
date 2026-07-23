/*
[File Role]
이 파일은 관리자 전용 시스템 설정 페이지를 담당합니다.
카페의 영업 상태(Open/Close)를 토글할 수 있으며, 결제용 계좌 정보 및 
사용자 화면에 표시될 공지사항을 관리합니다.
*/

import { useState, useEffect } from 'react';
import {
  Settings as SettingsIcon,
  Store,
  Power,
  CreditCard,
  Save,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  Lock,
  UserPlus,
  ShieldCheck,
  X,
  ChevronRight,
  Users,
  Clock,
  Info,
  Sparkles,
  Send
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QK, QK_DOMAIN } from '../../api/queryKeys';
import { apiClient } from '../../api/client';
import type { SettingResponse, StandardResponse, AdminInfo, AdminUser } from '../../types';
import { RELEASE_NOTES } from '../../constants/releaseNotes';

export const AdminSettings = () => {
  const queryClient = useQueryClient();
  const [localSettings, setLocalSettings] = useState<SettingResponse | null>(null);
  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState(false);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [isOrderSettingsModalOpen, setIsOrderSettingsModalOpen] = useState(false);
  const [isReleaseNotesOpen, setIsReleaseNotesOpen] = useState(false);

  // 비밀번호 실시간 검증을 위한 상태
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // 신규 계정 추가를 위한 상태
  const [accName, setAccName] = useState('');
  const [accLoginId, setAccLoginId] = useState('');
  const [accPassword, setAccPassword] = useState('');
  const [accConfirmPassword, setAccConfirmPassword] = useState('');
  const [accRole, setAccRole] = useState<'MASTER' | 'ADMIN'>('ADMIN');

  // [React Query] 데이터 조회
  const { data: settings, isLoading: loadingSettings } = useQuery({
    queryKey: QK.settings.admin,
    queryFn: async () => {
      const res = await apiClient.get<StandardResponse<SettingResponse>, StandardResponse<SettingResponse>>('/admin/settings');
      return res.success ? res.data : null;
    }
  });

  const { data: admins = [], isLoading: loadingAdmins } = useQuery({
    queryKey: QK.admins.list,
    queryFn: async () => {
      const res = await apiClient.get<AdminUser[], StandardResponse<AdminUser[]>>('/admin/accounts');
      return (res.success && res.data) ? res.data : [];
    }
  });

  const { data: currentAdmin } = useQuery({
    queryKey: QK.admins.me,
    queryFn: async () => {
      const res = await apiClient.get<StandardResponse<AdminInfo>, StandardResponse<AdminInfo>>('/admin/me');
      return res.success ? res.data : null;
    }
  });

  // 서버 데이터와 로컬 상태 동기화
  useEffect(() => {
    if (settings && !localSettings) {
      setLocalSettings(settings);
    }
  }, [settings, localSettings]);

  // [React Query] Mutations
  const updateSettingsMutation = useMutation({
    mutationFn: (updatedFields: Partial<SettingResponse>) =>
      apiClient.put<StandardResponse<SettingResponse>, StandardResponse<SettingResponse>>('/admin/settings', updatedFields),
    onSuccess: (res) => {
      if (res.success) {
        queryClient.setQueryData(QK.settings.admin, res.data);
        queryClient.invalidateQueries({ queryKey: QK.settings.public, exact: true });
        setLocalSettings(res.data);
        toast.success('설정이 성공적으로 저장되었습니다.');
      }
    }
  });

  const toggleAdminStatusMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      apiClient.patch<any, StandardResponse<any>>(`/admin/accounts/${id}`, { is_active }),
    onSuccess: (res) => {
      if (res.success) {
        queryClient.invalidateQueries({ queryKey: QK_DOMAIN.admins });
        toast.success(res.message);
      }
    }
  });

  const handleUpdate = (updatedFields: Partial<SettingResponse>) => {
    updateSettingsMutation.mutate(updatedFields);
  };

  const toggleAdminStatus = (id: number, currentStatus: boolean) => {
    toggleAdminStatusMutation.mutate({ id, is_active: !currentStatus });
  };

  const loading = loadingSettings;
  const saving = updateSettingsMutation.isPending;

  if (loading) return <div className="flex h-full items-center justify-center"><div className="animate-spin h-8 w-8 rounded-full border-b-2 border-primary" /></div>;
  if (!settings || !localSettings) return <div className="flex h-full items-center justify-center text-gray-400">설정 정보를 불러올 수 없습니다.</div>;

  return (
    <div className="flex flex-col h-full bg-[#F3F4F6] overflow-hidden font-sans">
      {/* 헤더 */}
      <header className="bg-white px-8 py-5 flex items-center justify-between border-b border-gray-200 shrink-0 z-20 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-black rounded-2xl flex items-center justify-center shadow-lg shadow-black/10">
            <SettingsIcon className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">시스템 설정</h1>
            <p className="text-[13px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">Global System Settings</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsReleaseNotesOpen(true)}
            className="flex items-center gap-2.5 px-5 py-2.5 bg-gradient-to-r from-primary/10 to-primary/5 hover:from-primary/20 hover:to-primary/10 text-primary rounded-2xl transition-all border border-primary/10 group shadow-sm active:scale-95"
          >
            <Sparkles size={18} className="group-hover:rotate-12 transition-transform duration-300" />
            <span className="text-[14px] font-black tracking-tight">업데이트 소식</span>
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-8 custom-scrollbar">
        <div className="max-w-4xl mx-auto space-y-6">

          {/* 1. 영업 상태 제어 (가장 중요) */}
          <section className="bg-white rounded-[32px] p-8 shadow-sm border border-gray-100 overflow-hidden relative group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-primary/10 transition-colors" />

            <div className="relative flex items-center justify-between">
              <div className="flex items-center gap-5">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-500 ${localSettings.is_open ? 'bg-emerald-50 text-emerald-500 shadow-emerald-100 shadow-xl' : 'bg-red-50 text-red-500 shadow-red-100 shadow-xl'
                  }`}>
                  <Store size={28} />
                </div>
                <div>
                  <h2 className="text-xl font-black text-gray-900 tracking-tight">영업 상태 제어</h2>
                  <p className="text-sm font-bold text-gray-400 mt-0.5">사용자 주문 가능 여부를 실시간으로 조절합니다.</p>
                </div>
              </div>

              {/* 프리미엄 토글 스위치 */}
              <button
                onClick={() => handleUpdate({ is_open: !localSettings.is_open })}
                disabled={saving}
                className={`relative w-24 h-12 rounded-full transition-all duration-500 p-1.5 focus:outline-none focus:ring-4 focus:ring-black/5 ${localSettings.is_open ? 'bg-emerald-500 shadow-lg shadow-emerald-500/30' : 'bg-gray-200 shadow-inner'
                  }`}
              >
                <div className={`w-9 h-9 rounded-full bg-white shadow-md transition-all duration-500 flex items-center justify-center ${localSettings.is_open ? 'translate-x-12' : 'translate-x-0'
                  }`}>
                  <Power size={18} className={localSettings.is_open ? 'text-emerald-500' : 'text-gray-300'} />
                </div>
              </button>
            </div>

            <div className={`mt-6 p-4 rounded-2xl flex items-center gap-3 border transition-all duration-500 ${localSettings.is_open
              ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
              : 'bg-red-50 border-red-100 text-red-700'
              }`}>
              <div className={`w-2 h-2 rounded-full animate-pulse ${localSettings.is_open ? 'bg-emerald-500' : 'bg-red-500'}`} />
              <span className="text-[13px] font-black uppercase tracking-widest">
                현재 상태: {localSettings.is_open ? '영업 중 (주문 가능)' : '영업 종료 (안내 화면 표시)'}
              </span>
            </div>
          </section>

          <div className="grid grid-cols-2 gap-6 items-start">
            {/* 왼쪽 컬럼: 결제 계좌 정보 */}
            <section className="bg-white rounded-[32px] p-7 shadow-sm border border-gray-100 flex flex-col h-full">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-blue-50 text-blue-500 rounded-xl flex items-center justify-center">
                  <CreditCard size={20} />
                </div>
                <h2 className="text-lg font-black text-gray-900 tracking-tight">결제 계좌 관리</h2>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5 px-1">은행명</label>
                  <input
                    type="text"
                    value={localSettings.bank_name || ''}
                    onChange={(e) => setLocalSettings({ ...localSettings, bank_name: e.target.value })}
                    disabled={currentAdmin?.role !== 'MASTER'}
                    className="w-full bg-gray-50 border-none rounded-2xl px-5 py-3.5 text-sm font-bold focus:bg-white focus:ring-4 focus:ring-black/5 transition-all outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                    placeholder="예: 카카오뱅크"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5 px-1">계좌번호</label>
                  <input
                    type="text"
                    value={localSettings.account_number || ''}
                    onChange={(e) => setLocalSettings({ ...localSettings, account_number: e.target.value })}
                    disabled={currentAdmin?.role !== 'MASTER'}
                    className="w-full bg-gray-50 border-none rounded-2xl px-5 py-3.5 text-sm font-bold focus:bg-white focus:ring-4 focus:ring-black/5 transition-all outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                    placeholder="하이픈(-) 포함 입력"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5 px-1">예금주</label>
                  <input
                    type="text"
                    value={localSettings.account_holder || ''}
                    onChange={(e) => setLocalSettings({ ...localSettings, account_holder: e.target.value })}
                    disabled={currentAdmin?.role !== 'MASTER'}
                    className="w-full bg-gray-50 border-none rounded-2xl px-5 py-3.5 text-sm font-bold focus:bg-white focus:ring-4 focus:ring-black/5 transition-all outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                    placeholder="예금주 명칭"
                  />
                </div>
                <button
                  onClick={() => {
                    if (currentAdmin?.role !== 'MASTER') {
                      return toast.error('계좌 정보 수정 권한이 없습니다.');
                    }
                    handleUpdate({
                      bank_name: localSettings.bank_name,
                      account_number: localSettings.account_number,
                      account_holder: localSettings.account_holder
                    });
                  }}
                  disabled={saving || currentAdmin?.role !== 'MASTER'}
                  className={`w-full py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all mt-2 ${currentAdmin?.role !== 'MASTER'
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-black text-white hover:bg-gray-800 active:scale-[0.98]'
                    }`}
                >
                  <Save size={18} />
                  {currentAdmin?.role !== 'MASTER' ? 'MASTER 전용' : '계좌 정보 저장'}
                </button>
              </div>
            </section>

            {/* 오른쪽 컬럼: 주문설정, 보안, 관리자 스택 */}
            <div className="flex flex-col gap-5">
              {/* 3. 주문 설정 진입 카드 */}
              <section
                onClick={() => setIsOrderSettingsModalOpen(true)}
                className="bg-white rounded-[32px] p-6 shadow-sm border border-gray-100 relative group overflow-hidden cursor-pointer hover:shadow-xl hover:shadow-gray-200/50 transition-all duration-300 active:scale-[0.98]"
              >
                <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50/50 rounded-full blur-2xl -mr-12 -mt-12 group-hover:bg-blue-100/50 transition-colors" />
                <div className="relative flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-11 h-11 bg-blue-50 text-blue-500 rounded-2xl flex items-center justify-center shadow-inner">
                      <Smartphone size={22} />
                    </div>
                    <div>
                      <h2 className="text-[17px] font-black text-gray-900 tracking-tight leading-tight">주문 설정</h2>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${localSettings.require_phone ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                          전화번호:{localSettings.require_phone ? '필수' : '선택'}
                        </span>
                        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${localSettings.toss_enabled ? 'bg-[#0064FF]/10 text-[#0064FF]' : 'bg-gray-100 text-gray-500'}`}>
                          토스:{localSettings.toss_enabled ? '활성' : '비활성'}
                        </span>
                        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${localSettings.show_price ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-500'}`}>
                          가격표시:{localSettings.show_price ? '활성' : '비활성'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <ChevronRight size={20} className="text-gray-300 group-hover:text-blue-500 transition-colors" />
                </div>
              </section>

              {/* 4. 보안 및 계정 관리 진입 카드 */}
              <section
                onClick={() => setIsSecurityModalOpen(true)}
                className="bg-white rounded-[32px] p-6 shadow-sm border border-gray-100 relative group overflow-hidden cursor-pointer hover:shadow-xl hover:shadow-gray-200/50 transition-all duration-300 active:scale-[0.98]"
              >
                <div className="absolute top-0 right-0 w-24 h-24 bg-amber-50/50 rounded-full blur-2xl -mr-12 -mt-12 group-hover:bg-amber-100/50 transition-colors" />
                <div className="relative flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-11 h-11 bg-amber-50 text-amber-500 rounded-2xl flex items-center justify-center shadow-inner">
                      <ShieldCheck size={22} />
                    </div>
                    <div>
                      <h2 className="text-[17px] font-black text-gray-900 tracking-tight leading-tight">보안 및 계정</h2>
                      <p className="text-[11px] font-bold text-gray-400 mt-0.5">비밀번호 및 권한 관리</p>
                    </div>
                  </div>
                  <ChevronRight size={20} className="text-gray-300 group-hover:text-amber-500 transition-colors" />
                </div>
              </section>

              {/* 5. 관리자 목록 및 현황 진입 카드 */}
              <section
                onClick={() => setIsAdminModalOpen(true)}
                className="bg-white rounded-[32px] p-6 shadow-sm border border-gray-100 relative group overflow-hidden cursor-pointer hover:shadow-xl hover:shadow-gray-200/50 transition-all duration-300 active:scale-[0.98]"
              >
                <div className="absolute top-0 right-0 w-24 h-24 bg-purple-50/50 rounded-full blur-2xl -mr-12 -mt-12 group-hover:bg-purple-100/50 transition-colors" />
                <div className="relative flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-11 h-11 bg-purple-50 text-purple-500 rounded-2xl flex items-center justify-center shadow-inner">
                      <Users size={22} />
                    </div>
                    <div>
                      <h2 className="text-[17px] font-black text-gray-900 tracking-tight leading-tight">관리자 목록</h2>
                      <p className="text-[11px] font-bold text-gray-400 mt-0.5">현재 {admins.length}명의 관리자 등록됨</p>
                    </div>
                  </div>
                  <ChevronRight size={20} className="text-gray-300 group-hover:text-purple-500 transition-colors" />
                </div>
              </section>
            </div>
          </div>
        </div>
      </main>

      {/* 보안 설정 모달 */}
      {isSecurityModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
          {/* 배경 블러 처리 */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setIsSecurityModalOpen(false)}
          />

          {/* 모달 콘텐츠 */}
          <div className="relative w-full max-w-5xl bg-gray-50 rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 max-h-[90vh] flex flex-col">
            <div className="p-8 bg-white border-b border-gray-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-amber-50 text-amber-500 rounded-2xl flex items-center justify-center shadow-inner">
                  <ShieldCheck size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-black text-gray-900 tracking-tight">보안 및 계정 관리</h2>
                  <p className="text-[12px] text-gray-400 font-bold uppercase tracking-wider">Security & Account Control</p>
                </div>
              </div>
              <button
                onClick={() => setIsSecurityModalOpen(false)}
                className="w-10 h-10 rounded-full bg-gray-50 text-gray-400 flex items-center justify-center hover:bg-gray-100 hover:text-gray-900 transition-all"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-8 grid grid-cols-2 gap-8 overflow-y-auto custom-scrollbar">
              {/* 왼쪽: 비밀번호 변경 섹션 */}
              <div className="space-y-6 bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm flex flex-col">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-amber-50 text-amber-500 rounded-lg flex items-center justify-center">
                      <Lock size={16} />
                    </div>
                    <h3 className="font-black text-gray-900">내 비밀번호 변경</h3>
                  </div>
                  {currentAdmin && (
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-gray-50 rounded-full border border-gray-100">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">접속 계정</span>
                      <span className="text-[12px] font-bold text-amber-600">@{currentAdmin.login_id}</span>
                    </div>
                  )}
                </div>
                <div className="space-y-4 flex-1">
                  <div className="space-y-2">
                    <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest px-1">현재 비밀번호</label>
                    <input
                      type="password"
                      id="current_password"
                      className="w-full bg-gray-50 border-none rounded-2xl px-5 py-4 text-sm font-bold focus:bg-white focus:ring-4 focus:ring-black/5 transition-all outline-none"
                      placeholder="현재 비밀번호를 입력하세요"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest px-1">새 비밀번호</label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full bg-gray-50 border-none rounded-2xl px-5 py-4 text-sm font-bold focus:bg-white focus:ring-4 focus:ring-black/5 transition-all outline-none"
                        placeholder="새 비밀번호"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest px-1">새 비밀번호 확인</label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full bg-gray-50 border-none rounded-2xl px-5 py-4 text-sm font-bold focus:bg-white focus:ring-4 focus:ring-black/5 transition-all outline-none"
                        placeholder="한번 더 입력"
                      />
                      {confirmPassword && (
                        <div className={`text-[11px] font-bold px-2 flex items-center gap-1 animate-in fade-in slide-in-from-top-1 ${newPassword === confirmPassword ? 'text-emerald-500' : 'text-red-500'
                          }`}>
                          {newPassword === confirmPassword ? (
                            <><CheckCircle2 size={12} /> 비밀번호가 일치합니다</>
                          ) : (
                            <><AlertCircle size={12} /> 비밀번호가 일치하지 않습니다</>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={async () => {
                    const currentPwdInput = document.getElementById('current_password') as HTMLInputElement;
                    const currentPwd = currentPwdInput?.value;

                    if (!currentPwd || !newPassword || !confirmPassword) {
                      return toast.error('모든 필드를 입력해 주세요.');
                    }

                    if (newPassword !== confirmPassword) {
                      return toast.error('새 비밀번호가 일치하지 않습니다.');
                    }

                    try {
                      const res = await apiClient.patch<StandardResponse<null>, StandardResponse<null>>('/admin/me/password', { current_password: currentPwd, new_password: newPassword });
                      if (res.success) {
                        toast.success('비밀번호가 안전하게 변경되었습니다.');
                        if (currentPwdInput) currentPwdInput.value = '';
                        setNewPassword('');
                        setConfirmPassword('');
                      }
                    } catch (err: any) {
                      console.error('비밀번호 변경 실패:', err);
                    }
                  }}
                  className="w-full mt-auto bg-amber-500 text-white py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 hover:bg-amber-600 transition-all shadow-lg shadow-amber-500/20"
                >
                  비밀번호 업데이트
                </button>
              </div>

              {/* 오른쪽: 관리자 계정 추가 섹션 (MASTER 전용) */}
              {currentAdmin?.role === 'MASTER' ? (
                <div className="space-y-6 bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm flex flex-col">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-indigo-50 text-indigo-500 rounded-lg flex items-center justify-center">
                      <UserPlus size={16} />
                    </div>
                    <h3 className="font-black text-gray-900">관리자 계정 추가</h3>
                  </div>
                  <div className="space-y-4 flex-1">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest px-1">관리자 성함</label>
                        <input
                          type="text"
                          className="w-full bg-gray-50 border-none rounded-2xl px-5 py-4 text-sm font-bold focus:bg-white focus:ring-4 focus:ring-black/5 transition-all outline-none"
                          placeholder="이름 입력"
                          value={accName}
                          onChange={(e) => setAccName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest px-1">신규 아이디</label>
                        <input
                          type="text"
                          className="w-full bg-gray-50 border-none rounded-2xl px-5 py-4 text-sm font-bold focus:bg-white focus:ring-4 focus:ring-black/5 transition-all outline-none"
                          placeholder="아이디 입력"
                          value={accLoginId}
                          onChange={(e) => setAccLoginId(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 px-1 relative group w-max">
                        <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest cursor-help">계정 권한</label>
                        <div className="text-gray-400 hover:text-indigo-500 cursor-help transition-colors">
                          <Info size={12} />
                        </div>

                        {/* 툴팁 (마우스 호버 시 표시) */}
                        <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-64 p-3 bg-gray-900/95 backdrop-blur-sm text-white text-[11px] rounded-xl shadow-xl z-50 animate-in fade-in zoom-in-95 pointer-events-none">
                          <div className="space-y-2">
                            <p className="leading-relaxed"><span className="text-amber-400 font-bold tracking-wider">MASTER:</span> 시스템 설정(계좌, 계정생성 등) 변경 및 모든 관리자 계정 생성/관리 가능</p>
                            <p className="leading-relaxed"><span className="text-blue-400 font-bold tracking-wider">ADMIN:</span> 주문 상태 관리, 재고 현황 파악 등 일반적인 매장 운영 기능만 사용 가능</p>
                          </div>
                          <div className="absolute left-6 -bottom-1 w-2 h-2 bg-gray-900/95 transform rotate-45" />
                        </div>
                      </div>
                      <select
                        className="w-full bg-gray-50 border-none rounded-2xl px-5 py-4 text-sm font-bold focus:bg-white focus:ring-4 focus:ring-black/5 transition-all outline-none appearance-none cursor-pointer"
                        value={accRole}
                        onChange={(e) => setAccRole(e.target.value as 'MASTER' | 'ADMIN')}
                      >
                        <option value="ADMIN">ADMIN (매장 운영 / 일반 봉사자)</option>
                        <option value="MASTER">MASTER (최고 관리자 / 설정 변경 가능)</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest px-1">초기 비밀번호</label>
                        <input
                          type="password"
                          className={`w-full bg-gray-50 border-none rounded-2xl px-5 py-4 text-sm font-bold focus:bg-white focus:ring-4 transition-all outline-none ${accPassword && accConfirmPassword
                            ? (accPassword === accConfirmPassword ? 'focus:ring-emerald-500/10' : 'focus:ring-red-500/10')
                            : 'focus:ring-black/5'
                            }`}
                          placeholder="비밀번호 설정"
                          value={accPassword}
                          onChange={(e) => setAccPassword(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest px-1">비밀번호 확인</label>
                        <input
                          type="password"
                          className={`w-full bg-gray-50 border-none rounded-2xl px-5 py-4 text-sm font-bold focus:bg-white focus:ring-4 transition-all outline-none ${accPassword && accConfirmPassword
                            ? (accPassword === accConfirmPassword ? 'focus:ring-emerald-500/10' : 'focus:ring-red-500/10')
                            : 'focus:ring-black/5'
                            }`}
                          placeholder="비밀번호 재입력"
                          value={accConfirmPassword}
                          onChange={(e) => setAccConfirmPassword(e.target.value)}
                        />
                      </div>
                    </div>

                    {/* 비밀번호 일치 알림 바 */}
                    {accPassword && accConfirmPassword && (
                      <div className={`mt-2 h-1.5 rounded-full overflow-hidden transition-all duration-500 ${accPassword === accConfirmPassword ? 'bg-emerald-50' : 'bg-red-50'}`}>
                        <div
                          className={`h-full transition-all duration-500 ${accPassword === accConfirmPassword ? 'w-full bg-emerald-500' : 'w-1/2 bg-red-500'}`}
                        />
                      </div>
                    )}
                    {accPassword && accConfirmPassword && (
                      <div className="flex items-center gap-1.5 px-1">
                        {accPassword === accConfirmPassword ? (
                          <>
                            <ShieldCheck size={12} className="text-emerald-500" />
                            <span className="text-[10px] font-bold text-emerald-600">비밀번호가 일치합니다.</span>
                          </>
                        ) : (
                          <>
                            <AlertCircle size={12} className="text-red-500" />
                            <span className="text-[10px] font-bold text-red-600">비밀번호가 일치하지 않습니다.</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={async () => {
                      if (!accName || !accLoginId || !accPassword || !accConfirmPassword) {
                        return toast.error('모든 필드를 입력해 주세요.');
                      }
                      if (accPassword !== accConfirmPassword) {
                        return toast.error('비밀번호가 일치하지 않습니다.');
                      }

                      try {
                        const res = await apiClient.post<StandardResponse<AdminInfo>, StandardResponse<AdminInfo>>('/admin/accounts', {
                          name: accName,
                          login_id: accLoginId,
                          password: accPassword,
                          role: accRole
                        });
                        if (res.success) {
                          toast.success(`${accName}(${accLoginId}) 계정이 생성되었습니다.`);
                          setAccName('');
                          setAccLoginId('');
                          setAccPassword('');
                          setAccConfirmPassword('');
                          queryClient.invalidateQueries({ queryKey: QK_DOMAIN.admins });
                        }
                      } catch (err: any) {
                        console.error('계정 생성 실패:', err);
                      }
                    }}
                    className="w-full mt-auto bg-indigo-500 text-white py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 hover:bg-indigo-600 transition-all shadow-lg shadow-indigo-500/20"
                  >
                    새 계정 생성하기
                  </button>
                </div>
              ) : (
                <div className="space-y-6 bg-gray-50 p-8 rounded-[32px] border border-gray-100 shadow-inner flex flex-col items-center justify-center text-center">
                  <div className="w-16 h-16 bg-gray-200 text-gray-400 rounded-3xl flex items-center justify-center mb-2 shadow-inner">
                    <ShieldCheck size={32} />
                  </div>
                  <div>
                    <h3 className="font-black text-gray-900 text-lg tracking-tight">접근 제한됨</h3>
                    <p className="text-[13px] text-gray-500 font-bold mt-2 leading-relaxed">
                      새로운 관리자 계정을 추가하려면<br />
                      <span className="text-gray-800">MASTER 권한</span>을 가진 계정으로<br />
                      로그인해야 합니다.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 bg-gray-50 text-center shrink-0">
              <p className="text-[11px] text-gray-400 font-medium italic">
                보안을 위해 비밀번호는 8자 이상, 영문/숫자 조합을 권장합니다.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 관리자 목록 모달 */}
      {isAdminModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setIsAdminModalOpen(false)}
          />

          <div className="relative w-full max-w-2xl bg-gray-50 rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 max-h-[90vh] flex flex-col">
            <div className="p-8 bg-white border-b border-gray-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-purple-50 text-purple-500 rounded-2xl flex items-center justify-center shadow-inner">
                  <Users size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-black text-gray-900 tracking-tight">관리자 목록</h2>
                  <p className="text-[12px] text-gray-400 font-bold uppercase tracking-wider">Admin Users List</p>
                </div>
              </div>
              <button
                onClick={() => setIsAdminModalOpen(false)}
                className="w-10 h-10 rounded-full bg-gray-50 text-gray-400 flex items-center justify-center hover:bg-gray-100 hover:text-gray-900 transition-all"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-8 flex-1 overflow-y-auto custom-scrollbar">
              <div className="space-y-4">
                {loadingAdmins ? (
                  <div className="py-10 text-center text-sm text-gray-400 font-bold flex flex-col items-center gap-3">
                    <div className="animate-spin h-6 w-6 rounded-full border-b-2 border-primary" />
                    목록을 불러오는 중입니다...
                  </div>
                ) : admins.map(admin => (
                  <div key={admin.id} className={`flex items-center justify-between p-4 rounded-3xl border transition-all ${admin.is_active ? 'bg-white border-gray-100 shadow-sm' : 'bg-gray-50 border-gray-200 opacity-70'}`}>
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-white text-lg ${admin.is_active ? 'bg-gradient-to-br from-purple-500 to-indigo-500 shadow-md' : 'bg-gray-300'}`}>
                        {admin.name.charAt(0)}
                      </div>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[15px] font-black text-gray-900">{admin.name}</span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-black uppercase tracking-wider ${admin.role === 'MASTER' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'}`}>
                            {admin.role}
                          </span>
                          {!admin.is_active && <span className="text-[9px] bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded font-bold uppercase">비활성</span>}
                        </div>
                        <span className="text-[12px] font-bold text-gray-400">@{admin.login_id}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">최근 접속</span>
                        <span className="text-[12px] font-bold text-gray-600 flex items-center gap-1.5">
                          <Clock size={12} className="text-gray-400" />
                          {admin.last_login_at
                            ? (() => {
                              // 9시간이 빠른 경우(데이터가 이미 KST인 경우)를 대비해 Z를 제거하고 파싱
                              const d = new Date(admin.last_login_at.replace('Z', ''));
                              return d.toLocaleString('ko-KR', {
                                timeZone: 'Asia/Seoul',
                                month: 'long',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                                hour12: false
                              });
                            })()
                            : '접속 기록 없음'}
                        </span>
                      </div>

                      <div className="w-[1px] h-8 bg-gray-100" />

                      <button
                        onClick={() => toggleAdminStatus(admin.id, admin.is_active)}
                        disabled={currentAdmin?.role !== 'MASTER'}
                        className={`relative w-12 h-7 rounded-full transition-all duration-300 p-1 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${admin.is_active ? 'bg-emerald-500 shadow-inner' : 'bg-gray-200 shadow-inner'
                          }`}
                      >
                        <div className={`w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300 ${admin.is_active ? 'translate-x-5' : 'translate-x-0'
                          }`} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* 주문 설정 모달 */}
      {isOrderSettingsModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setIsOrderSettingsModalOpen(false)}
          />

          <div className="relative w-full max-w-xl bg-gray-50 rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 max-h-[90vh] flex flex-col">
            <div className="p-8 bg-white border-b border-gray-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-50 text-blue-500 rounded-2xl flex items-center justify-center shadow-inner">
                  <Smartphone size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-black text-gray-900 tracking-tight">주문 상세 설정</h2>
                  <p className="text-[12px] text-gray-400 font-bold uppercase tracking-wider">Order Options Control</p>
                </div>
              </div>
              <button
                onClick={() => setIsOrderSettingsModalOpen(false)}
                className="w-10 h-10 rounded-full bg-gray-50 text-gray-400 flex items-center justify-center hover:bg-gray-100 hover:text-gray-900 transition-all"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-8 space-y-6 overflow-y-auto custom-scrollbar">
              {/* 전화번호 설정 */}
              <div className="bg-white rounded-[32px] p-6 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${localSettings.require_phone ? 'bg-blue-50 text-blue-500' : 'bg-gray-50 text-gray-400'}`}>
                      <Smartphone size={18} />
                    </div>
                    <div>
                      <h3 className="font-black text-gray-900">전화번호 입력 설정</h3>
                      <p className="text-[11px] font-bold text-gray-400">주문 시 전화번호 필수 여부</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleUpdate({ require_phone: !localSettings.require_phone })}
                    disabled={saving}
                    className={`relative w-16 h-8 rounded-full transition-all duration-500 p-1 ${localSettings.require_phone ? 'bg-blue-500 shadow-lg shadow-blue-500/30' : 'bg-gray-200 shadow-inner'}`}
                  >
                    <div className={`w-6 h-6 rounded-full bg-white shadow-md transition-all duration-500 flex items-center justify-center ${localSettings.require_phone ? 'translate-x-8' : 'translate-x-0'}`}>
                      <Smartphone size={12} className={localSettings.require_phone ? 'text-blue-500' : 'text-gray-300'} />
                    </div>
                  </button>
                </div>
                <div className={`p-4 rounded-2xl border text-center ${localSettings.require_phone ? 'bg-blue-50 border-blue-100 text-blue-700' : 'bg-gray-50 border-gray-100 text-gray-500'}`}>
                  <span className="text-[13px] font-black uppercase tracking-wider">
                    현재: {localSettings.require_phone ? '전화번호 필수 입력' : '전화번호 입력 생략 가능'}
                  </span>
                </div>
              </div>

              {/* 토스 송금 설정 */}
              <div className="bg-white rounded-[32px] p-6 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${localSettings.toss_enabled ? 'bg-[#0064FF]/10 text-[#0064FF]' : 'bg-gray-50 text-gray-400'}`}>
                      <Send size={18} />
                    </div>
                    <div>
                      <h3 className="font-black text-gray-900">토스 송금 기능</h3>
                      <p className="text-[11px] font-bold text-gray-400">토스 앱 간편 송금 활성화</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      if (!localSettings.toss_enabled && (!localSettings.bank_name || !localSettings.account_number)) {
                        toast.error('먼저 결제 계좌 정보를 설정해 주세요.');
                        return;
                      }
                      handleUpdate({ toss_enabled: !localSettings.toss_enabled });
                    }}
                    disabled={saving}
                    className={`relative w-16 h-8 rounded-full transition-all duration-500 p-1 ${localSettings.toss_enabled ? 'bg-[#0064FF] shadow-lg shadow-[#0064FF]/30' : 'bg-gray-200 shadow-inner'}`}
                  >
                    <div className={`w-6 h-6 rounded-full bg-white shadow-md transition-all duration-500 flex items-center justify-center ${localSettings.toss_enabled ? 'translate-x-8' : 'translate-x-0'}`}>
                      <Send size={12} className={localSettings.toss_enabled ? 'text-[#0064FF]' : 'text-gray-300'} />
                    </div>
                  </button>
                </div>
                <div className={`p-4 rounded-2xl border flex flex-col gap-1 text-center ${localSettings.toss_enabled ? 'bg-[#0064FF]/5 border-[#0064FF]/10 text-[#0064FF]' : 'bg-gray-50 border-gray-100 text-gray-500'}`}>
                  <span className="text-[13px] font-black uppercase tracking-wider">
                    현재: {localSettings.toss_enabled ? '토스 송금 활성화됨' : '토스 송금 비활성'}
                  </span>
                  {localSettings.toss_enabled && (
                    <p className="text-[11px] font-bold opacity-60">사용자 앱에서 '토스 송금' 버튼이 노출됩니다.</p>
                  )}
                </div>
              </div>

              {/* 가격 표시 설정 */}
              <div className="bg-white rounded-[32px] p-6 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${localSettings.show_price ? 'bg-amber-50 text-amber-500' : 'bg-gray-50 text-gray-400'}`}>
                      <CreditCard size={18} />
                    </div>
                    <div>
                      <h3 className="font-black text-gray-900">가격 표시</h3>
                      <p className="text-[11px] font-bold text-gray-400">사용자 화면 가격 및 합계 표시 여부</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleUpdate({ show_price: !localSettings.show_price })}
                    disabled={saving}
                    className={`relative w-16 h-8 rounded-full transition-all duration-500 p-1 ${localSettings.show_price ? 'bg-amber-500 shadow-lg shadow-amber-500/30' : 'bg-gray-200 shadow-inner'}`}
                  >
                    <div className={`w-6 h-6 rounded-full bg-white shadow-md transition-all duration-500 flex items-center justify-center ${localSettings.show_price ? 'translate-x-8' : 'translate-x-0'}`}>
                      <CreditCard size={12} className={localSettings.show_price ? 'text-amber-500' : 'text-gray-300'} />
                    </div>
                  </button>
                </div>
                <div className={`p-4 rounded-2xl border flex flex-col gap-1 text-center ${localSettings.show_price ? 'bg-amber-50 border-amber-100 text-amber-700' : 'bg-gray-50 border-gray-100 text-gray-500'}`}>
                  <span className="text-[13px] font-black uppercase tracking-wider">
                    현재: {localSettings.show_price ? '사용자 화면에 가격 표시됨' : '사용자 화면에 가격 숨김됨'}
                  </span>
                  {!localSettings.show_price && (
                    <p className="text-[11px] font-bold opacity-60">가격표시 토글이 OFF입니다. 메뉴 가격 및 장바구니 합계가 보이지 않습니다.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="p-6 bg-gray-50 border-t border-gray-100 shrink-0">
              <button
                onClick={() => setIsOrderSettingsModalOpen(false)}
                className="w-full py-4 bg-black text-white rounded-2xl font-black text-sm hover:bg-gray-800 transition-all active:scale-[0.98]"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 릴리즈 노트 모달 */}
      {isReleaseNotesOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setIsReleaseNotesOpen(false)}
          />
          <div className="relative w-full max-w-2xl bg-white rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-[85vh]">
            {/* 모달 헤더 */}
            <div className="p-8 bg-[#1A0A0A] text-white flex justify-between items-start shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-md">
                  <Sparkles size={28} className="text-yellow-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-black tracking-tight">업데이트 소식</h2>
                  <p className="text-white/40 text-[12px] font-bold uppercase tracking-widest mt-0.5">Release Notes & Updates</p>
                </div>
              </div>
              <button
                onClick={() => setIsReleaseNotesOpen(false)}
                className="p-2 hover:bg-white/10 rounded-full transition-all"
              >
                <X size={24} />
              </button>
            </div>

            {/* 모달 콘텐츠 */}
            <div className="flex-1 overflow-y-auto p-10 custom-scrollbar space-y-12">
              {RELEASE_NOTES.map((note, index) => (
                <div key={index} className="relative pl-10 border-l-2 border-gray-100 group">
                  {/* 타임라인 마커 */}
                  <div className={`absolute left-[-9px] top-0 w-4 h-4 rounded-full border-4 border-white shadow-md transition-colors duration-300 ${index === 0 ? 'bg-primary' : 'bg-gray-200'}`} />

                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <span className={`text-[11px] font-black px-2 py-0.5 rounded-md ${index === 0 ? 'bg-primary/10 text-primary' : 'bg-gray-100 text-gray-500'}`}>
                        {note.version}
                      </span>
                      <span className="text-sm font-bold text-gray-400">{note.date}</span>
                    </div>

                    <h3 className="text-xl font-black text-gray-900 leading-tight">
                      {note.title}
                    </h3>

                    <ul className="space-y-4">
                      {note.updates.map((update, i) => (
                        <li key={i} className="flex items-start gap-3 group/item">
                          <div className={`mt-2 w-1.5 h-1.5 rounded-full shrink-0 transition-all duration-300 ${update.isNew ? 'bg-primary scale-125 shadow-sm shadow-primary/50' : 'bg-gray-300 group-hover/item:bg-primary'}`} />
                          <div className="flex flex-wrap items-center gap-2 min-w-0">
                            <p className={`text-[15px] font-bold leading-relaxed transition-colors ${update.isNew ? 'text-gray-900' : 'text-gray-600 group-hover/item:text-gray-900'}`}>
                              {update.text}
                            </p>
                            {update.isNew && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary text-white text-[9px] font-black tracking-widest shadow-sm animate-in zoom-in-50 duration-500">
                                <span className="w-1 h-1 bg-white rounded-full animate-ping" />
                                NEW
                              </span>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>

            {/* 모달 하단 액션 */}
            <div className="p-8 bg-gray-50 border-t border-gray-100">
              <button
                onClick={() => setIsReleaseNotesOpen(false)}
                className="w-full py-4 text-[15px] font-black text-gray-500 bg-white border border-gray-200 hover:bg-gray-100 rounded-2xl transition-all shadow-sm"
              >
                확인했습니다
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
