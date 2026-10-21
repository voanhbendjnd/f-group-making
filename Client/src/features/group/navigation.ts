export const ADVANCED_GROUP_PATH = '/lecturer/group-review/advanced';

export function positiveId(value: string | null | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function reviewPath(context: URLSearchParams, area: 'admin' | 'lecturer' = 'lecturer'): string {
  const query = new URLSearchParams();
  for (const name of ['termId', 'classId', 'status', 'search', 'page', 'size', 'source']) {
    const value = context.get(name);
    if (value) query.set(name, value);
  }
  return `/${area}/group-review${query.size ? `?${query}` : ''}`;
}

export function advancedGroupPath(classId: number, context = new URLSearchParams(), deadlineId?: number, area: 'admin' | 'lecturer' = 'lecturer'): string {
  const query = new URLSearchParams(reviewPath(context).split('?')[1]);
  query.set('classId', String(classId));
  if (deadlineId) query.set('deadlineId', String(deadlineId));
  return `/${area}/group-review/advanced?${query}`;
}
