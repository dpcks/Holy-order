# [File Role]
# 역할: PWA 웹 푸시 연동에 필요한 VAPID(Voluntary Application Server Identification) 키 쌍을 생성하는 유틸리티 스크립트입니다.
# 위치: backend/generate_vapid_keys.py

import base64
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization

def generate_vapid_keys():
    """
    Web Push 표준 규격(RFC 8292)을 만족하는 VAPID 키 쌍을 생성하여 
    개발 서버의 .env 설정 포맷에 맞게 출력합니다.
    """
    print("🔑 VAPID 비대칭 키 쌍 생성을 시작합니다...")
    
    # 1. NIST P-256 (SECP256R1) 곡선을 이용하여 개인키 생성
    private_key = ec.generate_private_key(ec.SECP256R1())
    public_key = private_key.public_key()
    
    # 2. 개인키를 DER 포맷으로 직렬화 (PKCS#8 규격 적용)
    private_der = private_key.private_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption()
    )
    
    # 3. 공개키를 Web Push 명세에서 요구하는 X9.62 비압축 포인트(Uncompressed Point, 65바이트) 형태로 추출
    public_der = public_key.public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.UncompressedPoint
    )
    
    # 4. Base64url 인코딩 수행 (패딩 문자 '=' 제거 필수)
    private_base64 = base64.urlsafe_b64encode(private_der).decode('utf-8').rstrip('=')
    public_base64 = base64.urlsafe_b64encode(public_der).decode('utf-8').rstrip('=')
    
    print("\n아래 환경 변수 설정을 복사하여 backend/.env 파일에 추가해 주세요:\n")
    print(f"VAPID_PUBLIC_KEY={public_base64}")
    print(f"VAPID_PRIVATE_KEY={private_base64}")
    print("VAPID_CLAIM_EMAIL=admin@example.com\n")

if __name__ == "__main__":
    generate_vapid_keys()
