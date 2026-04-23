import { useEffect, useState, useCallback, useMemo } from 'react';
import { 
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, Save, UserPlus, 
  FileText, CheckCircle2, AlertCircle, Users, Clock, Info, X, ArrowLeft
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
  volunteers: Record<string, string[]>;
  memo: string;
}

const ROLES = ['바리스타', '포스/결제', '안내/서빙'];

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

  const handleVolunteerChange = (date: string, role: string, value: string) => {
    setSchedules(prev => prev.map(s => {
      if (s.sunday_date === date) {
        return {
          ...s,
          volunteers: {
            ...s.volunteers,
            [role]: value.split(',').map(name => name.trim()).filter(Boolean)
          }
        };
      }
      return s;
    }));
  };

  const handleMemoChange = (date: string, value: string) => {
    setSchedules(prev => prev.map(s => {
      if (s.sunday_date === date) {
        return { ...s, memo: value };
      }
      return s;
    }));
  };

  const handleSave = async (dateStr: string) => {
    const schedule = schedules.find(s => s.sunday_date === dateStr);
    if (!schedule) return;

    setSavingDate(dateStr);
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
        setMessage({ type: 'success', text: '스케줄이 저장되었습니다.' });
        // 저장 성공 시 1.5초 후 달력으로 돌아가기 (사용자가 메시지를 읽을 시간 확보)
        setTimeout(() => {
          setMessage(null);
          setSelectedDate(null);
        }, 1500);
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

        {!selectedDate && (
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
        )}

        {selectedDate && (
          <button 
            onClick={() => setSelectedDate(null)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-black text-gray-500 hover:bg-gray-50 transition-all border border-transparent hover:border-gray-200"
          >
            <ArrowLeft size={16} /> 달력으로 돌아가기
          </button>
        )}
      </header>

      <main className="flex-1 overflow-auto relative">
        {!selectedDate ? (
          /* 단계 1: 전체 달력 화면 */
          <div className="p-8 max-w-[1200px] mx-auto animate-in fade-in zoom-in duration-300">
            <div className="bg-white rounded-[40px] shadow-2xl shadow-black/[0.03] border border-white overflow-hidden">
              <div className="grid grid-cols-7 border-b border-gray-50 bg-gray-50/30">
                {['일', '월', '화', '수', '목', '금', '토'].map((day, i) => (
                  <div key={day} className={`py-5 text-center text-[11px] font-black uppercase tracking-[0.3em] ${i === 0 ? 'text-red-500' : 'text-gray-400'}`}>
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
                  calendarDays.map((day, i) => {
                    const schedule = getScheduleForDate(day);
                    const isCurrentMonth = isSameMonth(day, currentDate);
                    const isSun = isSunday(day);
                    const isToday = isSameDay(day, new Date());
                    const dateStr = format(day, 'yyyy-MM-dd');

                    return (
                      <div 
                        key={dateStr}
                        onClick={() => isSun && setSelectedDate(dateStr)}
                        className={`min-h-[140px] p-5 border-r border-b border-gray-50 transition-all group relative ${
                          !isCurrentMonth ? 'opacity-20' : ''
                        } ${isSun ? 'cursor-pointer hover:bg-[#1A0A0A]/[0.02]' : 'cursor-default'}`}
                      >
                        <span className={`text-[15px] font-black ${
                          isSun ? 'text-red-500' : 'text-gray-900'
                        } ${isToday ? 'bg-[#1A0A0A] text-white w-7 h-7 rounded-xl flex items-center justify-center -mt-1 -ml-1 shadow-lg shadow-black/20' : ''}`}>
                          {format(day, 'd')}
                        </span>

                        {isSun && (
                          <div className="mt-4 space-y-2">
                            {schedule && Object.entries(schedule.volunteers).some(([_, names]) => names.length > 0) ? (
                              Object.entries(schedule.volunteers).map(([role, names]) => (
                                names.length > 0 && (
                                  <div key={role} className="flex items-center gap-2 group/role">
                                    <div className="w-1.5 h-1.5 rounded-full bg-primary shadow-sm" />
                                    <p className="text-[10px] font-bold text-gray-500 truncate">
                                      {role}: <span className="text-gray-900">{names.join(', ')}</span>
                                    </p>
                                  </div>
                                )
                              ))
                            ) : (
                              <div className="flex flex-col items-center justify-center py-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                <div className="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center text-gray-300">
                                  <UserPlus size={14} />
                                </div>
                                <span className="text-[9px] font-black text-gray-400 mt-2 uppercase">기입하기</span>
                              </div>
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
        ) : (
          /* 단계 2: 날짜 선택 시 그리드 형태의 입력 폼 */
          <div className="p-8 max-w-[1000px] mx-auto animate-in fade-in slide-in-from-bottom-8 duration-500">
            <div className="mb-10 text-center">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-red-50 text-red-500 rounded-full text-[11px] font-black uppercase tracking-widest mb-4">
                <Clock size={12} /> Sunday Service Selection
              </div>
              <h2 className="text-5xl font-black text-gray-900 tracking-tighter mb-2">
                {format(parseDate(selectedDate), 'M월 d일')} 주일 스케줄
              </h2>
              <p className="text-gray-400 font-medium italic text-lg">해당 주일의 봉사자 명단을 작성해 주세요.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              {ROLES.map((role, idx) => (
                <div key={role} className="bg-white p-8 rounded-[32px] shadow-xl shadow-black/[0.02] border border-white hover:shadow-black/[0.05] transition-all group">
                  <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-400 mb-6 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                    <Users size={24} />
                  </div>
                  <label className="block text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3 ml-1">
                    {role} 명단
                  </label>
                  <textarea
                    placeholder="이름 입력 (쉼표 구분)"
                    value={(currentSelectedSchedule?.volunteers?.[role] || []).join(', ')}
                    onChange={(e) => handleVolunteerChange(selectedDate, role, e.target.value)}
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 text-[15px] font-bold text-gray-800 focus:bg-white focus:ring-4 focus:ring-primary/10 transition-all outline-none h-32 resize-none"
                  />
                  <p className="text-[10px] text-gray-300 mt-3 font-medium italic">이름 사이에 쉼표(,)를 넣어주세요.</p>
                </div>
              ))}
            </div>

            <div className="bg-white p-8 rounded-[32px] shadow-xl shadow-black/[0.02] border border-white mb-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center text-gray-400">
                  <FileText size={20} />
                </div>
                <label className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em]">
                  특이사항 및 메모
                </label>
              </div>
              <textarea
                placeholder="해당 주일에 공유할 공지사항이나 전달 내용을 입력하세요."
                value={currentSelectedSchedule?.memo || ''}
                onChange={(e) => handleMemoChange(selectedDate, e.target.value)}
                className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-6 py-5 text-[15px] font-bold text-gray-800 focus:bg-white focus:ring-4 focus:ring-primary/10 transition-all outline-none h-40 resize-none"
              />
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={() => setSelectedDate(null)}
                className="px-8 py-5 rounded-[24px] font-black text-[15px] text-gray-500 hover:bg-gray-200 transition-all"
              >
                취소
              </button>
              <button
                onClick={() => handleSave(selectedDate)}
                disabled={savingDate === selectedDate}
                className="flex-1 bg-[#1A0A0A] text-white py-5 rounded-[24px] font-black text-[17px] flex items-center justify-center gap-3 hover:bg-black transition-all shadow-2xl shadow-black/20 active:scale-[0.98] disabled:opacity-50"
              >
                {savingDate === selectedDate ? (
                  <div className="w-6 h-6 border-3 border-white/20 border-t-white rounded-full animate-spin" />
                ) : (
                  <Save size={20} />
                )}
                {savingDate === selectedDate ? '저장 중...' : '스케줄 확정 및 저장'}
              </button>
            </div>

            {message && (
              <div className={`mt-6 p-5 rounded-2xl flex items-center justify-center gap-3 animate-in slide-in-from-top-2 ${
                message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}>
                {message.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
                <span className="text-[15px] font-bold">{message.text}</span>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};
