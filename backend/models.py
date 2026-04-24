from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, JSON, DateTime, Date, UniqueConstraint
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from datetime import datetime, timedelta, timezone
from database import Base

# 한국 시간(KST) 설정
KST = timezone(timedelta(hours=9))

def get_seoul_time():
    # 타임존 정보가 없는(naive) 서울 현재 시간을 반환하여 DB에 그대로 저장되게 함
    return datetime.now(KST).replace(tzinfo=None)

# ==========================================
# 1. 마스터 데이터 (Master Data)
# ==========================================

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    phone = Column(String, unique=True, index=True) # 식별자 및 적립용
    duty = Column(String) # 직분 (성도, 집사, 권사, 장로, 목사 등)
    is_active = Column(Boolean, default=True) # 소프트 삭제용
    deleted_at = Column(DateTime, nullable=True) # 삭제 시각 기록
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    orders = relationship("Order", back_populates="user")

class Category(Base):
    __tablename__ = "categories"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True) # 커피, 음료, 디저트 등
    display_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    menus = relationship("Menu", back_populates="category", order_by="Menu.display_order")

class Menu(Base):
    __tablename__ = "menus"
    id = Column(Integer, primary_key=True, index=True)
    category_id = Column(Integer, ForeignKey("categories.id"))
    name = Column(String, index=True)
    price = Column(Integer)
    description = Column(String, nullable=True)
    image_url = Column(String, nullable=True) # Railway Volume 저장 경로
    display_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True) # 소프트 삭제용 (필요시)
    is_available = Column(Boolean, default=True) # 품절 관리용
    
    category = relationship("Category", back_populates="menus")
    options = relationship("MenuOption", back_populates="menu", order_by="MenuOption.id")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class MenuOption(Base):
    __tablename__ = "menu_options"
    id = Column(Integer, primary_key=True, index=True)
    menu_id = Column(Integer, ForeignKey("menus.id"))
    name = Column(String) # 예: "샷 추가", "Hot", "Ice"
    extra_price = Column(Integer, default=0)
    is_active = Column(Boolean, default=True) # 옵션 개별 품절/숨김 처리용
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    menu = relationship("Menu", back_populates="options")

# ==========================================
# 2. 주문 및 결제 (Orders & Payments)
# ==========================================

class Order(Base):
    __tablename__ = "orders"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    user_duty_snapshot = Column(String) # 주문 당시의 직분
    user_name_snapshot = Column(String, nullable=True) # 주문 당시의 이름 (관리자 화면 표시용)
    user_phone_snapshot = Column(String, nullable=True) # 주문 당시의 전화번호
    request = Column(String, nullable=True) # 고객 요청사항
    total_price = Column(Integer)
    payment_method = Column(String) # BANK_TRANSFER, KAKAOPAY 등
    status = Column(String, default="PENDING") # PENDING, PREPARING, READY, COMPLETED, CANCELLED
    
    order_number = Column(Integer, nullable=False) # 고객에게 보여주는 당일 순번 (ex: #1, #2, #3...)
    order_date = Column(Date, default=lambda: get_seoul_time().date(), index=True) # DB 내부 무결성용
    
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    __table_args__ = (
        UniqueConstraint("order_number", "order_date", name="uq_order_number_per_day"),
    )
    
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
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    order = relationship("Order", back_populates="items")

class PaymentLog(Base):
    __tablename__ = "payment_logs"
    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"))
    log_type = Column(String) # REQUEST, CALLBACK, ERROR
    amount = Column(Integer) # 입금/결제된 금액
    sender_name = Column(String, nullable=True) # 계좌이체 입금자명
    raw_data = Column(JSON, nullable=True) # 외부 API 응답 전문 또는 추가 상세 기록
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
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
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class ClosingReport(Base):
    __tablename__ = "closing_reports"
    id = Column(Integer, primary_key=True, index=True)
    report_date = Column(Date, unique=True, index=True) # 마감 날짜
    total_sales = Column(Integer, default=0)
    total_orders = Column(Integer, default=0)
    closed_at = Column(DateTime(timezone=True), server_default=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class Setting(Base):
    __tablename__ = "settings"
    id = Column(Integer, primary_key=True, index=True)
    is_open = Column(Boolean, default=False) # 영업 여부
    notice = Column(String, nullable=True) # 공지사항
    open_time = Column(String, nullable=True) # 오픈 시간
    close_time = Column(String, nullable=True) # 마감 시간
    # 계좌이체 정보 - 관리자 화면에서 변경 가능하도록 DB에서 관리
    bank_name = Column(String, nullable=True) # 은행명 (예: 카카오뱅크)
    account_number = Column(String, nullable=True) # 계좌번호
    account_holder = Column(String, nullable=True) # 예금주
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class VolunteerSchedule(Base):
    __tablename__ = "volunteer_schedules"
    id = Column(Integer, primary_key=True, index=True)
    sunday_date = Column(Date, unique=True, index=True, nullable=False) # 주일 날짜 (일요일)
    volunteers = Column(JSON, nullable=True) # {"names": ["홍길동", "김철수"]} 형태
    memo = Column(String, nullable=True) # 기타 전달사항
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class Volunteer(Base):
    __tablename__ = "volunteers"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
