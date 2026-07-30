/**
 * [File Role] 사용자 화면 공용 공지/이벤트 조회 훅 — GET /announcements/current
 * - free_event: 현재 진행 중인 무료 제공 이벤트 (1개 또는 null)
 * - notices: 현재 활성화된 일반 공지 목록 (여러 개)
 * - Home, MenuDetail, Cart, OrderStatus 등 모든 공개 화면이 이 훅을 공통으로 공유한다.
 */
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { QK } from '../api/queryKeys';
import type { CurrentAnnouncementsResponse, StandardResponse } from '../types';

export const fetchCurrentAnnouncements = async (): Promise<CurrentAnnouncementsResponse> => {
  const res = await apiClient.get<CurrentAnnouncementsResponse, StandardResponse<CurrentAnnouncementsResponse>>('/announcements/current');
  if (res.success && res.data) {
    return res.data;
  }
  return { free_event: null, notices: [] };
};

export const useCurrentAnnouncements = () => {
  return useQuery({
    queryKey: QK.announcements.current,
    queryFn: fetchCurrentAnnouncements,
    staleTime: 30000,
  });
};
