/*
[File Role]
이 파일은 관리자 전용 봉사 스케줄 관리 페이지를 담당합니다.
달력(Calendar) 인터페이스를 통해 각 주일(일요일)의 봉사자 명단과 특이사항을 관리합니다.
등록된 봉사자 마스터 명단에서 선택하여 배치하는 직관적인 UI를 제공합니다.
*/

import { useEffect, useState, useCallback, useMemo } from 'react';
import { 
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, Save, 
  FileText, CheckCircle2, AlertCircle, Users, X, Trash2
} from 'lucide-react';
import { apiClient } from '../../api/client';
import type { StandardResponse } from '../../api/client';
import { 
  format, startOfMonth, endOfMonth, eachDayOfInterval, 
  startOfWeek, endOfWeek, isSameMonth, isSameDay,
  addMonths, subMonths 
} from 'date-fns';

interface VolunteerSchedule {
  id: number;
  sunday_date: string;
  volunteers: {
    names?: string[];
    [key: string]: any;
  };
  memo: string;
}

interface Volunteer {
  id: number;
  name: string;
}

export const AdminSchedule = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [schedules, setSchedules] = useState<VolunteerSchedule[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [savingDate, setSavingDate] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  
  // 마스터 봉사자 명단 상태
  const [masterVolunteers, setMasterVolunteers] = useState<Volunteer[]>([]);
  const [isEditingMaster, setIsEditingMaster] = useState(false);
  const [newVolunteerName, setNewVolunteerName] = useState('');
  const [isAddingVolunteer, setIsAddingVolunteer] = useState(false);

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);

    return eachDayOfInterval({ start: startDate, end: endDate });
  }, [currentDate]);

  const fetchSchedules = useCallback(async () => {
    if (calendarDays.length === 0) return;
    
    try {
      const startDate = format(calendarDays[0], 'yyyy-MM-dd');
      const endDate = format(calendarDays[calendarDays.length - 1], 'yyyy-MM-dd');
      
      const res = await apiClient.get<VolunteerSchedule[], StandardResponse<VolunteerSchedule[]>>(
        `/admin/schedules?start_date=${startDate}&end_date=${endDate}`
      );
      if (res.success && res.data) {
        setSchedules(res.data);
      }
    } catch (err) {
      console.error('스케줄 조회 실패:', err);
    }
  }, [calendarDays]);

  const fetchMasterVolunteers = useCallback(async () => {
    try {
      const res = await apiClient.get<Volunteer[], StandardResponse<Volunteer[]>>('/admin/volunteers');
      if (res.success && res.data) {
        setMasterVolunteers(res.data);
      }
    } catch (err) {
      console.error('봉사자 명단 조회 실패:', err);
    }
  }, []);

  useEffect(() => {
    fetchSchedules();
    fetchMasterVolunteers();
  }, [fetchSchedules, fetchMasterVolunteers]);

  const handleAddVolunteerMaster = async () => {
    if (!newVolunteerName.trim() || isAddingVolunteer) return;
    
    setIsAddingVolunteer(true);
    try {
      const res = await apiClient.post<Volunteer, StandardResponse<Volunteer>>('/admin/volunteers', { name: newVolunteerName.trim() });
      if (res.success && res.data) {
        setMasterVolunteers(prev => [...prev, res.data]);
        setNewVolunteerName('');
      }
    } catch (err: any) {
      console.error('봉사자 추가 실패:', err);
    } finally {
      setIsAddingVolunteer(false);
    }
  };

  const handleDeleteVolunteerMaster = async (id: number) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    try {
      const res = await apiClient.delete<null, StandardResponse<null>>(`/admin/volunteers/${id}`);
      if (res.success) {
        setMasterVolunteers(prev => prev.filter(v => v.id !== id));
      }
    } catch (err) {
      console.error('봉사자 삭제 실패:', err);
    }
  };

  const parseDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);
  };

  const getScheduleForDate = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return schedules.find(s => s.sunday_date === dateStr);
  };

  const handlePrevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const handleNextMonth = () => setCurrentDate(addMonths(currentDate, 1));

  const handleToggleVolunteer = (date: string, name: string) => {
    setSchedules(prev => {
      const existing = prev.find(s => s.sunday_date === date);
      if (existing) {
        const names = Array.isArray(existing.volunteers?.names) ? existing.volunteers.names : [];
        const newNames = names.includes(name)
          ? names.filter(n => n !== name)
          : [...names, name];
        
        return prev.map(s => s.sunday_date === date ? {
          ...s,
          volunteers: { ...s.volunteers, names: newNames }
        } : s);
      }
      return [...prev, {
        id: 0,
        sunday_date: date,
        volunteers: { names: [name] },
        memo: ''
      }];
    });
  };

  const handleMemoChange = (date: string, value: string) => {
    setSchedules(prev => {
      const exists = prev.some(s => s.sunday_date === date);
      if (exists) {
        return prev.map(s => s.sunday_date === date ? { ...s, memo: value } : s);
      }
      return [...prev, {
        id: 0,
        sunday_date: date,
        volunteers: { names: [] },
        memo: value
      }];
    });
  };

  const handleSave = async (date: string) => {
    const schedule = schedules.find(s => s.sunday_date === date);
    if (!schedule) return;

    setSavingDate(date);
    try {
      const res = await apiClient.post<VolunteerSchedule, StandardResponse<VolunteerSchedule>>(
        '/admin/schedules',
        {
          sunday_date: schedule.sunday_date,
          volunteers: schedule.volunteers,
          memo: schedule.memo
        }
      );
      if (res.success) {
        setSelectedDate(null);
        setMessage(null);
        fetchSchedules();
      }
    } catch (err) {
      console.error('저장 실패:', err);
      setMessage({ type: 'error', text: '저장에 실패했습니다.' });
    } finally {
      setSavingDate(null);
    }
  };

  const currentSelectedSchedule = selectedDate ? getScheduleForDate(parseDate(selectedDate)) : null;
  const currentNames = Array.isArray(currentSelectedSchedule?.volunteers?.names) 
    ? currentSelectedSchedule?.volunteers?.names 
    : [];

  return (
    <div className="flex flex-col h-full bg-[#F3F4F6] overflow-hidden font-sans">
      {/* 헤더 */}
      <header className="bg-white px-8 py-5 flex items-center justify-between border-b border-gray-200 shrink-0 z-20 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-black rounded-2xl flex items-center justify-center shadow-lg shadow-black/10">
            <CalendarIcon className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">봉사 스케줄 관리</h1>
            <p className="text-[13px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">Sunday Service Volunteers</p>
          </div>
        </div>

        <div className="flex items-center gap-4 bg-gray-50 p-1.5 rounded-2xl border border-gray-100">
          <button onClick={handlePrevMonth} className="p-2 hover:bg-white hover:shadow-md rounded-xl transition-all">
            <ChevronLeft size={20} />
          </button>
          <span className="text-[16px] font-black min-w-[120px] text-center tracking-tighter">
            {format(currentDate, 'yyyy년 M월')}
          </span>
          <button onClick={handleNextMonth} className="p-2 hover:bg-white hover:shadow-md rounded-xl transition-all">
            <ChevronRight size={20} />
          </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden relative">
        {/* 왼쪽: 전체 달력 영역 */}
        <div className="flex-1 flex flex-col p-4 lg:p-8 overflow-hidden">
          <div className="flex-1 bg-white rounded-[32px] shadow-2xl shadow-black/[0.03] border border-white overflow-hidden flex flex-col animate-in fade-in zoom-in duration-300">
            {/* 요일 헤더 */}
            <div className="grid grid-cols-7 border-b border-gray-50 bg-gray-50/30 shrink-0">
              {['일', '월', '화', '수', '목', '금', '토'].map((day, idx) => (
                <div key={day} className={`py-4 text-center text-[13px] font-black tracking-widest ${idx === 0 ? 'text-red-500' : 'text-gray-400'}`}>
                  {day}
                </div>
              ))}
            </div>

            {/* 날짜 그리드 */}
            <div className={`flex-1 grid grid-cols-7 ${calendarDays.length > 35 ? 'grid-rows-6' : 'grid-rows-5'}`}>
              {calendarDays.map((day) => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const isSun = day.getDay() === 0;
                const isCurrentMonth = isSameMonth(day, currentDate);
                const isToday = isSameDay(day, new Date());
                const schedule = getScheduleForDate(day);
                const isSelected = selectedDate === dateStr;

                return (
                  <div
                    key={dateStr}
                    onClick={() => isSun && setSelectedDate(dateStr)}
                    className={`p-3 lg:p-4 border-r border-b border-gray-50 transition-all group relative flex flex-col h-full ${
                      !isCurrentMonth ? 'opacity-20' : ''
                    } ${isSun ? 'cursor-pointer hover:bg-[#1A0A0A]/[0.02]' : 'cursor-default'} ${
                      isSelected ? 'bg-primary/[0.03] ring-2 ring-inset ring-primary/20' : 
                      isToday ? 'bg-black/[0.02] ring-2 ring-inset ring-black/10' : ''
                    }`}
                  >
                    <span className={`text-[15px] font-black ${isSun ? 'text-red-500' : 'text-gray-900'}`}>
                      {format(day, 'd')}
                    </span>

                    {isSun && (
                      <div className="mt-2 flex flex-col gap-1 overflow-y-auto custom-scrollbar no-scrollbar">
                        {schedule ? (
                          <>
                            <div className="flex flex-wrap gap-1">
                              {(Array.isArray(schedule.volunteers?.names) ? schedule.volunteers.names : []).map((name: string, idx: number) => (
                                <span key={idx} className="text-[10px] font-bold text-primary bg-primary/5 px-1.5 py-0.5 rounded-md border border-primary/10">
                                  {name}
                                </span>
                              ))}
                            </div>
                            {schedule.memo && (
                              <div className="mt-1">
                                <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-100 uppercase tracking-tighter">
                                  특이사항
                                </span>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="text-[10px] font-bold text-gray-200 italic">미배정</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 배경 오버레이 */}
        {selectedDate && (
          <div 
            className="fixed inset-0 bg-black/10 backdrop-blur-[2px] z-25 lg:absolute animate-in fade-in duration-300"
            onClick={() => setSelectedDate(null)}
          />
        )}

        {/* 오른쪽: 입력 사이드바 */}
        <div 
          className={`fixed lg:absolute top-0 right-0 h-full w-full lg:w-[450px] bg-white shadow-[-30px_0_60px_-15px_rgba(0,0,0,0.1)] border-l border-gray-100 z-30 transition-transform duration-500 ease-in-out flex flex-col ${
            selectedDate ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          {selectedDate && (
            <>
              {/* 사이드바 헤더 */}
              <div className="p-8 border-b border-gray-50 shrink-0">
                <div className="flex items-center justify-between mb-2">
                  <span className="px-3 py-1 bg-red-50 text-red-600 text-[11px] font-black rounded-full uppercase tracking-widest">
                    Sunday Schedule
                  </span>
                  <button 
                    onClick={() => setSelectedDate(null)}
                    className="p-2 hover:bg-gray-100 rounded-xl transition-colors text-gray-400"
                  >
                    <X size={20} />
                  </button>
                </div>
                <h2 className="text-3xl font-black text-gray-900 tracking-tighter">
                  {format(parseDate(selectedDate), 'M월 d일')} 주일
                </h2>
              </div>

              {/* 사이드바 콘텐츠 */}
              <div className="flex-1 overflow-auto p-8 space-y-10 custom-scrollbar">
                {/* 봉사자 선택 영역 */}
                <section>
                  <div className="flex items-center justify-between mb-4">
                    <label className="flex items-center gap-2 text-[13px] font-black text-gray-400 uppercase tracking-widest">
                      <Users size={14} className="text-gray-400" /> 봉사자 선택
                    </label>
                    <button 
                      onClick={() => setIsEditingMaster(!isEditingMaster)}
                      className={`text-[11px] font-bold px-3 py-1 rounded-full transition-all ${
                        isEditingMaster 
                          ? 'bg-black text-white' 
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      {isEditingMaster ? '완료' : '명단 편집'}
                    </button>
                  </div>

                  {isEditingMaster ? (
                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                      <div className="flex gap-2">
                        <input 
                          type="text"
                          value={newVolunteerName}
                          onChange={(e) => setNewVolunteerName(e.target.value)}
                          placeholder="새 봉사자 이름"
                          disabled={isAddingVolunteer}
                          className="flex-1 bg-gray-50 border-none rounded-xl px-4 py-2 text-sm font-bold focus:ring-2 focus:ring-black transition-all disabled:opacity-50"
                          onKeyDown={(e) => e.key === 'Enter' && handleAddVolunteerMaster()}
                        />
                        <button 
                          onClick={handleAddVolunteerMaster}
                          disabled={isAddingVolunteer}
                          className="bg-black text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-gray-800 transition-all disabled:opacity-50 flex items-center justify-center min-w-[60px]"
                        >
                          {isAddingVolunteer ? (
                            <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                          ) : (
                            '추가'
                          )}
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {masterVolunteers.map(v => (
                          <div key={v.id} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-xl group">
                            <span className="text-sm font-bold text-gray-700">{v.name}</span>
                            <button 
                              onClick={() => handleDeleteVolunteerMaster(v.id)}
                              className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-all"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-3">
                      {masterVolunteers.length > 0 ? (
                        masterVolunteers.map(v => {
                          const isSelected = currentNames.includes(v.name);
                          return (
                            <button
                              key={v.id}
                              onClick={() => handleToggleVolunteer(selectedDate, v.name)}
                              className={`py-3 rounded-2xl text-[14px] font-black transition-all border-2 ${
                                isSelected
                                  ? 'bg-emerald-50 border-emerald-500 text-emerald-700 shadow-sm shadow-emerald-200/50 scale-[1.02]'
                                  : 'bg-gray-50 border-transparent text-gray-400 hover:bg-gray-100'
                              }`}
                            >
                              {v.name}
                            </button>
                          );
                        })
                      ) : (
                        <div className="col-span-3 py-8 text-center bg-gray-50 rounded-3xl border-2 border-dashed border-gray-100">
                          <p className="text-[13px] font-bold text-gray-300">등록된 봉사자가 없습니다.</p>
                          <p className="text-[11px] text-gray-400 mt-1">'명단 편집'을 눌러 추가해보세요!</p>
                        </div>
                      )}
                    </div>
                  )}
                </section>

                {/* 메모 영역 */}
                <div>
                  <label className="flex items-center gap-2 text-[13px] font-black text-gray-400 uppercase tracking-widest mb-4">
                    <FileText size={14} className="text-gray-400" /> 특이사항 및 메모
                  </label>
                  <textarea
                    placeholder="전달 사항을 입력하세요."
                    value={currentSelectedSchedule?.memo || ''}
                    onChange={(e) => handleMemoChange(selectedDate, e.target.value)}
                    className="w-full bg-gray-50 border border-transparent rounded-3xl px-6 py-5 text-[15px] font-bold text-gray-800 focus:bg-white focus:border-gray-100 focus:ring-4 focus:ring-primary/5 transition-all outline-none h-40 resize-none shadow-inner"
                  />
                </div>
              </div>

              {/* 사이드바 하단 */}
              <div className="p-8 border-t border-gray-50 bg-gray-50/30 shrink-0">
                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => handleSave(selectedDate)}
                    disabled={savingDate === selectedDate}
                    className="w-full bg-[#1A0A0A] text-white py-5 rounded-[24px] font-black text-[16px] flex items-center justify-center gap-3 hover:bg-black transition-all shadow-2xl shadow-black/20 active:scale-[0.98] disabled:opacity-50"
                  >
                    {savingDate === selectedDate ? (
                      <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Save size={20} />
                    )}
                    {savingDate === selectedDate ? '저장 중...' : '스케줄 저장하기'}
                  </button>
                </div>

                {message && (
                  <div className={`mt-4 p-4 rounded-2xl flex items-center justify-center gap-2 animate-in slide-in-from-top-2 ${
                    message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                  }`}>
                    {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                    <span className="text-[13px] font-bold">{message.text}</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
};
