from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from datetime import datetime

# ===============================
# Users
# ===============================
class UserCreate(BaseModel):
    name: str
    phone: str
    duty: str

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
    quantity: int
    options_text: Optional[str] = None
    sub_total: int

class OrderCreate(BaseModel):
    user_id: int
    total_price: int
    payment_method: str
    items: List[OrderItemCreate]

class PaymentLogCreate(BaseModel):
    order_id: int
    amount: int
    sender_name: str

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
    total_price: int
    payment_method: str
    status: str
    created_at: datetime
    items: List[OrderItemResponse] = []
    
    model_config = ConfigDict(from_attributes=True)

class OrderStatusUpdate(BaseModel):
    status: str

class SettingResponse(BaseModel):
    is_open: bool
    notice: Optional[str] = None
    
    model_config = ConfigDict(from_attributes=True)

class SettingUpdate(BaseModel):
    is_open: Optional[bool] = None
    notice: Optional[str] = None
