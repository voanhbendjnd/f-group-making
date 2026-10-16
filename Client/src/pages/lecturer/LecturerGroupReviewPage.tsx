import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Modal, Input as AntInput, Select, Table } from 'antd';
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
import { syncDeadlineQueries } from '@/features/deadline/realtime';
import type { GroupReviewRow, GroupStatus } from '@/features/group/types/groupTypes';
import { getApiError } from '@/services/api/types';
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
  const [filters, setFilters] = useState({ page: 1, size: 10, search: '', classId: undefined as number | undefined, status: undefined as GroupStatus | undefined });
  const [search, setSearch] = useState('');
  const [viewId, setViewId] = useState<number | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState('');
  const [actionError, setActionError] = useState('');
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
    if (action.kind === 'reject' && !reason.trim()) { setActionError(t('groupReview.reasonRequired')); return; }
    busy.current = true;
    const unlock = lockTermSelection();
    try {
      await mutation.mutateAsync(action);
      toast.success(t('groupReview.saved'));
      setAction(null); setViewId(null);
    } catch (error) { setActionError(getApiError(error).message || t('groupReview.actionError')); }
    finally { try { await syncDeadlineQueries(client); } finally { unlock(); busy.current = false; } }
  };
  const begin = (kind: Action['kind'], row: GroupReviewRow) => { setReason(''); setActionError(''); setAction({ kind, row }); };
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
    <PageHeader title={t('groupReview.title')} description={t('groupReview.description')} />
    <form className="card review-filters" onSubmit={event => { event.preventDefault(); setFilters(old => ({ ...old, search: search.trim(), page: 1 })); setViewId(null); }}>
      <label>{t('groupReview.search')}<AntInput value={search} onChange={event => setSearch(event.target.value)} /></label>
      <label>{t('groupReview.class')}<Select allowClear showSearch aria-label={t('groupReview.class')} placeholder={t('groupReview.allClasses')} loading={classes.isFetching} optionFilterProp="label"
        value={filters.classId} options={classes.data?.result.map(item => ({ value: item.id, label: item.name }))}
        onChange={classId => { setFilters(old => ({ ...old, classId, page: 1 })); setViewId(null); }} /></label>
      <label>{t('groupReview.status')}<Select allowClear aria-label={t('groupReview.status')} placeholder={t('groupReview.allStatuses')}
        value={filters.status} options={statuses.map(value => ({ value, label: t(`groupReview.statuses.${value}`) }))}
        onChange={status => { setFilters(old => ({ ...old, status, page: 1 })); setViewId(null); }} /></label>
      <Button type="submit" variant="secondary">{t('groupReview.filter')}</Button>
      <Button type="button" variant="ghost" onClick={() => { void reviews.refetch(); void classes.refetch(); }}>{t('groupReview.refresh')}</Button>
    </form>
    {classes.isError && <ErrorState message={t('groupReview.classesError')} onRetry={() => { void classes.refetch(); }} />}
    {reviews.isError ? <ErrorState message={getApiError(reviews.error).message || t('groupReview.loadError')} onRetry={() => { void reviews.refetch(); }} /> : <>
      <div className="review-summary" aria-label={t('groupReview.pageSummary')}>
        {[['pending', rows.filter(row => row.group.status === 'PENDING').length], ['accepted', rows.filter(row => row.group.status === 'ACCEPTED').length], ['warnings', rows.filter(row => !row.eligible).length]].map(([key, count]) =>
          <div className="card" key={key}><span>{t(`groupReview.${key}`)}</span><strong>{reviews.isFetching ? '…' : count}</strong><small>{t('groupReview.pageSummary')}</small></div>)}
      </div>
      <div className="card review-table"><Table rowKey={row => row.group.id} columns={columns} dataSource={reviews.isFetching ? [] : rows} pagination={false} loading={reviews.isFetching} scroll={{ x: 1100 }} locale={{ emptyText: t('groupReview.empty') }} />
        {reviews.data && <Pagination meta={reviews.data.meta} currentPage={filters.page} onPageChange={page => { setFilters(old => ({ ...old, page })); setViewId(null); }} />}
      </div>
    </>}
    <Modal title={view?.group.name} open={Boolean(view)} onCancel={() => setViewId(null)} footer={null} width={740}>
      {view && <div className="review-details">
        <p>{view.className} · {t('groupReview.leader')}: {view.group.leaderName} · {view.group.memberCount} {t('groupReview.members')}</p>
        <div>{statusBadge(view.group.status)} {eligibility(view)}</div>
        {view.group.status === 'OPEN' && view.eligible && <p className="alert alert-info">{t('groupReview.awaitSubmit')}</p>}
        {!view.eligible && <p className="alert alert-warning">{t('groupReview.ineligible')}</p>}
        {view.group.rejectReason && <p className="alert alert-warning">{t('groupReview.reason')}: {view.group.rejectReason}</p>}
        <ul className="review-members">{view.group.members.map(member => <li key={member.studentId}><strong>{member.fullName || t('groupReview.missing')}</strong><span>{member.rollNumber} · {member.majorName || member.majorCode || t('groupReview.missing')}</span>{member.role === 'LEADER' && <span className="badge badge-info">{t('groupReview.leader')}</span>}</li>)}</ul>
        <h3>{t('groupReview.rules')}</h3>
        <ul className="review-rule-list">{view.group.ruleEvaluations.map(rule => <li key={rule.code} className={rule.passed ? 'review-rule-pass' : 'review-rule-fail'}>{t(`${rule.code.includes('GROUPS_PER_CLASS') ? 'groupReview.classRuleMessages' : 'studentGroup.rules'}.${rule.code}_${rule.passed ? 'passed' : 'failed'}`, { actual: rule.actualValue, target: rule.targetValue })}</li>)}</ul>
      </div>}
    </Modal>
    <Modal title={t(`groupReview.${action?.kind ?? 'approve'}`)} open={Boolean(action)} onCancel={() => { if (!busy.current) setAction(null); }}
      confirmLoading={mutation.isPending} onOk={() => { void confirm(); }} okText={t(`groupReview.${action?.kind ?? 'approve'}`)} cancelText={t('groupReview.cancel')} cancelButtonProps={{ disabled: mutation.isPending }} closable={!mutation.isPending} mask={{ closable: !mutation.isPending }}>
      <p>{t(action?.kind === 'reopen' ? 'groupReview.reopenConfirm' : action?.kind === 'reject' ? 'groupReview.rejectConfirm' : 'groupReview.approveConfirm', { name: action?.row.group.name })}</p>
      {action?.kind === 'reject' && <label className="review-reason">{t('groupReview.reason')}<AntInput.TextArea aria-label={t('groupReview.reason')} rows={4} maxLength={2000} value={reason} disabled={mutation.isPending} onChange={event => setReason(event.target.value)} /></label>}
      {actionError && <p className="alert alert-error" role="alert">{actionError}</p>}
    </Modal>
  </div>;
}
