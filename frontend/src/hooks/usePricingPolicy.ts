/*
 * [File Role] 서버 가격 정책(Pricing Policy) 커스텀 훅
 *
 * 서버의 단일 가격 정책(GET /pricing-policy)을 조회하여
 * 텀블러 할인 단가, pricing_version을 프론트엔드 전체에 일관되게 제공합니다.
 */

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { QK } from '../api/queryKeys';
import type { PricingPolicyResponse, StandardResponse } from '../types';

export const usePricingPolicy = () => {
  const query = useQuery({
    queryKey: QK.settings.public,
    queryFn: async () => {
      const res = await apiClient.get<StandardResponse<PricingPolicyResponse>>('/pricing-policy');
      return res.data.data;
    },
    staleTime: 1000 * 60 * 60, // 1시간
  });

  return {
    pricingVersion: query.data?.pricing_version ?? 2,
    tumblerDiscountPerUnit: query.data?.tumbler_discount_per_unit ?? 500,
    isLoading: query.isLoading,
    isError: query.isError,
  };
};
