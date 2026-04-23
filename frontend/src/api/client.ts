import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || `http://${window.location.hostname}:8000/api/v1`;

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

import type { StandardResponse } from '../types';
export type { StandardResponse };

// 응답 인터셉터: 데이터 추출 및 공통 에러 처리
apiClient.interceptors.response.use(
  (response) => {
    // 성공 시 데이터 필드만 반환 (StandardResponse 구조)
    return response.data;
  },
  (error) => {
    let message = '알 수 없는 오류가 발생했습니다.';

    if (error.response) {
      // 1. 서버에서 응답이 온 경우 (상태 코드 존재)
      const { status, data } = error.response;
      // FastAPI의 경우 에러 메시지가 보통 detail 필드에 담겨 옴
      const serverDetail = data?.detail || data?.message;

      switch (status) {
        case 400:
          message = serverDetail || '요청이 올바르지 않습니다. 다시 확인해 주세요.';
          break;
        case 401:
          message = '인증 정보가 없거나 만료되었습니다.';
          break;
        case 403:
          message = '접근 권한이 없습니다.';
          break;
        case 404:
          message = serverDetail || '요청하신 정보를 찾을 수 없습니다.';
          break;
        case 422:
          message = '입력 데이터 형식이 올바르지 않습니다.';
          break;
        case 500:
          message = '서버 내부 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
          break;
        default:
          message = serverDetail || message;
      }
      console.error(`[API Error ${status}]:`, serverDetail || data);
    } else if (error.request) {
      // 2. 요청은 보냈으나 응답이 없는 경우 (네트워크 단절 등)
      message = '서버와의 통신이 원활하지 않습니다. Wi-Fi 상태를 확인해 주세요.';
      console.error('[API Network Error]: No response received');
    } else {
      // 3. 기타 에러
      message = error.message;
      console.error('[API Error]:', error.message);
    }

    // 사용자 피드백 (Toast 라이브러리 부재로 인한 임시 alert)
    // TODO: 전역 Toast 시스템 도입 시 교체 권장
    if (typeof window !== 'undefined') {
      alert(message);
    }

    return Promise.reject(error);
  }
);
