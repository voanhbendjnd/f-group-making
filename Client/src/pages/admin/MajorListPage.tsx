import { useCallback, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { GraduationCap, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/app/providers/ToastContext';
import { Button } from '@/components/common/Button';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { PageHeader } from '@/components/common/PageHeader';
import { majorApi } from '@/features/majors/api/majorApi';
import { MajorDetailsModal } from '@/features/majors/components/MajorDetailsModal';
import { MajorFilterBar } from '@/features/majors/components/MajorFilterBar';
import { MajorFormModal } from '@/features/majors/components/MajorFormModal';
import { MajorPagination } from '@/features/majors/components/MajorPagination';
import { MajorTable } from '@/features/majors/components/MajorTable';
import { getMajorErrorKey } from '@/features/majors/utils/majorErrors';
import type { Major, MajorFilters } from '@/features/majors/types';

export function MajorListPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const [filters, setFilters] = useState<MajorFilters>({});
  const [filterResetVersion, setFilterResetVersion] = useState(0);
  const applyFilters = useCallback((nextFilters: MajorFilters) => {
    setFilters(nextFilters);
    setPage(1);
  }, []);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingMajor, setEditingMajor] = useState<Major | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [deletingMajor, setDeletingMajor] = useState<Major | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteErrorKey, setDeleteErrorKey] = useState('');

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['majors', 'list', { page, size, ...filters }],
    queryFn: () => majorApi.getMajors({ page, size, ...filters }),
    placeholderData: keepPreviousData,
  });

  function openCreate() {
    setEditingMajor(null);
    setIsFormOpen(true);
  }

  function openEdit(major: Major) {
    setDetailId(null);
    setEditingMajor(major);
    setIsFormOpen(true);
  }

  function handleSaved(isEdit: boolean) {
    setIsFormOpen(false);
    toast.success(t(isEdit ? 'majors.updateSuccess' : 'majors.createSuccess'));
    void queryClient.invalidateQueries({ queryKey: ['majors'] });
  }

  function openDelete(major: Major) {
    setDeleteErrorKey('');
    setDeletingMajor(major);
  }

  function closeDelete() {
    if (!isDeleting) setDeletingMajor(null);
  }

  async function handleDelete() {
    if (!deletingMajor || isDeleting) return;
    setIsDeleting(true);
    setDeleteErrorKey('');
    try {
      await majorApi.deleteMajor(deletingMajor.id);
    } catch (deleteError) {
      setDeleteErrorKey(getMajorErrorKey(deleteError));
      setIsDeleting(false);
      return;
    }
    setIsDeleting(false);
    setDeletingMajor(null);
    if (majors.length === 1 && page > 1) setPage(page - 1);
    toast.success(t('majors.deleteSuccess'));
    void queryClient.invalidateQueries({ queryKey: ['majors'] });
  }

  const majors = data?.result || [];
  const hasFilters = Boolean(filters.search) || filters.temporaryName !== undefined;

  function clearFilters() {
    setFilters({});
    setPage(1);
    setFilterResetVersion((version) => version + 1);
  }

  return (
    <div>
      <PageHeader title={t('majors.title')} description={t('majors.description')}
        action={<Button icon={<Plus size={16} />} onClick={openCreate}>{t('majors.create')}</Button>} />

      <MajorFilterBar key={filterResetVersion} filters={filters} onApply={applyFilters} />

      {isLoading ? <LoadingSpinner message={t('majors.loadingList')} /> : isError ? (
        <ErrorState title={t('majors.errorTitle')} message={t(getMajorErrorKey(error))} onRetry={() => refetch()} />
      ) : majors.length === 0 ? (
        <EmptyState title={t(page > 1 ? 'majors.emptyPageTitle' : hasFilters ? 'majors.emptyFilteredTitle' : 'majors.emptyTitle')}
          description={t(page > 1 ? 'majors.emptyPageDescription' : hasFilters ? 'majors.emptyFilteredDescription' : 'majors.emptyDescription')}
          icon={<GraduationCap size={32} />} actionText={t(page > 1 ? 'majors.firstPage' : hasFilters ? 'majors.clearFilters' : 'majors.create')}
          onAction={page > 1 ? () => setPage(1) : hasFilters ? clearFilters : openCreate} />
      ) : (
        <div style={{ opacity: isFetching ? 0.65 : 1, transition: 'opacity 0.2s ease-in-out' }}>
          <MajorTable majors={majors} isLoading={isFetching} onView={(major) => setDetailId(major.id)}
            onEdit={openEdit} onDelete={openDelete} />
          {data && <MajorPagination meta={data.meta} currentPage={page} isLoading={isFetching} onPageChange={setPage}
            onPageSizeChange={(newSize) => { setSize(newSize); setPage(1); }} />}
        </div>
      )}

      {isFormOpen && <MajorFormModal key={editingMajor?.id || 'new'} major={editingMajor}
        onClose={() => setIsFormOpen(false)} onSuccess={handleSaved} />}
      {detailId !== null && <MajorDetailsModal id={detailId} onClose={() => setDetailId(null)} onEdit={openEdit} />}
      {deletingMajor && <ConfirmDialog open title={t('majors.deleteTitle')} isDanger isLoading={isDeleting}
        confirmText={t('majors.delete')} onConfirm={handleDelete} onCancel={closeDelete}
        message={
          <div>
            <p>{t('majors.deleteMessage', { code: deletingMajor.code, name: deletingMajor.name })}</p>
            <p style={{ marginTop: '0.75rem' }}>{t('majors.deleteNotice')}</p>
            {deleteErrorKey && <div className="alert alert-error" role="alert" style={{ marginTop: '1rem' }}>
              {t(deleteErrorKey)}
            </div>}
          </div>
        } />}
    </div>
  );
}
