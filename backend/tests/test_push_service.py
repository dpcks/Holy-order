"""
[File Role]
push_service 모듈의 단위 테스트.
실제 Push Service를 호출하지 않고 webpush를 mock하여
HTTP status별 구독 처리 정책과 재시도 로직을 검증한다.

[아키텍처 위치]
backend/tests/test_push_service.py
└─ services/push_service.py를 테스트
"""

import pytest
from unittest.mock import patch, MagicMock, PropertyMock
from sqlalchemy.orm import Session

import models
from services.push_service import (
    send_order_ready_pushes,
    normalize_vapid_subject,
    _build_payload,
    _get_endpoint_host,
)


# ── VAPID subject 정규화 테스트 ──

class TestNormalizeVapidSubject:
    """5.7 VAPID subject 정규화 검증"""

    def test_plain_email(self):
        """일반 이메일 → mailto: 접두사 추가"""
        assert normalize_vapid_subject("admin@example.com") == "mailto:admin@example.com"

    def test_already_mailto(self):
        """이미 mailto: 접두사가 있으면 그대로 반환"""
        assert normalize_vapid_subject("mailto:admin@example.com") == "mailto:admin@example.com"

    def test_https_url(self):
        """https:// URL은 그대로 반환"""
        assert normalize_vapid_subject("https://example.com/contact") == "https://example.com/contact"

    def test_whitespace_trimmed(self):
        """앞뒤 공백 제거"""
        assert normalize_vapid_subject("  admin@example.com  ") == "mailto:admin@example.com"

    def test_empty_raises(self):
        """빈 값은 ValueError 발생"""
        with pytest.raises(ValueError, match="비어 있습니다"):
            normalize_vapid_subject("")

    def test_whitespace_only_raises(self):
        """공백만 있는 값은 ValueError 발생"""
        with pytest.raises(ValueError, match="비어 있습니다"):
            normalize_vapid_subject("   ")


# ── endpoint 호스트 추출 테스트 ──

class TestGetEndpointHost:
    def test_apple_endpoint(self):
        assert _get_endpoint_host("https://web.push.apple.com/abc123") == "web.push.apple.com"

    def test_google_endpoint(self):
        assert _get_endpoint_host("https://fcm.googleapis.com/fcm/send/abc") == "fcm.googleapis.com"

    def test_invalid_url(self):
        assert _get_endpoint_host("not-a-url") == "unknown"


# ── payload 빌드 테스트 ──

class TestBuildPayload:
    def test_payload_contains_required_fields(self):
        import json
        payload = json.loads(_build_payload(order_id=100, order_number=5))
        assert payload["title"] == "평택중앙교회 카페"
        assert "#5번" in payload["body"]
        assert payload["tag"] == "order-ready-100"
        assert payload["url"] == "/order/status/100"
        assert payload["type"] == "ORDER_READY"
        assert payload["badge"] == "/pwa-192.png"

    def test_payload_korean_not_escaped(self):
        """한글이 유니코드 이스케이프 없이 직접 포함되는지 확인"""
        raw = _build_payload(order_id=1, order_number=1)
        assert "주문하신" in raw
        assert "\\u" not in raw


# ── 푸시 발송 서비스 통합 테스트 ──

class TestSendOrderReadyPushes:
    """
    send_order_ready_pushes 함수의 핵심 시나리오를 검증한다.
    DB는 실제 SQLite 인메모리를 사용하고, webpush 호출만 mock한다.
    """

    @pytest.fixture(autouse=True)
    def setup_db(self, db_session):
        """테스트용 주문 및 구독 데이터를 생성한다."""
        self.db = db_session

        from datetime import date

        # 주문 생성
        order = models.Order(
            user_id=None,
            user_duty_snapshot="성도",
            user_name_snapshot="테스트",
            total_price=2000,
            payment_method="BANK_TRANSFER",
            status="READY",
            order_number=1,
            order_date=date.today(),
        )
        db_session.add(order)
        db_session.commit()
        self.order_id = order.id

    def _add_subscription(self, endpoint="https://web.push.apple.com/test123"):
        """테스트용 구독을 추가한다."""
        sub = models.PushSubscription(
            order_id=self.order_id,
            endpoint=endpoint,
            p256dh="test_p256dh_key",
            auth="test_auth_key",
        )
        self.db.add(sub)
        self.db.commit()
        return sub.id

    @patch("services.push_service.SessionLocal")
    @patch("services.push_service.webpush")
    def test_success_path(self, mock_webpush, mock_session_local):
        """
        8.1 성공 경로: webpush 성공 → 해당 구독만 삭제
        """
        sub_id = self._add_subscription()
        mock_session_local.return_value = self.db

        # webpush 성공 (예외 없음)
        mock_webpush.return_value = None

        send_order_ready_pushes(self.order_id, 1)

        # webpush가 1회 호출되었는지 확인
        assert mock_webpush.call_count == 1

        # TTL 3600, timeout 10 확인
        call_kwargs = mock_webpush.call_args[1]
        assert call_kwargs["ttl"] == 3600
        assert call_kwargs["timeout"] == 10

        # 성공한 구독이 삭제되었는지 확인
        remaining = self.db.query(models.PushSubscription).filter(
            models.PushSubscription.id == sub_id
        ).first()
        assert remaining is None

    @patch("services.push_service.SessionLocal")
    @patch("services.push_service.webpush")
    def test_no_targets(self, mock_webpush, mock_session_local):
        """
        8.2 대상 구독 없음: 예외 없이 정상 종료, webpush 호출 없음
        """
        mock_session_local.return_value = self.db

        # 구독 없이 호출
        send_order_ready_pushes(self.order_id, 1)

        assert mock_webpush.call_count == 0

    @patch("services.push_service.SessionLocal")
    @patch("services.push_service.webpush")
    def test_expired_endpoint_404(self, mock_webpush, mock_session_local):
        """
        8.3 만료 endpoint (404): 해당 구독 삭제
        """
        sub_id = self._add_subscription()
        mock_session_local.return_value = self.db

        from pywebpush import WebPushException
        mock_response = MagicMock()
        mock_response.status_code = 404
        mock_response.text = "Not Found"
        mock_webpush.side_effect = WebPushException("Not Found", response=mock_response)

        send_order_ready_pushes(self.order_id, 1)

        remaining = self.db.query(models.PushSubscription).filter(
            models.PushSubscription.id == sub_id
        ).first()
        assert remaining is None

    @patch("services.push_service.SessionLocal")
    @patch("services.push_service.webpush")
    def test_expired_endpoint_410(self, mock_webpush, mock_session_local):
        """
        8.3 만료 endpoint (410 Gone): 해당 구독 삭제
        """
        sub_id = self._add_subscription()
        mock_session_local.return_value = self.db

        from pywebpush import WebPushException
        mock_response = MagicMock()
        mock_response.status_code = 410
        mock_response.text = "Gone"
        mock_webpush.side_effect = WebPushException("Gone", response=mock_response)

        send_order_ready_pushes(self.order_id, 1)

        remaining = self.db.query(models.PushSubscription).filter(
            models.PushSubscription.id == sub_id
        ).first()
        assert remaining is None

    @patch("services.push_service.SessionLocal")
    @patch("services.push_service.webpush")
    def test_auth_error_keeps_subscription(self, mock_webpush, mock_session_local):
        """
        8.4 인증/구성 오류 (401): 구독 유지, 재시도하지 않음
        """
        sub_id = self._add_subscription()
        mock_session_local.return_value = self.db

        from pywebpush import WebPushException
        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_response.text = "Unauthorized"
        mock_webpush.side_effect = WebPushException("Unauthorized", response=mock_response)

        send_order_ready_pushes(self.order_id, 1)

        # 구독이 유지되어야 함
        remaining = self.db.query(models.PushSubscription).filter(
            models.PushSubscription.id == sub_id
        ).first()
        assert remaining is not None

        # 재시도 없이 1회만 호출
        assert mock_webpush.call_count == 1

    @patch("services.push_service.SessionLocal")
    @patch("services.push_service.webpush")
    def test_forbidden_keeps_subscription(self, mock_webpush, mock_session_local):
        """
        8.4 인증/구성 오류 (403): 구독 유지
        """
        sub_id = self._add_subscription()
        mock_session_local.return_value = self.db

        from pywebpush import WebPushException
        mock_response = MagicMock()
        mock_response.status_code = 403
        mock_response.text = "Forbidden"
        mock_webpush.side_effect = WebPushException("Forbidden", response=mock_response)

        send_order_ready_pushes(self.order_id, 1)

        remaining = self.db.query(models.PushSubscription).filter(
            models.PushSubscription.id == sub_id
        ).first()
        assert remaining is not None

    @patch("services.push_service.RETRY_BACKOFF_SECONDS", 0)
    @patch("services.push_service.SessionLocal")
    @patch("services.push_service.webpush")
    def test_temporary_error_retries_then_keeps(self, mock_webpush, mock_session_local):
        """
        8.5 일시 오류 (429): 최대 2회 재시도, 최종 실패 시 구독 유지
        """
        sub_id = self._add_subscription()
        mock_session_local.return_value = self.db

        from pywebpush import WebPushException
        mock_response = MagicMock()
        mock_response.status_code = 429
        mock_response.text = "Too Many Requests"
        mock_webpush.side_effect = WebPushException("Rate Limited", response=mock_response)

        send_order_ready_pushes(self.order_id, 1)

        # 2회 시도 (1차 + 1회 재시도)
        assert mock_webpush.call_count == 2

        # 구독이 유지되어야 함
        remaining = self.db.query(models.PushSubscription).filter(
            models.PushSubscription.id == sub_id
        ).first()
        assert remaining is not None

    @patch("services.push_service.RETRY_BACKOFF_SECONDS", 0)
    @patch("services.push_service.SessionLocal")
    @patch("services.push_service.webpush")
    def test_server_error_retries(self, mock_webpush, mock_session_local):
        """
        8.5 일시 오류 (500): 1차 실패 → 재시도 성공
        """
        sub_id = self._add_subscription()
        mock_session_local.return_value = self.db

        from pywebpush import WebPushException
        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_response.text = "Internal Server Error"

        # 1차 실패, 2차 성공
        mock_webpush.side_effect = [
            WebPushException("Server Error", response=mock_response),
            None,
        ]

        send_order_ready_pushes(self.order_id, 1)

        assert mock_webpush.call_count == 2

        # 성공했으므로 구독 삭제
        remaining = self.db.query(models.PushSubscription).filter(
            models.PushSubscription.id == sub_id
        ).first()
        assert remaining is None

    @patch("services.push_service.SessionLocal")
    @patch("services.push_service.webpush")
    def test_push_failure_does_not_affect_order_status(self, mock_webpush, mock_session_local):
        """
        8.6 푸시 실패가 주문 상태에 영향을 주지 않는지 확인
        """
        self._add_subscription()
        mock_session_local.return_value = self.db

        from pywebpush import WebPushException
        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_response.text = "Server Error"
        mock_webpush.side_effect = WebPushException("Error", response=mock_response)

        send_order_ready_pushes(self.order_id, 1)

        # 주문 상태가 여전히 READY인지 확인
        order = self.db.query(models.Order).filter(
            models.Order.id == self.order_id
        ).first()
        assert order.status == "READY"

    @patch("services.push_service.SessionLocal")
    @patch("services.push_service.webpush")
    def test_payload_fields(self, mock_webpush, mock_session_local):
        """payload에 tag, type, url, badge 필드가 포함되는지 확인"""
        self._add_subscription()
        mock_session_local.return_value = self.db
        mock_webpush.return_value = None

        send_order_ready_pushes(self.order_id, 1)

        import json
        call_kwargs = mock_webpush.call_args[1]
        payload = json.loads(call_kwargs["data"])
        assert "tag" in payload
        assert "type" in payload
        assert "url" in payload
        assert "badge" in payload
        assert payload["type"] == "ORDER_READY"
