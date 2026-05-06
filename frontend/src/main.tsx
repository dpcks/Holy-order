import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'

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
