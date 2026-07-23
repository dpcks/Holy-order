/**
 * Holy-Order React Query Keys (Final Architecture)
 * 
 * [컨벤션]
 * 1. 구조: [도메인, 종류, 매개변수] 순서를 엄격히 준수합니다.
 * 2. _domain: 도메인 전체 무효화(Invalidate)를 위한 최상위 키입니다.
 * 3. filters: 모든 필터 객체는 Date나 Function이 아닌 '직렬화 가능한 값(string, number)'만 사용합니다.
 * 
 * [사용 예시]
 * - 조회: useQuery({ queryKey: QK.orders.history(1, { status: 'PAID' }), ... })
 * - 무효화: queryClient.invalidateQueries({ queryKey: QK_DOMAIN.orders })
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. 도메인별 필터 타입 정의 (API 명세와 일치시킴)
// ─────────────────────────────────────────────────────────────────────────────

export type OrderHistoryFilters = {
  start_date?: string; // 'YYYY-MM-DD' 형식 권장
  end_date?: string;
  status?:
  | 'PENDING'
  | 'PREPARING'
  | 'READY'
  | 'COMPLETED'
  | 'CANCELLED';
  payment_method?: 'CASH' | 'BANK_TRANSFER' | 'FREE' | 'TOSS' | 'VOLUNTEER';
  order_type?: 'APP' | 'QR' | 'DIRECT';
  search?: string;
};

export type PaymentLogFilters = {
  start_date?: string;
  end_date?: string;
  sender_name?: string;
  payment_method?: 'CASH' | 'BANK_TRANSFER' | 'FREE' | 'TOSS' | 'VOLUNTEER';
  log_type?: string;
};

export type ScheduleRange = {
  start: string; // ISO String 혹은 YYYY-MM-DD
  end: string;
};

/**
 * 매출 및 주문 통계 기간 타입
 * 백엔드 /admin/stats?type=... 파라미터와 1:1 일치
 */
export type StatsPeriod = 'daily' | 'weekly' | 'monthly';

// ─────────────────────────────────────────────────────────────────────────────
// 2. 메인 Query Key 객체 (QK)
// ─────────────────────────────────────────────────────────────────────────────

export const QK = {
  // 메뉴 및 카테고리
  menus: {
    _domain: ['menus'] as const,
    all: ['menus', 'list'] as const,
    detail: (id: number) => ['menus', 'detail', id] as const,
  },
  categories: {
    _domain: ['categories'] as const,
    all: ['categories', 'list'] as const,
    detail: (id: number) => ['categories', 'detail', id] as const,
  },

  // 주문 관리
  orders: {
    _domain: ['orders'] as const,
    board: ['orders', 'board'] as const, // 실시간 보드용
    history: (page: number, filters?: OrderHistoryFilters) =>
      ['orders', 'history', page, filters ?? {}] as const,
    detail: (id: number) => ['orders', 'detail', id] as const,
    statusForUser: (id: number) => ['orders', 'status', id] as const,
  },

  // 결제 및 입금 로그
  payments: {
    _domain: ['payments'] as const,
    list: (page: number, filters?: PaymentLogFilters) =>
      ['payments', 'list', page, filters ?? {}] as const,
    detail: (id: number) => ['payments', 'detail', id] as const,
  },

  stats: {
    _domain: ['stats'] as const,

    /**
     * 매출 및 주문 통계 조회 키
     *
     * 백엔드 파라미터:
     * - type: 'daily' | 'weekly' | 'monthly'
     * - date: 'YYYY-MM-DD' (미지정 시 오늘 날짜 기준)
     *
     * 캐시 식별:
     * - date 미지정 시 null로 식별하여 안정성 확보
     */
    sales: (period: StatsPeriod, date?: string) =>
      ['stats', 'sales', period, date ?? null] as const,

    summary: ['stats', 'summary'] as const,
  },

  // 공지사항 및 이벤트
  announcements: {
    _domain: ['announcements'] as const,
    list: ['announcements', 'list'] as const,
    active: ['announcements', 'active'] as const, // 사용자 화면용
    detail: (id: number) => ['announcements', 'detail', id] as const,
    report: (id: number) => ['announcements', 'report', id] as const,
  },

  // 봉사자 및 스케줄
  schedules: {
    _domain: ['schedules'] as const,
    list: ({ start, end }: ScheduleRange) =>
      ['schedules', 'list', { start, end }] as const,
    /** sundayDate: 'YYYY-MM-DD' (반드시 일요일 날짜) */
    detail: (sundayDate: string) => ['schedules', 'detail', sundayDate] as const,
  },
  volunteers: {
    _domain: ['volunteers'] as const,
    all: ['volunteers', 'list'] as const,
  },

  // 재고 관리
  ingredients: {
    _domain: ['ingredients'] as const,
    list: ['ingredients', 'list'] as const,
    alerts: ['ingredients', 'alerts'] as const, // 부족 알림
    detail: (id: number) => ['ingredients', 'detail', id] as const,
  },

  // 시스템 설정 및 유저
  settings: {
    _domain: ['settings'] as const,
    /** 사용자 주문 화면 (Home/MenuDetail/Cart/OrderStatus) - GET /settings */
    public: ['settings', 'public'] as const,
    /** 관리자 설정 화면 (AdminSettings/AdminOrderManagement) - GET /admin/settings */
    admin: ['settings', 'admin'] as const,
  },
  admins: {
    _domain: ['admins'] as const,
    list: ['admins', 'list'] as const,
    me: ['admins', 'me'] as const,
  },
  users: {
    _domain: ['users'] as const,
    /** 비관리자(일반 교인) 정보 */
    me: ['users', 'me'] as const,
  },
  auth: {
    _domain: ['auth'] as const,
    /** 관리자 인증 정보(JWT 검증용) */
    me: ['auth', 'me'] as const,
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// 3. 도메인 단위 Invalidate를 위한 엄격한 타입 헬퍼
// ─────────────────────────────────────────────────────────────────────────────

/**
 * QK_DOMAIN.orders -> ['orders'] 와 같이 맵핑됩니다.
 * 컴포넌트에서 전체 무효화 시 매우 유용합니다.
 */
type DomainMap = {
  [K in keyof typeof QK]: typeof QK[K]['_domain'];
};

export const QK_DOMAIN: DomainMap = {
  menus: QK.menus._domain,
  categories: QK.categories._domain,
  orders: QK.orders._domain,
  payments: QK.payments._domain,
  stats: QK.stats._domain,
  announcements: QK.announcements._domain,
  schedules: QK.schedules._domain,
  volunteers: QK.volunteers._domain,
  ingredients: QK.ingredients._domain,
  settings: QK.settings._domain,
  admins: QK.admins._domain,
  users: QK.users._domain,
  auth: QK.auth._domain,
};