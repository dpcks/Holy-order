/*
[File Role]
URL 및 네트워크 관련 유틸리티 함수들을 정의합니다.
개발 환경(localhost, .local, IP)과 운영 환경에 따른 URL 변환 로직을 포함합니다.
*/

export const getWsUrl = (): string => {
  // 1. 환경변수가 존재할 경우 최우선 사용 (Vercel 프로덕션 환경 등)
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }

  const { hostname, protocol } = window.location;
  
  // 2. WebSocket 프로토콜 결정 (HTTPS -> wss, HTTP -> ws)
  const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';
  
  // 3. 개발 환경 여부 판단
  // - localhost
  // - .local (mDNS, Mac/iOS 로컬 호스트네임)
  // - IP 주소 형식 (192.168.x.x 등)
  const isLocal = 
    hostname === 'localhost' || 
    hostname.endsWith('.local') || 
    /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);
    
  // 4. 로컬 환경인 경우 포트 8000으로 연결 (Docker/Localhost 개발)
  // 운영 환경인 경우 동일 호스트 사용
  const targetHost = isLocal ? `${hostname}:8000` : window.location.host;
  
  return `${wsProtocol}//${targetHost}/ws`;
};
