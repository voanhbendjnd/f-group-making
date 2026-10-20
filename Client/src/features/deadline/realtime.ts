import type { QueryClient, QueryKey } from '@tanstack/react-query';
import type { DeadlineClassWindow } from './types';

export interface RealtimeEvent {
  eventId?: string;
  eventType: string;
  deadlineId: number;
  schoolClassId?: number;
  affectedClassIds?: number[];
  version?: number;
  startTime?: string;
  endTime?: string;
  classWindows?: DeadlineClassWindow[];
}
const recommendationKeys = new Set([
  'recommended-students', 'recommended-groups', 'recommended-students-group', 'recommended-students-pool',
]);
const keys = new Set([
  'admin-deadlines', 'lecturer-deadlines', 'lecturer-deadlines-for-workspace',
  'student-deadline-activities', 'validate-deadline', 'group-workspace', 'deadline-detail', 'student-profile', 'group-reviews',
  ...recommendationKeys,
]);
export const isRealtimeQuery = (key: QueryKey) => keys.has(String(key[0]));
const versions = new WeakMap<QueryClient, Map<number, number>>();

export async function syncDeadlineQueries(client: QueryClient, event?: RealtimeEvent) {
  const predicate = (query: { queryKey: QueryKey }) => isRealtimeQuery(query.queryKey);
  const lifecycle = event?.eventType.startsWith('DEADLINE_');
  let known = versions.get(client);
  if (!known) { known = new Map(); versions.set(client, known); }
  if (lifecycle && event?.version !== undefined) {
    if (event.version < (known.get(event.deadlineId) ?? -1)) return;
    known.set(event.deadlineId, event.version);
  }
  // Abort older reads before applying the event; only a fresh server read may enable writes.
  await client.cancelQueries({ predicate });
  if (lifecycle && event && (event.version === undefined || event.version >= (known.get(event.deadlineId) ?? -1))) {
    for (const [key, data] of client.getQueriesData<any>({ predicate })) {
      // Recommendation items describe students/groups, not deadline DTOs.
      if (recommendationKeys.has(String(key[0]))) continue;
      const patch = (item: any): any => {
        if (!item) return item;
        const id = item.group?.deadlineId ?? item.deadlineId ?? item.id;
        if (id !== event.deadlineId || (event.version !== undefined && item.version > event.version && !item.group)) return item;
        const classId = item.group?.schoolClassId ?? item.schoolClassId ?? (['group-workspace', 'validate-deadline'].includes(String(key[0])) ? key[2] : undefined);
        if (classId !== undefined && event.affectedClassIds && !event.affectedClassIds.includes(Number(classId))) return item;
        const window = event.classWindows?.find(w => w.schoolClassId === classId);
        const closed = event.eventType === 'DEADLINE_CLOSED' || event.eventType === 'DEADLINE_CANCELLED' || event.eventType === 'DEADLINE_EXPIRED';
        const status = window?.status ?? (closed ? 'EXPIRED' : undefined);
        if (item.group) return { ...item, ...(status ? { deadlineStatus: status } : {}) };
        const updatedWindows = item.classWindows?.map((w: DeadlineClassWindow) => {
          const fresh = event.classWindows?.find(next => next.schoolClassId === w.schoolClassId);
          return fresh ? { ...w, startTime: fresh.startTime, endTime: fresh.endTime, status: fresh.status } : w;
        });
        return { ...item,
          ...(event.version !== undefined ? { version: event.version } : {}),
          ...(updatedWindows ? { classWindows: updatedWindows } : {}),
          ...(status ? { status, deadlineStatus: status } : {}),
          ...(window ? { startTime: window.startTime, endTime: window.endTime, deadlineStartTime: window.startTime, deadlineEndTime: window.endTime } : {}),
          ...(closed && classId !== undefined ? { valid: false, canCreateGroup: false, canJoinGroup: false,
            deadlineExpired: true, readOnlyReason: item.isLecturer ? item.readOnlyReason : 'EXPIRED' } : {}),
          ...(closed && !updatedWindows && classId === undefined && event.endTime ? { endTime: event.endTime } : {}),
        };
      };
      const patched = Array.isArray(data) ? data.map(patch)
        : Array.isArray(data?.result) ? { ...data, result: data.result.map(patch) } : patch(data);
      client.setQueryData(key, patched);
    }
  }
  await client.invalidateQueries({ predicate });
}
