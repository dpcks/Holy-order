import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: '평택중앙교회 카페',
        short_name: '미션 카페',
        description: '평택중앙교회 스마트 주문 시스템',
        theme_color: '#0D9488',
        background_color: '#F9FAFB',
        display: 'standalone',
        start_url: '/',
        orientation: 'portrait',
        icons: [
          {
            src: 'favicon.svg',
            sizes: '192x192 512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          },
          {
            src: 'pwa-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          }
        ]
      },
      devOptions: {
        enabled: true,
        type: 'module'
      }
    })
  ],
  build: {
    // 벤더 청크 분리 외에 개별적인 청크 사이즈 경고 수치 조정
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // 상세한 수동 청크 분리가 필요한 경우 여기서 정의할 수 있습니다.
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // 1. React 코어
            if (id.includes('react-dom') || id.includes('react-router-dom') || id.includes('react/')) {
              return 'vendor-react';
            }
            // 2. 데이터 관리 (TanStack Query)
            if (id.includes('@tanstack/react-query')) {
              return 'vendor-query';
            }
            // 3. 아이콘 (Lucide React) - 용량이 큰 편이라 분리 권장
            if (id.includes('lucide-react')) {
              return 'vendor-icons';
            }
            // 4. 유틸리티 (Axios, date-fns 등)
            if (id.includes('axios') || id.includes('date-fns')) {
              return 'vendor-utils';
            }
            // 5. 드래그 앤 드롭 (Dnd Kit)
            if (id.includes('@dnd-kit')) {
              return 'vendor-dnd';
            }
            // 그 외 모든 외부 라이브러리는 vendor 청크로
            return 'vendor';
          }
        },
      },
    },
  },
  server: {
    host: true,
    port: 5173,
  },
})
