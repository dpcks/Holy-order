/**
 * [File Role] 사용자 주문 화면 전용 공개 설정 조회 훅
 *
 * - 폴링(15초)으로 WebSocket 누락 복구
 * - visibilitychange / online 시 즉시 재조회 (PublicRealtimeLayout에서 처리)
 * - is_open === true가 명확히 확인된 경우에만 주문 허용
 * - 조회 실패 또는 데이터 없음 → 영업 중으로 간주하지 않음
 */

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { QK } from '../api/queryKeys';
import type { SettingResponse, StandardResponse } from '../types';

/** GET /settings 단순 fetch 함수 (queryClient.fetchQuery에서도 사용) */
export const fetchPublicSettings = async (): Promise<SettingResponse | null> => {
  try {
    const res = await apiClient.get<SettingResponse, StandardResponse<SettingResponse>>('/settings');
    return res.success && res.data ? res.data : null;
  } catch {
    return null;
  }
};

/** 사용자 주문 화면 전용 공개 설정 훅 */
export const usePublicSettings = () => {
  return useQuery({
    queryKey: QK.settings.public,
    queryFn: fetchPublicSettings,
    staleTime: 0,                      // 항상 최신 데이터 보장
    refetchInterval: 15_000,           // 15초 폴링 (WebSocket 누락 복구)
    refetchIntervalInBackground: false, // 백그라운드에서는 폴링 중단 (포어그라운드 복귀 시 즉시 재조회)
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: 'always',
    retry: 1,
  });
};
