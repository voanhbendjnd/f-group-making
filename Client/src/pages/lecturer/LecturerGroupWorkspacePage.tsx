import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Modal } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronLeft, ChevronRight, EyeOff, Plus, RefreshCw, Search, Users } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ErrorState } from '@/components/common/ErrorState';
import { DeadlineStatusBadge } from '@/features/deadline/components/DeadlineStatusBadge';
import { groupApi } from '@/features/group/api/groupApi';
import { useGroupBoard, AmbiguousGroupSessionError } from '@/features/group/hooks/useGroupBoard';
import { useBoardAutoScroll } from '@/features/group/hooks/useBoardAutoScroll';
import { BoardStudentCard } from '@/features/group/components/BoardStudentCard';
import { GroupBoardColumn } from '@/features/group/components/GroupBoardColumn';
import { LecturerGroupModal } from '@/features/group/components/LecturerGroupModal';
import { RejectGroupModal } from '@/features/group/components/RejectGroupModal';
import { positiveId, reviewPath } from '@/features/group/navigation';
import type { GroupDTO, GroupMemberDTO } from '@/features/group/types/groupTypes';
import { translateErrorMessage } from '@/services/api/errorTranslator';
import './LecturerGroupWorkspacePage.css';

interface DragStudent { studentId: number; fromGroupId: number | null; classId: number; deadlineId: number }
const quiet = (promise: Promise<unknown>) => { void promise.catch(() => {}); };
const matches = (student: GroupMemberDTO, search: string) =>
  [student.fullName, student.rollNumber, student.email, student.memberCode, student.majorCode, student.majorName]
    .some(value => value?.toLocaleLowerCase().includes(search.toLocaleLowerCase().trim()));

export function LecturerGroupWorkspacePage() {
  const [params, setParams] = useSearchParams(); const route = useParams();
  const classId = positiveId(params.get('classId') ?? route.classId);
  const requestedDeadline = positiveId(params.get('deadlineId') ?? route.deadlineId);
  // Remount local drag/modal state when following another class link in this route.
  return <GroupBoard key={`${classId}-${requestedDeadline}`} classId={classId} requestedDeadline={requestedDeadline}
    params={params} setDeadline={id => setParams(old => { const next = new URLSearchParams(old); next.set('deadlineId', String(id)); return next; }, { replace: true })} />;
}

function GroupBoard({ classId, requestedDeadline, params, setDeadline }: {
  classId: number | null; requestedDeadline: number | null; params: URLSearchParams; setDeadline: (id: number) => void;
}) {
  const { t } = useTranslation();
  const { workspace, session, deadlineId, connection, canManage, canUnlock, editable, pending, run, move } =
    useGroupBoard(classId, requestedDeadline, positiveId(params.get('termId')));
  const { boardRef, startAutoScroll, stopAutoScroll } = useBoardAutoScroll();
  const [pool, setPool] = useState<'expanded' | 'collapsed' | 'hidden'>(() => window.innerWidth < 900 ? 'collapsed' : 'expanded');
  const [studentSearch, setStudentSearch] = useState(''); const [major, setMajor] = useState('');
  const [suggestGroupId, setSuggestGroupId] = useState<number | null>(null);
  const [groupSearch, setGroupSearch] = useState(''); const [create, setCreate] = useState<number[] | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [rejectId, setRejectId] = useState<number | null>(null);
  const dragged = useRef<DragStudent | null>(null); const [draggedId, setDraggedId] = useState<number | null>(null);
  const [over, setOver] = useState<number | 'pool' | 'create' | null>(null);
  const data = workspace.data;

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
    poolRecs.forEach((r) => { map.set(r.studentId, r); });
    return map;
  }, [poolRecs]);

  useEffect(() => { if (!requestedDeadline && deadlineId) setDeadline(deadlineId); }, [deadlineId, requestedDeadline, setDeadline]);
  const clearDrag = () => { dragged.current = null; setDraggedId(null); setOver(null); stopAutoScroll(); };
  const back = reviewPath(params);
  const breadcrumb = <nav className="board-breadcrumb" aria-label={t('groupBoard.breadcrumb')}>
    <Link to={back}>{t('groupReview.title')}</Link><span aria-hidden="true">/</span>
    {data && <><Link to={back}>{data.schoolClassName}</Link><span aria-hidden="true">/</span></>}
    <span aria-current="page">{t('groupBoard.title')}</span>
  </nav>;
  if (!classId) return <div>{breadcrumb}<div className="card board-message"><p>{t('groupBoard.chooseClass')}</p><Link className="btn btn-primary" to={back}>{t('groupReview.title')}</Link></div></div>;
  if (session.isError || workspace.isError) return <div>{breadcrumb}<ErrorState
    message={session.error instanceof AmbiguousGroupSessionError ? t('groupBoard.multipleSessions') : translateErrorMessage(session.error ?? workspace.error)} onRetry={() => { if (deadlineId) void workspace.refetch(); else void session.refetch(); }} />
    {session.error instanceof AmbiguousGroupSessionError && <Link className="btn btn-primary" to="/lecturer/deadlines">{t('nav.lecturerDeadlines')}</Link>}
    <Link to={back}>{t('groupBoard.back')}</Link></div>;
  if ((!requestedDeadline && session.isPending) || (deadlineId && workspace.isPending)) return <LoadingSpinner message={t('groupWorkspace.loading')} />;
  if (!data || !deadlineId) return <div>{breadcrumb}<div className="card board-message"><p>{t('groupBoard.noSession')}</p><Link to="/lecturer/deadlines" className="btn btn-primary">{t('nav.lecturerDeadlines')}</Link></div></div>;
  const targets = data.groups.filter(editable);
  const groups = data.groups.filter(group => !groupSearch.trim() || group.name.toLocaleLowerCase().includes(groupSearch.trim().toLocaleLowerCase()) || group.members.some(student => matches(student, groupSearch)));
  const students = (data.unassignedStudents || [])
    .filter(student => (!major || student.majorCode === major) && matches(student, studentSearch))
    .map(student => {
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
  const majors = [...new Set(data.unassignedStudents.map(student => student.majorCode).filter(Boolean))].sort();
  const maxMembers = data.rules.find(rule => rule.status && rule.code === 'MAX_MEMBERS_PER_GROUP')?.value ?? data.groups[0]?.maxMembers ?? 2147483647;
  const readDrag = (event: DragEvent): DragStudent | null => {
    try {
      const payload = JSON.parse(event.dataTransfer.getData('application/json') || event.dataTransfer.getData('text/plain')) as DragStudent;
      if (payload.classId !== classId || payload.deadlineId !== deadlineId || !Number.isSafeInteger(payload.studentId)
        || !(payload.fromGroupId === null || Number.isSafeInteger(payload.fromGroupId))) return null;
      const source = data.groups.find(group => group.id === payload.fromGroupId);
      return (payload.fromGroupId === null ? data.unassignedStudents.some(student => student.studentId === payload.studentId)
        : source && editable(source) && source.members.some(student => student.studentId === payload.studentId)) ? payload : null;
    } catch { return null; }
  };
  const startDrag = (event: DragEvent<HTMLDivElement>, student: GroupMemberDTO, fromGroupId: number | null) => {
    if (!canManage || pending) { event.preventDefault(); return; }
    const payload = { studentId: student.studentId, fromGroupId, classId, deadlineId };
    event.dataTransfer.setData('application/json', JSON.stringify(payload));
    event.dataTransfer.setData('text/plain', JSON.stringify(payload)); event.dataTransfer.effectAllowed = 'move';
    dragged.current = payload; setDraggedId(student.studentId); startAutoScroll();
  };
  const dragOver = (event: DragEvent<HTMLElement>, target: number | 'pool' | 'create') => {
    if (!canManage || pending) return;
    const source = dragged.current;
    if (target === 'create' && source && source.fromGroupId !== null) return;
    if (typeof target === 'number') {
      const group = data.groups.find(item => item.id === target);
      if (!group || !editable(group) || group.memberCount >= group.maxMembers || source?.fromGroupId === target) return;
    }
    event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setOver(target);
  };
  const disband = (group: GroupDTO) => {
    if (!editable(group) || pending) return;
    Modal.confirm({ title: t('groupWorkspace.disbandConfirm.title', { name: group.name }),
      content: <p>{t('groupWorkspace.disbandConfirm.content')} {t('groupWorkspace.disbandConfirm.warning')}</p>,
      okText: t('groupWorkspace.disbandConfirm.ok'), cancelText: t('groupWorkspace.disbandConfirm.cancel'), okButtonProps: { danger: true },
      onOk: () => run(() => groupApi.lecturerDisbandGroup(deadlineId, classId, group.id)) });
  };
  const remove = (group: GroupDTO, studentId: number) => {
    if (!editable(group) || pending) return;
    if (group.memberCount <= 1) disband(group);
    else quiet(run(() => groupApi.lecturerRemoveMember(deadlineId, classId, group.id, studentId)));
  };
  const drop = (event: DragEvent<HTMLElement>, target: number | 'pool' | 'create') => {
    event.preventDefault(); event.stopPropagation(); const payload = readDrag(event); clearDrag();
    if (!payload || !canManage || pending) return;
    if (target === 'create') { if (payload.fromGroupId === null) setCreate([payload.studentId]); }
    else if (target === 'pool') { const group = data.groups.find(item => item.id === payload.fromGroupId); if (group) remove(group, payload.studentId); }
    else quiet(move(payload.studentId, payload.fromGroupId, target));
  };
  const unlock = (group: GroupDTO) => Modal.confirm({ title: t('groupLifecycle.unlock'),
    content: t('groupReview.reopenConfirm', { name: group.name }), okText: t('groupLifecycle.unlock'), cancelText: t('groupReview.cancel'),
    onOk: () => run(() => groupApi.revokeGroup(deadlineId, classId, group.id)) });
  return <div className={`group-board-page ${draggedId !== null ? 'is-board-dragging' : ''}`} aria-busy={pending} onDragEnd={clearDrag}>
    {breadcrumb}
    <header className="board-heading">
      <div><h1>{t('groupBoard.title')} <span>{data.schoolClassName}</span></h1><p>{data.deadlineName} · {t('groupBoard.subtitle')}</p></div>
      <div className="board-toolbar">
        <span className={`board-connection ${connection === 'connected' ? 'is-live' : ''}`} title={t('groupBoard.realtimeHint')}><i />{t(connection === 'connected' ? 'groupWorkspace.live' : 'groupWorkspace.offline')}</span>
        <Button variant="secondary" size="sm" disabled={pending || workspace.isFetching} aria-label={t('groupWorkspace.refreshData')} icon={<RefreshCw size={16} />} onClick={() => { void workspace.refetch(); }} />
        <Button size="sm" variant="secondary" onClick={() => setPool(old => old === 'hidden' ? 'expanded' : 'hidden')} icon={<Users size={16} />}>{t(pool === 'hidden' ? 'groupBoard.showStudents' : 'groupBoard.hideStudents')}</Button>
        {canManage && <Button size="sm" disabled={pending} icon={<Plus size={16} />} onClick={() => setCreate([])}>{t('groupWorkspace.createNewGroup')}</Button>}
      </div>
    </header>
    <div className="board-context-bar">
      <Link to={back}><ArrowLeft size={15} />{t('groupBoard.back')}</Link>
      <label className="board-search"><Search size={16} /><input aria-label={t('groupBoard.searchGroups')} placeholder={t('groupBoard.searchGroups')} value={groupSearch} onChange={event => setGroupSearch(event.target.value)} /></label>
      <span className="board-count">{t('groupBoard.groupCount', { count: data.groups.length })}</span>
      <span title={`Deadline: ${data.deadlineName}`}><DeadlineStatusBadge status={data.deadlineStatus === 'ACTIVE' ? 'ACTIVE' : data.deadlineStatus === 'UPCOMING' ? 'UPCOMING' : data.deadlineStatus === 'CANCELLED' ? 'CANCELLED' : 'EXPIRED'} /></span>
      <button className="board-rules-link" type="button" onClick={() => setShowRules(true)}>{t('groupReview.rules')}</button>
      <span role="status" className="board-save-status">{pending ? t('groupBoard.saving') : t('groupBoard.savedHint')}</span>
    </div>
    {!canManage && <p className="alert alert-info">{t('groupBoard.readOnly')}</p>}
    <div className="board-work-area">
      {pool !== 'hidden' && <aside className={`unassigned-pool board-pool ${pool === 'collapsed' ? 'is-collapsed' : ''} ${over === 'pool' ? 'is-drag-over' : ''}`}
        aria-label={t('groupWorkspace.unassignedTitle')} onDragOver={event => dragOver(event, 'pool')} onDrop={event => drop(event, 'pool')}>
        <header className="board-pool-header"><Users size={18} /><strong>{t('groupWorkspace.unassignedTitle')}</strong><span className="board-member-count">{data.unassignedStudents.length}</span>
          <button type="button" className="board-icon-button" aria-label={t(pool === 'expanded' ? 'groupBoard.collapseStudents' : 'groupBoard.expandStudents')} aria-expanded={pool === 'expanded'} onClick={() => setPool(old => old === 'expanded' ? 'collapsed' : 'expanded')}>
            {pool === 'expanded' ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
          </button>
          {pool === 'expanded' && <button type="button" className="board-icon-button" aria-label={t('groupBoard.hideStudents')} onClick={() => setPool('hidden')}><EyeOff size={16} /></button>}
        </header>
        {pool === 'expanded' && <>
          <div className="board-pool-filters">
            <label className="board-search">
              <Search size={16} />
              <input aria-label={t('groupWorkspace.searchPlaceholder')} placeholder={t('groupWorkspace.searchPlaceholder')} value={studentSearch} onChange={event => setStudentSearch(event.target.value)} />
            </label>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <select style={{ flex: 1 }} aria-label={t('groupBoard.majorFilter')} value={major} onChange={event => setMajor(event.target.value)}>
                <option value="">{t('groupWorkspace.all')}</option>
                {[...new Set([...majors, ...(major ? [major] : [])])].map(code => <option key={code} value={code}>{code}</option>)}
              </select>
              <select
                style={{ flex: 1.3 }}
                aria-label={t('groupBoard.suggestForGroup')}
                value={suggestGroupId ?? ''}
                onChange={event => setSuggestGroupId(event.target.value ? Number(event.target.value) : null)}
              >
                <option value="">{t('groupBoard.allPool')}</option>
                {data.groups.filter(editable).map(g => (
                  <option key={g.id} value={g.id}>
                    ✨ {g.name} ({g.memberCount}/{g.maxMembers})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="board-pool-students" data-board-scroll>
            {students.map(student => <BoardStudentCard key={student.studentId} student={student} source={null} targets={targets} editable={canManage} pending={pending} dragging={draggedId === student.studentId}
              onDragStart={event => startDrag(event, student, null)} onDragEnd={clearDrag} onMove={target => quiet(move(student.studentId, null, target))} />)}
            {!students.length && <p className="board-empty">{t(data.unassignedStudents.length ? 'groupBoard.noResults' : 'groupWorkspace.allAssignedTitle')}</p>}
          </div>
          <p className="board-pool-hint">{t('groupBoard.poolHint')}</p>
        </>}
      </aside>}
      <div ref={boardRef} className="group-board-track" role="region" aria-label={t('groupBoard.columns')} tabIndex={0}
        onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(null); }}>
        {groups.map(group => <GroupBoardColumn key={group.id} deadlineId={deadlineId} classId={classId} group={group} targets={targets} editable={editable(group)} canManage={canManage} canUnlock={!!canUnlock} pending={pending}
          dragOver={over === group.id} draggedId={draggedId} onDragStart={startDrag} onDragEnd={clearDrag}
          onDragOver={event => dragOver(event, group.id)} onDrop={event => drop(event, group.id)}
          onMove={(studentId, target) => quiet(move(studentId, group.id, target))} onRemove={studentId => remove(group, studentId)}
          onSetLeader={studentId => quiet(run(() => groupApi.lecturerSetLeader(deadlineId, classId, group.id, studentId)))}
          onAddMember={studentId => quiet(move(studentId, null, group.id))}
          onSubmit={() => quiet(run(() => groupApi.lecturerSubmitGroup(deadlineId, classId, group.id)))}
          onApprove={() => quiet(run(() => groupApi.acceptGroup(deadlineId, classId, group.id)))}
          onReject={() => setRejectId(group.id)} onUnlock={() => unlock(group)} onDisband={() => disband(group)} />)}
        {!groups.length && <div className="board-empty-columns"><Users size={32} /><strong>{t(data.groups.length ? 'groupBoard.noResults' : 'groupWorkspace.emptyGroupsTitle')}</strong></div>}
        {canManage && <div className={`board-create-column ${over === 'create' ? 'is-drag-over' : ''}`} role="button" tabIndex={pending ? -1 : 0} aria-disabled={pending}
          onClick={() => { if (!pending) setCreate([]); }} onKeyDown={event => { if (!pending && ['Enter', ' '].includes(event.key)) { event.preventDefault(); setCreate([]); } }}
          onDragOver={event => dragOver(event, 'create')} onDrop={event => drop(event, 'create')}>
          <Plus size={25} /><strong>{t('groupWorkspace.quickDropIdle')}</strong><span>{t('groupWorkspace.quickDropHint')}</span>
        </div>}
      </div>
    </div>
    <p className="board-bottom-hint">{t('groupBoard.edgeHint')}</p>
    <Modal title={t('groupReview.rules')} open={showRules} onCancel={() => setShowRules(false)} footer={null}>
      <div className="board-rule-details">{data.rules.filter(rule => rule.status).map(rule => <div key={rule.code}><span>{t(`rules.codes.${rule.code}`)}</span><strong>{rule.value}</strong></div>)}</div>
      {!data.rules.some(rule => rule.status) && <p>{t('groupReview.noRules')}</p>}
    </Modal>
    <LecturerGroupModal open={create !== null} initialStudentIds={create ?? []} unassignedStudents={data.unassignedStudents} rules={data.rules} maxMembers={maxMembers} isLoading={pending}
      onClose={() => { if (!pending) setCreate(null); }} onSubmit={values => run(() => groupApi.lecturerCreateGroup(deadlineId, classId, values))} />
    <RejectGroupModal open={rejectId !== null} groupId={rejectId} isLoading={pending} onClose={() => { if (!pending) setRejectId(null); }}
      onSubmit={(id, reason) => run(() => groupApi.rejectGroup(deadlineId, classId, id, { reason }))} />
  </div>;
}
