import { useEffect, useRef, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { message } from 'antd';
import { storage } from '@/utils/storage';
import type { GroupRealtimeEvent } from '../types/groupTypes';

// Ensure global is defined in browser environment for sockjs-client
if (typeof window !== 'undefined' && typeof (window as any).global === 'undefined') {
  (window as any).global = window;
}

export type WebSocketStatus = 'connected' | 'reconnecting' | 'disconnected';

interface UseGroupWebSocketProps {
  deadlineId: number | null;
  classId: number | null;
  onEvent?: (event: GroupRealtimeEvent) => void;
}

export function useGroupWebSocket({ deadlineId, classId, onEvent }: UseGroupWebSocketProps) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<WebSocketStatus>('disconnected');
  const clientRef = useRef<Client | null>(null);

  const invalidateWorkspace = useCallback(() => {
    if (deadlineId && classId) {
      queryClient.invalidateQueries({
        queryKey: ['group-workspace', deadlineId, classId],
      });
    }
  }, [queryClient, deadlineId, classId]);

  useEffect(() => {
    if (!deadlineId || !classId) {
      setStatus('disconnected');
      return;
    }

    const token = storage.getToken();
    const topic = `/topic/classes/${classId}/deadlines/${deadlineId}/groups`;
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const brokerURL = `${wsProtocol}//${window.location.host}/ws`;

    const client = new Client({
      brokerURL,
      webSocketFactory: () => new SockJS('/ws'),
      connectHeaders: token ? { Authorization: `Bearer ${token}` } : {},
      debug: () => {},
      reconnectDelay: 2000,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
    });

    client.onConnect = () => {
      setStatus('connected');
      // Always resync with REST API on (re)connect
      invalidateWorkspace();

      client.subscribe(topic, (msg) => {
        try {
          const event: GroupRealtimeEvent = JSON.parse(msg.body);
          invalidateWorkspace();

          if (onEvent) {
            onEvent(event);
          }

          // Optional toast feedback for team activity
          switch (event.eventType) {
            case 'GROUP_CREATED':
              message.info(`Có nhóm mới vừa được tạo!`);
              break;
            case 'MEMBER_JOINED':
              message.info(`Có sinh viên vừa tham gia nhóm!`);
              break;
            case 'MEMBER_LEFT':
              message.info(`Có thành viên vừa rời nhóm.`);
              break;
            case 'GROUP_SUBMITTED':
              message.info(`Một nhóm vừa nộp danh sách lên Giảng viên.`);
              break;
            case 'GROUP_ACCEPTED':
              message.success(`Một nhóm vừa được Giảng viên phê duyệt!`);
              break;
            case 'GROUP_REJECTED':
              message.warning(`Một nhóm vừa bị từ chối phê duyệt.`);
              break;
            default:
              break;
          }
        } catch (e) {
          console.error('Failed to parse realtime event', e);
        }
      });
    };

    client.onDisconnect = () => {
      setStatus('disconnected');
    };

    client.onStompError = (frame) => {
      console.warn('STOMP error:', frame.headers['message']);
      setStatus('reconnecting');
    };

    client.onWebSocketClose = () => {
      setStatus('reconnecting');
    };

    client.activate();
    clientRef.current = client;

    return () => {
      if (client.active) {
        client.deactivate();
      }
      clientRef.current = null;
    };
  }, [deadlineId, classId, invalidateWorkspace, onEvent]);

  return {
    status,
    refetch: invalidateWorkspace,
  };
}
