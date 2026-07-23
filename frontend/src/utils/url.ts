/*
[File Role]
URL 및 네트워크 관련 유틸리티 함수들을 정의합니다.
개발 환경(localhost, .local, IP)과 운영 환경에 따른 URL 변환 로직을 포함합니다.

[getWsUrl 우선순위]
1. VITE_WS_URL 환경변수
2. VITE_API_BASE_URL에서 WebSocket URL 파생
3. 로컬 개발 fallback (hostname:8000)
4. 현재 origin fallback
*/

/**
 * wss:// 또는 ws:// 형식의 WebSocket URL을 반환한다.
 * 결과는 항상 /ws 경로로 끝난다.
 */
export const getWsUrl = (): string => {
  // 1. VITE_WS_URL 최우선 (Vercel 환경변수)
  const envWsUrl = import.meta.env.VITE_WS_URL as string | undefined;
  if (envWsUrl) {
    try {
      const url = new URL(envWsUrl);
      // https/http → wss/ws 정규화
      const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${protocol}//${url.host}/ws`;
    } catch {
      console.error('[getWsUrl] VITE_WS_URL이 유효하지 않은 URL입니다:', envWsUrl);
      // 아래 단계로 계속 진행
    }
  }

  // 2. VITE_API_BASE_URL에서 파생 (예: https://backend.example.com/api/v1 → wss://backend.example.com/ws)
  const envApiUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (envApiUrl) {
    try {
      const url = new URL(envApiUrl);
      const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${protocol}//${url.host}/ws`;
    } catch {
      console.error('[getWsUrl] VITE_API_BASE_URL이 유효하지 않은 URL입니다:', envApiUrl);
      // 아래 단계로 계속 진행
    }
  }

  const { hostname, protocol } = window.location;

  // 3. WebSocket 프로토콜 결정 (HTTPS → wss, HTTP → ws)
  const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';

  // 4. 개발 환경 여부 판단
  //    - localhost
  //    - .local (mDNS, Mac/iOS 로컬 호스트네임)
  //    - IP 주소 형식 (192.168.x.x 등)
  const isLocal =
    hostname === 'localhost' ||
    hostname.endsWith('.local') ||
    /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);

  // 5. 로컬: 포트 8000으로 연결 / 운영: 동일 호스트 사용
  const targetHost = isLocal ? `${hostname}:8000` : window.location.host;

  return `${wsProtocol}//${targetHost}/ws`;
};
