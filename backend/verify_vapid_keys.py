"""
[File Role]
VAPID 공개키/개인키 쌍이 일치하는지 검증하는 스크립트.
개인키에서 공개키를 파생하여 현재 환경변수의 VAPID_PUBLIC_KEY와 비교한다.

[사용법]
  python verify_vapid_keys.py

[규칙]
- 키를 자동으로 새로 생성하지 않음
- 개인키 전체를 로그에 출력하지 않음
- 불일치 시 배포 완료로 보고하지 않음
"""

import base64
import sys

from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.backends import default_backend

from config import settings


def base64url_decode(data: str) -> bytes:
    """base64url 디코딩 (패딩 자동 보정)"""
    padding = 4 - len(data) % 4
    if padding != 4:
        data += "=" * padding
    return base64.urlsafe_b64decode(data)


def base64url_encode(data: bytes) -> str:
    """base64url 인코딩 (패딩 제거)"""
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def derive_public_from_private(private_key_b64url: str) -> str:
    """VAPID 개인키(base64url)에서 공개키(base64url)를 파생한다."""
    raw_private = base64url_decode(private_key_b64url)

    try:
        # 1. DER 형식 시도
        private_key = serialization.load_der_private_key(
            raw_private, password=None, backend=default_backend()
        )
    except Exception:
        # 2. Raw 32바이트 스칼라 시도
        private_key = ec.derive_private_key(
            int.from_bytes(raw_private, byteorder="big"),
            ec.SECP256R1(),
            default_backend(),
        )

    # 공개키를 비압축 포인트(65바이트)로 추출
    public_key = private_key.public_key()
    public_bytes = public_key.public_bytes(
        serialization.Encoding.X962,
        serialization.PublicFormat.UncompressedPoint,
    )

    return base64url_encode(public_bytes)


def main():
    print("🔑 VAPID 키 쌍 검증")
    print(f"   개인키: {settings.VAPID_PRIVATE_KEY[:8]}...***")
    print(f"   공개키: {settings.VAPID_PUBLIC_KEY[:16]}...***")
    print(f"   이메일: {settings.VAPID_CLAIM_EMAIL}")
    print()

    try:
        derived_public = derive_public_from_private(settings.VAPID_PRIVATE_KEY)
    except Exception as e:
        print(f"❌ 개인키에서 공개키 파생 실패: {type(e).__name__}: {e}")
        print("   개인키 형식이 올바른지 확인해 주세요.")
        sys.exit(1)

    # 비교 시 패딩 차이를 제거하여 정규화 비교
    current_public = settings.VAPID_PUBLIC_KEY.rstrip("=")
    derived_public_stripped = derived_public.rstrip("=")

    if current_public == derived_public_stripped:
        print("✅ VAPID public/private pair: MATCH")
        print("   키 쌍이 정상적으로 일치합니다.")
    else:
        print("❌ VAPID public/private pair: MISMATCH")
        print(f"   현재 공개키:   {current_public[:20]}...")
        print(f"   파생된 공개키: {derived_public_stripped[:20]}...")
        print()
        print("   ⚠️ 키가 불일치합니다!")
        print("   → Push Service가 401/403을 반환할 수 있습니다.")
        print("   → 키를 교체하면 기존 PWA 사용자 전원의 재구독이 필요합니다.")
        print("   → 임의로 새 키를 생성하지 마세요. 운영자와 상의하세요.")
        sys.exit(1)

    # VAPID subject 정규화 확인
    email = settings.VAPID_CLAIM_EMAIL.strip()
    if email.startswith("mailto:mailto:"):
        print(f"\n⚠️ VAPID_CLAIM_EMAIL 정규화 수정 필요: '{email}'")
        print("   'mailto:' 접두사가 중복되어 있습니다.")
    elif not email.startswith("mailto:") and not email.startswith("https://"):
        print(f"\n📌 VAPID_CLAIM_EMAIL 정규화: '{email}' → 'mailto:{email}'")
        print("   코드에서 자동으로 mailto: 접두사를 추가합니다.")
    else:
        print(f"\n✅ VAPID_CLAIM_EMAIL 정규화: 정상 ('{email}')")


if __name__ == "__main__":
    main()
