/**
 * [File Role] 재고 관리 — 상태 판정 순수 함수 모음
 * 컴포넌트 외부에 위치하여 데스크톱 표와 모바일 카드, 요약 카드 모두에서 공유한다.
 * DB의 alert_threshold 의미와 정확히 일치하는 기준으로 판정한다.
 */

import type { Ingredient } from '../../../types';

// ───────────────────────────────────────────────
// 1. 상태 타입
// ───────────────────────────────────────────────
export type InventoryStatus =
  | 'OUT_OF_STOCK'    // 품절: current_stock <= 0
  | 'ORDER_REQUIRED'  // 주문 필요: 0 < current_stock <= alert_threshold
  | 'WARNING'         // 주의: alert_threshold < current_stock <= alert_threshold * 1.5
  | 'NORMAL'          // 정상: 경고 범위 초과
  | 'UNSET';          // 기준 미설정: alert_threshold <= 0, 단 재고 0 제외

export type SortMode = 'shortage' | 'name' | 'updated' | 'display_order';

// ───────────────────────────────────────────────
// 2. 상태 판정 함수 (순서 중요)
// ───────────────────────────────────────────────
export const getInventoryStatus = (item: Ingredient): InventoryStatus => {
  // 1순위: 재고 0이하 → 품절
  if (item.current_stock <= 0) return 'OUT_OF_STOCK';

  // 2순위: 기준치 미설정(0 이하) → 기준 미설정
  if (item.alert_threshold <= 0) return 'UNSET';

  // 3순위: 재고 <= 기준치 → 주문 필요
  if (item.current_stock <= item.alert_threshold) return 'ORDER_REQUIRED';

  // 4순위: 재고 <= 기준치 * 1.5 → 주의
  if (item.current_stock <= Math.ceil(item.alert_threshold * 1.5)) return 'WARNING';

  // 5순위: 그 외 → 정상
  return 'NORMAL';
};

// ───────────────────────────────────────────────
// 3. 상태 우선순위 (정렬용)
// ───────────────────────────────────────────────
const STATUS_PRIORITY: Record<InventoryStatus, number> = {
  OUT_OF_STOCK:   0,
  ORDER_REQUIRED: 1,
  WARNING:        2,
  UNSET:          3,
  NORMAL:         4,
};

// ───────────────────────────────────────────────
// 4. 부족 수량 계산
// ───────────────────────────────────────────────
export const getShortage = (item: Ingredient): number =>
  Math.max(0, item.alert_threshold - item.current_stock);

// ───────────────────────────────────────────────
// 5. 정렬 함수
// ───────────────────────────────────────────────
export const sortIngredients = (
  items: Ingredient[],
  mode: SortMode,
): Ingredient[] => {
  const copy = [...items];

  if (mode === 'name') {
    return copy.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }

  if (mode === 'updated') {
    return copy.sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );
  }

  if (mode === 'display_order') {
    return copy.sort((a, b) => a.display_order - b.display_order || a.id - b.id);
  }

  // 기본: 부족한 순 (shortage 모드)
  return copy.sort((a, b) => {
    const sa = getInventoryStatus(a);
    const sb = getInventoryStatus(b);
    const pa = STATUS_PRIORITY[sa];
    const pb = STATUS_PRIORITY[sb];
    if (pa !== pb) return pa - pb;

    // 같은 상태 안에서: 부족 수량 큰 순
    const shortA = getShortage(a);
    const shortB = getShortage(b);
    if (shortA !== shortB) return shortB - shortA;

    // 부족 수량 같으면: display_order → 이름
    if (a.display_order !== b.display_order) return a.display_order - b.display_order;
    return a.name.localeCompare(b.name, 'ko');
  });
};

// ───────────────────────────────────────────────
// 6. 상태 레이블 / 색상 헬퍼
// ───────────────────────────────────────────────
export interface StatusMeta {
  label: string;
  shortLabel: string;
  emoji: string;
  textColor: string;
  bgColor: string;
  borderColor: string;
  badgeBg: string;
  badgeText: string;
}

export const STATUS_META: Record<InventoryStatus, StatusMeta> = {
  OUT_OF_STOCK: {
    label: '품절',
    shortLabel: '품절',
    emoji: '🔴',
    textColor: 'text-red-700',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    badgeBg: 'bg-red-100',
    badgeText: 'text-red-700',
  },
  ORDER_REQUIRED: {
    label: '주문 필요',
    shortLabel: '주문',
    emoji: '🟠',
    textColor: 'text-orange-700',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
    badgeBg: 'bg-orange-100',
    badgeText: 'text-orange-700',
  },
  WARNING: {
    label: '주의',
    shortLabel: '주의',
    emoji: '🟡',
    textColor: 'text-yellow-700',
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-200',
    badgeBg: 'bg-yellow-100',
    badgeText: 'text-yellow-700',
  },
  NORMAL: {
    label: '정상',
    shortLabel: '정상',
    emoji: '🟢',
    textColor: 'text-emerald-700',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    badgeBg: 'bg-emerald-100',
    badgeText: 'text-emerald-700',
  },
  UNSET: {
    label: '기준 미설정',
    shortLabel: '미설정',
    emoji: '⚪',
    textColor: 'text-gray-500',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-200',
    badgeBg: 'bg-gray-100',
    badgeText: 'text-gray-500',
  },
};

// ───────────────────────────────────────────────
// 7. updated_at 읽기 쉬운 표시
// ───────────────────────────────────────────────
export const formatUpdatedAt = (isoStr: string): string => {
  const date = new Date(isoStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const hm = date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

  if (target.getTime() === today.getTime()) {
    return `오늘 ${hm}`;
  }
  if (target.getTime() === yesterday.getTime()) {
    return `어제 ${hm}`;
  }
  return date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
};

// ───────────────────────────────────────────────
// 8. 구매 목록 클립보드 텍스트 생성
// ───────────────────────────────────────────────
export const buildPurchaseListText = (items: Ingredient[]): string => {
  const now = new Date();
  const timestamp = now.toLocaleString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).replace(/\. /g, '-').replace('.', '');

  const lines = items
    .filter(i => {
      const s = getInventoryStatus(i);
      return s === 'OUT_OF_STOCK' || s === 'ORDER_REQUIRED' || s === 'WARNING';
    })
    .map(i => {
      const unit = i.unit || '개';
      const status = getInventoryStatus(i);
      if (status === 'OUT_OF_STOCK') {
        return `- ${i.name}: 현재 ${i.current_stock}${unit} / 기준 ${i.alert_threshold}${unit} / 품절`;
      }
      if (status === 'ORDER_REQUIRED') {
        const shortage = getShortage(i);
        return `- ${i.name}: 현재 ${i.current_stock}${unit} / 기준 ${i.alert_threshold}${unit} / ${shortage}${unit} 부족`;
      }
      return `- ${i.name}: 현재 ${i.current_stock}${unit} / 기준 ${i.alert_threshold}${unit} / 곧 부족`;
    });

  if (lines.length === 0) return '';

  return `[미션 카페 구매 목록]\n\n${lines.join('\n')}\n\n작성 시각: ${timestamp}`;
};
