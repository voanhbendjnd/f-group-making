import type { Deadline } from './types';
import { deadlineClassWindows } from './classWindows';
import { effectiveDeadlineStatus } from './hooks/useDeadlineBoundary';

export function deadlinePresentation(deadline: Deadline, now: number) {
  const windows = deadlineClassWindows(deadline, now);
  const statuses = new Set(windows.map(window => window.status));
  const status = windows[0]?.status ?? effectiveDeadlineStatus(deadline.status, deadline.startTime, deadline.endTime, now);
  const mixedStatus = statuses.size > 1;
  return {
    windows, status, mixedStatus,
    differentEnds: new Set(windows.map(window => window.endTime)).size > 1,
    editLabel: mixedStatus ? 'deadlineScope.changeTime' : status === 'EXPIRED' ? 'deadlineLifecycle.reopen'
      : status === 'UPCOMING' ? 'deadline.table.edit' : 'deadline.table.extend',
    canClose: (deadline.canClose ?? deadline.canCancel) !== false && windows.some(window => window.status === 'ACTIVE'),
  };
}

export function formatDeadlineDate(value: string | undefined, locale: string): string {
  if (!value || !Number.isFinite(Date.parse(value))) return '—';
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(value));
}
