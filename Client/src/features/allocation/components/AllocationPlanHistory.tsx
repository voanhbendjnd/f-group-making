import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Drawer, Skeleton, Table, Tag, Tooltip } from 'antd';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Eye, RefreshCw } from 'lucide-react';
import { useAuth } from '@/app/providers/AuthContext';
import { useTerm } from '@/app/providers/TermContext';
import { allocationApi } from '../api/allocationApi';
import { AllocationGroups } from './AllocationGroups';
import { AllocationReport } from './AllocationReport';
import { RecommendedPlanBadge } from './RecommendedPlanBadge';
import { allocationErrorKey } from '../utils';
import type { PlanDetail, PlanSummary } from '../types';

export function AllocationPlanHistory({ classId, deadlineId, snapshotFingerprint, disabled, onSelect, onApply }: {
  classId: number; deadlineId: number; snapshotFingerprint: string; disabled: boolean; onSelect: (detail: PlanDetail) => void; onApply: (detail: PlanDetail) => void;
}) {
  const { t, i18n } = useTranslation(); const { user } = useAuth(); const { selectedTermId } = useTerm();
  const client = useQueryClient(); const [page, setPage] = useState(1); const [planId, setPlanId] = useState<string | null>(null);
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null); const [error, setError] = useState<unknown>(null);
  const key = ['allocation', user?.id, selectedTermId, classId, deadlineId, 'plans'];
  const history = useQuery({ queryKey: [...key, page], queryFn: ({ signal }) => allocationApi.plans(deadlineId, classId, page, signal), retry: false });
  const recommendation = useQuery({ queryKey: [...key, 'recommendation', snapshotFingerprint],
    queryFn: ({ signal }) => allocationApi.recommendation(deadlineId, classId, signal), retry: false });
  const recommended = !recommendation.isFetching && !recommendation.isError && !disabled
    && recommendation.data?.snapshotFingerprint === snapshotFingerprint && recommendation.data.planId ? recommendation.data : null;
  const detailKey = (id: string | null) => [...key, 'detail', id];
  const detail = useQuery({ queryKey: detailKey(planId), enabled: planId !== null,
    queryFn: ({ signal }) => allocationApi.plan(deadlineId, classId, planId!, signal), retry: false });
  const actor = (row: PlanSummary) => row.actorName || (row.actorId === user?.id ? user.name || user.email : t('allocation.actorReference', { id: row.actorId }));
  const applyHint = (row: PlanSummary) => disabled || loadingPlan !== null ? t('allocation.actionsLocked') : row.canApply ? undefined
    : row.invalidReason ? t(`allocation.errors.${row.invalidReason}`, { defaultValue: t('allocation.errors.other') })
      : row.status === 'UNAPPLIED' ? t('allocation.planOwnerOnly') : t(`allocation.planStatuses.${row.status}`);
  const applySaved = async (id: string) => {
    if (disabled || loadingPlan) return;
    setLoadingPlan(id); setError(null);
    try {
      const saved = await client.fetchQuery({ queryKey: detailKey(id), staleTime: 0, queryFn: ({ signal }) => allocationApi.plan(deadlineId, classId, id, signal) });
      if (!saved.summary.canApply) { setPlanId(id); return; }
      onApply(saved); setPlanId(null);
    } catch (failure) { setError(failure); }
    finally { setLoadingPlan(null); }
  };
  const failure = (value: unknown) => <Alert type="error" showIcon title={t(`allocation.errors.${allocationErrorKey(value)}`, { defaultValue: t('allocation.errors.other') })} />;
  return <>
    <section className="allocation-panel allocation-history-panel">
      <div className="allocation-heading"><div><h2>{t('allocation.randomHistory')}</h2><p>{t('allocation.randomHistoryHint')}</p></div>
        <Button icon={<RefreshCw size={15} aria-hidden="true" />} loading={history.isFetching || recommendation.isFetching}
          onClick={() => void Promise.allSettled([history.refetch(), recommendation.refetch()])}>{t('allocation.refresh')}</Button></div>
      <div className="allocation-recommendation" role="status">
        {recommendation.isFetching ? <span>{t('allocation.recommendation.loading')}</span>
          : recommendation.isError ? <span>{t('allocation.recommendation.error')}</span>
          : recommended ? <><RecommendedPlanBadge recommendation={recommended} /><span>{t('allocation.recommendation.target', { count: recommended.targetGroupCount })}</span>
            <Button size="small" icon={<Eye size={14} aria-hidden="true" />} onClick={() => setPlanId(recommended.planId)}>{t('allocation.viewPlan')}</Button></>
          : <span>{t(disabled ? 'allocation.actionsLocked' : 'allocation.recommendation.none')}</span>}
      </div>
      {error !== null && failure(error)}
      {history.isError && failure(history.error)}
      {(!history.isError || history.data) && <Table className="allocation-plan-history-table" tableLayout="fixed" rowKey="planId" loading={history.isPending} dataSource={history.data?.result ?? []} size="small" scroll={{ x: 1030 }}
        locale={{ emptyText: t('allocation.noRandomHistory') }} pagination={{ current: page, pageSize: 10, total: history.data?.meta.total ?? 0, showSizeChanger: false, position: ['bottomRight'], onChange: setPage }} columns={[
          { title: t('allocation.randomAt'), width: 124, render: (_, row) => <time className="allocation-table-time" dateTime={row.createdAt}><strong>{new Date(row.createdAt).toLocaleDateString(i18n.language)}</strong><span>{new Date(row.createdAt).toLocaleTimeString(i18n.language)}</span></time> },
          { title: t('allocation.actor'), width: 146, render: (_, row) => actor(row) },
          { title: t('allocation.target'), dataIndex: 'targetGroupCount', width: 130, align: 'center', className: 'allocation-history-number' },
          { title: t('allocation.totalStudents'), width: 90, align: 'center', className: 'allocation-history-number', render: (_, row) => row.totalStudents ?? t('allocation.missing') },
          { title: t('allocation.planStatusLabel'), width: 230, render: (_, row) => <div className="allocation-plan-status">
            <Tag className="allocation-history-status" icon={row.status === 'APPLIED' ? <CheckCircle2 size={12} aria-hidden="true" /> : undefined} color={row.status === 'APPLIED' ? 'success' : row.status === 'INVALID' ? 'warning' : 'blue'}>{t(`allocation.planStatuses.${row.status}`)}</Tag>
            {row.canApply && row.status === 'UNAPPLIED' && recommended?.planId === row.planId && <RecommendedPlanBadge recommendation={recommended} />}
            {row.appliedAt && <time className="allocation-plan-applied-time allocation-muted" dateTime={row.appliedAt}>{t('allocation.appliedAt')}: {new Date(row.appliedAt).toLocaleString(i18n.language)}</time>}
          </div> },
          { title: t('allocation.details'), width: 310, className: 'allocation-history-action-cell', render: (_, row) => <div className="allocation-table-actions">
            <Tooltip title={!row.available ? t('allocation.errors.allocationPlanUnavailable') : undefined} trigger={['hover', 'focus']}><span className="allocation-action-hint" tabIndex={!row.available ? 0 : undefined}><Button size="small" icon={<Eye size={15} aria-hidden="true" />} disabled={!row.available} onClick={() => setPlanId(row.planId)}>{t('allocation.viewPlan')}</Button></span></Tooltip>
            <Tooltip title={applyHint(row)} trigger={['hover', 'focus']}><span className="allocation-action-hint" tabIndex={applyHint(row) ? 0 : undefined}><Button size="small" type="primary" ghost icon={<CheckCircle2 size={15} aria-hidden="true" />} disabled={disabled || !row.canApply || loadingPlan !== null} loading={loadingPlan === row.planId} onClick={() => void applySaved(row.planId)}>{t(row.status === 'APPLIED' ? 'allocation.planStatuses.APPLIED' : 'allocation.applyPlan')}</Button></span></Tooltip>
          </div> },
        ]} />}
    </section>
    <Drawer open={planId !== null} onClose={() => setPlanId(null)} title={t('allocation.savedPlan')} size="large" rootClassName="allocation-history-overlay" className="allocation-history-drawer">
      {detail.isPending ? <Skeleton active /> : detail.isError ? failure(detail.error) : detail.data && <>
        <div className="allocation-history-summary"><Tag className="allocation-history-status" color={detail.data.summary.status === 'APPLIED' ? 'success' : detail.data.summary.status === 'INVALID' ? 'warning' : 'blue'}>{t(`allocation.planStatuses.${detail.data.summary.status}`)}</Tag>
          <p>{actor(detail.data.summary)} · {new Date(detail.data.summary.createdAt).toLocaleString(i18n.language)}</p><span>{t('allocation.savedPlanHint')}</span></div>
        {detail.data.summary.invalidReason && <Alert type="warning" showIcon title={t(`allocation.errors.${detail.data.summary.invalidReason}`, { defaultValue: t('allocation.errors.other') })} />}
        <div className="allocation-actions allocation-history-actions">
          <Tooltip title={disabled ? t('allocation.actionsLocked') : undefined} trigger={['hover', 'focus']}><span className="allocation-action-hint" tabIndex={disabled ? 0 : undefined}><Button disabled={disabled} onClick={() => { onSelect(detail.data!); setPlanId(null); }}>{t('allocation.openPlan')}</Button></span></Tooltip>
          <Tooltip title={applyHint(detail.data.summary)} trigger={['hover', 'focus']}><span className="allocation-action-hint" tabIndex={applyHint(detail.data.summary) ? 0 : undefined}><Button type="primary" icon={<CheckCircle2 size={15} aria-hidden="true" />} disabled={disabled || !detail.data.summary.canApply || loadingPlan !== null} loading={loadingPlan === planId} onClick={() => void applySaved(planId!)}>{t('allocation.applyPlan')}</Button></span></Tooltip>
        </div>
        <AllocationGroups groups={detail.data.preview.groups} />
        {detail.data.preview.report && <AllocationReport report={detail.data.preview.report} />}
      </>}
    </Drawer>
  </>;
}
