import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTerm } from '@/app/providers/TermContext';
import { TermScope } from '@/features/terms/components/TermScope';
import { Upload, Users, UserPlus } from 'lucide-react';
import { CreateStudentModal } from '@/features/students/components/CreateStudentModal';
import { useToast } from '@/app/providers/ToastContext';
import { useTranslation } from 'react-i18next';
import { studentApi } from '@/features/students/api/studentApi';
import type { Student, StudentFilterParams } from '@/features/students/types';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ErrorState } from '@/components/common/ErrorState';
import { EmptyState } from '@/components/common/EmptyState';
import { Pagination } from '@/components/common/Pagination';
import { StudentFilterBar } from '@/features/students/components/StudentFilterBar';
import { BulkActionToolbar } from '@/features/students/components/BulkActionToolbar';
import { StudentTable } from '@/features/students/components/StudentTable';
import { BatchActivationModal } from '@/features/students/components/BatchActivationModal';
import { SingleActivationModal } from '@/features/students/components/SingleActivationModal';
import { useListFilters } from '@/components/common/useListFilters';

export const StudentListPage: React.FC = () => <TermScope><StudentListContent /></TermScope>;

const StudentListContent: React.FC = () => {
  const { selectedTermId } = useTerm();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { success } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Filters state
  const [filters, setFilters] = useListFilters<StudentFilterParams>({
    page: 1,
    size: 10,
    search: '',
    majorSearch: '',
  }, selectedTermId!);

  // Selection state
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [selectedRecords, setSelectedRecords] = useState<Record<number, Student>>({});
  const [isAllMatchingSelected, setIsAllMatchingSelected] = useState<boolean>(false);

  // Modal states
  const [singleStudentModal, setSingleStudentModal] = useState<Student | null>(null);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);

  // Each Term has its own cache; no placeholder rows are shown during a new request.
  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['students', selectedTermId, filters],
    queryFn: () => studentApi.getStudents({ ...filters, termId: selectedTermId! }),
  });

  const students = data?.result || [];
  const meta = data?.meta || { page: filters.page || 1, pageSize: filters.size || 10, pages: 1, total: 0 };

  // Selected records only live in memory, including selections on previous pages.
  const selectedStudents = selectedUserIds.map(id => selectedRecords[id]).filter(Boolean);
  const activeInSelected = selectedStudents.filter((s) => s.activated).length;
  const eligibleSelectedCount = selectedStudents.length - activeInSelected;

  // Selection handlers
  const handleToggleSelect = (userId: number) => {
    const record = students.find(student => student.userId === userId);
    if (record) setSelectedRecords(previous => ({ ...previous, [userId]: record }));
    setIsAllMatchingSelected(false);
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleToggleSelectAllPage = () => {
    setSelectedRecords(previous => ({ ...previous, ...Object.fromEntries(students.map(student => [student.userId, student])) }));
    setIsAllMatchingSelected(false);
    const currentPageIds = students.map((s) => s.userId);
    const allSelected = currentPageIds.every((id) => selectedUserIds.includes(id));

    if (allSelected) {
      // Unselect all on current page
      setSelectedUserIds((prev) => prev.filter((id) => !currentPageIds.includes(id)));
    } else {
      // Select all on current page
      setSelectedUserIds((prev) => Array.from(new Set([...prev, ...currentPageIds])));
    }
  };

  const handleSelectAllMatching = () => {
    setIsAllMatchingSelected(true);
  };

  const handleClearSelection = () => {
    setSelectedUserIds([]);
    setSelectedRecords({});
    setIsAllMatchingSelected(false);
  };

  const handlePageChange = (newPage: number) => {
    setFilters((prev) => ({ ...prev, page: newPage }));
  };

  const handlePageSizeChange = (newSize: number) => {
    setFilters((prev) => ({ ...prev, size: newSize, page: 1 }));
    setSelectedUserIds([]);
    setIsAllMatchingSelected(false);
  };

  const handleResetFilters = () => {
    setFilters({
      page: 1,
      size: 10,
      search: '',
      majorSearch: '',
      activated: undefined,
      hasActivationKey: undefined,
    });
    handleClearSelection();
  };

  const handleActivationSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['students'] });
    queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['school-class-students'] });
    handleClearSelection();
  };

  return (
    <div>
      <PageHeader
        title={t('students.title')}
        description={t('students.description')}
        action={
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <Button variant="primary" icon={<UserPlus size={16} />} onClick={() => setIsCreateOpen(true)}>{t('addStudent.button')}</Button>
          <Button
            variant="secondary"
            icon={<Upload size={16} />}
            onClick={() => navigate('/admin/students/import')}
          >
            {t('students.importBtn')}
          </Button>
          </div>
        }
      />

      {isCreateOpen && <CreateStudentModal onClose={() => setIsCreateOpen(false)} onSuccess={() => {
        setIsCreateOpen(false);
        handleClearSelection();
        for (const key of ['students', 'admin-dashboard', 'school-class-students', 'school-classes', 'school-class', 'my-school-classes']) {
          void queryClient.invalidateQueries({ queryKey: [key] });
        }
        success(t('addStudent.success'));
      }} />}

      {/* Filter Bar */}
      <StudentFilterBar
        filters={{ ...filters, termId: selectedTermId! }}
        onFilterChange={(nextFilters) => { setFilters(nextFilters); handleClearSelection(); }}
        onReset={handleResetFilters}
        isLoading={isFetching}
      />

      {/* Bulk Action Toolbar */}
      <BulkActionToolbar
        selectedCount={selectedUserIds.length}
        totalFilteredCount={meta.total}
        isAllMatchingSelected={isAllMatchingSelected}
        eligibleCount={eligibleSelectedCount}
        onSelectAllMatching={handleSelectAllMatching}
        onClearSelection={handleClearSelection}
        onOpenBatchModal={() => setIsBatchModalOpen(true)}
      />

      {/* Content States */}
      {isLoading && !data ? (
        <LoadingSpinner message={t('students.loadingList')} />
      ) : isError ? (
        <ErrorState
          title={t('students.errorTitle')}
          message={(error as any)?.message || t('students.errorDefault')}
          onRetry={() => refetch()}
        />
      ) : students.length === 0 ? (
        <EmptyState
          title={t('students.emptyTitle')}
          description={
            filters.search || (filters.majorSearch || filters.majorId) || filters.activated !== undefined || filters.hasActivationKey !== undefined
              ? t('students.emptyFiltered')
              : t('students.emptyNoData')
          }
          icon={<Users size={32} />}
          actionText={
            filters.search || (filters.majorSearch || filters.majorId) || filters.activated !== undefined || filters.hasActivationKey !== undefined
              ? t('students.clearFilters')
              : t('students.importBtn')
          }
          onAction={
            filters.search || (filters.majorSearch || filters.majorId) || filters.activated !== undefined || filters.hasActivationKey !== undefined
              ? handleResetFilters
              : () => navigate('/admin/students/import')
          }
        />
      ) : (
        <div style={{ opacity: isFetching ? 0.65 : 1, transition: 'opacity 0.2s ease-in-out' }}>
          <StudentTable
            students={students}
            selectedUserIds={selectedUserIds}
            onToggleSelect={handleToggleSelect}
            onToggleSelectAllPage={handleToggleSelectAllPage}
            onSendSingle={(student) => setSingleStudentModal(student)}
            isLoading={isFetching}
          />

          <Pagination
            meta={meta}
            currentPage={filters.page || 1}
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
          />
        </div>
      )}

      {/* Modals */}
      <BatchActivationModal
        key={isBatchModalOpen ? 'batch-open' : 'batch-closed'}
        open={isBatchModalOpen}
        onClose={() => setIsBatchModalOpen(false)}
        onSuccess={handleActivationSuccess}
        userIds={selectedUserIds}
        selectedStudents={selectedStudents}
        totalSelected={selectedUserIds.length}
        alreadyActiveCount={activeInSelected}
        isAllMatching={isAllMatchingSelected}
        filters={{ ...filters, termId: selectedTermId! }}
        totalFilteredCount={meta.total}
      />

      <SingleActivationModal
        key={`single-${singleStudentModal?.userId ?? 'closed'}`}
        termId={selectedTermId!}
        open={Boolean(singleStudentModal)}
        student={singleStudentModal}
        onClose={() => setSingleStudentModal(null)}
        onSuccess={handleActivationSuccess}
      />
    </div>
  );
};
