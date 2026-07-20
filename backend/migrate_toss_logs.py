import sys
sys.path.append('.')

from database import SessionLocal
import models

db = SessionLocal()

try:
    # 1. "토스 자동확인"으로 기록된 모든 결제 로그 찾기
    logs = db.query(models.PaymentLog).filter(models.PaymentLog.sender_name == '토스 자동확인').all()
    
    if not logs:
        print("✅ 업데이트할 '토스 자동확인' 로그가 없습니다.")
        sys.exit(0)

    print(f"\n🚀 총 {len(logs)}건의 '토스 자동확인' 로그를 실제 주문자명으로 업데이트합니다...")

    update_count = 0
    for log in logs:
        # 해당 로그의 원본 주문 데이터(Order) 조회
        order = db.query(models.Order).filter(models.Order.id == log.order_id).first()
        
        if order:
            new_name = order.user_name_snapshot or "이름 없음"
            log.sender_name = new_name
            update_count += 1
            print(f"  - 주문 {order.order_number}번: '토스 자동확인' -> '{new_name}'")

    db.commit()
    print(f"\n✅ 업데이트 완료! 총 {update_count}건의 기록이 정상적으로 수정되었습니다.")

except Exception as e:
    db.rollback()
    print(f"❌ 에러 발생: {e}")
finally:
    db.close()
