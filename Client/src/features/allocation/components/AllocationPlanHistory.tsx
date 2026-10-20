import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Collapse, Drawer, Skeleton, Table, Tag } from 'antd';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/app/providers/AuthContext';
import { useTerm } from '@/app/providers/TermContext';
import { allocationApi } from '../api/allocationApi';
import { AllocationApplyHistory } from './AllocationHistory';
import { AllocationGroups } from './AllocationGroups';
import { AllocationReport } from './AllocationReport';
import { allocationErrorKey } from '../utils';
import type { PlanDetail, PlanSummary } from '../types';

export function AllocationPlanHistory({ classId, deadlineId, disabled, onSelect, onApply }: {
  classId: number; deadlineId: number; disabled: boolean; onSelect: (detail: PlanDetail) => void; onApply: (detail: PlanDetail) => void;
}) {
  const { t, i18n } = useTranslation(); const { user } = useAuth(); const { selectedTermId } = useTerm();
  const client = useQueryClient(); const [page, setPage] = useState(1); const [planId, setPlanId] = useState<string | null>(null);
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null); const [error, setError] = useState<unknown>(null);
  const key = ['allocation', user?.id, selectedTermId, classId, deadlineId, 'plans'];
  const history = useQuery({ queryKey: [...key, page], queryFn: ({ signal }) => allocationApi.plans(deadlineId, classId, page, signal), retry: false });
  const detailKey = (id: string | null) => [...key, 'detail', id];
  const detail = useQuery({ queryKey: detailKey(planId), enabled: planId !== null,
    queryFn: ({ signal }) => allocationApi.plan(deadlineId, classId, planId!, signal), retry: false });
  const actor = (row: PlanSummary) => row.actorName || (row.actorId === user?.id ? user.name || user.email : t('allocation.actorReference', { id: row.actorId }));
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
    <section className="allocation-panel">
      <div className="allocation-heading"><div><h2>{t('allocation.randomHistory')}</h2><p>{t('allocation.randomHistoryHint')}</p></div>
        <Button loading={history.isFetching} onClick={() => void history.refetch()}>{t('allocation.refresh')}</Button></div>
      {error !== null && failure(error)}
      {history.isError ? failure(history.error) : <Table rowKey="planId" loading={history.isPending} dataSource={history.data?.result ?? []} size="middle" scroll={{ x: 780 }}
        locale={{ emptyText: t('allocation.noRandomHistory') }} pagination={{ current: page, pageSize: 10, total: history.data?.meta.total ?? 0, showSizeChanger: false, onChange: setPage }} columns={[
          { title: t('allocation.randomAt'), render: (_, row) => new Date(row.createdAt).toLocaleString(i18n.language) },
          { title: t('allocation.actor'), render: (_, row) => actor(row) },
          { title: t('allocation.target'), dataIndex: 'targetGroupCount' },
          { title: t('allocation.totalStudents'), render: (_, row) => row.totalStudents ?? t('allocation.missing') },
          { title: t('allocation.planStatusLabel'), render: (_, row) => <Tag color={row.status === 'APPLIED' ? 'success' : row.status === 'INVALID' ? 'warning' : 'blue'}>{t(`allocation.planStatuses.${row.status}`)}</Tag> },
          { title: t('allocation.details'), render: (_, row) => <div className="allocation-actions">
            <Button disabled={!row.available} onClick={() => setPlanId(row.planId)}>{t('allocation.viewPlan')}</Button>
            <Button disabled={disabled || !row.canApply || loadingPlan !== null} loading={loadingPlan === row.planId} onClick={() => void applySaved(row.planId)}>{t('allocation.applyPlan')}</Button>
          </div> },
        ]} />}
    </section>
    <Collapse items={[{ key: 'audit', label: t('allocation.applyAudit'), children: <AllocationApplyHistory classId={classId} deadlineId={deadlineId} /> }]} />
    <Drawer open={planId !== null} onClose={() => setPlanId(null)} title={t('allocation.savedPlan')} size="large" className="allocation-history-drawer">
      {detail.isPending ? <Skeleton active /> : detail.isError ? failure(detail.error) : detail.data && <>
        <p className="allocation-muted">{actor(detail.data.summary)} · {new Date(detail.data.summary.createdAt).toLocaleString(i18n.language)}</p>
        <Alert type={detail.data.summary.status === 'INVALID' ? 'warning' : 'info'} showIcon title={t(`allocation.planStatuses.${detail.data.summary.status}`)}
          description={detail.data.summary.invalidReason ? t(`allocation.errors.${detail.data.summary.invalidReason}`, { defaultValue: t('allocation.errors.other') }) : t('allocation.savedPlanHint')} />
        <div className="allocation-actions allocation-history-actions">
          <Button disabled={disabled} onClick={() => { onSelect(detail.data!); setPlanId(null); }}>{t('allocation.openPlan')}</Button>
          <Button type="primary" disabled={disabled || !detail.data.summary.canApply || loadingPlan !== null} loading={loadingPlan === planId} onClick={() => void applySaved(planId!)}>{t('allocation.applyPlan')}</Button>
        </div>
        <AllocationGroups groups={detail.data.preview.groups} />
        {detail.data.preview.report && <AllocationReport report={detail.data.preview.report} />}
      </>}
    </Drawer>
  </>;
}
