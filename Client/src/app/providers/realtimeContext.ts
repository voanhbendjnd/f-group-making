import { createContext, useContext } from 'react';
import type { RealtimeEvent } from '@/features/deadline/realtime';

export type WebSocketStatus = 'connected' | 'reconnecting' | 'disconnected';
export type RealtimeListener = (event: RealtimeEvent) => void;
export const RealtimeContext = createContext<{
  status: WebSocketStatus;
  subscribe: (topic: string, listener?: RealtimeListener) => () => void;
}>({ status: 'disconnected', subscribe: () => () => {} });

export const useRealtime = () => useContext(RealtimeContext);
