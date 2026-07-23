// [File Role] User order routes (Home/MenuDetail/Cart) layout - maintains single persistent WebSocket
// Handles SETTINGS_UPDATED, MENU_*, CATEGORY_UPDATED, ANNOUNCEMENT_UPDATED events
// Includes exponential backoff reconnect, heartbeat, visibilitychange, online recovery

import { useEffect, useRef } from 'react';
import { Outlet } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { QK, QK_DOMAIN } from '../../api/queryKeys';
import { getWsUrl } from '../../utils/url';

const HEARTBEAT_INTERVAL_MS = 22000;
const INITIAL_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 30000;

export const PublicRealtimeLayout = () => {
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryCountRef = useRef(0);
  const isDestroyedRef = useRef(false);

  const invalidatePublicSettings = () => {
    queryClient.invalidateQueries({ queryKey: QK.settings.public, exact: true });
  };

  const clearHeartbeat = () => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  };

  const clearReconnectTimer = () => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  };

  const connect = () => {
    if (isDestroyedRef.current) return;

    const ws = wsRef.current;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

    clearReconnectTimer();

    let wsUrl: string;
    try {
      wsUrl = getWsUrl();
    } catch (e) {
      console.error('[PublicRealtimeLayout] getWsUrl failed:', e);
      return;
    }

    const socket = new WebSocket(wsUrl);
    wsRef.current = socket;

    socket.onopen = () => {
      if (isDestroyedRef.current) {
        socket.onclose = null;
        socket.close();
        return;
      }
      console.log('[PublicWS] Connected');
      retryCountRef.current = 0;

      invalidatePublicSettings();

      clearHeartbeat();
      heartbeatIntervalRef.current = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'ping' }));
        }
      }, HEARTBEAT_INTERVAL_MS);
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string);

        if (data.type === 'ping') {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'pong' }));
          }
          return;
        }

        if (data.type === 'SETTINGS_UPDATED') {
          console.log('[PublicWS] SETTINGS_UPDATED received');
          invalidatePublicSettings();
        }

        if (['MENU_UPDATED', 'MENU_CREATED', 'MENU_DELETED', 'CATEGORY_UPDATED'].includes(data.type)) {
          queryClient.invalidateQueries({ queryKey: QK_DOMAIN.categories });
        }

        if (data.type === 'ANNOUNCEMENT_UPDATED') {
          queryClient.invalidateQueries({ queryKey: QK_DOMAIN.announcements });
        }
      } catch (e) {
        console.error('[PublicWS] Failed to parse message:', e);
      }
    };

    socket.onclose = () => {
      clearHeartbeat();

      if (isDestroyedRef.current) return;

      const delay = Math.min(
        MAX_RETRY_DELAY_MS,
        INITIAL_RETRY_DELAY_MS * Math.pow(2, retryCountRef.current)
      );
      retryCountRef.current += 1;

      reconnectTimerRef.current = setTimeout(() => {
        connect();
      }, delay);
    };

    socket.onerror = () => socket.close();
  };

  useEffect(() => {
    isDestroyedRef.current = false;
    connect();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        invalidatePublicSettings();
        const curr = wsRef.current;
        if (!curr || curr.readyState === WebSocket.CLOSED || curr.readyState === WebSocket.CLOSING) {
          connect();
        }
      }
    };

    const handleOnline = () => {
      invalidatePublicSettings();
      const curr = wsRef.current;
      if (!curr || curr.readyState === WebSocket.CLOSED || curr.readyState === WebSocket.CLOSING) {
        retryCountRef.current = 0;
        connect();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);

    return () => {
      isDestroyedRef.current = true;
      clearReconnectTimer();
      clearHeartbeat();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);

      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <Outlet />;
};
