from config import settings
from pywebpush import webpush, WebPushException

print("Private key:", settings.VAPID_PRIVATE_KEY[:10] + "...")
try:
    webpush(
        subscription_info={"endpoint": "https://test.com", "keys": {"p256dh": "test", "auth": "test"}},
        data="test",
        vapid_private_key=settings.VAPID_PRIVATE_KEY,
        vapid_claims={"sub": f"mailto:{settings.VAPID_CLAIM_EMAIL}"}
    )
except Exception as e:
    print(f"Error: {e}")
