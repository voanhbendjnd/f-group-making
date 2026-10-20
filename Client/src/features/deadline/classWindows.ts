import type { Deadline, DeadlineClassWindow } from './types';
import { effectiveDeadlineStatus } from './hooks/useDeadlineBoundary';

export function deadlineClassWindows(deadline: Deadline, now = Date.now()): DeadlineClassWindow[] {
  const windows = deadline.classWindows ?? deadline.schoolClassIds.map((id, index) => ({
    schoolClassId: id, schoolClassName: deadline.schoolClassNames[index] ?? String(id),
    startTime: deadline.startTime, endTime: deadline.endTime, status: deadline.status, canEdit: deadline.canEdit !== false,
  }));
  return windows.map(window => ({ ...window,
    status: effectiveDeadlineStatus(window.status, window.startTime, window.endTime, now),
  }));
}
