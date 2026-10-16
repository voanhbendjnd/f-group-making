import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { syncDeadlineQueries } from '../realtime';
import type { DeadlineStatus } from '../types';

export function effectiveDeadlineStatus(status: DeadlineStatus, startTime: string, endTime: string, now = Date.now()): DeadlineStatus {
  // A server-confirmed closure must not be reopened by an old future endTime or a slow client clock.
  if (status === 'CANCELLED' || status === 'EXPIRED') return 'EXPIRED';
  if (now < Date.parse(startTime)) return 'UPCOMING';
  return now >= Date.parse(endTime) ? 'EXPIRED' : 'ACTIVE';
}

export function useDeadlineBoundary(items: { status: DeadlineStatus; startTime: string; endTime: string;
  classWindows?: { status: DeadlineStatus; startTime: string; endTime: string }[] }[]) {
  const client = useQueryClient();
  const [now, setNow] = useState(Date.now);
  const windows = items.flatMap(item => item.classWindows?.length ? item.classWindows : [item]);
  const signature = windows.map(item => `${item.status}:${item.startTime}:${item.endTime}`).join('|');
  useEffect(() => {
    const time = Date.now();
    const next = windows.filter(item => item.status !== 'CANCELLED')
      .flatMap(item => [Date.parse(item.startTime), Date.parse(item.endTime)]).filter(t => t > time);
    if (!next.length) return;
    const timer = window.setTimeout(() => {
      setNow(Date.now());
      void syncDeadlineQueries(client);
    }, Math.min(Math.min(...next) - time + 50, 2147483647));
    return () => window.clearTimeout(timer);
    // The signature tracks all relevant fields without rescheduling on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, now, client]);
  return Date.now();
}
