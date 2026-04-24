import { useEffect, useState, useCallback, useMemo } from 'react';
import { 
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, Save, 
  FileText, CheckCircle2, AlertCircle, Users, Clock, ArrowLeft
} from 'lucide-react';
import { apiClient } from '../../api/client';
import type { StandardResponse } from '../../api/client';
import { 
  format, startOfMonth, endOfMonth, eachDayOfInterval, 
  isSunday, startOfWeek, endOfWeek, isSameMonth, isSameDay, 
  addMonths, subMonths 
} from 'date-fns';
import { ko } from 'date-fns/locale';

interface VolunteerSchedule {
  id: number;
  sunday_date: string;
  volunteers: {
    names?: string | string[];
    [key: string]: any;
  };
  memo: string;
}

// const ROLES = ['바리스타', '포스/결제', '안내/서빙'];

export const AdminSchedule = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [schedules, setSchedules] = useState<VolunteerSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [savingDate, setSavingDate] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);

    return eachDayOfInterval({ start: startDate, end: endDate });
  }, [currentDate]);

  const fetchSchedules = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth() + 1;
      const res = await apiClient.get<VolunteerSchedule[], StandardResponse<VolunteerSchedule[]>>(
        `/admin/schedules?year=${year}&month=${month}`
      );
      if (res.success && res.data) {
        setSchedules(res.data);
      }
    } catch (err) {
      console.error('스케줄 조회 실패:', err);
      setMessage({ type: 'error', text: '데이터를 불러오는 중 오류가 발생했습니다.' });
    } finally {
      setLoading(false);
    }
  }, [currentDate]);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

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

  const handleVolunteerChange = (date: string, value: string) => {
    setSchedules(prev => {
      const exists = prev.some(s => s.sunday_date === date);
      if (exists) {
        return prev.map(s => s.sunday_date === date ? {
          ...s,
          volunteers: {
            ...s.volunteers,
            names: value
          }
        } : s);
      }
      return [...prev, {
        id: 0,
        sunday_date: date,
        volunteers: { names: value },
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
        volunteers: {},
        memo: value
      }];
    });
  };

  const handleSave = async (dateStr: string) => {
    const schedule = schedules.find(s => s.sunday_date === dateStr) || {
      id: 0,
      sunday_date: dateStr,
      volunteers: {},
      memo: ''
    };

    setSavingDate(dateStr);
    try {
      const names = schedule.volunteers?.names;
      const namesArray = typeof names === 'string' 
        ? names.split(/\s+/).filter(Boolean)
        : (Array.isArray(names) ? names : []);

      const res = await apiClient.post<VolunteerSchedule, StandardResponse<VolunteerSchedule>>(
        '/admin/schedules',
        {
          sunday_date: schedule.sunday_date,
          volunteers: { ...schedule.volunteers, names: namesArray },
          memo: schedule.memo
        }
      );
      if (res.success) {
        // 즉시 달력으로 돌아가기
        setSelectedDate(null);
        setMessage(null);
      }
    } catch (err) {
      setMessage({ type: 'error', text: '저장에 실패했습니다.' });
    } finally {
      setSavingDate(null);
    }
  };

  const currentSelectedSchedule = selectedDate ? getScheduleForDate(parseDate(selectedDate)) : null;

  return (
    <div className="flex flex-col h-full bg-[#F3F4F6] overflow-hidden">
      {/* 헤더 */}
      <header className="bg-white px-8 py-5 flex items-center justify-between border-b border-gray-200 shrink-0 z-20 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-[#1A0A0A] rounded-xl flex items-center justify-center text-white shadow-lg shadow-black/10">
            <CalendarIcon size={20} />
          </div>
          <div>
            <h1 className="text-xl font-black text-gray-900 tracking-tight">봉사 스케줄</h1>
            <p className="text-gray-400 text-[10px] font-black uppercase tracking-[0.2em] mt-0.5">Sunday Volunteers</p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-gray-50 p-1 rounded-xl border border-gray-100">
          <button onClick={handlePrevMonth} className="p-2 hover:bg-white hover:shadow-sm rounded-lg transition-all text-gray-400">
            <ChevronLeft size={18} />
          </button>
          <span className="text-[14px] font-black text-gray-900 px-4 min-w-[120px] text-center">
            {format(currentDate, 'yyyy년 M월', { locale: ko })}
          </span>
          <button onClick={handleNextMonth} className="p-2 hover:bg-white hover:shadow-sm rounded-lg transition-all text-gray-400">
            <ChevronRight size={18} />
          </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden relative">
        {/* 왼쪽: 전체 달력 영역 (고정 너비 유지) */}
        <div className="flex-1 overflow-auto">
          <div className="p-8 max-w-[1200px] mx-auto animate-in fade-in zoom-in duration-300">
            <div className="bg-white rounded-[40px] shadow-2xl shadow-black/[0.03] border border-white overflow-hidden">
              <div className="grid grid-cols-7 border-b border-gray-50 bg-gray-50/30">
                {['일', '월', '화', '수', '목', '금', '토'].map((day) => (
                  <div key={day} className={`py-5 text-center text-[11px] font-black uppercase tracking-[0.3em] ${day === '일' ? 'text-red-500' : 'text-gray-400'}`}>
                    {day}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7">
                {loading ? (
                  <div className="col-span-7 h-[600px] flex flex-col items-center justify-center gap-4">
                    <div className="animate-spin w-10 h-10 border-4 border-[#1A0A0A] border-t-transparent rounded-full" />
                    <p className="font-bold text-[13px] text-gray-400 uppercase tracking-widest">Loading Schedule...</p>
                  </div>
                ) : (
                  calendarDays.map((day) => {
                    const schedule = getScheduleForDate(day);
                    const isCurrentMonth = isSameMonth(day, currentDate);
                    const isSun = isSunday(day);
                    const isToday = isSameDay(day, new Date());
                    const dateStr = format(day, 'yyyy-MM-dd');
                    const isSelected = selectedDate === dateStr;

                    return (
                      <div 
                        key={dateStr}
                        onClick={() => isSun && setSelectedDate(dateStr)}
                        className={`min-h-[140px] p-5 border-r border-b border-gray-50 transition-all group relative ${
                          !isCurrentMonth ? 'opacity-20' : ''
                        } ${isSun ? 'cursor-pointer hover:bg-[#1A0A0A]/[0.02]' : 'cursor-default'} ${
                          isSelected ? 'bg-primary/[0.03] ring-2 ring-inset ring-primary/20' : ''
                        }`}
                      >
                        <span className={`text-[15px] font-black ${
                          isSun ? 'text-red-500' : 'text-gray-900'
                        } ${isToday ? 'bg-[#1A0A0A] text-white w-7 h-7 rounded-xl flex items-center justify-center -mt-1 -ml-1 shadow-lg shadow-black/20' : ''}`}>
                          {format(day, 'd')}
                        </span>

                        {isSun && (
                          <div className="mt-4 flex flex-wrap gap-1">
                            {schedule ? (
                              <>
                                {(() => {
                                  const names = schedule.volunteers?.names;
                                  return (Array.isArray(names) 
                                    ? names 
                                    : (typeof names === 'string' ? names.split(/\s+/).filter(Boolean) : [])
                                  ).map((name: string, idx: number) => (
                                    <span key={idx} className="text-[10px] font-bold text-primary bg-primary/5 px-1.5 py-0.5 rounded-md">
                                      {name}
                                    </span>
                                  ));
                                })()}
                                {schedule.memo && (
                                  <div className="w-full mt-1.5">
                                    <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-100 uppercase tracking-tighter">
                                      특이사항
                                    </span>
                                  </div>
                                )}
                              </>
                            ) : (
                              <div className="text-[10px] font-bold text-gray-300 italic">미배정</div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 배경 오버레이 (클릭 시 닫기) */}
        {selectedDate && (
          <div 
            className="fixed inset-0 bg-black/10 backdrop-blur-[2px] z-25 lg:absolute animate-in fade-in duration-300"
            onClick={() => setSelectedDate(null)}
          />
        )}

        {/* 오른쪽: 입력 사이드바 (Drawer) */}
        <div 
          className={`fixed lg:absolute top-0 right-0 h-full w-full lg:w-[450px] bg-white shadow-[-30px_0_60px_-15px_rgba(0,0,0,0.1)] border-l border-gray-100 z-30 transition-transform duration-500 ease-in-out flex flex-col ${
            selectedDate ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          {selectedDate && (
            <>
              {/* 사이드바 헤더 */}
              <div className="p-8 border-b border-gray-50 shrink-0">
                <div className="flex items-center justify-between mb-6">
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-red-50 text-red-500 rounded-full text-[10px] font-black uppercase tracking-widest">
                    <Clock size={12} /> Schedule Editor
                  </div>
                  <button 
                    onClick={() => setSelectedDate(null)}
                    className="w-10 h-10 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-50 hover:text-gray-900 transition-all"
                  >
                    <ArrowLeft size={20} />
                  </button>
                </div>
                <h2 className="text-3xl font-black text-gray-900 tracking-tighter">
                  {format(parseDate(selectedDate), 'M월 d일')} 주일
                </h2>
                <p className="text-gray-400 font-medium italic mt-1">봉사자 명단을 업데이트 해주세요.</p>
              </div>

              {/* 사이드바 본문 (스크롤) */}
              <div className="flex-1 overflow-auto p-8 space-y-8">
                {/* 봉사자 섹션 */}
                <div className="space-y-4">
                  <label className="flex items-center gap-2 text-[12px] font-black text-gray-400 uppercase tracking-widest">
                    <Users size={14} className="text-primary" /> 주일 봉사자 명단
                  </label>
                  <textarea
                    placeholder="봉사자 이름을 입력하세요 (띄어쓰기로 구분)"
                    value={
                      typeof currentSelectedSchedule?.volunteers?.names === 'string'
                        ? currentSelectedSchedule.volunteers.names
                        : (currentSelectedSchedule?.volunteers?.names || []).join(' ')
                    }
                    onChange={(e) => handleVolunteerChange(selectedDate, e.target.value)}
                    className="w-full bg-gray-50 border border-transparent rounded-2xl px-5 py-4 text-[15px] font-bold text-gray-800 focus:bg-white focus:border-gray-100 focus:ring-4 focus:ring-primary/5 transition-all outline-none h-40 resize-none"
                  />
                  <p className="text-[11px] text-gray-400 font-medium leading-relaxed">
                    팁: 이름과 이름 사이에 공백(띄어쓰기)을 넣어주시면 달력에 개별 태그로 표시됩니다.
                  </p>
                </div>

                {/* 메모 섹션 */}
                <div className="space-y-4">
                  <label className="flex items-center gap-2 text-[12px] font-black text-gray-400 uppercase tracking-widest">
                    <FileText size={14} className="text-gray-400" /> 특이사항 및 메모
                  </label>
                  <textarea
                    placeholder="전달 사항을 입력하세요."
                    value={currentSelectedSchedule?.memo || ''}
                    onChange={(e) => handleMemoChange(selectedDate, e.target.value)}
                    className="w-full bg-gray-50 border border-transparent rounded-2xl px-5 py-4 text-[15px] font-bold text-gray-800 focus:bg-white focus:border-gray-100 focus:ring-4 focus:ring-primary/5 transition-all outline-none h-40 resize-none"
                  />
                </div>
              </div>

              {/* 사이드바 하단 (액션 버튼) */}
              <div className="p-8 border-t border-gray-50 bg-gray-50/30 shrink-0">
                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => handleSave(selectedDate)}
                    disabled={savingDate === selectedDate}
                    className="w-full bg-[#1A0A0A] text-white py-4 rounded-2xl font-black text-[15px] flex items-center justify-center gap-3 hover:bg-black transition-all shadow-xl shadow-black/10 active:scale-[0.98] disabled:opacity-50"
                  >
                    {savingDate === selectedDate ? (
                      <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Save size={18} />
                    )}
                    {savingDate === selectedDate ? '저장 중...' : '스케줄 저장하기'}
                  </button>
                  <button
                    onClick={() => setSelectedDate(null)}
                    className="w-full py-4 rounded-2xl font-bold text-[14px] text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
                  >
                    닫기
                  </button>
                </div>

                {message && (
                  <div className={`mt-4 p-4 rounded-xl flex items-center justify-center gap-2 animate-in slide-in-from-top-2 ${
                    message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
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
