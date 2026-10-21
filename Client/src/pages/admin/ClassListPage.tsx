import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTerm } from '@/app/providers/TermContext';
import { TermScope } from '@/features/terms/components/TermScope';
import { PageHeader } from '@/components/common/PageHeader';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ErrorState } from '@/components/common/ErrorState';
import { EmptyState } from '@/components/common/EmptyState';
import { Pagination } from '@/components/common/Pagination';
import { Modal } from '@/components/common/Modal';
import { ClassFilterBar } from '@/features/classes/components/ClassFilterBar';
import { ClassTable } from '@/features/classes/components/ClassTable';
import { ClassLecturerAssignment } from '@/features/classes/components/ClassLecturerAssignment';
import { classApi } from '@/features/classes/api/classApi';
import type { SchoolClass } from '@/features/classes/types';
import { useNavigationGuard } from '@/app/providers/NavigationGuard';

export const ClassListPage = () => <TermScope><ClassList /></TermScope>;

function ClassList() {
  const { t } = useTranslation();
  const { selectedTermId, selectedTerm } = useTerm();
  const navigate = useNavigate();
  const location = useLocation();
  const requestLeave = useNavigationGuard();
  const [params, setParams] = useSearchParams();
  const [assigning, setAssigning] = useState<SchoolClass | null>(null);
  const search = params.get('search') || '';
  const assignment = params.get('assignment') || 'all';
  const size = [10, 20, 50, 100].includes(Number(params.get('size'))) ? Number(params.get('size')) : 10;
  const requestedPage = Math.max(1, Number(params.get('page')) || 1);
  const query = useQuery({ queryKey: ['school-classes', selectedTermId, 'all'],
    queryFn: ({ signal }) => classApi.getAllClasses(selectedTermId!, signal), retry: false });
  const filtered = (query.data ?? []).filter(item => {
    const match = [item.name, item.lecturerName, item.lecturerCode, item.lecturerEmail].some(value => value?.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
    return match && (assignment === 'unassigned' ? item.lecturerId === null : assignment === 'assigned' ? item.lecturerId !== null : true);
  });
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const page = Math.min(requestedPage, pages);
  const update = (changes: Record<string, string | number>) => {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([key, value]) => { if (value === '') next.delete(key); else next.set(key, String(value)); });
    setParams(next, { replace: true });
  };
  return <div className="space-y-6">
    <PageHeader title={t('classes.title')} description={`${selectedTerm?.name ?? ''} · ${t('adminUx.classSource')}`}
      breadcrumbs={[{ label: t('breadcrumbs.admin'), href: '/admin/dashboard' }, { label: t('classes.label') }]}
      action={<button className="btn btn-primary" onClick={() => navigate('/admin/students/import')}>{t('students.importBtn')}</button>} />
    <ClassFilterBar filters={{ search, page, size }} onChange={next => update({ search: next.search ?? search, page: 1 })} onReset={() => setParams({}, { replace: true })} />
    <div className="admin-inline-filter">
      <label htmlFor="class-assignment-filter">{t('adminUx.classAssignmentFilter')}</label>
      <select id="class-assignment-filter" className="form-control" value={assignment} onChange={event => update({ assignment: event.target.value, page: 1 })}>
        <option value="all">{t('adminUx.allClasses')}</option><option value="unassigned">{t('adminUx.unassignedClasses')}</option><option value="assigned">{t('adminUx.assignedClasses')}</option>
      </select><span>{t('classes.total')} {filtered.length}</span>
    </div>
    {query.isPending ? <LoadingSpinner message={t('classes.loadingList')} />
      : query.isError ? <ErrorState message={t('classes.loadFailed')} onRetry={() => void query.refetch()} />
      : !filtered.length ? <EmptyState title={t('adminUx.emptyClasses')} actionText={t('students.clearFilters')} onAction={() => setParams({}, { replace: true })} />
      : <section className="card">
        <ClassTable classes={filtered.slice((page - 1) * size, page * size)} page={page} pageSize={size}
          onSelectClass={item => navigate(`/admin/classes/${item.id}`, { state: { from: location.pathname + location.search } })}
          onAssignLecturer={setAssigning} />
        <Pagination meta={{ page, pageSize: size, pages, total: filtered.length }} currentPage={page} showingKey="adminUx.showingClasses"
          onPageChange={value => update({ page: value })} onPageSizeChange={value => update({ size: value, page: 1 })} />
      </section>}
    {assigning && <Modal open title={t('classAssignment.title')} onClose={() => requestLeave(() => setAssigning(null))} maxWidth="700px">
      <p>{assigning.name} · {assigning.termName}</p><ClassLecturerAssignment schoolClass={query.data?.find(item => item.id === assigning.id) ?? assigning} />
    </Modal>}
  </div>;
}
