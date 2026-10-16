import type { QueryClient, QueryKey } from '@tanstack/react-query';

export interface RealtimeEvent {
  eventId?: string;
  eventType: string;
  deadlineId: number;
  schoolClassId?: number;
  affectedClassIds?: number[];
  version?: number;
}

const keys = new Set([
  'admin-deadlines', 'lecturer-deadlines', 'lecturer-deadlines-for-workspace',
  'student-deadline-activities', 'validate-deadline', 'group-workspace', 'deadline-detail', 'student-profile', 'group-reviews',
]);
export const isRealtimeQuery = (key: QueryKey) => keys.has(String(key[0]));

export async function syncDeadlineQueries(client: QueryClient, event?: RealtimeEvent) {
  const predicate = (query: { queryKey: QueryKey }) => isRealtimeQuery(query.queryKey);
  // Older REST reads must not reopen controls after cancellation.
  await client.cancelQueries({ predicate });
  if (event?.eventType === 'DEADLINE_CANCELLED') {
    const cancel = (item: any) => item?.group?.deadlineId === event.deadlineId
      ? { ...item, deadlineStatus: 'CANCELLED', canReview: false, canReopen: false }
      : item && (item.id === event.deadlineId || item.deadlineId === event.deadlineId)
      ? { ...item, status: 'CANCELLED', deadlineStatus: 'CANCELLED', valid: false,
        canEdit: false, canCancel: false, canManageGroups: false, canCreateGroup: false,
        canJoinGroup: false, readOnlyReason: 'CANCELLED' }
      : item;
    client.setQueriesData({ predicate }, (data: any) => {
      if (Array.isArray(data)) return data.map(cancel);
      if (Array.isArray(data?.result)) return { ...data, result: data.result.map(cancel) };
      return cancel(data);
    });
  }
  await client.invalidateQueries({ predicate });
}
