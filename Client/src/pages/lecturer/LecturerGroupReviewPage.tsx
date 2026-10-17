import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Modal, Input as AntInput, Select, Table } from 'antd';
import { AlertTriangle, CheckCircle2, ClipboardCheck, Clock3, GraduationCap, Info, Layers, RefreshCw, Search, SlidersHorizontal, Sparkles, Target, Users } from 'lucide-react';
import { useTerm } from '@/app/providers/TermContext';
import { useAuth } from '@/app/providers/AuthContext';
import { useRealtime } from '@/app/providers/realtimeContext';
import { useToast } from '@/app/providers/ToastContext';
import { TermScope } from '@/features/terms/components/TermScope';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/common/Button';
import { ErrorState } from '@/components/common/ErrorState';
import { Pagination } from '@/components/common/Pagination';
import { classApi } from '@/features/classes/api/classApi';
import { groupApi } from '@/features/group/api/groupApi';
import { advancedGroupPath, positiveId } from '@/features/group/navigation';
import { syncDeadlineQueries } from '@/features/deadline/realtime';
import type { GroupReviewRow, GroupStatus } from '@/features/group/types/groupTypes';
import { getApiError } from '@/services/api/types';
import { translateErrorMessage } from '@/services/api/errorTranslator';
import './LecturerGroupReviewPage.css';

const statuses: GroupStatus[] = ['OPEN', 'PENDING', 'ACCEPTED', 'REVOKED'];
type Action = { kind: 'approve' | 'reject' | 'reopen'; row: GroupReviewRow };

export function LecturerGroupReviewPage() {
  const { selectedTermId } = useTerm();
  return <TermScope><ReviewContent key={selectedTermId} /></TermScope>;
}

function ReviewContent() {
  const { t, i18n } = useTranslation();
  const { selectedTermId, lockTermSelection } = useTerm();
  const { user } = useAuth();
  const toast = useToast();
  const client = useQueryClient();
  const { subscribe } = useRealtime();
  const navigate = useNavigate(); const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useState(() => {
    const sameTerm = !params.has('termId') || positiveId(params.get('termId')) === selectedTermId;
    const status = params.get('status') as GroupStatus;
    return { page: sameTerm ? positiveId(params.get('page')) ?? 1 : 1, size: 10,
      search: sameTerm ? params.get('search') ?? '' : '',
      classId: sameTerm ? positiveId(params.get('classId')) ?? undefined : undefined,
      status: sameTerm && statuses.includes(status) ? status : undefined };
  });
  const [search, setSearch] = useState(filters.search);
  const filterQuery = new URLSearchParams({ termId: String(selectedTermId), page: String(filters.page) });
  if (filters.classId) filterQuery.set('classId', String(filters.classId));
  if (filters.status) filterQuery.set('status', filters.status);
  if (filters.search) filterQuery.set('search', filters.search);
  const filterString = filterQuery.toString();
  useEffect(() => { if (params.toString() !== filterString) setParams(filterString, { replace: true }); }, [params, filterString, setParams]);
  const [viewId, setViewId] = useState<number | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState('');
  const [actionError, setActionError] = useState<unknown>(null);
  const [reasonRequired, setReasonRequired] = useState(false);
  const busy = useRef(false);
  const classes = useQuery({ queryKey: ['my-school-classes', user?.id, selectedTermId, 'review'],
    queryFn: async ({ signal }) => {
      const first = await classApi.getMyClasses({ termId: selectedTermId!, size: 50 }, signal);
      const result = [...first.result];
      for (let page = 2; page <= first.meta.pages; page++) {
        const next = await classApi.getMyClasses({ termId: selectedTermId!, size: 50, page }, signal);
        result.push(...next.result);
      }
      return { ...first, result };
    } });
  const reviews = useQuery({ queryKey: ['group-reviews', user?.id, selectedTermId, filters],
    queryFn: ({ signal }) => groupApi.getReviews({ ...filters, termId: selectedTermId! }, signal),
    refetchInterval: 30000,
    retry: (count, error) => count < 1 && ![400, 401, 403].includes(getApiError(error).status) });
  const pages = reviews.data?.meta.pages;
  if (pages && filters.page > pages) setFilters({ ...filters, page: pages });
  const rows = reviews.data?.result ?? [];
  const boardClassId = filters.classId ?? (classes.data?.result.length === 1 ? classes.data.result[0].id : undefined);
  const selectedClass = classes.data?.result.find(c => c.id === filters.classId);
  const openBoard = (targetClassId?: number) => {
    const cid = targetClassId ?? boardClassId;
    if (!cid) return;
    const deadlineId = rows.find(row => row.group.schoolClassId === cid)?.group.deadlineId;
    navigate(advancedGroupPath(cid, filterQuery, deadlineId));
  };
  const topics = [...new Set([...(classes.data?.result ?? []).map(item => item.id), ...rows.map(row => row.group.schoolClassId)])].sort((a, b) => a - b).join(',');
  useEffect(() => {
    const cleanup = topics.split(',').filter(Boolean).map(id => subscribe(`/topic/classes/${id}/deadlines`));
    return () => cleanup.forEach(unsubscribe => unsubscribe());
  }, [topics, subscribe]);
  const mutation = useMutation({ retry: false,
    mutationFn: async (request: Action) => {
      const { deadlineId, schoolClassId, id } = request.row.group;
      if (request.kind === 'approve') return groupApi.acceptGroup(deadlineId, schoolClassId, id);
      if (request.kind === 'reopen') return groupApi.revokeGroup(deadlineId, schoolClassId, id);
      return groupApi.rejectGroup(deadlineId, schoolClassId, id, { reason: reason.trim() });
    } });
  const confirm = async () => {
    if (!action || busy.current) return;
    if (action.kind === 'reject' && !reason.trim()) { setReasonRequired(true); return; }
    setReasonRequired(false);
    busy.current = true;
    const unlock = lockTermSelection();
    try {
      await mutation.mutateAsync(action);
      toast.success(t('groupReview.saved'));
      setAction(null); setViewId(null);
    } catch (error) { setActionError(error); }
    finally { try { await syncDeadlineQueries(client); } finally { unlock(); busy.current = false; } }
  };
  const begin = (kind: Action['kind'], row: GroupReviewRow) => { setReason(''); setReasonRequired(false); setActionError(null); setAction({ kind, row }); };
  const view = rows.find(row => row.group.id === viewId);
  const statusBadge = (status: GroupStatus) => <span className={`badge ${status === 'ACCEPTED' ? 'badge-success' : status === 'PENDING' ? 'badge-info' : 'badge-warning'}`}>{t(`groupReview.statuses.${status}`)}</span>;
  const eligibility = (row: GroupReviewRow) => <span className={`badge ${row.eligible ? 'badge-success' : 'badge-warning'}`}>{t(row.eligible ? 'groupReview.ready' : 'groupReview.needsWork')}</span>;
  const columns = [
    { title: t('groupReview.group'), key: 'group', render: (_: unknown, row: GroupReviewRow) => <strong>{row.group.name}</strong> },
    { title: t('groupReview.class'), dataIndex: 'className', key: 'class' },
    { title: t('groupReview.leader'), key: 'leader', render: (_: unknown, row: GroupReviewRow) => row.group.leaderName && row.group.leaderName !== 'N/A' ? row.group.leaderName : t('groupReview.missing') },
    { title: t('groupReview.members'), key: 'members', render: (_: unknown, row: GroupReviewRow) => row.group.memberCount },
    { title: t('groupReview.rules'), key: 'rules', render: (_: unknown, row: GroupReviewRow) => eligibility(row) },
    { title: t('groupReview.status'), key: 'status', render: (_: unknown, row: GroupReviewRow) => statusBadge(row.group.status) },
    { title: t('groupReview.submittedAt'), key: 'submitted', render: (_: unknown, row: GroupReviewRow) => row.submittedAt ? new Date(row.submittedAt).toLocaleString(i18n.language) : t('groupReview.notSubmitted') },
    { title: t('groupReview.actions'), key: 'actions', render: (_: unknown, row: GroupReviewRow) => <div className="review-actions">
      <Button size="sm" variant="secondary" onClick={() => setViewId(row.group.id)}>{t('groupReview.view')}</Button>
      {row.canReview && <>
        <Button size="sm" disabled={!row.eligible || mutation.isPending} onClick={() => begin('approve', row)}>{t('groupReview.approve')}</Button>
        <Button size="sm" variant="ghost" disabled={mutation.isPending} onClick={() => begin('reject', row)}>{t('groupReview.reject')}</Button>
      </>}
      {row.canReopen && <Button size="sm" variant="secondary" disabled={mutation.isPending} onClick={() => begin('reopen', row)}>{t('groupReview.reopen')}</Button>}
    </div> },
  ];
  return <div className="group-review-page">
    <PageHeader title={t('groupReview.title')} description={t('groupReview.description')}
      action={<div className="review-board-entry"><Button icon={<Users size={17} />} disabled={!boardClassId || classes.isError || classes.isPending} onClick={() => openBoard()}>{t('groupBoard.open')}</Button>
        {!boardClassId && <small>{t('groupBoard.chooseClass')}</small>}</div>} />
    <section className="card review-classes-card" aria-label={t('groupReview.myClassesTitle')}>
      <div className="review-classes-header">
        <div className="review-classes-title-group">
          <div className="review-classes-icon" aria-hidden="true"><GraduationCap size={22} /></div>
          <div>
            <h2 className="review-classes-title">{t('groupReview.myClassesTitle')}</h2>
            <p className="review-classes-subtitle">{t('groupReview.selectClassHint')}</p>
          </div>
        </div>
        {classes.data && <span className="badge badge-info review-classes-count">{t('groupReview.classesCount', { count: classes.data.result.length })}</span>}
      </div>
      {classes.isPending ? (
        <div className="review-classes-loading"><RefreshCw size={18} className="spin" aria-hidden="true" /><span>{t('groupReview.refresh')}…</span></div>
      ) : classes.data?.result.length === 0 ? (
        <p className="review-classes-empty">{t('groupReview.noAssignedClasses')}</p>
      ) : (
        <div className="review-classes-grid">
          <button type="button" className={`review-class-item ${!filters.classId ? 'is-active' : ''}`}
            onClick={() => { setFilters(old => ({ ...old, classId: undefined, page: 1 })); setViewId(null); }}>
            <div className="review-class-item-top">
              <div className="review-class-badge-icon" aria-hidden="true"><Layers size={18} /></div>
              {!filters.classId && <span className="review-active-pill"><CheckCircle2 size={12} aria-hidden="true" />{t('groupReview.activePill')}</span>}
            </div>
            <div className="review-class-item-name">{t('groupReview.allClassesCard')}</div>
            <div className="review-class-item-meta"><span>{t('groupReview.allClassesMeta', { count: classes.data?.result.length ?? 0 })}</span></div>
          </button>
          {classes.data?.result.map(cls => {
            const isSelected = filters.classId === cls.id;
            return <button key={cls.id} type="button" className={`review-class-item ${isSelected ? 'is-active' : ''}`}
              onClick={() => { setFilters(old => ({ ...old, classId: cls.id, page: 1 })); setViewId(null); }}>
              <div className="review-class-item-top">
                <div className="review-class-badge-icon" aria-hidden="true"><GraduationCap size={18} /></div>
                {isSelected && <span className="review-active-pill"><CheckCircle2 size={12} aria-hidden="true" />{t('groupReview.activePill')}</span>}
              </div>
              <div className="review-class-item-name">{cls.name}</div>
              <div className="review-class-item-meta"><Users size={14} aria-hidden="true" /><span>{t('groupReview.studentCount', { count: cls.studentCount })}</span></div>
            </button>;
          })}
        </div>
      )}
    </section>
    {selectedClass ? (
      <div className="card review-selected-class-banner" role="region" aria-label={t('groupReview.selectedClassHeading')}>
        <div className="selected-class-info">
          <div className="selected-class-icon" aria-hidden="true"><Sparkles size={24} /></div>
          <div className="selected-class-details">
            <div className="selected-class-pretitle">{t('groupReview.managingClass')}</div>
            <h3 className="selected-class-title">{selectedClass.name}</h3>
            <div className="selected-class-badges">
              <span className="badge badge-neutral"><Users size={13} aria-hidden="true" />{t('groupReview.studentCount', { count: selectedClass.studentCount })}</span>
              {reviews.data && <span className="badge badge-info">{t('groupReview.classGroupsCount', { count: reviews.data.meta.total })}</span>}
            </div>
          </div>
        </div>
        <div className="selected-class-actions">
          <Button variant="primary" icon={<SlidersHorizontal size={16} />} onClick={() => openBoard(selectedClass.id)} disabled={classes.isError || classes.isPending}>{t('groupReview.openAdvancedAction')}</Button>
          <Button variant="secondary" onClick={() => { setFilters(old => ({ ...old, classId: undefined, page: 1 })); setViewId(null); }}>{t('groupReview.viewAllClasses')}</Button>
        </div>
      </div>
    ) : (
      <div className="review-class-prompt-banner"><Info size={18} aria-hidden="true" /><span>{t('groupReview.selectClassPrompt')}</span></div>
    )}
    <div className="review-summary" aria-label={t('groupReview.pageSummary')}>
      {[
        { key: 'pending', count: rows.filter(row => row.group.status === 'PENDING').length, Icon: Clock3 },
        { key: 'accepted', count: rows.filter(row => row.group.status === 'ACCEPTED').length, Icon: CheckCircle2 },
        { key: 'warnings', count: rows.filter(row => !row.eligible).length, Icon: AlertTriangle },
      ].map(({ key, count, Icon }) => <div className={`card review-stat review-stat-${key}`} key={key}>
        <div className="review-stat-content"><span>{t(`groupReview.${key}`)}</span><strong>{reviews.isError ? '—' : reviews.isFetching ? '…' : count}</strong><small>{t('groupReview.pageSummary')}</small></div>
        <span className="review-stat-icon" aria-hidden="true"><Icon size={23} /></span>
      </div>)}
    </div>
    <form className="card review-filters" onSubmit={event => { event.preventDefault(); setFilters(old => ({ ...old, search: search.trim(), page: 1 })); setViewId(null); }}>
      <label className="review-search-field">{t('groupReview.search')}<AntInput prefix={<Search size={16} aria-hidden="true" />} value={search} onChange={event => setSearch(event.target.value)} /></label>
      <label>{t('groupReview.class')}<Select allowClear showSearch aria-label={t('groupReview.class')} placeholder={t('groupReview.allClasses')} loading={classes.isFetching} optionFilterProp="label"
        value={filters.classId} options={classes.data?.result.map(item => ({ value: item.id, label: item.name }))}
        onChange={classId => { setFilters(old => ({ ...old, classId, page: 1 })); setViewId(null); }} /></label>
      <label>{t('groupReview.status')}<Select allowClear aria-label={t('groupReview.status')} placeholder={t('groupReview.allStatuses')}
        value={filters.status} options={statuses.map(value => ({ value, label: t(`groupReview.statuses.${value}`) }))}
        onChange={status => { setFilters(old => ({ ...old, status, page: 1 })); setViewId(null); }} /></label>
      <div className="review-filter-actions">
        <Button type="submit" variant="primary" icon={<Search size={16} />}>{t('groupReview.filter')}</Button>
        <Button type="button" variant="secondary" icon={<RefreshCw size={16} />} onClick={() => { void reviews.refetch(); void classes.refetch(); }}>{t('groupReview.refresh')}</Button>
      </div>
    </form>
    {classes.isError && <ErrorState message={t('groupReview.classesError')} onRetry={() => { void classes.refetch(); }} />}
    {reviews.isError ? <ErrorState message={translateErrorMessage(reviews.error)} onRetry={() => { void reviews.refetch(); }} /> : <>
      <div className="card review-table">
        <div className="review-table-heading"><span><ClipboardCheck size={18} aria-hidden="true" />{t('groupReview.title')}</span>{reviews.data && <span className="badge badge-info">{reviews.data.meta.total}</span>}</div>
        <Table rowKey={row => row.group.id} columns={columns} dataSource={reviews.isFetching ? [] : rows} pagination={false} loading={reviews.isFetching} scroll={{ x: 1100 }} locale={{ emptyText: t('groupReview.empty') }} />
        {reviews.data && <div className="review-pagination"><Pagination meta={reviews.data.meta} currentPage={filters.page} onPageChange={page => { setFilters(old => ({ ...old, page })); setViewId(null); }} /></div>}
      </div>
    </>}
    <Modal className="review-detail-modal" aria-labelledby="review-detail-name" title={<span className="review-detail-title" id="review-detail-name"><ClipboardCheck size={28} aria-hidden="true" />{view?.group.name}</span>} open={Boolean(view)} onCancel={() => setViewId(null)} footer={null} width={1120}>
      {view && <div className="review-details">
        <div className="review-detail-overview">
          <div className="review-detail-badges">{statusBadge(view.group.status)} {eligibility(view)}</div>
          <dl className="review-detail-metadata">
            <div><dt>{t('groupReview.class')}</dt><dd>{view.className}</dd></div>
            <div><dt>{t('groupReview.leader')}</dt><dd>{view.group.leaderName && view.group.leaderName !== 'N/A' ? view.group.leaderName : t('groupReview.missing')}</dd></div>
            <div><dt>{t('groupReview.members')}</dt><dd>{view.group.memberCount}</dd></div>
          </dl>
          <Target className="review-overview-art" size={76} strokeWidth={1.25} aria-hidden="true" />
        </div>
        {view.group.status === 'OPEN' && view.eligible && <p className="review-header-notice review-header-info"><ClipboardCheck size={16} aria-hidden="true" /><span>{t('groupReview.awaitSubmit')}</span></p>}
        {!view.eligible && <p className="review-header-notice"><AlertTriangle size={16} aria-hidden="true" /><span>{t('groupReview.ineligible')}</span></p>}
        {view.group.rejectReason && <p className="review-header-notice"><AlertTriangle size={16} aria-hidden="true" /><span>{t('groupReview.reason')}: {view.group.rejectReason}</span></p>}
        <section aria-label={t('groupReview.members')}>
          <div className="review-detail-section-heading"><h3><Users size={22} aria-hidden="true" />{t('groupReview.members')}</h3><span className="badge badge-neutral">{view.group.memberCount}</span></div>
          <ul className="review-members">{view.group.members.map(member => <li key={member.studentId}>
            <span className="review-member-avatar" aria-hidden="true">{member.fullName?.trim().charAt(0).toUpperCase()}</span>
            <div className="review-member-identity"><strong>{member.fullName || t('groupReview.missing')}</strong><span>{member.rollNumber} · {member.majorName || member.majorCode || t('groupReview.missing')}</span></div>
            <span className={`badge ${member.role === 'LEADER' ? 'badge-info' : 'badge-neutral'}`}>{t(member.role === 'LEADER' ? 'groupReview.leader' : 'studentWidget.roleMember')}</span>
          </li>)}</ul>
        </section>
        <section aria-label={t('groupReview.rules')} className="review-rules-section">
          <div className="review-detail-section-heading"><h3><Target size={22} aria-hidden="true" />{t('groupReview.rules')}</h3><div className="review-rule-summary"><span>{t('groupReview.ruleChecks', { passed: view.group.ruleEvaluations.filter(rule => rule.passed).length, total: view.group.ruleEvaluations.length })}</span>{view.group.ruleEvaluations.length > 0 && <meter min={0} max={view.group.ruleEvaluations.length} value={view.group.ruleEvaluations.filter(rule => rule.passed).length} aria-label={t('groupReview.rules')} />}</div></div>
          <ul className="review-rule-list">{view.group.ruleEvaluations.map(rule => <li key={rule.code} className={`review-rule-card ${rule.passed ? 'review-rule-pass' : 'review-rule-fail'}`}>
            <div className="review-rule-heading">
              {rule.passed ? <CheckCircle2 size={19} aria-hidden="true" /> : <AlertTriangle size={19} aria-hidden="true" />}
              <strong>{t(`rules.codes.${rule.code}`)}</strong>
              <span className={`badge ${rule.passed ? 'badge-success' : 'badge-warning'}`}>{t(rule.passed ? 'groupReview.rulePassed' : 'groupReview.ruleFailed')}</span>
            </div>
            <div className="review-rule-metrics"><div><span>{t('groupReview.actual')}</span><strong>{rule.actualValue}</strong></div><div><span>{t('groupReview.target')}</span><strong>{rule.code.startsWith('MIN_') ? '≥' : '≤'} {rule.targetValue}</strong></div></div>
            <p><Info size={14} aria-hidden="true" /><span>{t(`${rule.code.includes('GROUPS_PER_CLASS') ? 'groupReview.classRuleMessages' : 'studentGroup.rules'}.${rule.code}_${rule.passed ? 'passed' : 'failed'}`, { actual: rule.actualValue, target: rule.targetValue })}</span></p>
          </li>)}</ul>
          {view.group.ruleEvaluations.length === 0 && <p className="review-rules-empty">{t('groupReview.noRules')}</p>}
        </section>
      </div>}
    </Modal>
    <Modal title={t(`groupReview.${action?.kind ?? 'approve'}`)} open={Boolean(action)} onCancel={() => { if (!busy.current) setAction(null); }}
      confirmLoading={mutation.isPending} onOk={() => { void confirm(); }} okText={t(`groupReview.${action?.kind ?? 'approve'}`)} cancelText={t('groupReview.cancel')} cancelButtonProps={{ disabled: mutation.isPending }} closable={!mutation.isPending} mask={{ closable: !mutation.isPending }}>
      <p>{t(action?.kind === 'reopen' ? 'groupReview.reopenConfirm' : action?.kind === 'reject' ? 'groupReview.rejectConfirm' : 'groupReview.approveConfirm', { name: action?.row.group.name })}</p>
      {action?.kind === 'reject' && <label className="review-reason">{t('groupReview.reason')}<AntInput.TextArea aria-label={t('groupReview.reason')} rows={4} maxLength={2000} value={reason} disabled={mutation.isPending} onChange={event => setReason(event.target.value)} /></label>}
      {(reasonRequired || Boolean(actionError)) && <p className="alert alert-error" role="alert">{reasonRequired ? t('groupReview.reasonRequired') : translateErrorMessage(actionError)}</p>}
    </Modal>
  </div>;
}
