import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowRight, RefreshCw, Search } from 'lucide-react';
import { RoleRoute } from '@/app/router/RoleRoute';
import { useAuth } from '@/app/providers/AuthContext';
import { useTerm } from '@/app/providers/TermContext';
import { useRealtime } from '@/app/providers/realtimeContext';
import { TermScope } from '@/features/terms/components/TermScope';
import { ClassScopeFilter } from '@/features/classes/components/ClassScopeFilter';
import type { ClassViewScope } from '@/features/classes/types';
import { departmentApi } from '@/features/department/api/departmentApi';
import { DepartmentStatistics, DepartmentProgress } from '@/features/department/components/DepartmentStatistics';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { Pagination } from '@/components/common/Pagination';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ErrorState } from '@/components/common/ErrorState';
import { EmptyState } from '@/components/common/EmptyState';
import { getApiError } from '@/services/api/types';
import './DepartmentOverviewPage.css';

export function DepartmentOverviewPage() {
  return <RoleRoute requiredRole="ROLE_LECTURE_MASTER"><TermScope><DepartmentOverview /></TermScope></RoleRoute>;
}

function DepartmentOverview() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { selectedTermId, selectedTerm, isLocked } = useTerm();
  const { subscribe } = useRealtime();
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ page: 1, size: 10, search: '', classScope: 'ALL' as ClassViewScope });
  const query = useQuery({ queryKey: ['department-overview', user?.id, selectedTermId, filters],
    queryFn: ({ signal }) => departmentApi.overview({ ...filters, termId: selectedTermId! }, signal),
    retry: (count, error) => count < 1 && ![400, 401, 403, 404].includes(getApiError(error).status),
    refetchInterval: 60000, refetchOnWindowFocus: true });
  const topics = query.data?.classes.result.map(row => row.schoolClass.id).sort((a, b) => a - b).join(',') ?? '';
  useEffect(() => {
    const cleanup = topics.split(',').filter(Boolean).map(id => subscribe(`/topic/classes/${id}/deadlines`));
    return () => cleanup.forEach(off => off());
  }, [subscribe, topics]);
  const data = query.data;
  return <div className="department-page">
    <PageHeader title={t('departmentOverview.title')} description={`${t('departmentOverview.description')} · ${selectedTerm?.name ?? ''}`}
      action={<Button variant="secondary" icon={<RefreshCw size={16} />} loading={query.isFetching} onClick={() => void query.refetch()}>{t('groupReview.refresh')}</Button>} />
    <p className="department-notice">{t('departmentOverview.readOnly')}</p>
    {query.isPending ? <LoadingSpinner message={t('common.loading')} /> : query.isError || !data
      ? <ErrorState message={getApiError(query.error).message || t('errors.generalFailure')} onRetry={() => void query.refetch()} />
      : <>
        <DepartmentStatistics statistics={data.summary.statistics} classes={data.summary.classes} lecturers={data.summary.lecturers} />
        <DepartmentProgress statistics={data.summary.statistics} />
        {data.summary.unassignedClasses > 0 && <p className="alert alert-warning">{t('departmentOverview.unassignedClasses', { count: data.summary.unassignedClasses })}</p>}
        <section className="card department-panel">
          <div className="department-section-heading"><div><h2>{t('departmentOverview.classList')}</h2><p>{t('departmentOverview.summaryScope')}</p></div>
            <span className="badge badge-info">{t('departmentOverview.resultCount', { count: data.classes.meta.total })}</span></div>
          <form className="department-filters" onSubmit={event => { event.preventDefault(); setFilters(previous => ({ ...previous, search: search.trim(), page: 1 })); }}>
            <Input label={t('lecturer.searchLabel')} value={search} onChange={event => setSearch(event.target.value)} placeholder={t('lecturer.searchPlaceholder')} />
            <ClassScopeFilter value={filters.classScope} disabled={isLocked} onChange={classScope => setFilters(previous => ({ ...previous, classScope, page: 1 }))} />
            <Button type="submit" icon={<Search size={16} />}>{t('lecturer.search')}</Button>
          </form>
          {!data.classes.result.length ? <EmptyState title={t('departmentOverview.empty')} description={t('departmentOverview.emptyHint')} />
            : <div className="table-container"><table className="table department-class-table"><thead><tr>
              <th>{t('lecturer.className')}</th><th>{t('classVisibility.lecturer')}</th><th>{t('departmentOverview.students')}</th>
              <th>{t('departmentOverview.groups')}</th><th>{t('departmentOverview.groupingProgress')}</th><th>{t('lecturer.actions')}</th>
            </tr></thead><tbody>{data.classes.result.map(({ schoolClass, statistics }) => <tr key={schoolClass.id}>
              <th scope="row"><Link to={`/lecturer/department-overview/classes/${schoolClass.id}`}>{schoolClass.name}</Link>
                {schoolClass.lecturerId === user?.id && <span className="badge badge-neutral">{t('classVisibility.MINE')}</span>}</th>
              <td>{schoolClass.lecturerName || schoolClass.lecturerCode || t('classVisibility.unassigned')}</td>
              <td>{statistics.students}</td><td>{statistics.groups}</td>
              <td><span>{statistics.groupedStudents} / {statistics.students}</span><progress max={Math.max(1, statistics.students)} value={statistics.groupedStudents} aria-label={t('departmentOverview.classProgress', { name: schoolClass.name })} /></td>
              <td><Link className="btn btn-secondary btn-sm" aria-label={t('lecturer.openClassLabel', { name: schoolClass.name })}
                to={`/lecturer/department-overview/classes/${schoolClass.id}`}>{t('departmentOverview.viewClass')} <ArrowRight size={14} /></Link></td>
            </tr>)}</tbody></table></div>}
          <Pagination meta={data.classes.meta} currentPage={filters.page} onPageChange={page => setFilters(previous => ({ ...previous, page }))}
            onPageSizeChange={size => setFilters(previous => ({ ...previous, size, page: 1 }))} />
        </section>
      </>}
  </div>;
}
