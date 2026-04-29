import sys
import os
from datetime import datetime, timedelta, timezone

# 경로 설정
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from database import SessionLocal
import models

def check():
    db = SessionLocal()
    try:
        now_kst = datetime.now(timezone(timedelta(hours=9)))
        print(f"--- Current KST: {now_kst} ---")
        
        # 1. 모든 활성 이벤트 조회
        events = db.query(models.Announcement).filter(
            models.Announcement.is_active == True
        ).all()
        
        if not events:
            print("No announcements with is_active = True found.")
            return

        for e in events:
            print(f"\n[Event ID: {e.id}] {e.title}")
            print(f"- is_event_mode: {e.is_event_mode}")
            print(f"- starts_at: {e.starts_at}")
            print(f"- ends_at: {e.ends_at}")
            
            # 필터 조건 체크
            is_mode = e.is_event_mode == True
            is_started = e.starts_at is None or e.starts_at <= now_kst.replace(tzinfo=None)
            is_ended = e.ends_at is not None and e.ends_at < now_kst.replace(tzinfo=None)
            
            print(f"- Condition Match: mode={is_mode}, started={is_started}, not_ended={not is_ended}")
            
            if is_mode and is_started and not is_ended:
                print(">>> THIS EVENT SHOULD BE ACTIVE! <<<")
            else:
                print(">>> This event is NOT active for current time. <<<")
                
    finally:
        db.close()

if __name__ == "__main__":
    check()
