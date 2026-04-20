import os
import sys

# 프로젝트 루트 경로를 sys.path에 추가하여 모듈 임포트 에러 방지
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.database import SessionLocal, engine
from backend.models import Base, Category, Menu, MenuOption, Setting

def seed_data():
    db = SessionLocal()
    try:
        # 1. 초기화 (선택사항: 이미 데이터가 있다면 건너뜀)
        if db.query(Category).first() is not None:
            print("데이터가 이미 존재합니다. 시딩을 건너뜁니다.")
            return

        print("더미 데이터 생성을 시작합니다...")

        # 2. 카테고리 생성
        cat_coffee = Category(name="커피", display_order=1)
        cat_beverage = Category(name="음료", display_order=2)
        cat_dessert = Category(name="디저트", display_order=3)
        
        db.add_all([cat_coffee, cat_beverage, cat_dessert])
        db.commit()
        db.refresh(cat_coffee)
        db.refresh(cat_beverage)
        db.refresh(cat_dessert)

        # 3. 메뉴 및 옵션 생성
        # 아메리카노
        americano = Menu(category_id=cat_coffee.id, name="아메리카노", price=2000, description="기본적인 롱블랙 커피입니다.")
        db.add(americano)
        db.commit()
        db.refresh(americano)
        
        db.add_all([
            MenuOption(menu_id=americano.id, name="HOT", extra_price=0),
            MenuOption(menu_id=americano.id, name="ICE", extra_price=0),
            MenuOption(menu_id=americano.id, name="샷 추가", extra_price=500)
        ])

        # 카페라떼
        latte = Menu(category_id=cat_coffee.id, name="카페라떼", price=2500, description="부드러운 우유가 들어간 라떼입니다.")
        db.add(latte)
        db.commit()
        db.refresh(latte)

        db.add_all([
            MenuOption(menu_id=latte.id, name="HOT", extra_price=0),
            MenuOption(menu_id=latte.id, name="ICE", extra_price=0),
            MenuOption(menu_id=latte.id, name="바닐라 시럽 추가", extra_price=500),
            MenuOption(menu_id=latte.id, name="디카페인 변경", extra_price=500)
        ])

        # 복숭아 아이스티
        iced_tea = Menu(category_id=cat_beverage.id, name="복숭아 아이스티", price=2000, description="달콤한 복숭아 맛 아이스티입니다.")
        db.add(iced_tea)
        db.commit()
        db.refresh(iced_tea)
        
        db.add_all([
            MenuOption(menu_id=iced_tea.id, name="ICE", extra_price=0),
            MenuOption(menu_id=iced_tea.id, name="샷 추가(아샷추)", extra_price=500)
        ])

        # 쿠키
        cookie = Menu(category_id=cat_dessert.id, name="초코 스모어 쿠키", price=3000, description="마시멜로우가 들어간 쫀득한 쿠키입니다.")
        db.add(cookie)

        # 4. 시스템 영업 상태 켜기
        setting = Setting(is_open=True, notice="환영합니다! 예배 후 맛있는 커피 한 잔 어떠세요?")
        db.add(setting)

        db.commit()
        print("더미 데이터 생성이 완료되었습니다! ✅")

    except Exception as e:
        db.rollback()
        print(f"에러 발생: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    seed_data()
