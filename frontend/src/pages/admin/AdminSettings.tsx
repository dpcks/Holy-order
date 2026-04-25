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
  Bell, 
  CreditCard, 
  Save, 
  CheckCircle2, 
  AlertCircle,
  Clock
} from 'lucide-react';
import { apiClient } from '../../api/client';
import type { StandardResponse } from '../../api/client';
import type { SettingResponse } from '../../types';

export const AdminSettings = () => {
  const [settings, setSettings] = useState<SettingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await apiClient.get<SettingResponse, StandardResponse<SettingResponse>>('/admin/settings');
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
      const res = await apiClient.put<SettingResponse, StandardResponse<SettingResponse>>('/admin/settings', updatedFields);
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

          <div className="grid grid-cols-2 gap-6">
            {/* 2. 결제 계좌 정보 */}
            <section className="bg-white rounded-[32px] p-8 shadow-sm border border-gray-100">
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

            {/* 3. 공지사항 및 운영 시간 (예정) */}
            <section className="bg-white rounded-[32px] p-8 shadow-sm border border-gray-100 flex flex-col">
              <div className="flex items-center gap-3 mb-8">
                <div className="w-10 h-10 bg-amber-50 text-amber-500 rounded-xl flex items-center justify-center">
                  <Bell size={20} />
                </div>
                <h2 className="text-lg font-black text-gray-900">공지사항 및 안내</h2>
              </div>

              <div className="flex-1 flex flex-col gap-5">
                <div className="flex-1 flex flex-col">
                  <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest block mb-2 px-1">영업 종료 시 안내 문구</label>
                  <textarea 
                    value={settings.notice || ''}
                    onChange={(e) => setSettings({...settings, notice: e.target.value})}
                    className="flex-1 w-full bg-gray-50 border-none rounded-3xl px-6 py-5 text-sm font-bold focus:bg-white focus:ring-4 focus:ring-black/5 transition-all outline-none resize-none"
                    placeholder="영업 종료 화면에 표시될 공지사항을 입력하세요."
                  />
                </div>
                
                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-start gap-3">
                  <Clock size={16} className="text-gray-400 mt-0.5" />
                  <p className="text-[11px] font-bold text-gray-400 leading-relaxed">
                    운영 시간 설정 기능은 추후 업데이트 예정입니다.<br/>지금은 수동으로 영업을 시작/종료해 주세요.
                  </p>
                </div>

                <button 
                  onClick={() => handleUpdate({ notice: settings.notice })}
                  disabled={saving}
                  className="w-full bg-black text-white py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 hover:bg-gray-800 transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  <Save size={18} />
                  공지사항 저장
                </button>
              </div>
            </section>
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
    </div>
  );
};
