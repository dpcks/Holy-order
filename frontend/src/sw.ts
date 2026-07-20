/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';

declare let self: ServiceWorkerGlobalScope;

// 1. 프리캐시 리스트 및 라우팅 등록
precacheAndRoute(self.__WB_MANIFEST);

// 2. 만료된 캐시 청소
cleanupOutdatedCaches();

// 3. PWA 즉각 활성화
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// 4. 백그라운드 웹 푸시 알림 수신 이벤트 처리
self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const payload = event.data.json();
    const title = payload.title || '평택중앙교회 카페';
    const options: any = {
      body: payload.body || '제조가 완료 되었습니다. 메뉴를 픽업해주세요',
      icon: payload.icon || '/pwa-192.png',
      data: {
        url: payload.url || '/'
      }
    };

    event.waitUntil(
      self.registration.showNotification(title, options)
    );
  } catch (e) {
    // 문자열 데이터 포백 처리
    const text = event.data.text();
    event.waitUntil(
      self.registration.showNotification('평택중앙교회 카페', {
        body: text || '제조가 완료 되었습니다. 메뉴를 픽업해주세요',
        icon: '/pwa-192.png'
      } as any)
    );
  }
});

// 5. 알림 배너 터치/클릭 시 포커싱 및 페이지 이동 처리
self.addEventListener('notificationclick', (event) => {
  event.notification.close(); // 알림 배너 닫기

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // 5-1. 이미 켜져 있는 창이 있다면 포커싱 후 이동
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.navigate(targetUrl).then((c) => c?.focus());
        }
      }
      // 5-2. 켜져 있는 창이 없다면 새 창 열기
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
