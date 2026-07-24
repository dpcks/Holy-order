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
// 서버에서 전송된 payload의 badge, tag, type 필드를 지원하여
// iOS/Android 모두에서 올바른 시스템 알림을 표시한다.
self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const payload = event.data.json();
    const title = payload.title || '평택중앙교회 카페';
    
    // iOS Safari 호환성: 상대 경로 대신 self.location.origin 기반 절대 URL 생성
    const iconUrl = payload.icon ? new URL(payload.icon, self.location.origin).href : new URL('/pwa-192.png', self.location.origin).href;
    const badgeUrl = payload.badge ? new URL(payload.badge, self.location.origin).href : new URL('/img/design/android_ silhouette.svg', self.location.origin).href;

    // TypeScript 사양 확장: 안드로이드 PWA 전용 vibrate/renotify 옵션 지원
    interface ExtendedNotificationOptions extends NotificationOptions {
      vibrate?: number[];
      renotify?: boolean;
    }

    const options: ExtendedNotificationOptions = {
      body: payload.body || '제조가 완료 되었습니다. 메뉴를 픽업해주세요',
      icon: iconUrl,
      badge: badgeUrl,
      tag: payload.tag,
      vibrate: [200, 100, 200, 100, 300], // 안드로이드 기기 진동 패턴
      renotify: true, // 동일 태그 재알림 허용 (안드로이드 상단바 진동/알림 강제)
      data: {
        url: payload.url || '/',
        type: payload.type,
      },
    };

    event.waitUntil(
      self.registration.showNotification(title, options as NotificationOptions)
    );
  } catch {
    // 문자열 데이터 폴백 처리
    const text = event.data ? event.data.text() : '';
    const fallbackIcon = new URL('/pwa-192.png', self.location.origin).href;
    const fallbackBadge = new URL('/img/design/android_ silhouette.svg', self.location.origin).href;
    event.waitUntil(
      self.registration.showNotification('평택중앙교회 카페', {
        body: text || '제조가 완료 되었습니다. 메뉴를 픽업해주세요',
        icon: fallbackIcon,
        badge: fallbackBadge,
      })
    );
  }
});

// 5. 알림 배너 터치/클릭 시 포커싱 및 페이지 이동 처리
// 왜 Origin 검증: 외부 URL을 열어 보안 문제가 발생하는 것을 방지한다.
self.addEventListener('notificationclick', (event) => {
  event.notification.close(); // 알림 배너 닫기

  let targetUrl = event.notification.data?.url || '/';

  // 외부 Origin URL 차단: 절대 URL이면서 같은 Origin이 아닌 경우 '/'로 fallback
  try {
    if (targetUrl.startsWith('http://') || targetUrl.startsWith('https://')) {
      const targetOrigin = new URL(targetUrl).origin;
      if (targetOrigin !== self.location.origin) {
        targetUrl = '/';
      }
    }
  } catch {
    // URL 파싱 실패 시 안전하게 '/'로 이동
    targetUrl = '/';
  }

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
