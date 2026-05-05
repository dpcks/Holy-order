/**
 * [File Role] 프론트엔드 전역 타입 정의 파일
 * - 백엔드 API 응답 스키마와 1:1로 대응하는 TypeScript 인터페이스를 관리한다.
 * - 모든 페이지와 컴포넌트는 이 파일에서 타입을 import 하여 사용해야 한다.
 * - 백엔드 스키마가 변경될 경우 이 파일 하나만 수정하면 전체에 반영된다.
 */

// ==========================================
// 공통 열거형 (Enums)
// ==========================================

/** 백엔드 OrderStatusEnum과 동일하게 유지 */
export type OrderStatus = 'PENDING' | 'PREPARING' | 'READY' | 'COMPLETED' | 'CANCELLED';

/** 백엔드 DutyEnum과 동일하게 유지 */
export type Duty =
  | '학생' | '청년' | '성도' | '집사' | '안수집사'
  | '권사' | '장로' | '사모' | '전도사' | '강도사'
  | '부목사' | '목사';

/** 결제 수단 */
export type PaymentMethod = 'BANK_TRANSFER' | 'CASH' | 'FREE';

// ==========================================
// 메뉴 관련 (Menus)
// ==========================================

export interface MenuOption {
  id: number;
  name: string;
  extra_price: number;
}

export interface Menu {
  id: number;
  name: string;
  price: number;
  description: string | null;
  image_url: string | null;
  is_available: boolean;
  display_order: number;
  is_active: boolean;
  options: MenuOption[];
  created_at: string;
}

export interface Category {
  id: number;
  name: string;
  display_order: number;
  is_active: boolean;
  menus: Menu[];
}


// ==========================================
// 주문 관련 (Orders)
// ==========================================

export interface OrderItem {
  id: number;
  menu_name_snapshot: string;
  quantity: number;
  options_text: string | null;
  sub_total: number;
}

export interface Order {
  id: number;
  order_number: number;
  status: OrderStatus;
  user_name_snapshot: string | null;
  user_duty_snapshot: string;
  user_phone_snapshot: string | null;
  request: string | null;
  total_price: number;
  original_price: number | null;
  announcement_id: number | null;
  payment_method: PaymentMethod;
  created_at: string;
  items: OrderItem[];
}


// ==========================================
// 관리자 관련 (Admin)
// ==========================================

export interface AdminUser {
  id: number;
  login_id: string;
  name: string;
  role: 'MASTER' | 'ADMIN';
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

// ==========================================
// 설정 및 통계 (Settings & Stats)
// ==========================================

export interface SettingResponse {
  bank_name: string | null;
  account_number: string | null;
  account_holder: string | null;
  is_open: boolean;
  notice: string | null;
  open_time: string | null;
  close_time: string | null;
  require_phone: boolean;
}

export type SettingUpdate = Partial<SettingResponse>;

/** 관리자 대시보드 요약 통계 */
export interface DashboardStats {
  total_orders: number;
  total_sales: number;
}

/** 매출/정산 리포트 상세 통계 */
export interface ReportStats {
  total_orders: number;
  total_sales: number;
  avg_order_value: number;
  top_menu: string | null;
  status_counts: Record<string, number>;
  top_menus: { name: string; count: number; revenue: number }[];
  duty_breakdown: Record<string, number>;
  trend_data: Record<string, { count: number, revenue: number }>;
  payment_method_sales: Record<string, number>;
}


// ==========================================
// 클라이언트 전용 (Client-only)
// ==========================================

/** localStorage의 activeOrders 배열에서 사용하는 타입 */
export interface ActiveOrder {
  id: string;
  orderNumber: number;
}

/** 장바구니에 담긴 아이템 타입 */
export interface CartItem {
  cartItemId: string; // 로컬 식별용 고유 ID (수정/삭제용)
  menu_id: number;
  name: string;
  image_url?: string;
  quantity: number;
  options_text: string | null;
  price: number; // 메뉴 기본가 + 옵션 추가금액 합계 (단가)
  sub_total: number; // 단가 * 수량
}

export interface StandardResponse<T> {
  success: boolean;
  data: T;
  message: string;
}

export interface OrderListResponse {
  items: Order[];
  total_count: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface PaymentLog {
  id: number;
  order_id: number;
  log_type: string;
  amount: number;
  sender_name: string | null;
  raw_data: any;
  created_at: string;
}

export interface PaymentLogListResponse {
  items: PaymentLog[];
  total_count: number;
  page: number;
  limit: number;
  total_pages: number;
}

// ==========================================
// 봉사 스케줄 관련 (Volunteer Schedules)
// ==========================================

export interface VolunteerData {
  names: string[];
}

export interface VolunteerSchedule {
  id: number;
  sunday_date: string;
  volunteers: VolunteerData;
  memo: string;
}

export interface Volunteer {
  id: number;
  name: string;
  created_at: string;
}

// ==========================================
// 이벤트/공지 관련 (Announcements)
// ==========================================

export interface Announcement {
  id: number;
  title: string;
  content: string | null;
  banner_text: string | null;
  image_url: string | null;
  is_event_mode: boolean;
  sponsor_name: string | null;
  sponsor_duty: string | null;
  event_type: string | null;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
}

/** 공개 API /announcements/active 전용 응답 타입 */
export interface ActiveAnnouncement {
  id: number;
  title: string;
  content: string | null;
  banner_text: string | null;
  image_url: string | null;
  is_event_mode: boolean;
  sponsor_name: string | null;
  sponsor_duty: string | null;
  event_type: string | null;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
}

export interface MenuBreakdown {
  name: string;
  count: number;
  revenue: number;
}

export interface AnnouncementReportResponse {
  total_orders: number;
  total_items: number;
  original_price_sum: number;
  menu_breakdown: MenuBreakdown[];
  duty_breakdown: Record<string, number>;
}

// ==========================================
// 재고 관리 (Inventory Management)
// ==========================================

export interface Ingredient {
  id: number;
  name: string;
  category: string | null;
  unit: string | null;
  current_stock: number;
  alert_threshold: number;
  memo: string | null;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface IngredientCreate {
  name: string;
  category?: string | null;
  unit?: string | null;
  current_stock?: number;
  alert_threshold?: number;
  memo?: string | null;
  display_order?: number;
}

export interface IngredientUpdate {
  name?: string;
  category?: string | null;
  unit?: string | null;
  current_stock?: number;
  alert_threshold?: number;
  memo?: string | null;
  display_order?: number;
}

// ==========================================
// 관리자 관련 (Admin)
// ==========================================

export interface AdminInfo {
  id: number;
  login_id: string;
  name: string;
  role: 'MASTER' | 'ADMIN';
  created_at: string;
}
