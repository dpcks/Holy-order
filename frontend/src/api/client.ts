import axios from 'axios';
import toast from 'react-hot-toast';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || `http://${window.location.hostname}:8000/api/v1`;

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 요청 인터셉터: 관리자 API 요청 시 토큰 자동 포함
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('adminToken');
  // URL이 /admin으로 시작하거나 관리자 API(/api/v1/admin)로 향하는 경우 토큰 포함
  if (token && config.url && (config.url.includes('/admin') || config.url.includes('/api/v1/admin'))) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 응답 인터셉터: 401 에러 처리
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.warn('🔒 [Auth] 인증이 만료되었습니다. 로그아웃 처리합니다.');
      localStorage.removeItem('adminToken');
      // 현재 페이지가 관리자 영역이면 로그인 페이지로 강제 이동
      if (window.location.pathname.startsWith('/admin')) {
        window.location.href = '/admin/login';
      }
    }
    return Promise.reject(error);
  }
);

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

    // 사용자 피드백 (Toast 시스템 적용)
    if (typeof window !== 'undefined') {
      toast.error(message);
    }

    return Promise.reject(error);
  }
);
