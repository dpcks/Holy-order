import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

import { StandardResponse } from '../types';
export type { StandardResponse };

// 응답 인터셉터를 추가하여 StandardResponse 구조에서 data만 추출하거나 에러를 처리할 수 있음
apiClient.interceptors.response.use(
  (response) => {
    // 모든 API가 StandardResponse를 반환한다고 가정
    return response.data;
  },
  (error) => {
    console.error('API Error:', error);
    return Promise.reject(error);
  }
);
