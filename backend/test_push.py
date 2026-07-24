"""
[File Role]
운영 환경에서 특정 주문에 대한 웹 푸시 전송을 진단하는 스크립트.
실제 Push Service에 요청을 보내므로 운영 환경에서 주의하여 사용한다.

[사용법]
  python test_push.py --order-id 500

[규칙]
- 테스트 후 구독을 자동 삭제하지 않음
- VAPID 개인키 전체를 출력하지 않음
- endpoint 전체를 출력하지 않음 (호스트만 출력)
"""

import argparse
import json
import sys
from urllib.parse import urlparse

from config import settings
from database import SessionLocal
import models


def get_endpoint_host(endpoint: str) -> str:
    """endpoint URL에서 호스트명만 추출한다."""
    try:
        return urlparse(endpoint).hostname or "unknown"
    except Exception:
        return "unknown"


def normalize_vapid_subject(value: str) -> str:
    """VAPID subject 정규화 (mailto: 중복 방지)"""
    normalized = value.strip()
    if normalized.startswith("mailto:") or normalized.startswith("https://"):
        return normalized
    return f"mailto:{normalized}"


def main():
    parser = argparse.ArgumentParser(description="특정 주문에 대한 웹 푸시 진단")
    parser.add_argument("--order-id", type=int, required=True, help="테스트할 주문 ID")
    args = parser.parse_args()

    order_id = args.order_id
    print(f"\n📋 주문 #{order_id} 푸시 진단 시작")
    print(f"   VAPID 개인키: {settings.VAPID_PRIVATE_KEY[:8]}...***")
    print(f"   VAPID 이메일: {settings.VAPID_CLAIM_EMAIL}")

    db = SessionLocal()
    try:
        # 주문 존재 확인
        order = db.query(models.Order).filter(models.Order.id == order_id).first()
        if not order:
            print(f"\n❌ 주문 #{order_id}을 찾을 수 없습니다.")
            sys.exit(1)

        print(f"   주문번호: #{order.order_number}, 상태: {order.status}")

        # 구독 조회
        subscriptions = (
            db.query(models.PushSubscription)
            .filter(models.PushSubscription.order_id == order_id)
            .all()
        )

        print(f"\n📱 대상 구독 수: {len(subscriptions)}")

        if not subscriptions:
            print("   ⚠️ 등록된 구독이 없습니다. 푸시를 보낼 수 없습니다.")
            sys.exit(0)

        from pywebpush import webpush, WebPushException

        vapid_subject = normalize_vapid_subject(settings.VAPID_CLAIM_EMAIL)

        payload = json.dumps(
            {
                "title": "평택중앙교회 카페 [테스트]",
                "body": f"#{order.order_number}번 주문 테스트 푸시입니다.",
                "icon": "/pwa-192.png",
                "badge": "/pwa-192.png",
                "tag": f"test-{order_id}",
                "url": f"/order/status/{order_id}",
                "type": "ORDER_READY",
            },
            ensure_ascii=False,
        )

        for idx, sub in enumerate(subscriptions, 1):
            endpoint_host = get_endpoint_host(sub.endpoint)
            print(f"\n── 구독 {idx}/{len(subscriptions)} ──")
            print(f"   ID: {sub.id}")
            print(f"   endpoint_host: {endpoint_host}")

            try:
                webpush(
                    subscription_info={
                        "endpoint": sub.endpoint,
                        "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                    },
                    data=payload,
                    vapid_private_key=settings.VAPID_PRIVATE_KEY,
                    vapid_claims={"sub": vapid_subject},
                    ttl=3600,
                    timeout=10,
                )
                print(f"   ✅ 전송 성공 (status=201)")
            except WebPushException as e:
                status = e.response.status_code if e.response is not None else "N/A"
                body = ""
                if e.response is not None:
                    try:
                        body = e.response.text[:500]
                    except Exception:
                        body = str(e)[:500]
                print(f"   ❌ 전송 실패 (status={status})")
                print(f"   응답: {body}")
            except Exception as e:
                print(f"   ❌ 예외 발생: {type(e).__name__}: {e}")

        print("\n✅ 진단 완료. 구독은 삭제하지 않았습니다.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
