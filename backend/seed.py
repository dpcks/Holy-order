import os
import sys
from datetime import datetime, date

# 프로젝트 루트 경로를 sys.path에 추가하여 모듈 임포트 에러 방지
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import SessionLocal, engine
from models import Base, Category, Menu, MenuOption, Setting, Admin, User

def seed_data():
    db = SessionLocal()
    try:
        # 테이블 생성 (없을 경우를 대비)
        Base.metadata.create_all(bind=engine)

        # 1. 초기화 확인
        if db.query(Category).first() is not None:
            print("데이터가 이미 존재합니다. 시딩을 건너뜁니다.")
            return

        print("더미 데이터 생성을 시작합니다...")

        # 2. 시스템 설정 생성 (오픈/마감 시간 추가)
        setting = Setting(
            is_open=True, 
            notice="환영합니다! 예배 후 맛있는 커피 한 잔 어떠세요? ☕️",
            open_time="10:00",
            close_time="13:30"
        )
        db.add(setting)

        # 3. 관리자 계정 생성
        admin = Admin(
            login_id="admin",
            password_hash="pbkdf2:sha256:600000$tVvT8...", # 실제 운영 시에는 제대로 된 해시 사용 권장
            name="카페 관리자"
        )
        db.add(admin)

        # 4. 테스트용 유저 생성
        test_user = User(
            name="홍길동",
            phone="01012345678",
            duty="성도"
        )
        db.add(test_user)
        db.commit()

        # 5. 카테고리 생성
        cat_coffee = Category(name="커피", display_order=1)
        cat_beverage = Category(name="음료", display_order=2)
        cat_tea = Category(name="티", display_order=3)
        cat_dessert = Category(name="디저트", display_order=4)
        
        db.add_all([cat_coffee, cat_beverage, cat_tea, cat_dessert])
        db.commit()
        db.refresh(cat_coffee)
        db.refresh(cat_beverage)
        db.refresh(cat_tea)
        db.refresh(cat_dessert)

        # 6. 메뉴 및 옵션 생성
        # [커피] 아메리카노
        americano = Menu(category_id=cat_coffee.id, name="아메리카노", price=2000, description="에티오피아 원두의 산미와 고소함이 어우러진 커피")
        db.add(americano)
        db.commit()
        db.refresh(americano)
        
        db.add_all([
            MenuOption(menu_id=americano.id, name="HOT", extra_price=0),
            MenuOption(menu_id=americano.id, name="ICE", extra_price=0),
            MenuOption(menu_id=americano.id, name="샷 추가", extra_price=500),
            MenuOption(menu_id=americano.id, name="연하게", extra_price=0)
        ])

        # [커피] 카페라떼
        latte = Menu(category_id=cat_coffee.id, name="카페라떼", price=2500, description="신선한 우유가 들어간 부드러운 라떼")
        db.add(latte)
        db.commit()
        db.refresh(latte)

        db.add_all([
            MenuOption(menu_id=latte.id, name="HOT", extra_price=0),
            MenuOption(menu_id=latte.id, name="ICE", extra_price=0),
            MenuOption(menu_id=latte.id, name="바닐라 시럽 추가", extra_price=500),
            MenuOption(menu_id=latte.id, name="디카페인 변경", extra_price=500),
            MenuOption(menu_id=latte.id, name="두유 변경", extra_price=0)
        ])

        # [음료] 복숭아 아이스티
        iced_tea = Menu(category_id=cat_beverage.id, name="복숭아 아이스티", price=2000, description="달콤한 복숭아 향이 가득한 시원한 아이스티")
        db.add(iced_tea)
        db.commit()
        db.refresh(iced_tea)
        
        db.add_all([
            MenuOption(menu_id=iced_tea.id, name="ICE (고정)", extra_price=0),
            MenuOption(menu_id=iced_tea.id, name="샷 추가 (아샷추)", extra_price=500)
        ])

        # [티] 유자차
        yuja_tea = Menu(category_id=cat_tea.id, name="유자차", price=2500, description="비타민 C가 풍부하고 달콤한 유자차")
        db.add(yuja_tea)
        db.commit()
        db.refresh(yuja_tea)
        db.add_all([
            MenuOption(menu_id=yuja_tea.id, name="HOT", extra_price=0),
            MenuOption(menu_id=yuja_tea.id, name="ICE", extra_price=0)
        ])

        # [디저트] 초코 쿠키
        cookie = Menu(category_id=cat_dessert.id, name="초코 스모어 쿠키", price=3000, description="초콜릿 칩과 마시멜로우가 들어간 쫀득한 쿠키")
        db.add(cookie)

        # [디저트] 치즈 케이크
        cake = Menu(category_id=cat_dessert.id, name="뉴욕 치즈 케이크", price=4500, description="진한 치즈의 풍미를 느낄 수 있는 조각 케이크")
        db.add(cake)

        db.commit()
        print("더미 데이터 생성이 완료되었습니다! ✅")
        print(f"생성된 카테고리 수: {db.query(Category).count()}")
        print(f"생성된 메뉴 수: {db.query(Menu).count()}")

    except Exception as e:
        db.rollback()
        print(f"에러 발생: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    seed_data()
