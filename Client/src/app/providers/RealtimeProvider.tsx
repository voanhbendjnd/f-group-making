import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Client, type StompSubscription } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './AuthContext';
import { storage } from '@/utils/storage';
import { useStudentProfile } from '@/features/students/hooks/useStudentProfile';
import { syncDeadlineQueries, type RealtimeEvent } from '@/features/deadline/realtime';
import { RealtimeContext, type WebSocketStatus, type RealtimeListener as Listener } from './realtimeContext';

type Entry = { listeners: Set<Listener>; subscription?: StompSubscription };

export const RealtimeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAdmin, isLecturer, isStudent } = useAuth();
  const accountId = user?.id;
  const clientQueries = useQueryClient();
  const profile = useStudentProfile(isStudent && !isAdmin && !isLecturer);
  const classId = profile.data?.schoolClassId;
  const [status, setStatus] = useState<WebSocketStatus>('disconnected');
  const clientRef = useRef<Client | null>(null);
  const entries = useRef(new Map<string, Entry>());
  const seen = useRef(new Set<string>());
  const receivedVersions = useRef(new Map<number, number>());

  const attach = useCallback((topic: string, entry: Entry, client: Client) => {
    entry.subscription = client.subscribe(topic, frame => {
      try {
        const event: RealtimeEvent = JSON.parse(frame.body);
        const classShareChanged = event.eventType === 'ZALO_SHARE_UPDATED'
          && Number.isSafeInteger(event.schoolClassId) && Number(event.schoolClassId) > 0;
        if (!event.eventType || (!event.deadlineId && !classShareChanged)) return;
        if (event.eventType.startsWith('DEADLINE_') && event.version !== undefined) {
          if (event.version < (receivedVersions.current.get(event.deadlineId) ?? -1)) return;
          receivedVersions.current.set(event.deadlineId, event.version);
        }
        if (event.eventId && seen.current.has(event.eventId)) return;
        if (event.eventId) {
          seen.current.add(event.eventId);
          if (seen.current.size > 500) seen.current.delete(seen.current.values().next().value!);
        }
        if (classShareChanged) {
          // A class can share Zalo before a grouping session/deadline exists.
          // Clear private previews before fetching the current server-authorized links.
          for (const [key] of clientQueries.getQueriesData({ queryKey: ['zalo-mine'] })) clientQueries.setQueryData(key, []);
          void clientQueries.invalidateQueries({ queryKey: ['zalo-mine'] });
        } else {
          void syncDeadlineQueries(clientQueries, event);
        }
        for (const value of entries.current.values()) value.listeners.forEach(listener => listener(event));
      } catch (error) { console.error('Invalid realtime message', error); }
    });
  }, [clientQueries]);

  const subscribe = useCallback((topic: string, listener?: Listener) => {
    const callback = listener ?? (() => {});
    let entry = entries.current.get(topic);
    if (!entry) {
      entry = { listeners: new Set() };
      entries.current.set(topic, entry);
      if (clientRef.current?.connected) {
        attach(topic, entry, clientRef.current);
        void syncDeadlineQueries(clientQueries);
      }
    }
    entry.listeners.add(callback);
    return () => {
      entry.listeners.delete(callback);
      if (entry.listeners.size === 0) {
        entry.subscription?.unsubscribe();
        entries.current.delete(topic);
      }
    };
  }, [attach, clientQueries]);

  useEffect(() => {
    if (!accountId) return;
    const activeEntries = entries.current;
    const seenEvents = seen.current;
    const deadlineVersions = receivedVersions.current;
    const client = new Client({
      webSocketFactory: () => new SockJS('/ws'),
      beforeConnect: () => { client.connectHeaders = { Authorization: `Bearer ${storage.getToken() ?? ''}` }; },
      reconnectDelay: 2000, heartbeatIncoming: 4000, heartbeatOutgoing: 4000,
      onConnect: () => {
        for (const [topic, entry] of entries.current) attach(topic, entry, client);
        setStatus('connected');
        void syncDeadlineQueries(clientQueries);
      },
      onWebSocketClose: () => setStatus('reconnecting'),
      onStompError: () => setStatus('reconnecting'),
    });
    clientRef.current = client;
    client.activate();
    return () => {
      client.onWebSocketClose = () => {};
      void client.deactivate();
      clientRef.current = null;
      for (const entry of activeEntries.values()) entry.subscription = undefined;
      seenEvents.clear();
      deadlineVersions.clear();
      setStatus('disconnected');
    };
  }, [accountId, attach, clientQueries]);

  useEffect(() => {
    if (!accountId) return;
    if (isAdmin) return subscribe('/topic/admin/deadlines');
    if (isLecturer) return subscribe('/user/queue/deadlines');
    if (classId) return subscribe(`/topic/classes/${classId}/deadlines`);
  }, [accountId, isAdmin, isLecturer, classId, subscribe]);

  useEffect(() => {
    if (!accountId) return;
    const resync = () => { if (navigator.onLine) void syncDeadlineQueries(clientQueries); };
    window.addEventListener('online', resync);
    window.addEventListener('focus', resync);
    const timer = status !== 'connected' ? window.setInterval(resync, 30000) : undefined;
    return () => {
      window.removeEventListener('online', resync);
      window.removeEventListener('focus', resync);
      window.clearInterval(timer);
    };
  }, [accountId, status, clientQueries]);

  return <RealtimeContext.Provider value={{ status, subscribe }}>{children}</RealtimeContext.Provider>;
};
