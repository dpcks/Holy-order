/**
 * [File Role]
 * PWA 웹 푸시 알림 관련 공용 유틸리티 모듈.
 * 중복된 push 로직(base64 변환, VAPID 키 조회, 구독 생성, 주문 등록)을
 * 하나의 모듈로 통합하여 Home, Cart, OrderStatus에서 재사용한다.
 *
 * [아키텍처 위치]
 * frontend/src/utils/push.ts
 * ├─ Home.tsx → handleAllowPush
 * ├─ Cart.tsx → 주문 생성 직후 구독 등록
 * └─ OrderStatus.tsx → fallback 등록
 */

import { apiClient } from '../api/client';
import type { StandardResponse } from '../types';

// ── 결과 타입 정의 ──

export type PushSetupResult =
  | { status: 'subscribed'; subscription: PushSubscription }
  | { status: 'permission-denied' }
  | { status: 'permission-default' }
  | { status: 'unsupported' }
  | { status: 'not-installed-ios-pwa' }
  | { status: 'failed'; error: unknown };

// ── 환경 감지 헬퍼 ──

/** Service Worker와 PushManager가 지원되는 브라우저인지 확인 */
export const isPushSupported = (): boolean => {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
};

/** iOS/iPadOS 기기인지 확인 */
export const isIosDevice = (): boolean => {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
};

/** 홈 화면에 설치된 PWA(standalone 모드)인지 확인 */
export const isStandalonePwa = (): boolean => {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
};

// ── base64url 변환 ──

/** base64url 인코딩된 문자열을 Uint8Array로 변환 (VAPID 공개키용) */
export const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
};

// ── VAPID 공개키 조회 ──

/** 서버에서 VAPID 공개키를 조회한다 */
export const getVapidPublicKey = async (): Promise<string | null> => {
  try {
    const res = await apiClient.get<
      { publicKey: string },
      StandardResponse<{ publicKey: string }>
    >('/orders/vapid-key', {
      headers: { 'X-Skip-Error-Toast': 'true' },
    });
    if (res.success && res.data?.publicKey) {
      return res.data.publicKey;
    }
    console.error('[Push] VAPID 키 조회 실패:', res.message);
    return null;
  } catch (e) {
    console.error('[Push] VAPID 키 조회 오류:', e);
    return null;
  }
};

// ── PushSubscription 생성/재사용 ──

/**
 * 기존 PushSubscription을 재사용하거나 새로 생성한다.
 * 왜 VAPID 키 비교: 서버의 VAPID 키가 변경된 경우 기존 구독이 무효화되므로
 * applicationServerKey를 비교하여 불일치 시 재구독한다.
 */
export const getOrCreatePushSubscription = async (): Promise<PushSetupResult> => {
  // 1. 지원 여부 확인
  if (!isPushSupported()) {
    return { status: 'unsupported' };
  }

  // 2. iOS 홈 화면 PWA 확인
  if (isIosDevice() && !isStandalonePwa()) {
    return { status: 'not-installed-ios-pwa' };
  }

  // 3. 알림 권한 확인
  if (Notification.permission === 'denied') {
    return { status: 'permission-denied' };
  }

  if (Notification.permission === 'default') {
    return { status: 'permission-default' };
  }

  try {
    // 4. VAPID 공개키 조회
    const vapidPublicKey = await getVapidPublicKey();
    if (!vapidPublicKey) {
      return { status: 'failed', error: new Error('VAPID 키 조회 실패') };
    }

    // 5. Service Worker ready 대기
    const registration = await navigator.serviceWorker.ready;

    // 6. 기존 구독 무효화 및 신규 발급 (토큰 꼬임 원천 방지)
    // 왜 기존 구독 해제: 앱 재설치나 OS 알림 권한 재설정 시 브라우저에 남은 옛날 만료 토큰이
    // 그대로 재사용되는 현상을 방지하기 위해, 항상 기존 구독을 해제하고 완전히 새로운 토큰을 발급받는다.
    let subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      try {
        console.log('[Push] 기존 푸시 구독 해제 및 신규 토큰 발급 시도');
        await subscription.unsubscribe();
      } catch (err) {
        console.warn('[Push] 기존 구독 해제 중 예외 발생 (무시 후 신규 구독 진행):', err);
      }
      subscription = null;
    }

    // 7. 항상 깨끗한 신규 PushSubscription 생성
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey).buffer as ArrayBuffer,
    });

    return { status: 'subscribed', subscription };
  } catch (e) {
    console.error('[Push] 구독 생성 실패:', e);
    return { status: 'failed', error: e };
  }
};

// ── 주문별 서버 등록 ──

/**
 * 특정 주문에 PushSubscription을 서버에 등록한다.
 * 왜 별도 함수: 주문 생성 직후(Cart)와 상태 페이지 진입 시(OrderStatus) 모두에서
 * 동일한 등록 로직을 사용하기 위함.
 *
 * 실패 시 주문 자체에는 영향을 주지 않는다.
 */
export const registerOrderPushSubscription = async (
  orderId: number,
): Promise<boolean> => {
  try {
    const result = await getOrCreatePushSubscription();

    if (result.status !== 'subscribed') {
      console.warn(`[Push] 구독 등록 불가: ${result.status}`);
      return false;
    }

    await apiClient.post(`/orders/${orderId}/push-subscribe`, {
      subscription: result.subscription,
    }, {
      headers: { 'X-Skip-Error-Toast': 'true' },
    });

    console.log(`✅ [Push] 주문 #${orderId} 푸시 알림 등록 완료`);
    return true;
  } catch (e) {
    console.error(`❌ [Push] 주문 #${orderId} 푸시 구독 등록 실패:`, e);
    return false;
  }
};
