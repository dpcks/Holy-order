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
    phone = Column(String, unique=True, index=True, nullable=True) # 식별자 및 적립용 (선택 사항 가능)
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
    
    # 이벤트(골든벨) 관련 필드 - 이벤트 주문 시 원래 가격과 이벤트 연결 정보 보관
    announcement_id = Column(Integer, ForeignKey("announcements.id"), nullable=True, index=True) # 이벤트 주문 시 연결
    original_price = Column(Integer, nullable=True) # 이벤트 주문 시 원래 계산 금액 (정산용)
    
    order_number = Column(Integer, nullable=False) # 고객에게 보여주는 당일 순번 (ex: #1, #2, #3...)
    order_date = Column(Date, default=lambda: get_seoul_time().date(), index=True) # DB 내부 무결성용
    
    is_pwa = Column(Boolean, default=False) # PWA 앱 주문 여부
    pwa_installation_id = Column(Integer, ForeignKey("pwa_installations.id"), nullable=True, index=True) # PWA 설치 기기 추적 연결
    is_active = Column(Boolean, default=True, index=True) # 소프트 삭제 여부
    deleted_at = Column(DateTime(timezone=True), nullable=True) # 삭제 일시
    
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    __table_args__ = (
        UniqueConstraint("order_number", "order_date", name="uq_order_number_per_day"),
    )
    
    user = relationship("User", back_populates="orders")
    items = relationship("OrderItem", back_populates="order")
    payment_log = relationship("PaymentLog", back_populates="order", uselist=False)
    announcement = relationship("Announcement", back_populates="orders")
    pwa_installation = relationship("PwaInstallation", foreign_keys=[pwa_installation_id])

class OrderItem(Base):
    __tablename__ = "order_items"
    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"))
    menu_id = Column(Integer, ForeignKey("menus.id"))
    menu_name_snapshot = Column(String) # 이름 변경 대비
    menu_price_snapshot = Column(Integer) # 단가 변경 대비
    menu_image_url_snapshot = Column(String, nullable=True) # 이미지 변경 대비 추가
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
    role = Column(String, default="ADMIN") # 권한 (MASTER / ADMIN)
    is_active = Column(Boolean, default=True) # 계정 활성화 여부
    last_login_at = Column(DateTime(timezone=True), nullable=True) # 최근 접속 시각
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
    require_phone = Column(Boolean, default=True) # 전화번호 필수 입력 여부
    # 토스 송금 설정 - supertoss:// 딥링크를 활용한 간편 송금
    toss_enabled = Column(Boolean, default=False) # 토스 송금 활성화 여부 (기존 계좌 정보 활용)
    # 가격 표시 토글 설정
    show_price = Column(Boolean, default=True) # 가격 표시 여부
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

# ==========================================
# 4. 이벤트/공지 (Announcements)
# ==========================================

class Announcement(Base):
    """이벤트/공지 데이터 모델 - 골든벨(무료 제공) 이벤트 및 일반 공지를 관리"""
    __tablename__ = "announcements"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False) # 이벤트 제목 (예: "김철수 장로님 칠순 감사")
    content = Column(String, nullable=True) # 상세 내용
    banner_text = Column(String, nullable=True) # 사용자 화면 상단 배너 문구
    image_url = Column(String, nullable=True) # 이벤트 이미지 URL
    is_event_mode = Column(Boolean, default=False) # True이면 골든벨(무료) 모드
    sponsor_name = Column(String, nullable=True) # 후원자 성함
    sponsor_duty = Column(String, nullable=True) # 후원자 직분
    event_type = Column(String, nullable=True) # 이벤트 유형 (칠순감사, 결혼감사, 출산감사 등)
    is_active = Column(Boolean, default=False, index=True) # 현재 활성 여부 (동시에 1개만 활성)
    starts_at = Column(DateTime, nullable=True) # 이벤트 시작 일시
    ends_at = Column(DateTime, nullable=True) # 이벤트 종료 일시
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    orders = relationship("Order", back_populates="announcement")

# ==========================================
# 5. 재고 관리 (Inventory Management)
# ==========================================

class Ingredient(Base):
    """재료/소모품 재고 관리 모델 - 자동 차감 없이 수동 관리 방식"""
    __tablename__ = "ingredients"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)          # 품목명 (예: 우유, 일회용컵)
    category = Column(String, nullable=True)                   # 카테고리 (재료, 소모품)
    unit = Column(String, nullable=True)                       # 단위 (kg, 개, 팩 등)
    current_stock = Column(Integer, default=0)                 # 현재 재고 수량
    alert_threshold = Column(Integer, default=0)               # 부족 알림 임계값
    memo = Column(String, nullable=True)                       # 메모 (구매처, 비고 등)
    is_active = Column(Boolean, default=True)                  # 소프트 삭제용
    display_order = Column(Integer, default=0)                 # 정렬 순서
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


# ==========================================
# 6. 푸시 알림 구독 (Push Subscriptions)
# ==========================================

class PushSubscription(Base):
    """모바일 PWA 푸시 알림을 발송하기 위해 브라우저 구독 정보를 저장하는 모델"""
    __tablename__ = "push_subscriptions"
    
    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=True, index=True) # 알림을 발송할 특정 주문 연결
    endpoint = Column(String, unique=True, index=True, nullable=False)            # 브라우저별 푸시 수신 주소
    p256dh = Column(String, nullable=False)                                      # 공개 키
    auth = Column(String, nullable=False)                                        # 인증 비밀 키
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    order = relationship("Order", backref="push_subscriptions") # 주문에서 구독 정보 역참조 지원


# ==========================================
# 7. PWA 설치 및 기기 추적 (PWA Installation Tracking)
# ==========================================

class PwaInstallation(Base):
    """PWA 익명 설치 및 기기 활성화 추적 모델"""
    __tablename__ = "pwa_installations"

    id = Column(Integer, primary_key=True, index=True)
    installation_id = Column(String(64), index=True, nullable=False)
    app_type = Column(String(20), nullable=False)  # "USER" | "ADMIN"
    platform = Column(String(20), nullable=False, default="UNKNOWN")  # "IOS" | "ANDROID" | "DESKTOP" | "UNKNOWN"
    browser_family = Column(String(20), nullable=False, default="UNKNOWN")  # "SAFARI" | "CHROME" | "EDGE" | "FIREFOX" | "OTHER" | "UNKNOWN"
    first_seen_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    last_seen_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), index=True, nullable=False)
    first_standalone_at = Column(DateTime(timezone=True), nullable=True)
    last_standalone_at = Column(DateTime(timezone=True), nullable=True)
    last_detection_method = Column(String(30), nullable=False, default="UNKNOWN")  # "STANDALONE_LAUNCH" | "APPINSTALLED_EVENT" | "RELATED_APPS" | "UNKNOWN"
    push_permission = Column(String(20), nullable=False, default="UNKNOWN")  # "GRANTED" | "DENIED" | "DEFAULT" | "UNSUPPORTED" | "UNKNOWN"
    related_app_installed = Column(Boolean, nullable=True)
    admin_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("installation_id", "app_type", name="uq_pwa_installation_id_app_type"),
    )

    admin = relationship("User", foreign_keys=[admin_id])


