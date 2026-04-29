from datetime import datetime, timedelta, timezone
import sys
import os

# 현재 경로 추가
sys.path.append(os.getcwd() + "/backend")
from database import SessionLocal
import models

db = SessionLocal()
now = datetime.now()
seoul_now = datetime.now(timezone(timedelta(hours=9)))

print(f"Server Now: {now}")
print(f"Seoul Now: {seoul_now}")

active_event = db.query(models.Announcement).filter(
    models.Announcement.is_active == True,
    models.Announcement.is_event_mode == True
).first()

if active_event:
    print(f"Event Found: {active_event.title}")
    print(f"Starts At: {active_event.starts_at}")
    print(f"Ends At: {active_event.ends_at}")
    
    # 실제 필터 로직 시뮬레이션
    is_started = active_event.starts_at is None or active_event.starts_at <= now
    is_ended = active_event.ends_at is not None and active_event.ends_at < now
    print(f"Is Started (by Server Now): {is_started}")
    print(f"Is Ended (by Server Now): {is_ended}")
else:
    print("No active event found in DB with is_active=True and is_event_mode=True")

db.close()
