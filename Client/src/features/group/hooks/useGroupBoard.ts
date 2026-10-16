import { useCallback, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/app/providers/AuthContext';
import { useToast } from '@/app/providers/ToastContext';
import { useTerm } from '@/app/providers/TermContext';
import { deadlineApi } from '@/features/deadline/api/deadlineApi';
import { syncDeadlineQueries } from '@/features/deadline/realtime';
import { translateErrorMessage } from '@/services/api/errorTranslator';
import { groupApi } from '../api/groupApi';
import type { GroupDTO, WorkspaceDTO } from '../types/groupTypes';
import { useGroupWebSocket } from './useGroupWebSocket';

export class AmbiguousGroupSessionError extends Error {
  constructor() { super('Multiple grouping sessions'); }
}

export function useGroupBoard(classId: number | null, requestedDeadline: number | null, termId: number | null) {
  const { t } = useTranslation(); const toast = useToast(); const client = useQueryClient(); const { user } = useAuth();
  const { lockTermSelection } = useTerm();
  const [pending, setPending] = useState(false); const busy = useRef(false);
  const session = useQuery({
    queryKey: ['lecturer-deadlines-for-workspace', user?.id, classId, termId],
    enabled: !!classId && !requestedDeadline,
    queryFn: async ({ signal }) => {
      const first = await deadlineApi.getDeadlines({ page: 1, size: 50, termId: termId ?? undefined }, signal);
      const matches = first.result.filter(d => d.schoolClassIds.includes(classId!));
      for (let page = 2; page <= first.meta.pages; page++) {
        const next = await deadlineApi.getDeadlines({ page, size: 50, termId: termId ?? undefined }, signal);
        matches.push(...next.result.filter(d => d.schoolClassIds.includes(classId!)));
      }
      if (matches.length > 1) throw new AmbiguousGroupSessionError();
      return matches[0]?.id ?? null;
    }, retry: false,
  });
  const deadlineId = requestedDeadline ?? session.data ?? null;
  const queryKey = ['group-workspace', deadlineId, classId];
  const workspace = useQuery({ queryKey,
    queryFn: ({ signal }) => groupApi.getWorkspace(deadlineId!, classId!, signal),
    enabled: !!classId && !!deadlineId, retry: false,
    refetchInterval: 30000,
  });
  const { status: connection } = useGroupWebSocket({ deadlineId, classId });
  const canManage = !!workspace.data?.canManageGroups;
  const canUnlock = canManage && (user?.authorities.includes('ROLE_ADMIN') || user?.id === workspace.data?.lecturerId);
  const editable = useCallback((group: GroupDTO) => canManage && ['OPEN', 'REVOKED'].includes(group.status), [canManage]);
  const run = async (operation: () => Promise<unknown>, success = 'groupBoard.saved', optimistic?: (data: WorkspaceDTO) => WorkspaceDTO) => {
    if (busy.current || !canManage) throw new Error(t('groupBoard.busy'));
    busy.current = true; setPending(true);
    const unlockTerm = lockTermSelection();
    let before: WorkspaceDTO | undefined;
    try {
      await client.cancelQueries({ queryKey });
      before = client.getQueryData<WorkspaceDTO>(queryKey);
      if (optimistic && before) client.setQueryData(queryKey, optimistic(before));
      await operation(); toast.success(t(success));
    }
    catch (error) {
      if (optimistic && before) client.setQueryData(queryKey, before);
      toast.error(translateErrorMessage(error)); throw error;
    } finally {
      try { await syncDeadlineQueries(client); }
      finally { unlockTerm(); busy.current = false; setPending(false); }
    }
  };
  const move = async (studentId: number, sourceId: number | null, targetId: number) => {
    const current = client.getQueryData<WorkspaceDTO>(queryKey);
    const source = current?.groups.find(g => g.id === sourceId);
    const target = current?.groups.find(g => g.id === targetId);
    const student = sourceId === null ? current?.unassignedStudents.find(s => s.studentId === studentId)
      : source?.members.find(s => s.studentId === studentId);
    if (!student || !target || !editable(target) || (sourceId !== null && (!source || !editable(source)))
        || target.memberCount >= target.maxMembers || sourceId === targetId) return;
    await run(() => sourceId === null ? groupApi.lecturerAddMember(deadlineId!, classId!, targetId, studentId)
      : groupApi.lecturerMoveMember(deadlineId!, classId!, sourceId, targetId, studentId), 'groupBoard.saved', data => ({
        ...data, unassignedStudents: data.unassignedStudents.filter(s => s.studentId !== studentId),
        groups: data.groups.map(group => {
          if (group.id === targetId) return { ...group, memberCount: group.memberCount + 1,
            members: [...group.members, { ...student, groupId: targetId, role: 'MEMBER' as const }] };
          if (group.id !== sourceId) return group;
          const members = group.members.filter(member => member.studentId !== studentId);
          const leaderId = group.leaderId === studentId ? members[0]?.studentId : group.leaderId;
          return { ...group, memberCount: members.length, leaderId: leaderId ?? group.leaderId,
            status: members.length ? group.status : 'DISBANDED',
            members: members.map(member => ({ ...member, role: member.studentId === leaderId ? 'LEADER' as const : 'MEMBER' as const })) };
        }).filter(group => group.status !== 'DISBANDED'),
      }));
  };
  return { workspace, session, deadlineId, connection, canManage, canUnlock, editable, pending, run, move };
}
