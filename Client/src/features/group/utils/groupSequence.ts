import type { GroupDTO } from '../types/groupTypes';

export function groupCode(group: Pick<GroupDTO, 'sequenceNo' | 'groupCode'>): string {
  return group.groupCode ?? (group.sequenceNo == null ? '' : `G${String(group.sequenceNo).padStart(2, '0')}`);
}

// State changes must never move a column. Use the immutable ID only as a fallback.
export function compareGroupSequence(a: GroupDTO, b: GroupDTO): number {
  return (a.sequenceNo ?? Number.MAX_SAFE_INTEGER) - (b.sequenceNo ?? Number.MAX_SAFE_INTEGER) || a.id - b.id;
}
