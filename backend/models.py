from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, JSON, DateTime, Date
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base

# ==========================================
# 1. 마스터 데이터 (Master Data)
# ==========================================

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    phone = Column(String, unique=True, index=True) # 식별자 및 적립용
    rank = Column(String) # 직분 (성도, 집사, 권사, 장로, 목사 등)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    orders = relationship("Order", back_populates="user")

class Category(Base):
    __tablename__ = "categories"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True) # 커피, 음료, 디저트 등
    display_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    
    menus = relationship("Menu", back_populates="category")

class Menu(Base):
    __tablename__ = "menus"
    id = Column(Integer, primary_key=True, index=True)
    category_id = Column(Integer, ForeignKey("categories.id"))
    name = Column(String, index=True)
    price = Column(Integer)
    description = Column(String, nullable=True)
    image_url = Column(String, nullable=True) # Railway Volume 저장 경로
    is_available = Column(Boolean, default=True) # 품절 관리용
    
    category = relationship("Category", back_populates="menus")
    options = relationship("MenuOption", back_populates="menu")

class MenuOption(Base):
    __tablename__ = "menu_options"
    id = Column(Integer, primary_key=True, index=True)
    menu_id = Column(Integer, ForeignKey("menus.id"))
    name = Column(String) # 예: "샷 추가", "Hot", "Ice"
    extra_price = Column(Integer, default=0)
    is_active = Column(Boolean, default=True) # 옵션 개별 품절/숨김 처리용
    
    menu = relationship("Menu", back_populates="options")

# ==========================================
# 2. 주문 및 결제 (Orders & Payments)
# ==========================================

class Order(Base):
    __tablename__ = "orders"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    user_rank_snapshot = Column(String) # 주문 당시의 직분
    total_price = Column(Integer)
    payment_method = Column(String) # BANK_TRANSFER, KAKAOPAY 등
    status = Column(String, default="PENDING") # PENDING, PAID, PREPARING, READY, COMPLETED, CANCELLED
    order_number = Column(Integer) # 당일 주문 번호 (#001, #002...)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    user = relationship("User", back_populates="orders")
    items = relationship("OrderItem", back_populates="order")
    payment_log = relationship("PaymentLog", back_populates="order", uselist=False)

class OrderItem(Base):
    __tablename__ = "order_items"
    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"))
    menu_id = Column(Integer, ForeignKey("menus.id"))
    menu_name_snapshot = Column(String) # 이름 변경 대비
    menu_price_snapshot = Column(Integer) # 단가 변경 대비
    quantity = Column(Integer, default=1)
    options_text = Column(String, nullable=True) # 예: "ICE, 샷 추가 1"
    sub_total = Column(Integer)
    
    order = relationship("Order", back_populates="items")

class PaymentLog(Base):
    __tablename__ = "payment_logs"
    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"))
    log_type = Column(String) # REQUEST, CALLBACK, ERROR
    amount = Column(Integer) # 입금/결제된 금액
    sender_name = Column(String, nullable=True) # 계좌이체 입금자명
    raw_data = Column(JSON, nullable=True) # 외부 API 응답 전문 또는 추가 상세 기록
    created_at = Column(DateTime, default=datetime.utcnow)
    
    order = relationship("Order", back_populates="payment_log")

# ==========================================
# 3. 운영 및 시스템 관리 (Operations & Admin)
# ==========================================

class Admin(Base):
    __tablename__ = "admins"
    id = Column(Integer, primary_key=True, index=True)
    login_id = Column(String, unique=True, index=True)
    password_hash = Column(String)
    name = Column(String)

class ClosingReport(Base):
    __tablename__ = "closing_reports"
    id = Column(Integer, primary_key=True, index=True)
    report_date = Column(Date, unique=True, index=True) # 마감 날짜
    total_sales = Column(Integer, default=0)
    total_orders = Column(Integer, default=0)
    closed_at = Column(DateTime, default=datetime.utcnow)

class Setting(Base):
    __tablename__ = "settings"
    id = Column(Integer, primary_key=True, index=True)
    is_open = Column(Boolean, default=False) # 영업 여부
    notice = Column(String, nullable=True) # 공지사항
