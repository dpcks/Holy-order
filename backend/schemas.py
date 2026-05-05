from pydantic import BaseModel, ConfigDict, field_validator, Field
from typing import List, Optional, Generic, TypeVar, Any
from datetime import datetime, date
from enum import Enum
import re

# ===============================
# Generic Response
# ===============================
T = TypeVar("T")

class StandardResponse(BaseModel, Generic[T]):
    success: bool = True
    message: str = "요청이 성공적으로 처리되었습니다."
    data: Optional[T] = None

# ===============================
# Users
# ===============================
class DutyEnum(str, Enum):
    학생 = "학생"
    청년 = "청년"
    성도 = "성도"
    집사 = "집사"
    안수집사 = "안수집사"
    권사 = "권사"
    장로 = "장로"
    사모 = "사모"
    전도사 = "전도사"
    강도사 = "강도사"
    부목사 = "부목사"
    목사 = "목사"

class UserCreate(BaseModel):
    name: str
    phone: Optional[str] = None
    duty: DutyEnum

    @field_validator("phone")
    def validate_phone(cls, v):
        if v is None or v == "":
            return None
        if not re.match(r"^01[0-9]-?\d{3,4}-?\d{4}$", v):
            raise ValueError("올바른 전화번호 형식이 아닙니다.")
        return v

class UserResponse(BaseModel):
    id: int
    name: str
    phone: Optional[str] = None
    duty: str
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

# ===============================
# Menus & Categories
# ===============================
class MenuOptionResponse(BaseModel):
    id: int
    name: str
    extra_price: int
    
    model_config = ConfigDict(from_attributes=True)

class MenuResponse(BaseModel):
    id: int
    name: str
    price: int
    description: Optional[str] = None
    image_url: Optional[str] = None
    category_id: int
    is_available: bool
    options: List[MenuOptionResponse]
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

class CategoryWithMenusResponse(BaseModel):
    id: int
    name: str
    display_order: int
    is_active: bool
    menus: List[MenuResponse] = []
    
    model_config = ConfigDict(from_attributes=True)

# ===============================
# Orders & Payments
# ===============================
class OrderItemCreate(BaseModel):
    menu_id: int
    quantity: int = Field(gt=0, description="1 이상이어야 합니다")
    options_text: Optional[str] = None
    sub_total: int = Field(ge=0, description="0 이상이어야 합니다")

class PaymentMethodEnum(str, Enum):
    BANK_TRANSFER = "BANK_TRANSFER"
    CASH = "CASH"
    FREE = "FREE"

class OrderCreate(BaseModel):
    user_id: int
    total_price: int
    payment_method: PaymentMethodEnum
    request: Optional[str] = None
    items: List[OrderItemCreate]

class PaymentLogCreate(BaseModel):
    order_id: int
    amount: int
    sender_name: str

class PaymentLogResponse(BaseModel):
    id: int
    order_id: int
    log_type: str
    amount: int
    sender_name: Optional[str] = None
    raw_data: Optional[Any] = None
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

class PaymentLogListResponse(BaseModel):
    items: List[PaymentLogResponse]
    total_count: int
    page: int
    limit: int
    total_pages: int

class OrderItemResponse(BaseModel):
    id: int
    menu_name_snapshot: str
    quantity: int
    options_text: Optional[str]
    sub_total: int
    
    model_config = ConfigDict(from_attributes=True)

class OrderResponse(BaseModel):
    id: int
    order_number: int
    user_duty_snapshot: str
    user_name_snapshot: Optional[str] = None
    user_phone_snapshot: Optional[str] = None
    request: Optional[str] = None
    total_price: int
    payment_method: str
    status: str
    created_at: datetime
    items: List[OrderItemResponse] = []
    # 이벤트(골든벨) 관련 필드
    announcement_id: Optional[int] = None
    original_price: Optional[int] = None
    
    model_config = ConfigDict(from_attributes=True)

class OrderListResponse(BaseModel):
    items: List[OrderResponse]
    total_count: int
    page: int
    limit: int
    total_pages: int

class OrderStatusEnum(str, Enum):
    PENDING = "PENDING"
    PREPARING = "PREPARING"
    READY = "READY"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"

class OrderStatusUpdate(BaseModel):
    status: OrderStatusEnum

class SettingResponse(BaseModel):
    is_open: bool
    notice: Optional[str] = None
    open_time: Optional[str] = None
    close_time: Optional[str] = None
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    account_holder: Optional[str] = None
    require_phone: bool = True
    
    model_config = ConfigDict(from_attributes=True)

class SettingUpdate(BaseModel):
    is_open: Optional[bool] = None
    notice: Optional[str] = None
    open_time: Optional[str] = None
    close_time: Optional[str] = None
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    account_holder: Optional[str] = None
    require_phone: Optional[bool] = None

class MenuOptionCreate(BaseModel):
    name: str
    extra_price: int = 0

class MenuUpdate(BaseModel):
    name: Optional[str] = None
    price: Optional[int] = None
    description: Optional[str] = None
    category_id: Optional[int] = None
    image_url: Optional[str] = None
    is_available: Optional[bool] = None
    is_active: Optional[bool] = None
    options: Optional[List[MenuOptionCreate]] = None

class MenuCreate(BaseModel):
    name: str
    price: int
    description: Optional[str] = None
    category_id: int
    image_url: Optional[str] = None
    options: List[MenuOptionCreate] = []

class CategoryCreate(BaseModel):
    name: str
    display_order: int = 0

class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    display_order: Optional[int] = None
    is_active: Optional[bool] = None

class CategoryReorderRequest(BaseModel):
    category_ids: List[int]

class MenuReorderRequest(BaseModel):
    menu_ids: List[int]

# ===============================
# Admin & Auth
# ===============================
class AdminLogin(BaseModel):
    username: str
    password: str

class AdminPasswordChange(BaseModel):
    current_password: str
    new_password: str

class AdminAccountCreate(BaseModel):
    login_id: str
    password: str
    name: str
    role: str = "ADMIN"

class AdminUpdate(BaseModel):
    is_active: Optional[bool] = None
    role: Optional[str] = None

class AdminResponse(BaseModel):
    id: int
    login_id: str
    name: str
    role: str
    is_active: bool
    last_login_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

class ClosingReportResponse(BaseModel):
    id: int
    date: datetime
    total_sales: int
    total_orders: int

    model_config = ConfigDict(from_attributes=True)

class VolunteerData(BaseModel):
    """봉사자 명단 데이터 구조 (JSON)"""
    names: List[str] = []

class VolunteerScheduleResponse(BaseModel):
    id: int
    sunday_date: date
    volunteers: Optional[VolunteerData] = None
    memo: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class VolunteerScheduleUpdate(BaseModel):
    sunday_date: date
    volunteers: Optional[VolunteerData] = None
    memo: Optional[str] = None

class VolunteerCreate(BaseModel):
    name: str

class VolunteerResponse(BaseModel):
    id: int
    name: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

# ===============================
# Announcements (이벤트/공지)
# ===============================
class AnnouncementCreate(BaseModel):
    title: str
    content: Optional[str] = None
    banner_text: Optional[str] = None
    image_url: Optional[str] = None
    is_event_mode: bool = False
    sponsor_name: Optional[str] = None
    sponsor_duty: Optional[str] = None
    event_type: Optional[str] = None
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None

class AnnouncementUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    banner_text: Optional[str] = None
    image_url: Optional[str] = None
    is_event_mode: Optional[bool] = None
    is_active: Optional[bool] = None # 유연성을 위해 추가
    sponsor_name: Optional[str] = None
    sponsor_duty: Optional[str] = None
    event_type: Optional[str] = None
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None

class AnnouncementResponse(BaseModel):
    id: int
    title: str
    content: Optional[str] = None
    banner_text: Optional[str] = None
    image_url: Optional[str] = None
    is_event_mode: bool
    is_active: bool
    sponsor_name: Optional[str] = None
    sponsor_duty: Optional[str] = None
    event_type: Optional[str] = None
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# 공개 API 전용 응답 타입
class ActiveAnnouncementResponse(BaseModel):
    id: int
    title: str
    content: Optional[str] = None
    banner_text: Optional[str] = None
    image_url: Optional[str] = None
    is_event_mode: bool
    sponsor_name: Optional[str] = None
    sponsor_duty: Optional[str] = None
    event_type: Optional[str] = None
    is_active: bool
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True

# 정산 리포트 응답 타입
class MenuBreakdown(BaseModel):
    name: str
    count: int
    revenue: int

class AnnouncementReportResponse(BaseModel):
    total_orders: int
    total_items: int
    original_price_sum: int
    menu_breakdown: List[MenuBreakdown]
    duty_breakdown: dict # {duty: count}

    class Config:
        from_attributes = True

# ===============================
# Ingredients (재고 관리)
# ===============================
class IngredientCreate(BaseModel):
    """재고 항목 생성 스키마"""
    name: str
    category: Optional[str] = None          # 재료 / 소모품
    unit: Optional[str] = None              # 단위 (kg, 개, 팩 등)
    current_stock: int = 0
    alert_threshold: int = 0
    memo: Optional[str] = None
    display_order: int = 0

class IngredientUpdate(BaseModel):
    """재고 항목 수정 스키마 - 모든 필드 Optional"""
    name: Optional[str] = None
    category: Optional[str] = None
    unit: Optional[str] = None
    current_stock: Optional[int] = None
    alert_threshold: Optional[int] = None
    memo: Optional[str] = None
    display_order: Optional[int] = None

class IngredientResponse(BaseModel):
    """재고 항목 응답 스키마"""
    id: int
    name: str
    category: Optional[str] = None
    unit: Optional[str] = None
    current_stock: int
    alert_threshold: int
    memo: Optional[str] = None
    is_active: bool
    display_order: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
