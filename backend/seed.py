import os
import sys
import argparse
from datetime import datetime

# backend 디렉토리를 path에 추가하여 모듈 임포트 가능하게 함
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import SessionLocal, engine
import models
import auth

def create_admin_if_not_exists(db):
    """기본 관리자 계정(admin/1234) 생성"""
    admin = db.query(models.Admin).filter(models.Admin.login_id == "admin").first()
    if not admin:
        new_admin = models.Admin(
            login_id="admin",
            password_hash=auth.hash_password("1234"),
            name="최고관리자",
            role="MASTER",
            is_active=True
        )
        db.add(new_admin)
        print("✅ 초기 관리자 계정(admin/1234)이 생성되었습니다.")
    else:
        print("ℹ️ 초기 관리자 계정이 이미 존재합니다.")

def create_settings_if_not_exists(db):
    """기본 시스템 설정 생성"""
    setting = db.query(models.Setting).first()
    if not setting:
        setting = models.Setting(
            is_open=True,
            bank_name="카카오뱅크",
            account_number="3333-01-1234567",
            account_holder="평택중앙교회"
        )
        db.add(setting)
        print("✅ 기본 시스템 설정이 생성되었습니다.")

def seed_test_data(db):
    """가짜 테스트 데이터 삽입"""
    print("⏳ 테스트 데이터를 삽입합니다...")
    
    # 1. 카테고리 생성
    coffee_cat = models.Category(name="커피 (Coffee)", display_order=0)
    beverage_cat = models.Category(name="음료 (Beverage)", display_order=1)
    db.add_all([coffee_cat, beverage_cat])
    db.flush()

    # 2. 메뉴 생성
    americano = models.Menu(category_id=coffee_cat.id, name="아메리카노", price=1500, description="에티오피아 원두로 내린 신선한 아메리카노", is_available=True)
    latte = models.Menu(category_id=coffee_cat.id, name="카페라떼", price=2000, description="고소한 우유와 에스프레소의 만남", is_available=True)
    ade = models.Menu(category_id=beverage_cat.id, name="청포도 에이드", price=2500, description="상큼한 청포도와 탄산수", is_available=True)
    db.add_all([americano, latte, ade])
    db.flush()

    # 3. 메뉴 옵션 추가
    db.add(models.MenuOption(menu_id=americano.id, name="ICE", extra_price=0))
    db.add(models.MenuOption(menu_id=americano.id, name="HOT", extra_price=0))
    db.add(models.MenuOption(menu_id=americano.id, name="샷 추가", extra_price=500))
    db.add(models.MenuOption(menu_id=latte.id, name="ICE", extra_price=0))
    db.add(models.MenuOption(menu_id=latte.id, name="HOT", extra_price=0))

    # 4. 가짜 주문 데이터 생성
    order1 = models.Order(
        order_number=101,
        user_name_snapshot="홍길동",
        user_phone_snapshot="010-1234-5678",
        user_duty_snapshot="청년",
        total_price=3000,
        payment_method="TRANSFER",
        status="PENDING",
        order_date=datetime.now().date(),
        special_instructions="얼음 많이 주세요!"
    )
    db.add(order1)
    db.flush()

    # 주문 아이템 추가
    db.add(models.OrderItem(
        order_id=order1.id,
        menu_name_snapshot="아메리카노",
        menu_price_snapshot=1500,
        quantity=2,
        sub_total=3000,
        options_snapshot={"온도": "ICE"}
    ))

    db.commit()
    print("✅ 메뉴 및 주문 테스트 데이터 세팅 완료!")

def clear_test_data(db):
    """관리자 계정과 설정을 제외한 모든 데이터 삭제"""
    print("⏳ 테스트 데이터를 싹 지웁니다...")
    try:
        # 외래키 무결성을 위해 순서대로 삭제
        db.query(models.PaymentLog).delete()
        db.query(models.OrderItem).delete()
        db.query(models.Order).delete()
        db.query(models.MenuOption).delete()
        db.query(models.Menu).delete()
        db.query(models.Category).delete()
        db.query(models.VolunteerSchedule).delete()
        db.query(models.Volunteer).delete()
        db.commit()
        print("✅ 테스트 데이터가 깔끔하게 삭제되었습니다. (관리자 계정은 유지됨)")
    except Exception as e:
        db.rollback()
        print(f"❌ 데이터 삭제 중 오류 발생: {e}")

def main():
    parser = argparse.ArgumentParser(description="Holy-Order DB Seed Tool")
    parser.add_argument("--seed", action="store_true", help="테스트 데이터와 기본 관리자를 생성합니다.")
    parser.add_argument("--clear", action="store_true", help="테스트 데이터를 삭제하고 초기 상태로 되돌립니다.")
    args = parser.parse_args()

    models.Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        if args.seed:
            create_admin_if_not_exists(db)
            create_settings_if_not_exists(db)
            # 카테고리가 비어있을 때만 테스트 데이터 삽입
            if db.query(models.Category).count() == 0:
                seed_test_data(db)
            else:
                print("ℹ️ 이미 데이터가 존재하여 테스트 데이터 삽입을 건너뜁니다. (초기화하려면 --clear 사용)")
        elif args.clear:
            clear_test_data(db)
            create_admin_if_not_exists(db)
            create_settings_if_not_exists(db)
        else:
            parser.print_help()
    finally:
        db.close()

if __name__ == "__main__":
    main()
