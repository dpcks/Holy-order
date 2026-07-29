/**
 * [File Role] PWA 익명 설치 식별자 관리, standalone 판정, heartbeat 전송 유틸리티
 * - 사용자 PWA와 관리자 PWA의 독립적인 localStorage installation_id 관리
 * - standalone 실행 시에만 익명 installation_id를 주문 요청에 전달
 * - iPhone Safari 등 미지원 환경에서는 설치 여부를 false로 단정하지 않고 null로 처리
 */

import { apiClient } from '../api/client';
import type { StandardResponse } from '../types';

export type PwaAppType = 'USER' | 'ADMIN';
export type PwaPlatform = 'IOS' | 'ANDROID' | 'DESKTOP' | 'UNKNOWN';
export type PwaBrowserFamily = 'SAFARI' | 'CHROME' | 'EDGE' | 'FIREFOX' | 'OTHER' | 'UNKNOWN';
export type PwaDetectionMethod = 'STANDALONE_LAUNCH' | 'APPINSTALLED_EVENT' | 'RELATED_APPS' | 'UNKNOWN';
export type PushPermissionState = 'GRANTED' | 'DENIED' | 'DEFAULT' | 'UNSUPPORTED' | 'UNKNOWN';

export interface PwaInstallState {
  isRunningStandalone: boolean;
  isInstalledOnDevice: boolean | null;
  detectionMethod: PwaDetectionMethod;
  platform: PwaPlatform;
  browserFamily: PwaBrowserFamily;
  pushPermission: PushPermissionState;
}

export interface PwaHeartbeatResponse {
  status: 'created' | 'updated' | 'unchanged' | 'ignored';
  app_type: string;
  reason?: string;
  admin_id?: number;
}

const STORAGE_KEYS = {
  USER_ID: 'holy-order:pwa-installation-id:user',
  ADMIN_ID: 'holy-order:pwa-installation-id:admin',
  USER_LAST_REPORT: 'holy-order:pwa-installation-last-report:user',
  ADMIN_LAST_REPORT: 'holy-order:pwa-installation-last-report:admin',
};

// 6시간 throttling
const REPORT_THROTTLE_MS = 6 * 60 * 60 * 1000;

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  const isStandaloneMedia = window.matchMedia('(display-mode: standalone)').matches;
  const isNavigatorStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return isStandaloneMedia || isNavigatorStandalone;
}

export function detectPwaPlatform(): PwaPlatform {
  if (typeof window === 'undefined') return 'UNKNOWN';
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    return 'IOS';
  }
  if (/Android/.test(ua)) {
    return 'ANDROID';
  }
  if (/Windows|Macintosh|Linux/.test(ua)) {
    return 'DESKTOP';
  }
  return 'UNKNOWN';
}

export function detectBrowserFamily(): PwaBrowserFamily {
  if (typeof window === 'undefined') return 'UNKNOWN';
  const ua = navigator.userAgent || '';
  if (/Edg\//i.test(ua) || /EdgiOS/i.test(ua)) return 'EDGE';
  if (/Firefox\//i.test(ua) || /FxiOS/i.test(ua)) return 'FIREFOX';
  if (/Chrome\//i.test(ua) || /CriOS/i.test(ua)) return 'CHROME';
  if (/Safari\//i.test(ua)) return 'SAFARI';
  return 'OTHER';
}

export function getPushPermissionState(): PushPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'UNSUPPORTED';
  }
  const perm = Notification.permission;
  if (perm === 'granted') return 'GRANTED';
  if (perm === 'denied') return 'DENIED';
  if (perm === 'default') return 'DEFAULT';
  return 'UNKNOWN';
}

export function hasPwaInstallationEvidence(
  state: PwaInstallState,
  override?: PwaDetectionMethod
): boolean {
  const method = override ?? state.detectionMethod;

  return (
    state.isRunningStandalone ||
    state.isInstalledOnDevice === true ||
    method === 'APPINSTALLED_EVENT' ||
    method === 'RELATED_APPS'
  );
}

export function getOrCreateInstallationId(appType: PwaAppType): string {
  if (typeof window === 'undefined') return '';
  const key = appType === 'ADMIN' ? STORAGE_KEYS.ADMIN_ID : STORAGE_KEYS.USER_ID;
  let id = localStorage.getItem(key);
  
  // 유효한 UUID 형식이 아니면 새로 생성
  if (!id || !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id)) {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      id = crypto.randomUUID();
    } else {
      id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    }
    localStorage.setItem(key, id);
  }
  return id;
}

export async function detectPwaInstallState(): Promise<PwaInstallState> {
  const isStandalone = isStandalonePwa();
  const platform = detectPwaPlatform();
  const browserFamily = detectBrowserFamily();
  const pushPermission = getPushPermissionState();

  let isInstalledOnDevice: boolean | null = null;
  let detectionMethod: PwaDetectionMethod = 'UNKNOWN';

  if (isStandalone) {
    detectionMethod = 'STANDALONE_LAUNCH';
    isInstalledOnDevice = true;
  } else if (typeof navigator !== 'undefined' && 'getInstalledRelatedApps' in navigator) {
    try {
      const nav = navigator as Navigator & { getInstalledRelatedApps?: () => Promise<unknown[]> };
      if (nav.getInstalledRelatedApps) {
        const relatedApps = await nav.getInstalledRelatedApps();
        if (Array.isArray(relatedApps)) {
          isInstalledOnDevice = relatedApps.length > 0;
          if (isInstalledOnDevice) {
            detectionMethod = 'RELATED_APPS';
          }
        }
      }
    } catch {
      // API 지원 불가 또는 에러 시 false로 단정하지 않고 null 유지
      isInstalledOnDevice = null;
    }
  }

  return {
    isRunningStandalone: isStandalone,
    isInstalledOnDevice,
    detectionMethod,
    platform,
    browserFamily,
    pushPermission,
  };
}

export async function reportPwaHeartbeat(
  appType: PwaAppType,
  options?: { force?: boolean; detectionMethodOverride?: PwaDetectionMethod }
): Promise<void> {
  if (typeof window === 'undefined') return;

  // 관리자 모드인 경우 토큰 확인 (adminToken)
  if (appType === 'ADMIN') {
    const adminToken = localStorage.getItem('adminToken');
    if (!adminToken) return;
  }

  const isForce = options?.force ?? false;
  const lastReportKey = appType === 'ADMIN' ? STORAGE_KEYS.ADMIN_LAST_REPORT : STORAGE_KEYS.USER_LAST_REPORT;
  const lastReportStr = localStorage.getItem(lastReportKey);
  const now = Date.now();

  // throttling: force나 APPINSTALLED_EVENT가 아니면 최근 6시간 이내 중복 전송 방지
  if (!isForce && options?.detectionMethodOverride !== 'APPINSTALLED_EVENT' && lastReportStr) {
    const lastReportTime = parseInt(lastReportStr, 10);
    if (!isNaN(lastReportTime) && now - lastReportTime < REPORT_THROTTLE_MS) {
      return;
    }
  }

  try {
    const state = await detectPwaInstallState();

    // [핵심 레퍼런스 가드] 설치 증거가 없으면 installation_id 생성 및 전송을 하지 않음 (일반 QR 웹 제외)
    if (!hasPwaInstallationEvidence(state, options?.detectionMethodOverride)) {
      return;
    }

    const installationId = getOrCreateInstallationId(appType);

    const payload = {
      installation_id: installationId,
      platform: state.platform,
      browser_family: state.browserFamily,
      is_running_standalone: state.isRunningStandalone,
      detection_method: options?.detectionMethodOverride || state.detectionMethod,
      push_permission: state.pushPermission,
      related_app_installed: state.isInstalledOnDevice,
    };

    const path = appType === 'ADMIN'
      ? '/admin/pwa/installations/heartbeat'
      : '/pwa/installations/heartbeat';

    // Railway API로 apiClient를 사용하여 전송 (x-skip-error-toast로 조용한 실패)
    const response = await apiClient.post<
      StandardResponse<PwaHeartbeatResponse>,
      StandardResponse<PwaHeartbeatResponse>
    >(
      path,
      payload,
      {
        headers: {
          'x-skip-error-toast': 'true',
        },
      }
    );

    if (
      response &&
      response.success &&
      response.data &&
      ['created', 'updated', 'unchanged'].includes(response.data.status)
    ) {
      localStorage.setItem(lastReportKey, now.toString());
    }
  } catch {
    // PWA heartbeat 실패 시에도 애플리케이션 주문 및 정상 작동에 영향을 주지 않음
  }
}

/**
 * 주문 시점 PWA 설치 키 반환 (standalone일 때만 익명 USER ID 포함)
 */
export function getPwaInstallationIdForOrder(): string | null {
  if (!isStandalonePwa()) return null;
  return getOrCreateInstallationId('USER');
}
