import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Users } from 'lucide-react';
import { Pagination } from '@/components/common/Pagination';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ErrorState } from '@/components/common/ErrorState';
import { EmptyState } from '@/components/common/EmptyState';
import { getApiError } from '@/services/api/types';
import { StudentFilterBar } from '@/features/students/components/StudentFilterBar';
import type { StudentFilterParams } from '@/features/students/types';
import type { Major } from '@/features/majors/types';
import { classApi } from '../api/classApi';

export function ClassStudentsPanel({ classId }: { classId: number }) {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<StudentFilterParams>({ page: 1, size: 10, search: '', majorSearch: '' });
  const query = useQuery({
    queryKey: ['school-class-students', classId],
    queryFn: ({ signal }) => classApi.getClassStudents(classId, signal),
    retry: (count, error) => count < 1 && ![401, 403, 404].includes(getApiError(error).status),
  });
  const error = getApiError(query.error);
  const students = query.data || [];
  const keyword = filters.search?.trim().toLocaleLowerCase() || '';
  const majorKeyword = filters.majorSearch?.trim().toLocaleLowerCase() || '';
  const majorOptions: Major[] = Array.from(new Map(students.flatMap(student => student.majorId !== null
    && (student.majorCode || student.majorName) ? [[student.majorId, { id: student.majorId,
      code: student.majorCode || '', name: student.majorName || '' }] as const] : [])).values())
    .sort((left, right) => left.code.localeCompare(right.code));
  const filtered = students.filter(student => !keyword || [student.rollNumber, student.fullName,
    student.email, student.memberCode].some(value => value?.toLocaleLowerCase().includes(keyword)))
    .filter(student => filters.majorId !== undefined ? student.majorId === filters.majorId
      : !majorKeyword || [student.majorCode, student.majorName].some(value => value?.toLocaleLowerCase().includes(majorKeyword)))
    .filter(student => filters.activated === undefined || student.activated === filters.activated)
    .filter(student => filters.hasActivationKey === undefined || student.hasActivationKey === filters.hasActivationKey);
  const size = filters.size || 10;
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const page = Math.min(filters.page || 1, pages);
  const offset = (page - 1) * size;
  const displayed = filtered.slice(offset, offset + size);
  const resetFilters = () => setFilters({ page: 1, size: 10, search: '', majorSearch: '' });
  const headingId = `class-students-${classId}`;

  return <section className="card class-students-card" aria-labelledby={headingId}>
    <div className="lecturer-card">
      <div className="lecturer-section-header">
        <div><h2 id={headingId}>{t('classStudents.title')}</h2><p>{t('classStudents.description')}</p></div>
      </div>
      {query.isPending ? <LoadingSpinner message={t('students.loadingList')} />
        : query.isError || !query.data ? <ErrorState
          message={error.message || t('classStudents.loadFailed')}
          onRetry={[401, 403, 404].includes(error.status) ? undefined : () => { void query.refetch(); }} />
        : students.length === 0 ? <EmptyState title={t('classStudents.emptyTitle')}
          description={t('classStudents.emptyHint')} icon={<Users size={32} />} />
        : <>
          <StudentFilterBar filters={filters} onFilterChange={setFilters} onReset={resetFilters}
            isLoading={query.isFetching} majorOptions={majorOptions} />
          <p className="rules-help" role="status">{t('classStudents.count', { count: filtered.length, total: students.length })}</p>
        </>}
    </div>
    {!query.isPending && !query.isError && query.data && students.length > 0 && (filtered.length === 0
      ? <EmptyState title={t('classStudents.noMatches')} description={t('classStudents.noMatchesHint')}
          actionText={t('students.clearFilters')} onAction={resetFilters} />
      : <><div className="table-container" tabIndex={0} role="region" aria-labelledby={headingId}>
        <table className="table class-students-table">
          <thead><tr>
            <th scope="col">{t('classStudents.index')}</th>
            <th scope="col">{t('students.colRollNumber')}</th>
            <th scope="col">{t('students.colFullName')}</th>
            <th scope="col">{t('students.colEmail')}</th>
            <th scope="col">{t('students.colMemberCode')}</th>
            <th scope="col">{t('students.colMajor')}</th>
            <th scope="col">{t('students.colAccountStatus')}</th>
          </tr></thead>
          <tbody>{displayed.map((student, index) => <tr key={student.userId}>
            <td>{offset + index + 1}</td>
            <th scope="row">{student.rollNumber}</th>
            <td>{student.fullName}</td>
            <td>{student.email}</td>
            <td>{student.memberCode}</td>
            <td>{[student.majorCode, student.majorName].filter(Boolean).join(' — ') || '—'}</td>
            <td><span className={`badge ${student.activated ? 'badge-success' : 'badge-warning'}`}>
              {t(student.activated ? 'students.activated' : 'students.unactivated')}
            </span></td>
          </tr>)}</tbody>
        </table>
      </div><div className="lecturer-pagination"><Pagination
        meta={{ page, pageSize: size, pages, total: filtered.length }} currentPage={page}
        onPageChange={nextPage => setFilters(previous => ({ ...previous, page: nextPage }))}
        onPageSizeChange={nextSize => setFilters(previous => ({ ...previous, size: nextSize, page: 1 }))} />
      </div></>)}
  </section>;
}
