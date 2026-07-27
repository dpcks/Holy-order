/*
[File Role]
이 파일은 관리자 전용 주일 봉사 스케줄 관리 페이지를 담당합니다.
월간 달력 대신 해당 월의 일요일(주일) 4~5개만 표시하는 주차별 카드로 리디자인되었습니다.
봉사자 선택, 명단 관리, 메모, 저장 사이드바 기능을 완벽하게 제공합니다.
*/

import { useState, useMemo, useEffect } from 'react';
import {
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, Save,
  FileText, CheckCircle2, AlertCircle, Users, X, Trash2,
  Quote, Sparkles, Copy, Clock
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { QK, QK_DOMAIN } from '../../api/queryKeys';
import { Skeleton } from '../../components/ui/Skeleton';
import type { StandardResponse, VolunteerSchedule, Volunteer } from '../../types';
import { Toast } from '../../components/ui/Toast';
import type { ToastType } from '../../components/ui/Toast';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  isSameDay, isBefore, startOfDay, addMonths, subMonths, subDays
} from 'date-fns';
import { getDailyVerse } from '../../utils/bibleVerses';

// 봉사 카드 스켈레톤
const ScheduleCardSkeleton = () => (
  <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm flex flex-col space-y-4">
    <div className="flex justify-between items-center">
      <Skeleton className="h-5 w-16" />
      <Skeleton className="h-5 w-20" />
    </div>
    <Skeleton className="h-7 w-32" />
    <div className="flex gap-2 pt-2">
      <Skeleton className="h-6 w-16 rounded-lg" />
      <Skeleton className="h-6 w-16 rounded-lg" />
    </div>
    <div className="pt-4 border-t border-gray-50 flex justify-between items-center">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-9 w-20 rounded-xl" />
    </div>
  </div>
);

// 봉사자 버튼 스켈레톤
const VolunteerSkeleton = () => (
  <Skeleton className="h-12 w-full rounded-2xl" />
);

export const AdminSchedule = () => {
  const queryClient = useQueryClient();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [schedules, setSchedules] = useState<VolunteerSchedule[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [savingDate, setSavingDate] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [dailyVerse] = useState(() => getDailyVerse());
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type });
  };

  const [isEditingMaster, setIsEditingMaster] = useState(false);
  const [newVolunteerName, setNewVolunteerName] = useState('');

  // 해당 월의 시작일과 종료일
  const monthStart = useMemo(() => startOfMonth(currentDate), [currentDate]);
  const monthEnd = useMemo(() => endOfMonth(currentDate), [currentDate]);

  // 해당 월의 모든 일요일 (주일)
  const sundaysOfMonth = useMemo(() => {
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    return days.filter(d => d.getDay() === 0);
  }, [monthStart, monthEnd]);

  // 가장 가까운 다음 운영 주일 (오늘 포함 이후 첫 일요일)
  const nextSunday = useMemo(() => {
    const today = startOfDay(new Date());
    return sundaysOfMonth.find(d => !isBefore(startOfDay(d), today)) || null;
  }, [sundaysOfMonth]);

  const startDate = format(monthStart, 'yyyy-MM-dd');
  const endDate = format(monthEnd, 'yyyy-MM-dd');

  // [React Query] 스케줄 조회
  const { data: fetchedSchedules = [], isLoading: loadingSchedules } = useQuery({
    queryKey: QK.schedules.list({ start: startDate, end: endDate }),
    queryFn: async () => {
      const res = await apiClient.get<VolunteerSchedule[], StandardResponse<VolunteerSchedule[]>>(
        `/admin/schedules?start_date=${startDate}&end_date=${endDate}`
      );
      return (res.success && res.data) ? res.data : [];
    },
  });

  // 사이드바가 닫혀있을 때만 fetchedSchedules를 로컬 state로 동기화 (Rule #8)
  useEffect(() => {
    if (fetchedSchedules && !selectedDate) {
      setSchedules(fetchedSchedules);
    }
  }, [fetchedSchedules, selectedDate]);

  // [React Query] 마스터 명단 조회
  const { data: masterVolunteers = [], isLoading: loadingVolunteers } = useQuery({
    queryKey: QK.volunteers.all,
    queryFn: async () => {
      const res = await apiClient.get<Volunteer[], StandardResponse<Volunteer[]>>('/admin/volunteers');
      return (res.success && res.data) ? res.data : [];
    },
  });

  // 봉사자 추가 Mutation
  const addVolunteerMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiClient.post<Volunteer, StandardResponse<Volunteer>>('/admin/volunteers', { name });
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK_DOMAIN.volunteers });
      setNewVolunteerName('');
    },
  });

  // 봉사자 삭제 Mutation
  const deleteVolunteerMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiClient.delete<null, StandardResponse<null>>(`/admin/volunteers/${id}`);
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK_DOMAIN.volunteers });
    },
  });

  const handleAddVolunteerMaster = async () => {
    if (!newVolunteerName.trim() || addVolunteerMutation.isPending) return;
    addVolunteerMutation.mutate(newVolunteerName.trim());
  };

  const handleDeleteVolunteerMaster = async (id: number) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    deleteVolunteerMutation.mutate(id);
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
  const handleThisMonth = () => setCurrentDate(new Date());

  // 월별 요약 통계
  const statsSummary = useMemo(() => {
    let assigned = 0;
    sundaysOfMonth.forEach(sunday => {
      const dateStr = format(sunday, 'yyyy-MM-dd');
      const sched = schedules.find(s => s.sunday_date === dateStr);
      const names = Array.isArray(sched?.volunteers?.names) ? sched.volunteers.names : [];
      if (names.length > 0) {
        assigned++;
      }
    });
    return {
      total: sundaysOfMonth.length,
      assigned,
      unassigned: sundaysOfMonth.length - assigned,
    };
  }, [sundaysOfMonth, schedules]);

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

  // 이전 주일 봉사자 불러오기 (보조 기능)
  const handleCopyPreviousVolunteerNames = (currentDateStr: string) => {
    const curDate = parseDate(currentDateStr);
    const prevSundayStr = format(subDays(curDate, 7), 'yyyy-MM-dd');
    const prevSched = schedules.find(s => s.sunday_date === prevSundayStr) ||
                      fetchedSchedules.find(s => s.sunday_date === prevSundayStr);

    const prevNames = Array.isArray(prevSched?.volunteers?.names) ? prevSched.volunteers.names : [];
    if (prevNames.length === 0) {
      showToast('이전 주일(7일 전) 봉사자 기록이 없습니다.', 'info');
      return;
    }

    setSchedules(prev => {
      const exists = prev.some(s => s.sunday_date === currentDateStr);
      if (exists) {
        return prev.map(s => s.sunday_date === currentDateStr ? {
          ...s,
          volunteers: { ...s.volunteers, names: [...prevNames] }
        } : s);
      }
      return [...prev, {
        id: 0,
        sunday_date: currentDateStr,
        volunteers: { names: [...prevNames] },
        memo: ''
      }];
    });

    showToast(`이전 주일 봉사자(${prevNames.length}명) 명단을 불러왔습니다.`, 'success');
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
        showToast('스케줄이 성공적으로 저장되었습니다.', 'success');
        queryClient.invalidateQueries({ queryKey: QK_DOMAIN.schedules });
      }
    } catch (err) {
      console.error('저장 실패:', err);
      showToast('스케줄 저장에 실패했습니다.', 'error');
    } finally {
      setSavingDate(null);
    }
  };

  const selectedWeekIndex = selectedDate
    ? sundaysOfMonth.findIndex(d => format(d, 'yyyy-MM-dd') === selectedDate)
    : -1;

  const currentSelectedSchedule = selectedDate ? getScheduleForDate(parseDate(selectedDate)) : null;
  const currentNames = Array.isArray(currentSelectedSchedule?.volunteers?.names)
    ? currentSelectedSchedule?.volunteers?.names
    : [];

  return (
    <div className="flex flex-col h-full bg-[#F3F4F6] overflow-hidden font-sans relative">
      {/* 헤더 */}
      <header className="bg-white px-6 xl:px-8 py-3 xl:py-4 flex flex-col md:flex-row md:items-center justify-between border-b border-gray-200 shrink-0 z-20 shadow-sm gap-3">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 xl:w-12 xl:h-12 bg-black rounded-xl xl:rounded-2xl flex items-center justify-center shadow-lg shadow-black/10">
            <CalendarIcon className="text-white" size={20} />
          </div>
          <div>
            <h1 className="text-xl xl:text-2xl font-black text-gray-900 tracking-tight">봉사 스케줄 관리</h1>
            <p className="text-[11px] xl:text-[13px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">Sunday Volunteer Schedule Board</p>
          </div>
        </div>

        <div className="flex items-center justify-between md:justify-end gap-3">
          {/* 요약 뱃지 */}
          <div className="flex items-center gap-1.5 bg-gray-100/80 px-3 py-1.5 rounded-xl text-[12px] font-bold">
            <span className="text-gray-600">주일 {statsSummary.total}회</span>
            <span className="text-gray-300">·</span>
            <span className="text-emerald-600">배정 완료 {statsSummary.assigned}회</span>
            <span className="text-gray-300">·</span>
            <span className="text-amber-600">미배정 {statsSummary.unassigned}회</span>
          </div>

          {/* 월 이동 컨트롤 */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-gray-50 p-1 rounded-2xl border border-gray-200">
              <button onClick={handlePrevMonth} className="p-1.5 hover:bg-white hover:shadow-sm rounded-xl transition-all text-gray-700" title="이전 달">
                <ChevronLeft size={18} />
              </button>
              <span className="text-[15px] font-black min-w-[100px] text-center tracking-tighter text-gray-900">
                {format(currentDate, 'yyyy년 M월')}
              </span>
              <button onClick={handleNextMonth} className="p-1.5 hover:bg-white hover:shadow-sm rounded-xl transition-all text-gray-700" title="다음 달">
                <ChevronRight size={18} />
              </button>
            </div>

            <button
              onClick={handleThisMonth}
              className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-[12px] font-bold transition-all shadow-xs"
            >
              이번 달
            </button>
          </div>
        </div>
      </header>

      {/* 성경 구절 카드 */}
      <div className="px-6 xl:px-8 pt-3 shrink-0">
        <div className="relative overflow-hidden rounded-[20px] bg-gradient-to-br from-rose-50 via-orange-50 to-amber-50 border border-orange-100/50 shadow-sm p-3 xl:p-4 group">
          <div className="relative flex items-center gap-4">
            <div className="flex-shrink-0 w-9 h-9 bg-white rounded-xl flex items-center justify-center shadow-md border border-orange-100">
              <Quote className="text-orange-400 rotate-180" size={16} />
            </div>

            <div className="flex-1">
              <p className="text-[12px] xl:text-[14px] font-black text-gray-800 leading-relaxed tracking-tight break-keep">
                "{dailyVerse?.text}"
              </p>
              <div className="flex items-center gap-2 mt-1">
                <div className="h-[1px] w-5 bg-orange-200" />
                <span className="text-[9px] xl:text-[10px] font-black text-orange-500 uppercase tracking-widest">{dailyVerse?.ref}</span>
              </div>
            </div>

            <div className="hidden md:flex items-center gap-1 px-2.5 py-1 bg-white/60 backdrop-blur-md rounded-full border border-white/80 shadow-sm text-[9px] font-black text-orange-600">
              <Sparkles size={10} className="animate-pulse" />
              <span>축복합니다</span>
            </div>
          </div>
        </div>
      </div>

      {/* 주일 카드 보드 영역 */}
      <main className="flex-1 p-6 xl:p-8 overflow-y-auto custom-scrollbar">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-5 gap-5">
          {loadingSchedules ? (
            Array.from({ length: sundaysOfMonth.length || 4 }).map((_, i) => (
              <ScheduleCardSkeleton key={i} />
            ))
          ) : (
            sundaysOfMonth.map((day, idx) => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const weekNumber = idx + 1;
              const schedule = getScheduleForDate(day);
              const names = Array.isArray(schedule?.volunteers?.names) ? schedule.volunteers.names : [];
              const isAssigned = names.length > 0;
              const hasMemo = Boolean(schedule?.memo && schedule.memo.trim() !== '');

              const today = startOfDay(new Date());
              const isCurrentDay = isSameDay(startOfDay(day), today);
              const isNext = nextSunday ? isSameDay(day, nextSunday) : false;
              const isPast = isBefore(startOfDay(day), today);
              const isSelected = selectedDate === dateStr;

              return (
                <div
                  key={dateStr}
                  onClick={() => setSelectedDate(dateStr)}
                  className={`bg-white rounded-3xl p-6 border transition-all duration-200 cursor-pointer flex flex-col justify-between relative group ${
                    isPast
                      ? 'opacity-75 border-gray-200 hover:border-gray-300 bg-gray-50/50'
                      : isCurrentDay
                        ? 'border-emerald-500 ring-2 ring-emerald-500/20 shadow-lg shadow-emerald-500/10 bg-emerald-50/20'
                        : isNext
                          ? 'border-primary ring-2 ring-primary/20 shadow-lg shadow-primary/10 bg-primary/[0.02]'
                          : 'border-gray-200 hover:border-gray-300 hover:shadow-md'
                  } ${isSelected ? 'ring-4 ring-black/10 border-black' : ''}`}
                >
                  {/* 카드 상단: 주차 & 날짜 & 상단 뱃지 */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-black text-gray-500 bg-gray-100 px-2.5 py-1 rounded-lg">
                          {weekNumber}주차
                        </span>

                        {isCurrentDay ? (
                          <span className="text-[11px] font-extrabold text-emerald-700 bg-emerald-100 border border-emerald-200 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            오늘 주일
                          </span>
                        ) : isNext ? (
                          <span className="text-[11px] font-extrabold text-primary bg-primary/10 border border-primary/20 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                            <Clock size={12} />
                            다음 주일
                          </span>
                        ) : null}
                      </div>

                      {/* 배정 상태 뱃지 */}
                      {isAssigned ? (
                        <span className="text-[11px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full flex items-center gap-1">
                          <CheckCircle2 size={12} />
                          배정 완료
                        </span>
                      ) : (
                        <span className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
                          미배정
                        </span>
                      )}
                    </div>

                    {/* 날짜 표시 */}
                    <h3 className="text-xl font-black text-gray-900 tracking-tight mb-4">
                      {format(day, 'M월 d일 주일')}
                    </h3>

                    {/* 봉사자 이름 칩 영역 */}
                    <div className="space-y-2 mb-4">
                      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">담당 봉사자</p>
                      {isAssigned ? (
                        <div className="flex flex-wrap gap-1.5">
                          {names.slice(0, 4).map((name, i) => (
                            <span
                              key={i}
                              className="text-[12px] font-bold text-gray-800 bg-gray-100 hover:bg-gray-200 px-2.5 py-1 rounded-xl transition-colors"
                            >
                              {name}
                            </span>
                          ))}
                          {names.length > 4 && (
                            <span className="text-[11px] font-black text-primary bg-primary/5 px-2 py-1 rounded-xl border border-primary/10">
                              +{names.length - 4}명
                            </span>
                          )}
                        </div>
                      ) : (
                        <p className="text-[13px] font-bold text-gray-400 italic py-1">
                          등록된 봉사자가 없습니다
                        </p>
                      )}
                    </div>
                  </div>

                  {/* 카드 하단 정보 & 버튼 */}
                  <div className="pt-4 border-t border-gray-100/80 flex items-center justify-between mt-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-black text-gray-900">
                        {isAssigned ? `${names.length}명 배정` : '0명'}
                      </span>
                      {hasMemo && (
                        <span className="text-[10px] font-black text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                          <FileText size={10} />
                          특이사항
                        </span>
                      )}
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedDate(dateStr);
                      }}
                      className={`px-3.5 py-1.5 rounded-xl text-[12px] font-black transition-all shadow-xs ${
                        isAssigned
                          ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          : 'bg-primary text-white hover:bg-primary/90'
                      }`}
                    >
                      {isAssigned ? '편집' : '배정하기'}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </main>

      {/* 배경 오버레이 (사이드바 오픈 시) */}
      {selectedDate && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-30 animate-in fade-in duration-300"
          onClick={() => setSelectedDate(null)}
        />
      )}

      {/* 오른쪽: 편집 사이드바 (오버레이) */}
      <div
        className={`fixed top-0 right-0 h-full w-full lg:w-[450px] bg-white shadow-[-30px_0_60px_-15px_rgba(0,0,0,0.1)] border-l border-gray-100 z-40 transition-transform duration-300 ease-in-out flex flex-col ${
          selectedDate ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {selectedDate && (
          <>
            {/* 사이드바 헤더 */}
            <div className="p-6 xl:p-8 border-b border-gray-100 shrink-0 bg-gray-50/50">
              <div className="flex items-center justify-between mb-2">
                <span className="px-3 py-1 bg-red-50 text-red-600 text-[11px] font-black rounded-full uppercase tracking-widest flex items-center gap-1.5">
                  <CalendarIcon size={12} />
                  {selectedWeekIndex >= 0 ? `${selectedWeekIndex + 1}주차` : 'Sunday'} Schedule
                </span>
                <button
                  onClick={() => setSelectedDate(null)}
                  className="p-2 hover:bg-gray-200 rounded-xl transition-colors text-gray-400 hover:text-gray-600"
                >
                  <X size={20} />
                </button>
              </div>
              <h2 className="text-2xl xl:text-3xl font-black text-gray-900 tracking-tight">
                {format(parseDate(selectedDate), 'M월 d일')} 주일
              </h2>
            </div>

            {/* 사이드바 콘텐츠 */}
            <div className="flex-1 overflow-auto p-6 xl:p-8 space-y-8 custom-scrollbar">
              {/* 이전 주일 봉사자 불러오기 보조 버튼 */}
              <div className="flex justify-end">
                <button
                  onClick={() => handleCopyPreviousVolunteerNames(selectedDate)}
                  className="flex items-center gap-1.5 text-[12px] font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-xl transition-colors border border-gray-200/60 shadow-2xs"
                >
                  <Copy size={13} />
                  이전 주일 봉사자 불러오기
                </button>
              </div>

              {/* 봉사자 선택 영역 */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <label className="flex items-center gap-2 text-[13px] font-black text-gray-400 uppercase tracking-widest">
                    <Users size={14} className="text-gray-400" /> 봉사자 선택 ({currentNames.length}명)
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
                        disabled={addVolunteerMutation.isPending}
                        className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm font-bold focus:ring-2 focus:ring-black outline-none transition-all disabled:opacity-50"
                        onKeyDown={(e) => e.key === 'Enter' && handleAddVolunteerMaster()}
                      />
                      <button
                        onClick={handleAddVolunteerMaster}
                        disabled={addVolunteerMutation.isPending}
                        className="bg-black text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-gray-800 transition-all disabled:opacity-50 flex items-center justify-center min-w-[60px]"
                      >
                        {addVolunteerMutation.isPending ? (
                          <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                        ) : (
                          '추가'
                        )}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 max-h-[220px] overflow-y-auto p-1 custom-scrollbar">
                      {masterVolunteers.map(v => (
                        <div key={v.id} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-xl border border-gray-100 group">
                          <span className="text-sm font-bold text-gray-700">{v.name}</span>
                          <button
                            onClick={() => handleDeleteVolunteerMaster(v.id)}
                            className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-all p-1"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2.5">
                    {loadingVolunteers ? (
                      Array.from({ length: 6 }).map((_, i) => <VolunteerSkeleton key={i} />)
                    ) : masterVolunteers.length > 0 ? (
                      masterVolunteers.map(v => {
                        const isSelected = currentNames.includes(v.name);
                        return (
                          <button
                            key={v.id}
                            onClick={() => handleToggleVolunteer(selectedDate, v.name)}
                            className={`py-3 rounded-2xl text-[14px] font-black transition-all border-2 ${
                              isSelected
                                ? 'bg-emerald-50 border-emerald-500 text-emerald-700 shadow-xs scale-[1.02]'
                                : 'bg-gray-50 border-transparent text-gray-500 hover:bg-gray-100'
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
                <label className="flex items-center gap-2 text-[13px] font-black text-gray-400 uppercase tracking-widest mb-3">
                  <FileText size={14} className="text-gray-400" /> 특이사항 및 메모
                </label>
                <textarea
                  placeholder="전달 사항이나 특이사항을 입력하세요."
                  value={currentSelectedSchedule?.memo || ''}
                  onChange={(e) => handleMemoChange(selectedDate, e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-3xl px-5 py-4 text-[14px] font-bold text-gray-800 focus:bg-white focus:border-gray-300 focus:ring-4 focus:ring-primary/5 transition-all outline-none h-32 resize-none shadow-inner"
                />
              </div>
            </div>

            {/* 사이드바 하단 */}
            <div className="p-6 xl:p-8 border-t border-gray-100 bg-gray-50/50 shrink-0">
              <button
                onClick={() => handleSave(selectedDate)}
                disabled={savingDate === selectedDate}
                className="w-full bg-[#1A0A0A] text-white py-4 rounded-[20px] font-black text-[15px] flex items-center justify-center gap-2 hover:bg-black transition-all shadow-lg active:scale-[0.98] disabled:opacity-50"
              >
                {savingDate === selectedDate ? (
                  <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                ) : (
                  <Save size={18} />
                )}
                {savingDate === selectedDate ? '저장 중...' : '스케줄 저장하기'}
              </button>

              {message && (
                <div className={`mt-3 p-3.5 rounded-xl flex items-center justify-center gap-2 animate-in slide-in-from-top-2 ${
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

      {/* 토스트 알림 */}
      <Toast
        message={toast?.message || ''}
        type={toast?.type}
        isVisible={!!toast}
        onClose={() => setToast(null)}
      />
    </div>
  );
};
