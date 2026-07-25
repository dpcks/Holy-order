"""
[File Role]
웹 푸시 알림 전용 서비스 모듈.
관리자가 주문 상태를 READY로 변경할 때 Background Task에서 호출되며,
request-scoped Session과 분리된 독립적인 DB 세션을 사용한다.

[아키텍처 위치]
backend/services/push_service.py
├─ routers/admin.py → BackgroundTasks.add_task(send_order_ready_pushes, ...)
├─ database.SessionLocal → 독립 세션
└─ pywebpush → Apple/Google Push Service
"""

import inspect
import json
import logging
import time
from typing import Optional, Tuple
from urllib.parse import urlparse

from cryptography.hazmat.primitives.asymmetric import ec

# cryptography 버전에 따른 pywebpush EllipticCurve 타입 호환성 패치
# 왜: cryptography >= 41.0.0에서는 generate_private_key에 ec.SECP256R1() 인스턴스를 넘겨야 하나,
# pywebpush 내부에서 ec.SECP256R1 클래스 자체를 넘겨 TypeError가 발생하는 라이브러리 결함을 원천 방지한다.
_orig_generate_private_key = ec.generate_private_key
def _patched_generate_private_key(curve, backend=None):
    if inspect.isclass(curve):
        curve = curve()
    return _orig_generate_private_key(curve, backend)

ec.generate_private_key = _patched_generate_private_key

from pywebpush import webpush, WebPushException

from config import settings
from database import SessionLocal
import models

logger = logging.getLogger(__name__)

# 재시도 대상 HTTP status 코드
RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}

# 만료된 endpoint를 나타내는 HTTP status 코드
EXPIRED_STATUS_CODES = {404, 410}

# 최대 재시도 횟수 (첫 시도 포함 총 2회)
MAX_ATTEMPTS = 2

# 재시도 간 대기 시간 (초)
RETRY_BACKOFF_SECONDS = 1


def normalize_vapid_subject(value: str) -> str:
    """
    VAPID subject 값을 정규화한다.
    왜: 환경변수에 'mailto:' 접두사가 있을 수도 없을 수도 있으므로
    중복 접두사(mailto:mailto:...)를 방지하기 위함.
    """
    normalized = value.strip()

    if not normalized:
        raise ValueError("VAPID_CLAIM_EMAIL이 비어 있습니다.")

    # 이미 mailto: 또는 https:// 접두사가 있으면 그대로 반환
    if normalized.startswith("mailto:"):
        return normalized

    if normalized.startswith("https://"):
        return normalized

    return f"mailto:{normalized}"


def _get_endpoint_host(endpoint: str) -> str:
    """endpoint URL에서 호스트명만 추출하여 로그에 안전하게 사용한다."""
    try:
        return urlparse(endpoint).hostname or "unknown"
    except Exception:
        return "unknown"


def _build_payload(order_id: int, order_number: int) -> str:
    """
    주문 준비 완료 알림 payload를 생성한다.
    왜 ensure_ascii=False: 한글 메시지가 유니코드 이스케이프 없이 전달되어야
    iOS/Android 알림에서 정상 표시된다.
    """
    payload = {
        "title": "평택중앙교회 카페",
        "body": f"#{order_number}번 주문하신 메뉴가 준비되었습니다. 픽업대로 와 주세요.",
        "icon": "/pwa-192.png",
        "badge": "/img/design/android_silhouette.svg",
        "tag": f"order-ready-{order_id}",
        "url": f"/order/status/{order_id}",
        "type": "ORDER_READY",
    }
    return json.dumps(payload, ensure_ascii=False)


def _send_single_push(
    subscription_info: dict,
    data: str,
    vapid_subject: str,
    order_id: int,
    subscription_id: int,
    endpoint_host: str,
) -> Tuple[bool, Optional[int], bool]:
    """
    단일 구독에 대해 웹 푸시를 전송한다.
    제한된 재시도 로직을 포함한다.

    Returns:
        (성공 여부, HTTP status 또는 None, 구독 삭제 필요 여부)
    """
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            webpush(
                subscription_info=subscription_info,
                data=data,
                vapid_private_key=settings.VAPID_PRIVATE_KEY,
                vapid_claims={"sub": vapid_subject},
                ttl=3600,
                timeout=10,
            )
            # 성공
            logger.info(
                "event=webpush_success order_id=%s subscription_id=%s "
                "endpoint_host=%s status=201 attempt=%s",
                order_id,
                subscription_id,
                endpoint_host,
                attempt,
            )
            return (True, 201, True)  # 성공 → 해당 구독 삭제 가능

        except WebPushException as e:
            status_code = None
            response_excerpt = ""

            if e.response is not None:
                status_code = e.response.status_code
                try:
                    response_excerpt = e.response.text[:1000] if e.response.text else ""
                except Exception:
                    response_excerpt = str(e)[:1000]

            logger.warning(
                "event=webpush_failure order_id=%s subscription_id=%s "
                "endpoint_host=%s status=%s exception_type=%s "
                "response_excerpt=%s attempt=%s",
                order_id,
                subscription_id,
                endpoint_host,
                status_code,
                type(e).__name__,
                response_excerpt,
                attempt,
            )

            # 만료된 endpoint (404/410) → 구독 삭제, 재시도 불필요
            if status_code in EXPIRED_STATUS_CODES:
                return (False, status_code, True)

            # 인증/구성 오류 (400/401/403) → 구독 유지, 재시도 불필요
            # 왜: 동일한 요청을 즉시 반복해도 같은 오류가 발생하며,
            # VAPID 키 불일치 등 운영 구성 문제일 수 있어 운영자 확인이 필요하다.
            if status_code is not None and status_code in {400, 401, 403}:
                return (False, status_code, False)

            # 재시도 대상 (429/5xx) → 다음 시도
            if status_code in RETRYABLE_STATUS_CODES and attempt < MAX_ATTEMPTS:
                time.sleep(RETRY_BACKOFF_SECONDS)
                continue

            # 최종 실패 → 구독 유지
            return (False, status_code, False)

        except Exception as e:
            # 네트워크 타임아웃 등 일반 예외
            logger.warning(
                "event=webpush_failure order_id=%s subscription_id=%s "
                "endpoint_host=%s status=None exception_type=%s "
                "response_excerpt=%s attempt=%s",
                order_id,
                subscription_id,
                endpoint_host,
                type(e).__name__,
                str(e)[:1000],
                attempt,
            )

            if attempt < MAX_ATTEMPTS:
                time.sleep(RETRY_BACKOFF_SECONDS)
                continue

            return (False, None, False)

    # 이론적으로 도달 불가하지만 안전을 위해
    return (False, None, False)


def send_order_ready_pushes(order_id: int, order_number: int) -> None:
    """
    주문 준비 완료 웹 푸시를 발송한다.
    왜 독립 세션: FastAPI BackgroundTask에서는 request-scoped 세션이
    이미 닫혀 있으므로 새 세션을 열어야 한다.

    이 함수는 동기 함수로, BackgroundTask 내에서 동기적으로 실행되어
    이벤트 루프를 차단하지 않는다.
    """
    db = SessionLocal()
    try:
        subscriptions = (
            db.query(models.PushSubscription)
            .filter(models.PushSubscription.order_id == order_id)
            .all()
        )

        if not subscriptions:
            logger.info(
                "event=webpush_no_targets order_id=%s",
                order_id,
            )
            return

        logger.info(
            "event=webpush_start order_id=%s order_number=%s target_count=%s",
            order_id,
            order_number,
            len(subscriptions),
        )

        vapid_subject = normalize_vapid_subject(settings.VAPID_CLAIM_EMAIL)
        data = _build_payload(order_id, order_number)

        for sub in subscriptions:
            endpoint_host = _get_endpoint_host(sub.endpoint)
            subscription_info = {
                "endpoint": sub.endpoint,
                "keys": {
                    "p256dh": sub.p256dh,
                    "auth": sub.auth,
                },
            }

            success, status, should_delete = _send_single_push(
                subscription_info=subscription_info,
                data=data,
                vapid_subject=vapid_subject,
                order_id=order_id,
                subscription_id=sub.id,
                endpoint_host=endpoint_host,
            )

            if should_delete:
                reason = "success" if success else f"expired_{status}"
                db.delete(sub)
                db.commit()
                logger.info(
                    "event=subscription_deleted order_id=%s subscription_id=%s "
                    "reason=%s",
                    order_id,
                    sub.id,
                    reason,
                )
    except Exception as e:
        # 전체 발송 과정에서 예상 외 오류가 발생해도 주문 상태에는 영향 없음
        logger.error(
            "event=webpush_unexpected_error order_id=%s error=%s",
            order_id,
            str(e)[:1000],
        )
    finally:
        db.close()
