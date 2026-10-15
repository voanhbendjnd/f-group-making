import { useTerm } from '@/app/providers/TermContext';
import { TermScope } from '@/features/terms/components/TermScope';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ErrorState } from '@/components/common/ErrorState';
import { EmptyState } from '@/components/common/EmptyState';
import { Pagination } from '@/components/common/Pagination';
import { classApi } from '@/features/classes/api/classApi';
import { LecturerClassTable } from '@/features/classes/components/LecturerClassTable';
import { getApiError } from '@/services/api/types';
import { useAuth } from '@/app/providers/AuthContext';
import { canViewAllClasses } from '@/features/auth/utils/roleRouting';

export function LecturerClassListPage() {
  return <TermScope><LecturerClassListPageContent /></TermScope>;
}

function LecturerClassListPageContent() {
  const { selectedTermId } = useTerm();
  const { t } = useTranslation();
  const { user } = useAuth();
  const allClasses = canViewAllClasses(user?.authorities || []);
  const [searchInput, setSearchInput] = useState('');
  const [filters, setFilters] = useState({ page: 1, size: 10, search: '' });
  const query = useQuery({
    queryKey: [allClasses ? 'school-classes' : 'my-school-classes', user?.id, selectedTermId, filters],
    queryFn: ({ signal }) => allClasses ? classApi.getClasses({ ...filters, termId: selectedTermId! }, signal) : classApi.getMyClasses({ ...filters, termId: selectedTermId! }, signal),
    retry: (count, error) => count < 1 && ![401, 403].includes(getApiError(error).status),
  });
  const error = getApiError(query.error);

  return <div className="space-y-6 lecturer-page">
    <PageHeader title={t(allClasses ? 'lecturer.allClasses' : 'lecturer.myClasses')}
      description={t(allClasses ? 'lecturer.allListDescription' : 'lecturer.listDescription')} />
    <form className="card lecturer-card lecturer-search" onSubmit={event => {
      event.preventDefault(); setFilters(previous => ({ ...previous, search: searchInput.trim(), page: 1 }));
    }}>
      <Input id="lecturer-class-search" label={t('lecturer.searchLabel')} value={searchInput}
        placeholder={t('lecturer.searchPlaceholder')} onChange={event => setSearchInput(event.target.value)} />
      <Button type="submit" variant="secondary" icon={<Search size={18} />}>{t('lecturer.search')}</Button>
    </form>
    {query.isPending ? <div className="card lecturer-card"><LoadingSpinner message={t(allClasses ? 'lecturer.loadingAllClasses' : 'lecturer.loadingClasses')} /></div>
      : query.isError || !query.data ? <div className="card lecturer-card"><ErrorState message={error.message || t('lecturer.loadFailed')}
        onRetry={[401, 403].includes(error.status) ? undefined : () => { void query.refetch(); }} /></div>
      : query.data.result.length === 0 ? <EmptyState title={t(filters.search ? 'lecturer.noMatches' : allClasses ? 'lecturer.allEmptyTitle' : 'lecturer.emptyTitle')}
        description={t(filters.search ? 'lecturer.noMatchesHint' : allClasses ? 'lecturer.allEmptyHint' : 'lecturer.emptyHint')} />
      : <div className="card">
        <div className="lecturer-card lecturer-list-summary">{t(allClasses ? 'lecturer.totalAllClasses' : 'lecturer.totalClasses', { count: query.data.meta.total })}</div>
        <LecturerClassTable classes={query.data.result} />
        <div className="lecturer-pagination"><Pagination meta={query.data.meta}
          onPageChange={page => setFilters(previous => ({ ...previous, page }))} /></div>
      </div>}
  </div>;
}
