import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/app/providers/AuthContext';
import { useToast } from '@/app/providers/ToastContext';
import { useTerm } from '@/app/providers/TermContext';
import { deadlineApi } from '@/features/deadline/api/deadlineApi';
import { classApi } from '@/features/classes/api/classApi';
import { syncDeadlineQueries } from '@/features/deadline/realtime';
import { translateErrorMessage } from '@/services/api/errorTranslator';
import { groupApi } from '../api/groupApi';
import type { GroupDTO, GroupMemberDTO, WorkspaceDTO } from '../types/groupTypes';
import { useGroupWebSocket } from './useGroupWebSocket';
import { useUnsavedChanges } from '@/app/providers/NavigationGuard';

export class AmbiguousGroupSessionError extends Error {
  constructor() { super('Multiple grouping sessions'); }
}

export function useGroupBoard(classId: number | null, requestedDeadline: number | null, termId: number | null) {
  const { t } = useTranslation();
  const toast = useToast();
  const client = useQueryClient();
  const { user } = useAuth();
  const { lockTermSelection } = useTerm();
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  useUnsavedChanges(false, pending);

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
      return matches[0]?.id ?? (await classApi.ensureGroupingSession(classId!, termId ?? undefined, signal)).id;
    }, retry: false,
  });

  const deadlineId = requestedDeadline ?? session.data ?? null;
  const queryKey = useMemo(() => ['group-workspace', deadlineId, classId] as const, [deadlineId, classId]);

  const workspace = useQuery({
    queryKey,
    queryFn: ({ signal }) => groupApi.getWorkspace(deadlineId!, classId!, signal),
    enabled: !!classId && !!deadlineId,
    retry: false,
    refetchInterval: 30000,
  });

  const canManage = !!workspace.data?.canManageGroups;
  const canUnlock = canManage && (user?.authorities.includes('ROLE_ADMIN') || user?.id === workspace.data?.lecturerId);
  const editable = useCallback(
    (group: GroupDTO) => canManage && ['OPEN', 'REVOKED'].includes(group.status),
    [canManage]
  );

  const latest = useRef({ t, toast, lockTermSelection, queryKey, deadlineId, classId, canManage });
  latest.current = { t, toast, lockTermSelection, queryKey, deadlineId, classId, canManage };

  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const onEvent = useCallback((event: { eventType: string; payload?: unknown }) => {
    const { queryKey } = latest.current;
    if (event.eventType === 'STUDENT_BIO_UPDATED') {
      const payload = event.payload as { studentId?: number; selfDescription?: string } | undefined;
      const targetStudentId = payload?.studentId;
      const newBio = payload?.selfDescription ?? null;
      if (targetStudentId) {
        client.setQueryData(queryKey, (old: WorkspaceDTO | undefined) => {
          if (!old) return old;
          const updateMember = (m: GroupMemberDTO) =>
            m.studentId === targetStudentId ? { ...m, selfDescription: newBio } : m;
          return {
            ...old,
            groups: old.groups.map(g => ({ ...g, members: g.members.map(updateMember) })),
            unassignedStudents: old.unassignedStudents.map(updateMember),
          };
        });
      }
    }
    if (busy.current) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(
      () => void client.invalidateQueries({ queryKey: latest.current.queryKey }),
      300
    );
  }, [client]);

  const { status: connection } = useGroupWebSocket({ deadlineId, classId, onEvent });

  const isBusy = useCallback(() => busy.current, []);

  const run = useCallback(async (
    operation: () => Promise<unknown>,
    success: string | null = 'groupBoard.saved',
    optimistic?: (data: WorkspaceDTO) => WorkspaceDTO
  ) => {
    const { t, toast, lockTermSelection, queryKey, canManage } = latest.current;
    if (busy.current || !canManage) throw new Error(t('groupBoard.busy'));
    busy.current = true;
    setPending(true);
    const unlockTerm = lockTermSelection();
    let before: WorkspaceDTO | undefined;
    try {
      await client.cancelQueries({ queryKey });
      before = client.getQueryData<WorkspaceDTO>(queryKey);
      if (optimistic && before) client.setQueryData(queryKey, optimistic(before));
      await operation();
      if (success) {
        toast.success(t(success));
      }
    } catch (error) {
      if (optimistic && before) client.setQueryData(queryKey, before);
      toast.error(translateErrorMessage(error));
      throw error;
    } finally {
      busy.current = false;
      setPending(false);
      void client.invalidateQueries({ queryKey });
      void syncDeadlineQueries(client).catch(() => {}).finally(unlockTerm);
    }
  }, [client]);

  const move = useCallback(async (studentId: number, sourceId: number | null, targetId: number) => {
    const { t, toast, queryKey, deadlineId, classId } = latest.current;
    const current = client.getQueryData<WorkspaceDTO>(queryKey);
    const source = current?.groups.find(g => g.id === sourceId);
    const target = current?.groups.find(g => g.id === targetId);
    const student = sourceId === null ? current?.unassignedStudents.find(s => s.studentId === studentId)
      : source?.members.find(s => s.studentId === studentId);
    if (!student || !target || sourceId === targetId) return;
    if (!editable(target)) {
      toast.error(t('groupFormation.errors.stateConflict', 'Thao tác không hợp lệ với trạng thái nhóm hiện tại.'));
      return;
    }
    if (sourceId !== null && (!source || !editable(source))) {
      toast.error(t('groupFormation.errors.stateConflict', 'Thao tác không hợp lệ với trạng thái nhóm hiện tại.'));
      return;
    }
    if (target.memberCount >= target.maxMembers) {
      toast.error(t('groupFormation.errors.groupFull', 'Nhóm đã đủ số lượng thành viên tối đa.'));
      return;
    }
    await run(
      () => sourceId === null
        ? groupApi.lecturerAddMember(deadlineId!, classId!, targetId, studentId)
        : groupApi.lecturerMoveMember(deadlineId!, classId!, sourceId, targetId, studentId),
      null,
      data => ({
        ...data,
        unassignedStudents: data.unassignedStudents.filter(s => s.studentId !== studentId),
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
      })
    );
  }, [client, editable, run]);

  return { workspace, session, deadlineId, connection, canManage, canUnlock, editable, pending, isBusy, run, move };
}
