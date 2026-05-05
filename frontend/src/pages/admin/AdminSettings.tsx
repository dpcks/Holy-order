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
  Clock
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '../../api/client';
import type { SettingResponse, StandardResponse, AdminInfo, AdminUser } from '../../types';

export const AdminSettings = () => {
  const [settings, setSettings] = useState<SettingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState(false);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  
  // 비밀번호 실시간 검증을 위한 상태
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // 신규 계정 추가를 위한 상태
  const [accName, setAccName] = useState('');
  const [accLoginId, setAccLoginId] = useState('');
  const [accPassword, setAccPassword] = useState('');
  const [accConfirmPassword, setAccConfirmPassword] = useState('');
  const [accRole, setAccRole] = useState<'MASTER' | 'ADMIN'>('ADMIN');

  // 관리자 목록 상태
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loadingAdmins, setLoadingAdmins] = useState(false);
  
  // 현재 로그인된 관리자 정보 상태
  const [currentAdmin, setCurrentAdmin] = useState<AdminInfo | null>(null);

  useEffect(() => {
    fetchSettings();
    fetchAdmins();
    fetchCurrentAdmin();
  }, []);

  const fetchCurrentAdmin = async () => {
    try {
      const res = await apiClient.get<StandardResponse<AdminInfo>, StandardResponse<AdminInfo>>('/admin/me');
      if (res.success) {
        setCurrentAdmin(res.data);
      }
    } catch (err) {
      console.error('현재 관리자 정보 조회 실패:', err);
    }
  };

  const fetchAdmins = async () => {
    try {
      setLoadingAdmins(true);
      const res = await apiClient.get<AdminUser[], StandardResponse<AdminUser[]>>('/admin/accounts');
      if (res.success && res.data) {
        setAdmins(res.data);
      }
    } catch (err) {
      console.error('관리자 목록 조회 실패:', err);
    } finally {
      setLoadingAdmins(false);
    }
  };

  const toggleAdminStatus = async (id: number, currentStatus: boolean) => {
    try {
      const res = await apiClient.patch<any, StandardResponse<any>>(`/admin/accounts/${id}`, { is_active: !currentStatus });
      if (res.success) {
        toast.success(res.message);
        fetchAdmins(); // 상태 변경 후 목록 새로고침
      }
    } catch (err: any) {
      // client.ts의 전역 에러 핸들러가 토스트를 띄우지만, 커스텀 에러 처리 방지
      console.error('계정 상태 변경 실패:', err);
    }
  };


  const fetchSettings = async () => {
    try {
      const res = await apiClient.get<StandardResponse<SettingResponse>, StandardResponse<SettingResponse>>('/admin/settings');
      if (res.success) setSettings(res.data);
    } catch (err) {
      console.error('설정 조회 실패:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (updatedFields: Partial<SettingResponse>) => {
    if (!settings) return;
    
    setSaving(true);
    setMessage(null);
    try {
      const res = await apiClient.put<StandardResponse<SettingResponse>, StandardResponse<SettingResponse>>('/admin/settings', updatedFields);
      if (res.success) {
        setSettings(res.data);
        setMessage({ type: 'success', text: '설정이 성공적으로 저장되었습니다.' });
        // 3초 후 메시지 제거
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (err) {
      console.error('설정 저장 실패:', err);
      setMessage({ type: 'error', text: '설정 저장 중 오류가 발생했습니다.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex h-full items-center justify-center"><div className="animate-spin h-8 w-8 rounded-full border-b-2 border-primary" /></div>;
  if (!settings) return <div className="flex h-full items-center justify-center text-gray-400">설정 정보를 불러올 수 없습니다.</div>;

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
      </header>

      <main className="flex-1 overflow-auto p-8 custom-scrollbar">
        <div className="max-w-4xl mx-auto space-y-6">
          
          {/* 1. 영업 상태 제어 (가장 중요) */}
          <section className="bg-white rounded-[32px] p-8 shadow-sm border border-gray-100 overflow-hidden relative group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-primary/10 transition-colors" />
            
            <div className="relative flex items-center justify-between">
              <div className="flex items-center gap-5">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-500 ${
                  settings.is_open ? 'bg-emerald-50 text-emerald-500 shadow-emerald-100 shadow-xl' : 'bg-red-50 text-red-500 shadow-red-100 shadow-xl'
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
                onClick={() => handleUpdate({ is_open: !settings.is_open })}
                disabled={saving}
                className={`relative w-24 h-12 rounded-full transition-all duration-500 p-1.5 focus:outline-none focus:ring-4 focus:ring-black/5 ${
                  settings.is_open ? 'bg-emerald-500 shadow-lg shadow-emerald-500/30' : 'bg-gray-200 shadow-inner'
                }`}
              >
                <div className={`w-9 h-9 rounded-full bg-white shadow-md transition-all duration-500 flex items-center justify-center ${
                  settings.is_open ? 'translate-x-12' : 'translate-x-0'
                }`}>
                  <Power size={18} className={settings.is_open ? 'text-emerald-500' : 'text-gray-300'} />
                </div>
              </button>
            </div>

            <div className={`mt-6 p-4 rounded-2xl flex items-center gap-3 border transition-all duration-500 ${
              settings.is_open 
                ? 'bg-emerald-50 border-emerald-100 text-emerald-700' 
                : 'bg-red-50 border-red-100 text-red-700'
            }`}>
              <div className={`w-2 h-2 rounded-full animate-pulse ${settings.is_open ? 'bg-emerald-500' : 'bg-red-500'}`} />
              <span className="text-[13px] font-black uppercase tracking-widest">
                현재 상태: {settings.is_open ? '영업 중 (주문 가능)' : '영업 종료 (안내 화면 표시)'}
              </span>
            </div>
          </section>

          <div className="grid grid-cols-2 gap-6 items-start">
            {/* 2. 결제 계좌 정보 (왼쪽 배치) */}
            <section className="bg-white rounded-[32px] p-8 shadow-sm border border-gray-100 flex flex-col h-full">
              <div className="flex items-center gap-3 mb-8">
                <div className="w-10 h-10 bg-blue-50 text-blue-500 rounded-xl flex items-center justify-center">
                  <CreditCard size={20} />
                </div>
                <h2 className="text-lg font-black text-gray-900">결제 계좌 관리</h2>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest block mb-2 px-1">은행명</label>
                  <input 
                    type="text"
                    value={settings.bank_name || ''}
                    onChange={(e) => setSettings({...settings, bank_name: e.target.value})}
                    className="w-full bg-gray-50 border-none rounded-2xl px-5 py-4 text-sm font-bold focus:bg-white focus:ring-4 focus:ring-black/5 transition-all outline-none"
                    placeholder="예: 카카오뱅크"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest block mb-2 px-1">계좌번호</label>
                  <input 
                    type="text"
                    value={settings.account_number || ''}
                    onChange={(e) => setSettings({...settings, account_number: e.target.value})}
                    className="w-full bg-gray-50 border-none rounded-2xl px-5 py-4 text-sm font-bold focus:bg-white focus:ring-4 focus:ring-black/5 transition-all outline-none"
                    placeholder="하이픈(-) 포함 입력"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest block mb-2 px-1">예금주</label>
                  <input 
                    type="text"
                    value={settings.account_holder || ''}
                    onChange={(e) => setSettings({...settings, account_holder: e.target.value})}
                    className="w-full bg-gray-50 border-none rounded-2xl px-5 py-4 text-sm font-bold focus:bg-white focus:ring-4 focus:ring-black/5 transition-all outline-none"
                    placeholder="예금주 명칭"
                  />
                </div>
                <button 
                  onClick={() => handleUpdate({ 
                    bank_name: settings.bank_name, 
                    account_number: settings.account_number, 
                    account_holder: settings.account_holder 
                  })}
                  disabled={saving}
                  className="w-full bg-black text-white py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 hover:bg-gray-800 transition-all active:scale-[0.98] disabled:opacity-50 mt-2"
                >
                  <Save size={18} />
                  계좌 정보 저장
                </button>
              </div>
            </section>

            {/* 오른쪽 컬럼: 전화번호 설정 + 보안 설정 스택 */}
            <div className="flex flex-col gap-6 h-full">
              {/* 3. 전화번호 필수 입력 여부 제어 */}
              <section className="bg-white rounded-[32px] p-6 shadow-sm border border-gray-100 relative group overflow-hidden shrink-0">
                <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50/50 rounded-full blur-2xl -mr-12 -mt-12 group-hover:bg-blue-100/50 transition-colors" />
                
                <div className="relative flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-500 ${
                      settings.require_phone ? 'bg-blue-50 text-blue-500' : 'bg-gray-50 text-gray-400'
                    }`}>
                      <Smartphone size={18} />
                    </div>
                    <div>
                      <h2 className="text-[16px] font-black text-gray-900 leading-tight">전화번호 설정</h2>
                      <p className="text-[11px] font-bold text-gray-400">필수 여부 조절</p>
                    </div>
                  </div>

                  <button 
                    onClick={() => handleUpdate({ require_phone: !settings.require_phone })}
                    disabled={saving}
                    className={`relative w-16 h-8 rounded-full transition-all duration-500 p-1 focus:outline-none focus:ring-4 focus:ring-black/5 ${
                      settings.require_phone ? 'bg-blue-500 shadow-lg shadow-blue-500/30' : 'bg-gray-200 shadow-inner'
                    }`}
                  >
                    <div className={`w-6 h-6 rounded-full bg-white shadow-md transition-all duration-500 flex items-center justify-center ${
                      settings.require_phone ? 'translate-x-8' : 'translate-x-0'
                    }`}>
                      <Smartphone size={12} className={settings.require_phone ? 'text-blue-500' : 'text-gray-300'} />
                    </div>
                  </button>
                </div>

                <div className={`relative w-full p-4 rounded-2xl flex items-center justify-between border transition-all duration-500 ${
                  settings.require_phone 
                    ? 'bg-blue-50 border-blue-100 text-blue-700' 
                    : 'bg-gray-50 border-gray-100 text-gray-500'
                }`}>
                  <span className="text-[11px] font-black uppercase tracking-wider opacity-60">현재 설정</span>
                  <span className="text-[13px] font-black">
                    {settings.require_phone ? '필수 입력' : '입력 생략'}
                  </span>
                </div>
              </section>

              {/* 4. 보안 및 계정 관리 진입 카드 */}
              <section 
                onClick={() => setIsSecurityModalOpen(true)}
                className="bg-white rounded-[32px] p-6 shadow-sm border border-gray-100 relative group overflow-hidden shrink-0 cursor-pointer hover:shadow-xl hover:shadow-gray-200/50 transition-all duration-300 active:scale-[0.98]"
              >
                <div className="absolute top-0 right-0 w-24 h-24 bg-amber-50/50 rounded-full blur-2xl -mr-12 -mt-12 group-hover:bg-amber-100/50 transition-colors" />
                
                <div className="relative flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-500 flex items-center justify-center">
                      <ShieldCheck size={18} />
                    </div>
                    <div>
                      <h2 className="text-[16px] font-black text-gray-900 leading-tight">보안 및 계정</h2>
                      <p className="text-[11px] font-bold text-gray-400">비밀번호 및 계정</p>
                    </div>
                  </div>
                  <div className="w-10 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-300 group-hover:text-amber-500 group-hover:bg-amber-50 transition-all">
                    <ChevronRight size={16} />
                  </div>
                </div>

                <div className="relative w-full p-4 rounded-2xl flex items-center justify-between border border-amber-100 bg-amber-50/50 text-amber-700 transition-all duration-500">
                  <span className="text-[11px] font-black uppercase tracking-wider opacity-60">관리 상태</span>
                  <span className="text-[13px] font-black flex items-center gap-1.5">
                    <Lock size={12} />
                    설정 관리하기
                  </span>
                </div>
              </section>

              {/* 5. 관리자 목록 및 현황 진입 카드 */}
              <section 
                onClick={() => setIsAdminModalOpen(true)}
                className="bg-white rounded-[32px] p-6 shadow-sm border border-gray-100 relative group overflow-hidden shrink-0 cursor-pointer hover:shadow-xl hover:shadow-gray-200/50 transition-all duration-300 active:scale-[0.98]"
              >
                <div className="absolute top-0 right-0 w-24 h-24 bg-purple-50/50 rounded-full blur-2xl -mr-12 -mt-12 group-hover:bg-purple-100/50 transition-colors" />
                
                <div className="relative flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-500 flex items-center justify-center">
                      <Users size={18} />
                    </div>
                    <div>
                      <h2 className="text-[16px] font-black text-gray-900 leading-tight">관리자 목록</h2>
                      <p className="text-[11px] font-bold text-gray-400">접속 현황 및 권한</p>
                    </div>
                  </div>
                  <div className="w-10 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-300 group-hover:text-purple-500 group-hover:bg-purple-50 transition-all">
                    <ChevronRight size={16} />
                  </div>
                </div>

                <div className="relative w-full p-4 rounded-2xl flex items-center justify-between border border-purple-100 bg-purple-50/50 text-purple-700 transition-all duration-500">
                  <span className="text-[11px] font-black uppercase tracking-wider opacity-60">등록된 관리자</span>
                  <span className="text-[13px] font-black flex items-center gap-1.5">
                    <Users size={12} />
                    {admins.length}명 보기
                  </span>
                </div>
              </section>

            </div>
          </div>

          {/* 하단 메시지 알림 */}
          {message && (
            <div className={`p-5 rounded-3xl flex items-center justify-center gap-3 animate-in slide-in-from-bottom-2 ${
              message.type === 'success' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-red-500 text-white shadow-lg shadow-red-500/20'
            }`}>
              {message.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
              <span className="text-[14px] font-black">{message.text}</span>
            </div>
          )}
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
                        <div className={`text-[11px] font-bold px-2 flex items-center gap-1 animate-in fade-in slide-in-from-top-1 ${
                          newPassword === confirmPassword ? 'text-emerald-500' : 'text-red-500'
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
                    const currentPwd = (document.getElementById('current_password') as HTMLInputElement).value;
                    
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
                        (document.getElementById('current_password') as HTMLInputElement).value = '';
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
                    <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest px-1">계정 권한</label>
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
                        className={`w-full bg-gray-50 border-none rounded-2xl px-5 py-4 text-sm font-bold focus:bg-white focus:ring-4 transition-all outline-none ${
                          accPassword && accConfirmPassword 
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
                        className={`w-full bg-gray-50 border-none rounded-2xl px-5 py-4 text-sm font-bold focus:bg-white focus:ring-4 transition-all outline-none ${
                          accPassword && accConfirmPassword 
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
                        fetchAdmins(); // 신규 추가 후 목록 갱신
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
                      새로운 관리자 계정을 추가하려면<br/>
                      <span className="text-gray-800">MASTER 권한</span>을 가진 계정으로<br/>
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
                            ? new Date(admin.last_login_at).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) 
                            : '접속 기록 없음'}
                        </span>
                      </div>
                      
                      <div className="w-[1px] h-8 bg-gray-100" />
                      
                      <button 
                        onClick={() => toggleAdminStatus(admin.id, admin.is_active)}
                        disabled={currentAdmin?.role !== 'MASTER'}
                        className={`relative w-12 h-7 rounded-full transition-all duration-300 p-1 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
                          admin.is_active ? 'bg-emerald-500 shadow-inner' : 'bg-gray-200 shadow-inner'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300 ${
                          admin.is_active ? 'translate-x-5' : 'translate-x-0'
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
    </div>
  );
};

