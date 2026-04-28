/*
[File Role]
URL 및 네트워크 관련 유틸리티 함수들을 정의합니다.
개발 환경(localhost, .local, IP)과 운영 환경에 따른 URL 변환 로직을 포함합니다.
*/

export const getWsUrl = (): string => {
  const { hostname, protocol } = window.location;
  
  // 1. WebSocket 프로토콜 결정 (HTTPS -> wss, HTTP -> ws)
  const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';
  
  // 2. 개발 환경 여부 판단
  // - localhost
  // - .local (mDNS, Mac/iOS 로컬 호스트네임)
  // - IP 주소 형식 (192.168.x.x 등)
  const isLocal = 
    hostname === 'localhost' || 
    hostname.endsWith('.local') || 
    /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);
    
  // 3. 포트 결정
  // 로컬 개발 환경에서는 백엔드가 8000 포트에서 실행됨을 가정
  const wsPort = isLocal ? ':8000' : '';
  
  // 4. 환경 변수가 명시적으로 지정된 경우 우선 사용
  const envWsUrl = import.meta.env.VITE_WS_URL;
  if (envWsUrl) return envWsUrl;
  
  return `${wsProtocol}//${hostname}${wsPort}/ws`;
};
