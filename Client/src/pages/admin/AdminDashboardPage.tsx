import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Users, Layers, Clock, ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTerm } from '@/app/providers/TermContext';
import { TermScope } from '@/features/terms/components/TermScope';
import { studentApi } from '@/features/students/api/studentApi';
import { classApi } from '@/features/classes/api/classApi';
import { deadlineApi } from '@/features/deadline/api/deadlineApi';
import { deadlinePresentation } from '@/features/deadline/presentation';
import { useDeadlineBoundary } from '@/features/deadline/hooks/useDeadlineBoundary';
import { DeadlineTable } from '@/features/deadline/components/DeadlineTable';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/common/Button';
import { ErrorState } from '@/components/common/ErrorState';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { StatusBadge } from '@/components/common/StatusBadge';

export const AdminDashboardPage = () => <TermScope><Dashboard /></TermScope>;

function Metric({ title, value, pending, error, retry, to, icon }: {
  title: string; value: number | undefined; pending: boolean; error: boolean; retry: () => void; to: string; icon: ReactNode;
}) {
  const { t } = useTranslation();
  return <article className="card admin-metric">
    <span className="admin-metric-icon" aria-hidden="true">{icon}</span>
    <h2>{title}</h2>
    {error ? <><p role="status">{t('adminUx.dataUnavailable')}</p><Button size="sm" variant="secondary" onClick={retry}>{t('adminUx.retry')}</Button></>
      : <Link to={to}><strong aria-live="polite">{pending ? '…' : value?.toLocaleString() ?? '—'}</strong><ArrowRight size={16} aria-hidden="true" /></Link>}
  </article>;
}

function Dashboard() {
  const { t } = useTranslation();
  const { selectedTermId, selectedTerm } = useTerm();
  const total = useQuery({ queryKey: ['admin-dashboard', selectedTermId, 'students-count-total'],
    queryFn: () => studentApi.getStudents({ termId: selectedTermId!, page: 1, size: 1 }) });
  const waiting = useQuery({ queryKey: ['admin-dashboard', selectedTermId, 'students-count-waiting'],
    queryFn: () => studentApi.getStudents({ termId: selectedTermId!, page: 1, size: 1, activated: false }) });
  const recent = useQuery({ queryKey: ['admin-dashboard', selectedTermId, 'students-recent'],
    queryFn: () => studentApi.getStudents({ termId: selectedTermId!, page: 1, size: 5, sort: 'userId,desc' }) });
  const classes = useQuery({ queryKey: ['admin-dashboard', selectedTermId, 'classes'],
    queryFn: ({ signal }) => classApi.getAllClasses(selectedTermId!, signal) });
  const deadlines = useQuery({ queryKey: ['admin-dashboard', selectedTermId, 'deadlines'],
    queryFn: ({ signal }) => deadlineApi.getAllDeadlines(selectedTermId!, signal) });
  const now = useDeadlineBoundary(deadlines.data ?? []);
  const activeDeadlines = deadlines.data?.filter(item => deadlinePresentation(item, now).windows.some(window => window.status === 'ACTIVE'));
  const missingLecturers = classes.data?.filter(item => item.lecturerId === null).length;
  return <div className="admin-dashboard">
    <PageHeader title={t('dashboard.title')} description={`${t('adminUx.dashboardDescription')} · ${selectedTerm?.name ?? ''}`}
      action={<Link to="/admin/students/import" className="btn btn-primary">{t('students.importBtn')}</Link>} />
    <div className="admin-metrics">
      <Metric title={t('dashboard.statTotalStudents')} value={total.data?.meta.total} pending={total.isPending} error={total.isError}
        retry={() => void total.refetch()} to="/admin/students" icon={<Users />} />
      <Metric title={t('adminUx.waitingStudents')} value={waiting.data?.meta.total} pending={waiting.isPending} error={waiting.isError}
        retry={() => void waiting.refetch()} to="/admin/students?activated=false" icon={<Users />} />
      <Metric title={t('adminUx.totalClasses')} value={classes.data?.length} pending={classes.isPending} error={classes.isError}
        retry={() => void classes.refetch()} to="/admin/classes" icon={<Layers />} />
      <Metric title={t('adminUx.openDeadlines')} value={activeDeadlines?.length} pending={deadlines.isPending} error={deadlines.isError}
        retry={() => void deadlines.refetch()} to="/admin/deadlines" icon={<Clock />} />
    </div>
    <section className="card admin-attention">
      <h2 className="card-title">{t('adminUx.operations')}</h2>
      {waiting.data && waiting.data.meta.total > 0 && <Link to="/admin/students?activated=false"><span>{t('adminUx.waitingStudents')}</span><strong>{waiting.data.meta.total}</strong><ArrowRight size={16} /></Link>}
      {missingLecturers !== undefined && missingLecturers > 0 && <Link to="/admin/classes?assignment=unassigned"><span>{t('adminUx.missingLecturer')}</span><strong>{missingLecturers}</strong><ArrowRight size={16} /></Link>}
      {waiting.isSuccess && classes.isSuccess && waiting.data.meta.total === 0 && missingLecturers === 0 && <p>{t('adminUx.dashboardNoAttention')}</p>}
      {(waiting.isPending || classes.isPending) && <p role="status">{t('common.loading')}</p>}
    </section>
    <section className="card">
      <div className="card-header"><h2 className="card-title">{t('adminUx.deadlines')}</h2><Link className="btn btn-secondary btn-sm" to="/admin/deadlines">{t('adminUx.viewDeadlines')}</Link></div>
      {deadlines.isPending ? <LoadingSpinner message={t('deadline.loadingList')} />
        : deadlines.isError ? <ErrorState message={t('deadline.loadErrorDesc')} onRetry={() => void deadlines.refetch()} />
        : <DeadlineTable deadlines={(deadlines.data ?? []).slice(0, 5)} canManage={false} />}
    </section>
    <section className="card">
      <div className="card-header"><h2 className="card-title">{t('dashboard.recentTitle')}</h2><Link className="btn btn-secondary btn-sm" to="/admin/students">{t('dashboard.viewAll')}</Link></div>
      {recent.isPending ? <LoadingSpinner message={t('students.loadingList')} />
        : recent.isError ? <ErrorState message={t('students.errorDefault')} onRetry={() => void recent.refetch()} />
        : !recent.data?.result.length ? <p>{t('dashboard.emptyRecent')}</p>
        : <div className="table-container"><table className="table"><thead><tr>
          <th>{t('students.colRollNumber')}</th><th>{t('students.colFullName')}</th><th>{t('students.colAccountStatus')}</th>
        </tr></thead><tbody>{recent.data.result.map(student => <tr key={student.userId}>
          <td>{student.rollNumber}</td><td>{student.fullName}</td><td><StatusBadge activated={student.activated} hasActivationKey={student.hasActivationKey} isKeyExpired={student.isKeyExpired} /></td>
        </tr>)}</tbody></table></div>}
    </section>
    <details className="card admin-setup"><summary>{t('adminUx.setup')}</summary><p>{t('adminUx.setupHint')}</p>
      <div className="admin-inline-actions"><Link to="/admin/lecturers?scope=all">{t('lecturer.role')}</Link><Link to="/admin/students/import">{t('students.importBtn')}</Link><Link to="/admin/classes">{t('classes.label')}</Link></div>
    </details>
  </div>;
}
