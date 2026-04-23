from pydantic import BaseModel, ConfigDict, field_validator, Field
from typing import List, Optional, Generic, TypeVar, Any
from datetime import datetime
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
    phone: str
    duty: DutyEnum

    @field_validator("phone")
    def validate_phone(cls, v):
        if not re.match(r"^01[0-9]-?\d{3,4}-?\d{4}$", v):
            raise ValueError("올바른 전화번호 형식이 아닙니다.")
        return v

class UserResponse(BaseModel):
    id: int
    name: str
    phone: str
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
    is_available: bool
    options: List[MenuOptionResponse] = []
    
    model_config = ConfigDict(from_attributes=True)

class CategoryWithMenusResponse(BaseModel):
    id: int
    name: str
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
    
    model_config = ConfigDict(from_attributes=True)

class SettingUpdate(BaseModel):
    is_open: Optional[bool] = None
    notice: Optional[str] = None
    open_time: Optional[str] = None
    close_time: Optional[str] = None
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    account_holder: Optional[str] = None

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

# ===============================
# Admin & Auth
# ===============================
class AdminLogin(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

class ClosingReportResponse(BaseModel):
    id: int
    date: datetime
    total_sales: int
    total_orders: int

    model_config = ConfigDict(from_attributes=True)
