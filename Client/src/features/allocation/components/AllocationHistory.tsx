import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Drawer, Skeleton, Table } from 'antd';
import { useTranslation } from 'react-i18next';
import { Eye, RefreshCw } from 'lucide-react';
import { useAuth } from '@/app/providers/AuthContext';
import { useTerm } from '@/app/providers/TermContext';
import { allocationApi } from '../api/allocationApi';
import { AllocationReport } from './AllocationReport';
import { allocationErrorKey } from '../utils';

export function AllocationApplyHistory({ classId, deadlineId }: { classId: number; deadlineId: number }) {
  const { t, i18n } = useTranslation(); const { user } = useAuth(); const { selectedTermId } = useTerm();
  const [page, setPage] = useState(1); const [runId, setRunId] = useState<number | null>(null);
  const key = ['allocation', user?.id, selectedTermId, classId, deadlineId, 'history'];
  const history = useQuery({ queryKey: [...key, page], queryFn: ({ signal }) => allocationApi.history(deadlineId, classId, page, signal), retry: false });
  const detail = useQuery({ queryKey: [...key, 'detail', runId], enabled: runId !== null,
    queryFn: ({ signal }) => allocationApi.historyDetail(deadlineId, classId, runId!, signal), retry: false });
  const actor = (id: number) => id === user?.id ? user.name || user.email : t('allocation.actorReference', { id });
  return <section className="allocation-panel allocation-history-panel" id="allocation-history">
    <div className="allocation-heading"><div><h2>{t('allocation.applyAudit')}</h2><p>{t('allocation.historyHint')}</p></div>
      <Button icon={<RefreshCw size={15} aria-hidden="true" />} loading={history.isFetching} onClick={() => void history.refetch()}>{t('allocation.refresh')}</Button></div>
    {history.isError ? <Alert type="error" showIcon title={t(`allocation.errors.${allocationErrorKey(history.error)}`, { defaultValue: t('allocation.errors.other') })} /> :
      <Table rowKey="runId" loading={history.isPending} dataSource={history.data?.result ?? []} size="small" scroll={{ x: 580 }}
        locale={{ emptyText: t('allocation.noHistory') }} pagination={{ current: page, pageSize: 10, total: history.data?.meta.total ?? 0, showSizeChanger: false, position: ['bottomRight'], onChange: setPage }} columns={[
          { title: t('allocation.appliedAt'), render: (_, row) => <time className="allocation-table-time" dateTime={row.appliedAt}><strong>{new Date(row.appliedAt).toLocaleDateString(i18n.language)}</strong><span>{new Date(row.appliedAt).toLocaleTimeString(i18n.language)}</span></time> },
          { title: t('allocation.actor'), render: (_, row) => actor(row.actorId) },
          { title: t('allocation.target'), dataIndex: 'targetGroupCount' },
          { title: t('allocation.details'), className: 'allocation-history-action-cell', render: (_, row) => <Button size="small" icon={<Eye size={15} aria-hidden="true" />} onClick={() => setRunId(row.runId)}>{t('allocation.viewRun', { id: row.runId })}</Button> },
        ]} />}
    <Drawer open={runId !== null} onClose={() => setRunId(null)} title={t('allocation.runTitle', { id: runId })} size="large" rootClassName="allocation-history-overlay" className="allocation-history-drawer">
      {detail.isPending ? <Skeleton active /> : detail.isError ? <Alert type="error" showIcon title={t(`allocation.errors.${allocationErrorKey(detail.error)}`, { defaultValue: t('allocation.errors.other') })} action={<Button onClick={() => void detail.refetch()}>{t('allocation.retry')}</Button>} /> : detail.data && <>
        <p className="allocation-muted">{actor(detail.data.actorId)} · {new Date(detail.data.appliedAt).toLocaleString(i18n.language)}</p>
        <Alert type="success" showIcon title={t('allocation.approvedCount', { count: detail.data.approvedGroupIds.length })} />
        <AllocationReport report={detail.data.report} />
      </>}
    </Drawer>
  </section>;
}
