/// <reference types="vite-plugin-pwa/client" />
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import { registerSW } from 'virtual:pwa-register'

// Service Worker 수동 등록 (PWA 훅업)
registerSW({ immediate: true })

// iOS Safari 두 손가락 핀치 줌 제스처 차단 (네이티브 앱 UX 구현)
document.addEventListener('gesturestart', (e) => {
  e.preventDefault();
});
document.addEventListener('gesturechange', (e) => {
  e.preventDefault();
});
document.addEventListener('gestureend', (e) => {
  e.preventDefault();
});

// 5분 staleTime을 기본값으로 설정. 각 페이지에서 필요에 따라 개별 오버라이드 가능
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5분
      retry: 1,                  // 실패 시 1회 재시도
      refetchOnWindowFocus: false, // 탭 전환 시 자동 리페치 비활성 (WebSocket이 있으므로 불필요)
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
