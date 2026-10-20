import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRealtime } from '@/app/providers/realtimeContext';
import { syncDeadlineQueries } from '@/features/deadline/realtime';
import type { GroupRealtimeEvent } from '../types/groupTypes';

export type { WebSocketStatus } from '@/app/providers/realtimeContext';

export function useGroupWebSocket({ deadlineId, classId, onEvent }: {
  deadlineId: number | null; classId: number | null; onEvent?: (event: GroupRealtimeEvent) => void;
}) {
  const { status, subscribe } = useRealtime();
  const queries = useQueryClient();
  const callback = useRef(onEvent);
  useEffect(() => { callback.current = onEvent; }, [onEvent]);
  useEffect(() => {
    if (!deadlineId || !classId) return;
    return subscribe(`/topic/classes/${classId}/deadlines/${deadlineId}/groups`, event => {
      const matchesClass = event.schoolClassId !== undefined ? event.schoolClassId === classId
        : !event.affectedClassIds || event.affectedClassIds.includes(classId);
      if (event.deadlineId === deadlineId && matchesClass) callback.current?.(event as GroupRealtimeEvent);
    });
  }, [deadlineId, classId, subscribe]);
  const refetch = useCallback(() => { void syncDeadlineQueries(queries); }, [queries]);
  return { status, refetch };
}
