import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useTerm } from '@/app/providers/TermContext';
import { deadlineApi } from '@/features/deadline/api/deadlineApi';
import { DeadlineTable } from '@/features/deadline/components/DeadlineTable';
import { DeadlineStatusBadge } from '@/features/deadline/components/DeadlineStatusBadge';
import { deadlinePresentation, formatDeadlineDate } from '@/features/deadline/presentation';
import { useDeadlineBoundary } from '@/features/deadline/hooks/useDeadlineBoundary';
import { advancedGroupPath } from '@/features/group/navigation';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

export function ClassGroupingSessions({ classId, mode }: { classId: number; mode: 'groups' | 'deadlines' }) {
  const { selectedTermId } = useTerm();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const query = useQuery({ queryKey: ['class-grouping-sessions', selectedTermId, classId],
    queryFn: ({ signal }) => deadlineApi.getAllDeadlines(selectedTermId!, signal), retry: false });
  const sessions = query.data?.filter(item => item.schoolClassIds.includes(classId)) ?? [];
  const now = useDeadlineBoundary(sessions);
  if (query.isPending) return <LoadingSpinner message={t('deadline.loadingList')} />;
  if (query.isError) return <ErrorState message={t('deadline.loadErrorDesc')} onRetry={() => void query.refetch()} />;
  if (!sessions.length) return <EmptyState title={t('adminUx.noSession')} actionText={t('adminUx.viewDeadlines')} onAction={() => navigate('/admin/deadlines')} />;
  return <section className="card">
    <div className="card-header"><h2 className="card-title">{t(mode === 'groups' ? 'adminUx.selectSession' : 'adminUx.deadlines')}</h2>
      <Link className="btn btn-secondary btn-sm" to="/admin/deadlines">{t('adminUx.viewDeadlines')}</Link>
    </div>
    {mode === 'deadlines' ? <DeadlineTable deadlines={sessions} canManage={false} /> : <>
      <p className="form-hint">{t('adminUx.sessionHint')}</p>
      <div className="admin-session-list">{sessions.map(deadline => {
        const window = deadlinePresentation(deadline, now).windows.find(item => item.schoolClassId === classId);
        const context = new URLSearchParams({ termId: String(selectedTermId), source: 'class' });
        return <article key={deadline.id} className="admin-session-card">
          <div><h3>{deadline.name}</h3>{window && <>
            <DeadlineStatusBadge status={window.status} />
            <p className="form-hint">{formatDeadlineDate(window.startTime, i18n.language)} → {formatDeadlineDate(window.endTime, i18n.language)}</p>
          </>}</div>
          <div className="admin-inline-actions">
            <Link to={advancedGroupPath(classId, context, deadline.id, 'admin')} className="btn btn-primary">{t('adminUx.openGroups')}</Link>
            <Link to={`/admin/automatic-allocation/${classId}?deadlineId=${deadline.id}`} className="btn btn-secondary">{t('adminUx.openAllocation')}</Link>
          </div>
        </article>;
      })}</div>
    </>}
  </section>;
}
