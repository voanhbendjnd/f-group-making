import { useState, useRef, useEffect, useCallback, useMemo, type DragEvent } from 'react';
import { useLocation, useParams, useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Modal } from 'antd';
import {
  Users,
  Search,
  Plus,
  RefreshCw,
  EyeOff,
  SlidersHorizontal,
  ArrowLeft,
  FileSpreadsheet,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useGroupBoard, AmbiguousGroupSessionError } from '@/features/group/hooks/useGroupBoard';
import { useBoardAutoScroll } from '@/features/group/hooks/useBoardAutoScroll';
import { groupApi } from '@/features/group/api/groupApi';
import type { GroupDTO, GroupMemberDTO } from '@/features/group/types/groupTypes';
import { groupCode, compareGroupSequence } from '@/features/group/utils/groupSequence';
import { Button } from '@/components/common/Button';
import { DeadlineStatusBadge } from '@/features/deadline/components/DeadlineStatusBadge';
import { translateErrorMessage } from '@/services/api/errorTranslator';
import { GroupBoardColumn } from '@/features/group/components/GroupBoardColumn';
import { BoardStudentCard } from '@/features/group/components/BoardStudentCard';
import { LecturerGroupModal } from '@/features/group/components/LecturerGroupModal';
import { RejectGroupModal } from '@/features/group/components/RejectGroupModal';
import { GroupPreviewExportModal } from '@/features/group/components/GroupPreviewExportModal';
import './LecturerGroupWorkspacePage.css';

interface DragStudent {
  studentId: number;
  fromGroupId: number | null;
  classId: number;
  deadlineId: number;
}

const quiet = (promise: Promise<unknown>) => {
  void promise.catch(() => {});
};

const positiveId = (val: string | null | undefined): number | null => {
  if (!val) return null;
  const num = Number(val);
  return Number.isSafeInteger(num) && num > 0 ? num : null;
};

export const LecturerGroupWorkspacePage = () => {
  const [params, setParams] = useSearchParams();
  const route = useParams<{ classId?: string }>();
  const classId = positiveId(params.get('classId') ?? route.classId);
  const requestedDeadline = positiveId(params.get('deadlineId'));
  const setDeadline = useCallback(
    (id: number) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('deadlineId', String(id));
          return next;
        },
        { replace: true }
      );
    },
    [setParams]
  );

  return (
    <LecturerGroupWorkspaceContent
      key={`${classId}-${requestedDeadline}`}
      classId={classId}
      requestedDeadline={requestedDeadline}
      params={params}
      setDeadline={setDeadline}
    />
  );
};

const matches = (student: GroupMemberDTO, query: string) => {
  return (
    student.fullName.toLocaleLowerCase().includes(query) ||
    student.rollNumber.toLocaleLowerCase().includes(query) ||
    (student.majorCode ?? '').toLocaleLowerCase().includes(query)
  );
};

const reviewPath = (params: URLSearchParams, area: 'admin' | 'lecturer') => {
  const query = new URLSearchParams();
  const termId = params.get('termId');
  const classId = params.get('classId');
  const deadlineId = params.get('deadlineId');
  if (termId) query.set('termId', termId);
  if (classId) query.set('classId', classId);
  if (deadlineId) query.set('deadlineId', deadlineId);
  return `/${area}/group-review?${query.toString()}`;
};

function LecturerGroupWorkspaceContent({
  classId,
  requestedDeadline,
  params,
  setDeadline,
}: {
  classId: number | null;
  requestedDeadline: number | null;
  params: URLSearchParams;
  setDeadline: (id: number) => void;
}) {
  const { t } = useTranslation();
  const area = useLocation().pathname.startsWith('/admin') ? 'admin' : 'lecturer';
  const { workspace, session, deadlineId, connection, canManage, canUnlock, editable, pending, isBusy, run, move } =
    useGroupBoard(classId, requestedDeadline, positiveId(params.get('termId')));
  const { boardRef, startAutoScroll, stopAutoScroll } = useBoardAutoScroll();

  const [pool, setPool] = useState<'expanded' | 'collapsed' | 'hidden'>(() =>
    window.innerWidth < 900 ? 'collapsed' : 'expanded'
  );
  const [studentSearch, setStudentSearch] = useState('');
  const [major, setMajor] = useState('');
  const [suggestGroupId, setSuggestGroupId] = useState<number | null>(null);
  const [groupSearch, setGroupSearch] = useState('');
  const [create, setCreate] = useState<number[] | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<number>>(new Set());

  // Trạng thái kéo thả dùng DOM trực tiếp, không setState để tránh re-render
  const dragged = useRef<DragStudent | null>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const overEl = useRef<HTMLElement | null>(null);

  const data = workspace.data;
  const dataRef = useRef(data);
  dataRef.current = data;

  const canManageRef = useRef(canManage);
  canManageRef.current = canManage;

  const { data: poolRecs = [] } = useQuery({
    queryKey: ['recommended-students-pool', deadlineId, classId, suggestGroupId],
    queryFn: ({ signal }) =>
      deadlineId && classId && suggestGroupId && groupApi.getRecommendedStudents
        ? groupApi.getRecommendedStudents(deadlineId, classId, suggestGroupId, signal)
        : Promise.resolve([]),
    enabled: !!suggestGroupId && !!deadlineId && !!classId,
    staleTime: 10000,
  });

  const poolRecMap = useMemo(() => {
    const map = new Map<number, GroupMemberDTO>();
    poolRecs.forEach((r) => {
      map.set(r.studentId, r);
    });
    return map;
  }, [poolRecs]);

  useEffect(() => {
    if (!requestedDeadline && deadlineId) setDeadline(deadlineId);
  }, [deadlineId, requestedDeadline, setDeadline]);

  useEffect(() => {
    if (!data?.groups) return;
    const existing = new Set(data.groups.map((g) => g.id));
    setSelectedGroupIds((prev) => {
      const next = new Set([...prev].filter((id) => existing.has(id)));
      if (next.size !== prev.size) return next;
      return prev;
    });
  }, [data?.groups]);

  const orderedGroups = useMemo(() => {
    if (!data?.groups) return [];
    return [...data.groups].sort(compareGroupSequence);
  }, [data?.groups]);

  const targets = useMemo(() => {
    return orderedGroups.filter(editable);
  }, [orderedGroups, editable]);

  const targetsRef = useRef(targets);
  targetsRef.current = targets;

  const getTargets = useCallback(() => targetsRef.current, []);

  // Highlight DOM trực tiếp thay vì render
  const setOverTarget = useCallback((el: HTMLElement | null) => {
    if (overEl.current === el) return;
    overEl.current?.removeAttribute('data-drag-over');
    el?.setAttribute('data-drag-over', 'true');
    overEl.current = el;
  }, []);

  const clearDrag = useCallback(() => {
    dragged.current = null;
    setOverTarget(null);
    pageRef.current?.classList.remove('is-board-dragging');
    pageRef.current?.querySelector('[data-dragging="true"]')?.removeAttribute('data-dragging');
    stopAutoScroll();
  }, [setOverTarget, stopAutoScroll]);

  const startDrag = useCallback(
    (event: DragEvent<HTMLElement>, student: GroupMemberDTO, fromGroupId: number | null) => {
      if (!canManageRef.current || isBusy()) {
        event.preventDefault();
        return;
      }
      const payload = { studentId: student.studentId, fromGroupId, classId: classId!, deadlineId: deadlineId! };
      event.dataTransfer.setData('application/json', JSON.stringify(payload));
      event.dataTransfer.setData('text/plain', JSON.stringify(payload));
      event.dataTransfer.effectAllowed = 'move';
      dragged.current = payload;
      const el = event.currentTarget;
      // Hoãn thay đổi DOM sang animation frame sau để trình duyệt chụp drag image xong (tránh giật trên Chrome)
      requestAnimationFrame(() => {
        el.setAttribute('data-dragging', 'true');
        pageRef.current?.classList.add('is-board-dragging');
      });
      startAutoScroll();
    },
    [classId, deadlineId, isBusy, startAutoScroll]
  );

  const dragOver = useCallback(
    (event: DragEvent<HTMLElement>, target: number | 'pool' | 'create') => {
      if (!canManageRef.current || isBusy()) return;
      const source = dragged.current;
      if (target === 'create' && source && source.fromGroupId !== null) return;
      if (typeof target === 'number') {
        const group = dataRef.current?.groups.find((g) => g.id === target);
        if (
          !group ||
          !editable(group) ||
          group.memberCount >= group.maxMembers ||
          source?.fromGroupId === target
        ) {
          setOverTarget(null);
          return;
        }
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      setOverTarget(event.currentTarget);
    },
    [editable, isBusy, setOverTarget]
  );

  const back =
    area === 'admin' && params.get('source') === 'class' && classId
      ? `/admin/classes/${classId}?tab=groups`
      : reviewPath(params, area);

  const breadcrumb = (
    <nav className="board-breadcrumb" aria-label={t('groupBoard.breadcrumb')}>
      <Link to={back}>{t('groupReview.title')}</Link>
      <span aria-hidden="true">/</span>
      {data && (
        <>
          <Link to={back}>{data.schoolClassName}</Link>
          <span aria-hidden="true">/</span>
        </>
      )}
      <span aria-current="page">{t('groupBoard.title')}</span>
    </nav>
  );

  const groups = useMemo(() => {
    const query = groupSearch.trim().toLocaleLowerCase();
    if (!query) return orderedGroups;
    return orderedGroups.filter(
      (group) =>
        `${groupCode(group)} ${group.name}`.toLocaleLowerCase().includes(query) ||
        group.members.some((student) => matches(student, query))
    );
  }, [orderedGroups, groupSearch]);

  const students = useMemo(() => {
    if (!data?.unassignedStudents) return [];
    const query = studentSearch.trim().toLocaleLowerCase();
    return data.unassignedStudents
      .filter((student) => (!major || student.majorCode === major) && (!query || matches(student, query)))
      .map((student) => {
        const rec = poolRecMap.get(student.studentId);
        if (rec) {
          return {
            ...student,
            matchScore: rec.matchScore,
            matchReasons: rec.matchReasons,
          };
        }
        return student;
      })
      .sort((a, b) => {
        if (suggestGroupId) {
          const scoreA = a.matchScore ?? -1;
          const scoreB = b.matchScore ?? -1;
          if (scoreA !== scoreB) return scoreB - scoreA;
        }
        return a.fullName.localeCompare(b.fullName);
      });
  }, [data?.unassignedStudents, studentSearch, major, poolRecMap, suggestGroupId]);

  const majors = useMemo(() => {
    if (!data?.unassignedStudents) return [];
    return [...new Set(data.unassignedStudents.map((student) => student.majorCode).filter(Boolean))].sort();
  }, [data?.unassignedStudents]);

  const maxMembers = useMemo(() => {
    if (!data) return 2147483647;
    return (
      data.rules.find((rule) => rule.status && rule.code === 'MAX_MEMBERS_PER_GROUP')?.value ??
      data.groups[0]?.maxMembers ??
      2147483647
    );
  }, [data]);

  const readDrag = useCallback(
    (event: DragEvent): DragStudent | null => {
      try {
        const payload = JSON.parse(
          event.dataTransfer.getData('application/json') || event.dataTransfer.getData('text/plain')
        ) as DragStudent;
        if (
          payload.classId !== classId ||
          payload.deadlineId !== deadlineId ||
          !Number.isSafeInteger(payload.studentId) ||
          !(payload.fromGroupId === null || Number.isSafeInteger(payload.fromGroupId))
        )
          return null;
        const currentData = dataRef.current;
        if (!currentData?.groups || !currentData?.unassignedStudents) return null;
        const source = currentData.groups.find((group) => group.id === payload.fromGroupId);
        return payload.fromGroupId === null
          ? currentData.unassignedStudents.some((student) => student.studentId === payload.studentId)
            ? payload
            : null
          : source &&
            editable(source) &&
            source.members.some((student) => student.studentId === payload.studentId)
          ? payload
          : null;
      } catch {
        return null;
      }
    },
    [classId, deadlineId, editable]
  );

  const toggleSelectGroup = useCallback((groupId: number, checked: boolean) => {
    setSelectedGroupIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(groupId);
      else next.delete(groupId);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(
    (checked: boolean) => {
      if (checked) {
        setSelectedGroupIds(new Set(groups.map((g) => g.id)));
      } else {
        setSelectedGroupIds(new Set());
      }
    },
    [groups]
  );

  const disbandGroupSafely = useCallback(
    async (group: GroupDTO) => {
      if (group.status === 'ACCEPTED') {
        await groupApi.revokeGroup(deadlineId!, classId!, group.id);
      } else if (group.status === 'PENDING') {
        await groupApi.rejectGroup(deadlineId!, classId!, group.id, { reason: t('groupWorkspace.disband') });
      }
      await groupApi.lecturerDisbandGroup(deadlineId!, classId!, group.id);
    },
    [deadlineId, classId, t]
  );

  const disband = useCallback(
    (group: GroupDTO) => {
      if (!editable(group) || isBusy()) return;
      Modal.confirm({
        title: t('groupWorkspace.disbandConfirm.title', { name: group.name }),
        content: (
          <p>
            {t('groupWorkspace.disbandConfirm.content')} {t('groupWorkspace.disbandConfirm.warning')}
          </p>
        ),
        okText: t('groupWorkspace.disbandConfirm.ok'),
        cancelText: t('groupWorkspace.disbandConfirm.cancel'),
        okButtonProps: { danger: true },
        onOk: () => run(() => groupApi.lecturerDisbandGroup(deadlineId!, classId!, group.id)),
      });
    },
    [editable, isBusy, t, run, deadlineId, classId]
  );

  const remove = useCallback(
    (group: GroupDTO, studentId: number) => {
      if (!editable(group) || isBusy()) return;
      if (group.memberCount <= 1) disband(group);
      else quiet(run(() => groupApi.lecturerRemoveMember(deadlineId!, classId!, group.id, studentId), null));
    },
    [editable, isBusy, disband, run, deadlineId, classId]
  );

  const handleRemoveMember = useCallback(
    (groupId: number, studentId: number) => {
      const group = dataRef.current?.groups.find((g) => g.id === groupId);
      if (group) remove(group, studentId);
    },
    [remove]
  );

  const drop = useCallback(
    (event: DragEvent<HTMLElement>, target: number | 'pool' | 'create') => {
      event.preventDefault();
      event.stopPropagation();
      const payload = readDrag(event);
      clearDrag();
      const currentData = dataRef.current;
      if (!payload || !canManageRef.current || isBusy() || !currentData?.groups) return;
      if (target === 'create') {
        if (payload.fromGroupId === null) setCreate([payload.studentId]);
      } else if (target === 'pool') {
        const group = currentData.groups.find((g) => g.id === payload.fromGroupId);
        if (group) remove(group, payload.studentId);
      } else {
        quiet(move(payload.studentId, payload.fromGroupId, target));
      }
    },
    [readDrag, clearDrag, isBusy, remove, move]
  );

  const unlock = useCallback(
    (group: GroupDTO) => {
      Modal.confirm({
        title: t('groupLifecycle.unlock'),
        content: t('groupReview.reopenConfirm', { name: group.name }),
        okText: t('groupLifecycle.unlock'),
        cancelText: t('groupReview.cancel'),
        onOk: () => run(() => groupApi.revokeGroup(deadlineId!, classId!, group.id)),
      });
    },
    [t, run, deadlineId, classId]
  );

  const disbandSelected = () => {
    if (!canManage || isBusy() || selectedGroupIds.size === 0 || !data?.groups) return;
    const targetGroups = data.groups.filter((g) => selectedGroupIds.has(g.id));
    if (targetGroups.length === 0) return;
    const totalMembers = targetGroups.reduce((acc, g) => acc + g.memberCount, 0);

    Modal.confirm({
      title: t('groupWorkspace.disbandSelectedConfirm.title', { count: targetGroups.length }),
      content: (
        <div>
          <p>
            {t('groupWorkspace.disbandSelectedConfirm.content')}{' '}
            {t('groupWorkspace.disbandSelectedConfirm.warning', { count: targetGroups.length })}
          </p>
          <p style={{ marginTop: '0.5rem', fontWeight: 600 }}>
            {targetGroups.map((g) => g.name).join(', ')} ({totalMembers}{' '}
            {t('classMajor.studentsUnit', 'sinh viên')})
          </p>
        </div>
      ),
      okText: t('groupWorkspace.disbandSelectedConfirm.ok', { count: targetGroups.length }),
      cancelText: t('groupWorkspace.disbandSelectedConfirm.cancel'),
      okButtonProps: { danger: true },
      onOk: () =>
        run(async () => {
          for (const g of targetGroups) {
            await disbandGroupSafely(g);
          }
          setSelectedGroupIds(new Set());
        }, 'groupWorkspace.disbandSelectedSuccess'),
    });
  };

  const disbandAll = () => {
    if (!canManage || isBusy() || !data?.groups || data.groups.length === 0) return;
    const totalGroups = data.groups.length;
    const totalMembers = data.groups.reduce((acc, g) => acc + g.memberCount, 0);

    Modal.confirm({
      title: t('groupWorkspace.disbandAllConfirm.title'),
      content: (
        <div>
          <p>
            {t('groupWorkspace.disbandAllConfirm.content', { count: totalGroups })}{' '}
            {t('groupWorkspace.disbandAllConfirm.warning')}
          </p>
          <p style={{ marginTop: '0.5rem', fontWeight: 600 }}>
            {t('groupBoard.groupCount', { count: totalGroups })} · {totalMembers}{' '}
            {t('classMajor.studentsUnit', 'sinh viên')}
          </p>
        </div>
      ),
      okText: t('groupWorkspace.disbandAllConfirm.ok'),
      cancelText: t('groupWorkspace.disbandAllConfirm.cancel'),
      okButtonProps: { danger: true },
      onOk: () =>
        run(async () => {
          for (const g of data.groups) {
            await disbandGroupSafely(g);
          }
          setSelectedGroupIds(new Set());
        }, 'groupWorkspace.disbandAllSuccess'),
    });
  };

  const handleMoveStudent = useCallback(
    (studentId: number, sourceId: number | null, targetId: number) => {
      quiet(move(studentId, sourceId, targetId));
    },
    [move]
  );

  const handleSetLeader = useCallback(
    (groupId: number, studentId: number) => {
      if (deadlineId && classId) {
        quiet(run(() => groupApi.lecturerSetLeader(deadlineId, classId, groupId, studentId)));
      }
    },
    [run, deadlineId, classId]
  );

  const handleAddMember = useCallback(
    (groupId: number, studentId: number) => {
      quiet(move(studentId, null, groupId));
    },
    [move]
  );

  const handleSubmitGroup = useCallback(
    (groupId: number) => {
      if (deadlineId && classId) {
        quiet(run(() => groupApi.lecturerSubmitGroup(deadlineId, classId, groupId)));
      }
    },
    [run, deadlineId, classId]
  );

  const handleApproveGroup = useCallback(
    (groupId: number) => {
      if (deadlineId && classId) {
        quiet(run(() => groupApi.acceptGroup(deadlineId, classId, groupId)));
      }
    },
    [run, deadlineId, classId]
  );

  const handleRejectGroup = useCallback((groupId: number) => {
    setRejectId(groupId);
  }, []);

  const handleUnlockGroup = useCallback(
    (group: GroupDTO) => {
      unlock(group);
    },
    [unlock]
  );

  const handleDisbandGroup = useCallback(
    (group: GroupDTO) => {
      disband(group);
    },
    [disband]
  );

  if (!classId) {
    return (
      <div>
        {breadcrumb}
        <div className="card board-message">
          <p>{t('groupBoard.chooseClass')}</p>
          <Link className="btn btn-primary" to={back}>
            <ArrowLeft size={16} aria-hidden="true" /> {t('groupBoard.back')}
          </Link>
        </div>
      </div>
    );
  }

  if (session.isLoading || (session.data && workspace.isLoading)) {
    return (
      <div>
        {breadcrumb}
        <div className="card board-message">
          <p>{t('groupBoard.loading')}</p>
        </div>
      </div>
    );
  }

  if (session.isError || workspace.isError || !data) {
    return (
      <div>
        {breadcrumb}
        <div className="card board-message">
          <p>
            {session.error instanceof AmbiguousGroupSessionError
              ? t('groupBoard.multipleSessions')
              : translateErrorMessage(session.error ?? workspace.error)}
          </p>
          <Link className="btn btn-secondary" to={back}>
            <ArrowLeft size={16} aria-hidden="true" /> {t('groupBoard.back')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={pageRef}
      className="group-board-page"
      aria-busy={pending}
      onDragEnd={clearDrag}
    >
      <header className="board-heading">
        <div className="board-heading-main">
          <Link to={back} className="board-header-back-btn" title={t('groupBoard.back', 'Quay lại')}>
            <ArrowLeft size={18} />
            <span>{t('groupBoard.back', 'Quay lại')}</span>
          </Link>
          <div className="board-heading-titles">
            {breadcrumb}
            <h1>
              {t('groupBoard.title')} <span>{data.schoolClassName}</span>
            </h1>
            <p>
              {data.deadlineName} · {t('groupBoard.subtitle')}
            </p>
          </div>
        </div>
        <div className="board-toolbar">
          <span
            className={`board-connection ${connection === 'connected' ? 'is-live' : ''}`}
            title={t('groupBoard.realtimeHint')}
          >
            <i /> {t(connection === 'connected' ? 'groupWorkspace.live' : 'groupWorkspace.offline')}
          </span>
          <button
            type="button"
            className="board-rules-link"
            onClick={() => setShowRules(true)}
            aria-label={t('groupReview.rules')}
          >
            <SlidersHorizontal size={14} /> {t('groupReview.rules')}
          </button>
          <Button
            size="sm"
            variant="secondary"
            loading={workspace.isRefetching}
            icon={<RefreshCw size={14} className={workspace.isRefetching ? 'animate-spin' : ''} />}
            aria-label={t('common.refresh')}
            onClick={() => {
              void workspace.refetch();
            }}
          />
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setExportModalOpen(true)}
            icon={<FileSpreadsheet size={16} />}
          >
            {t('groupReview.previewExport')}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setPool((old) => (old === 'hidden' ? 'expanded' : 'hidden'))}
            icon={<Users size={16} />}
          >
            {t(pool === 'hidden' ? 'groupBoard.showStudents' : 'groupBoard.hideStudents')}
          </Button>
          {canManage && (
            <Button size="sm" disabled={pending} icon={<Plus size={16} />} onClick={() => setCreate([])}>
              {t('groupWorkspace.createNewGroup')}
            </Button>
          )}
        </div>
      </header>
      <div className="board-context-bar">
        <label className="board-search">
          <Search size={16} />
          <input
            aria-label={t('groupBoard.searchGroups')}
            placeholder={t('groupBoard.searchGroups')}
            value={groupSearch}
            onChange={(event) => setGroupSearch(event.target.value)}
          />
        </label>
        <span className="board-count">{t('groupBoard.groupCount', { count: data.groups.length })}</span>
        <span title={`Deadline: ${data.deadlineName}`}>
          <DeadlineStatusBadge
            status={
              data.deadlineStatus === 'UNSCHEDULED'
                ? 'UNSCHEDULED'
                : data.deadlineStatus === 'ACTIVE'
                ? 'ACTIVE'
                : data.deadlineStatus === 'UPCOMING'
                ? 'UPCOMING'
                : 'EXPIRED'
            }
          />
        </span>
        <button
          type="button"
          className="board-rules-link"
          onClick={() => setShowRules(true)}
          aria-label={t('groupReview.rules')}
        >
          {t('groupReview.rules')}
        </button>

        {canManage && data.groups.length > 0 && (
          <div className="board-bulk-actions">
            <label className="board-select-all-label">
              <input
                type="checkbox"
                className="board-group-select-checkbox"
                checked={groups.length > 0 && groups.every((g) => selectedGroupIds.has(g.id))}
                ref={(el) => {
                  if (el) {
                    const someSelected = groups.some((g) => selectedGroupIds.has(g.id));
                    const allSelected = groups.length > 0 && groups.every((g) => selectedGroupIds.has(g.id));
                    el.indeterminate = someSelected && !allSelected;
                  }
                }}
                onChange={(e) => toggleSelectAll(e.target.checked)}
                disabled={pending}
              />
              <span>
                {selectedGroupIds.size > 0
                  ? t('groupWorkspace.selectedCount', { count: selectedGroupIds.size })
                  : t('groupWorkspace.selectAll')}
              </span>
            </label>

            {selectedGroupIds.size > 0 && (
              <Button
                size="sm"
                variant="danger"
                className="board-disband-selected-btn"
                disabled={pending}
                icon={<Trash2 size={14} />}
                onClick={disbandSelected}
              >
                {t('groupWorkspace.disbandSelected', { count: selectedGroupIds.size })}
              </Button>
            )}

            <Button
              size="sm"
              variant="secondary"
              className="board-disband-all-btn"
              disabled={pending || data.groups.length === 0}
              icon={<Trash2 size={14} />}
              onClick={disbandAll}
            >
              {t('groupWorkspace.disbandAll')}
            </Button>
          </div>
        )}
      </div>
      <div className="board-work-area">
        {pool !== 'hidden' && (
          <aside
            className={`board-pool unassigned-pool ${pool === 'collapsed' ? 'is-collapsed' : ''}`}
            aria-label={t('groupWorkspace.unassignedTitle')}
            onDragOver={(e) => dragOver(e, 'pool')}
            onDrop={(e) => drop(e, 'pool')}
          >
            <header className="board-pool-header">
              <Users size={18} />
              <strong>{t('groupWorkspace.unassignedTitle')}</strong>
              <span className="board-member-count">{data.unassignedStudents.length}</span>
              <button
                type="button"
                className="board-icon-button"
                aria-label={t(pool === 'expanded' ? 'groupBoard.collapseStudents' : 'groupBoard.expandStudents')}
                aria-expanded={pool === 'expanded'}
                onClick={() => setPool((old) => (old === 'expanded' ? 'collapsed' : 'expanded'))}
              >
                {pool === 'expanded' ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
              </button>
              {pool === 'expanded' && (
                <button
                  type="button"
                  className="board-icon-button"
                  aria-label={t('groupBoard.hideStudents')}
                  onClick={() => setPool('hidden')}
                >
                  <EyeOff size={16} />
                </button>
              )}
            </header>
            {pool === 'expanded' && (
              <>
                <div className="board-pool-filters">
                  <label className="board-search">
                    <Search size={16} />
                    <input
                      aria-label={t('groupWorkspace.searchPlaceholder')}
                      placeholder={t('groupWorkspace.searchPlaceholder')}
                      value={studentSearch}
                      onChange={(event) => setStudentSearch(event.target.value)}
                    />
                  </label>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <select
                      style={{ flex: 1 }}
                      aria-label={t('groupBoard.majorFilter')}
                      value={major}
                      onChange={(event) => setMajor(event.target.value)}
                    >
                      <option value="">{t('groupWorkspace.all')}</option>
                      {[...new Set([...majors, ...(major ? [major] : [])])].map((code) => (
                        <option key={code} value={code}>
                          {code}
                        </option>
                      ))}
                    </select>
                    <select
                      style={{ flex: 1.3 }}
                      aria-label={t('groupBoard.suggestForGroup')}
                      value={suggestGroupId ?? ''}
                      onChange={(event) => setSuggestGroupId(event.target.value ? Number(event.target.value) : null)}
                    >
                      <option value="">{t('groupBoard.allPool')}</option>
                      {data.groups.filter(editable).map((g) => (
                        <option key={g.id} value={g.id}>
                          ✨ {g.name} ({g.memberCount}/{g.maxMembers})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="board-pool-students" data-board-scroll>
                  {students.map((student) => (
                    <BoardStudentCard
                      key={student.studentId}
                      student={student}
                      sourceId={null}
                      getTargets={getTargets}
                      editable={canManage}
                      onDragStart={startDrag}
                      onMove={handleMoveStudent}
                    />
                  ))}
                  {!students.length && (
                    <p className="board-empty">
                      {t(data.unassignedStudents.length ? 'groupBoard.noResults' : 'groupWorkspace.allAssignedTitle')}
                    </p>
                  )}
                </div>
                <p className="board-pool-hint">{t('groupBoard.poolHint')}</p>
              </>
            )}
          </aside>
        )}
        <div
          ref={boardRef}
          className="group-board-track"
          role="region"
          aria-label={t('groupBoard.columns')}
          tabIndex={0}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOverTarget(null);
          }}
        >
          {groups.map((group) => (
            <GroupBoardColumn
              key={group.id}
              deadlineId={deadlineId}
              classId={classId}
              group={group}
              getTargets={getTargets}
              pending={pending}
              editable={editable(group)}
              canManage={canManage}
              canUnlock={!!canUnlock}
              isSelected={selectedGroupIds.has(group.id)}
              onToggleSelect={toggleSelectGroup}
              onDragStart={startDrag}
              onDragOverColumn={dragOver}
              onDropColumn={drop}
              onMoveStudent={handleMoveStudent}
              onRemoveMember={handleRemoveMember}
              onSetGroupLeader={handleSetLeader}
              onAddGroupMember={handleAddMember}
              onSubmitGroup={handleSubmitGroup}
              onApproveGroup={handleApproveGroup}
              onRejectGroup={handleRejectGroup}
              onUnlockGroup={handleUnlockGroup}
              onDisbandGroup={handleDisbandGroup}
            />
          ))}
          {!groups.length && (
            <div className="board-empty-columns">
              <Users size={32} />
              <strong>{t(data.groups.length ? 'groupBoard.noResults' : 'groupWorkspace.emptyGroupsTitle')}</strong>
            </div>
          )}
          {canManage && (
            <div
              className="board-create-column"
              role="button"
              tabIndex={pending ? -1 : 0}
              aria-disabled={pending}
              onClick={() => {
                if (!pending) setCreate([]);
              }}
              onKeyDown={(event) => {
                if (!pending && ['Enter', ' '].includes(event.key)) {
                  event.preventDefault();
                  setCreate([]);
                }
              }}
              onDragOver={(event) => dragOver(event, 'create')}
              onDrop={(event) => drop(event, 'create')}
            >
              <Plus size={25} />
              <strong>{t('groupWorkspace.quickDropIdle')}</strong>
              <span>{t('groupWorkspace.quickDropHint')}</span>
            </div>
          )}
        </div>
      </div>
      <p className="board-bottom-hint">{t('groupBoard.edgeHint')}</p>
      <Modal title={t('groupReview.rules')} open={showRules} onCancel={() => setShowRules(false)} footer={null}>
        <div className="board-rule-details">
          {data.rules
            .filter((rule) => rule.status)
            .map((rule) => (
              <div key={rule.code}>
                <span>{t(`rules.codes.${rule.code}`)}</span>
                <strong>{rule.value}</strong>
              </div>
            ))}
        </div>
        {!data.rules.some((rule) => rule.status) && <p>{t('groupReview.noRules')}</p>}
      </Modal>
      <LecturerGroupModal
        open={create !== null}
        initialStudentIds={create ?? []}
        unassignedStudents={data.unassignedStudents}
        rules={data.rules}
        maxMembers={maxMembers}
        isLoading={pending}
        onClose={() => {
          if (!pending) setCreate(null);
        }}
        onSubmit={(values) => run(() => groupApi.lecturerCreateGroup(deadlineId!, classId!, values))}
      />
      <RejectGroupModal
        open={rejectId !== null}
        groupId={rejectId}
        isLoading={pending}
        onClose={() => {
          if (!pending) setRejectId(null);
        }}
        onSubmit={(id, reason) => run(() => groupApi.rejectGroup(deadlineId!, classId!, id, { reason }))}
      />
      <GroupPreviewExportModal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        classId={classId}
        className={data.schoolClassName}
        deadlineId={deadlineId}
        termId={positiveId(params.get('termId'))}
        termName={params.get('termName') ?? undefined}
      />
    </div>
  );
}
