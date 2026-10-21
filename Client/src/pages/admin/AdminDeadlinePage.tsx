import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Modal } from 'antd';
import { Plus, Clock } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ErrorState } from '@/components/common/ErrorState';
import { EmptyState } from '@/components/common/EmptyState';
import { Pagination } from '@/components/common/Pagination';
import { useToast } from '@/app/providers/ToastContext';
import { useTerm } from '@/app/providers/TermContext';
import { TermScope } from '@/features/terms/components/TermScope';
import { deadlineApi } from '@/features/deadline/api/deadlineApi';
import { classApi } from '@/features/classes/api/classApi';
import { DeadlineTable } from '@/features/deadline/components/DeadlineTable';
import { CreateDeadlineModal } from '@/features/deadline/components/CreateDeadlineModal';
import { ExtendDeadlineModal } from '@/features/deadline/components/ExtendDeadlineModal';
import { syncDeadlineQueries } from '@/features/deadline/realtime';
import type { Deadline } from '@/features/deadline/types';

export const AdminDeadlinePage: React.FC = () => (
  <TermScope>
    <AdminDeadlineContent />
  </TermScope>
);

const AdminDeadlineContent: React.FC = () => {
  const { t } = useTranslation();
  const toast = useToast();
  const queries = useQueryClient();
  const { selectedTermId, lockTermSelection } = useTerm();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingDeadline, setEditingDeadline] = useState<Deadline | null>(null);

  // Fetch deadlines
  const {
    data: deadlineData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['admin-deadlines', selectedTermId, page, pageSize],
    queryFn: ({ signal }) => deadlineApi.getDeadlines({ page, size: pageSize, termId: selectedTermId ?? undefined }, signal),
  });

  // Fetch classes for modal
  const classesQuery = useQuery({
    queryKey: ['admin-classes-for-deadline', selectedTermId],
    queryFn: ({ signal }) => classApi.getAllClasses(selectedTermId!, signal),
    enabled: isCreateOpen, retry: false,
  });

  const availableClasses = (classesQuery.data || []).map((c) => ({
    id: c.id,
    name: c.name,
  }));

  const deadlines = deadlineData?.result || [];
  const meta = deadlineData?.meta || { page, pageSize, pages: 1, total: 0 };
  const listedEditing = deadlines.find(d => d.id === editingDeadline?.id);
  const currentEditing = listedEditing && (listedEditing.version ?? -1) >= (editingDeadline?.version ?? -1)
    ? listedEditing : editingDeadline;
  const visibleEditing = currentEditing;

  const handleCancel = (d: Deadline) => {
    Modal.confirm({
      title: t('deadline.confirmCancel.title'),
      icon: <Clock size={22} style={{ color: 'var(--color-error, #ef4444)', marginRight: 8 }} />,
      content: (
        <div>
          <p>
            {t('deadline.confirmCancel.content', { name: d.name })}<br />{d.schoolClassNames.join(', ')}
          </p>
          <p style={{ color: 'var(--color-text-muted, #64748b)', fontSize: '13px', marginTop: '6px' }}>
            {t('deadline.confirmCancel.adminNotice')}
          </p>
        </div>
      ),
      okText: t('deadline.confirmCancel.ok'),
      okType: 'danger',
      cancelText: t('deadline.confirmCancel.cancel'),
      centered: true,
      onOk: async () => {
        const release = lockTermSelection();
        try {
          const updated = await deadlineApi.closeDeadline(d);
          toast.success(t('deadline.messages.cancelSuccess'));
          await syncDeadlineQueries(queries, { eventType: 'DEADLINE_CLOSED', deadlineId: d.id, affectedClassIds: d.schoolClassIds, version: updated.version, classWindows: updated.classWindows, startTime: updated.startTime, endTime: updated.endTime });
        } catch (err: any) {
          toast.error(err.message || t('deadline.messages.cancelError'));
          await syncDeadlineQueries(queries);
          throw err;
        } finally { release(); }
      },
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('deadline.title')}
        description={t('deadline.description')}
        action={
          <Button
            variant="primary"
            icon={<Plus size={16} />}
            onClick={() => setIsCreateOpen(true)}
          >
            {t('deadline.createNew')}
          </Button>
        }
      />

      <div className="card">
        {isLoading ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <LoadingSpinner message={t('deadline.loadingList')} />
          </div>
        ) : isError ? (
          <div style={{ padding: '2rem' }}>
            <ErrorState
              title={t('deadline.loadErrorTitle')}
              message={(error as any)?.message || t('deadline.loadErrorDesc')}
              onRetry={() => refetch()}
            />
          </div>
        ) : deadlines.length === 0 ? (
          <div style={{ padding: '3rem 1rem' }}>
            <EmptyState
              icon={<Clock size={48} />}
              title={t('deadline.emptyAdminTitle')}
              description={t('deadline.emptyAdminDesc')}
              actionText={t('deadline.createNew')}
              onAction={() => setIsCreateOpen(true)}
            />
          </div>
        ) : (
          <>
            <DeadlineTable
              deadlines={deadlines}
              onEdit={(d) => setEditingDeadline(d)}
              onCancel={handleCancel}
              canManage={true}
            />
            {meta.pages > 1 && (
              <div style={{ padding: '1rem', borderTop: '1px solid var(--color-border)' }}>
                <Pagination
                  meta={meta}
                  currentPage={page}
                  onPageChange={setPage}
                  onPageSizeChange={size => { setPageSize(size); setPage(1); }}
                />
              </div>
            )}
          </>
        )}
      </div>

      <CreateDeadlineModal
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        availableClasses={availableClasses}
        classesLoading={classesQuery.isPending || classesQuery.isFetching}
        classesError={classesQuery.isError}
        onRetryClasses={() => void classesQuery.refetch()}
        lockSelection={lockTermSelection}
        onSuccess={() => refetch()}
      />

      <ExtendDeadlineModal
        open={!!visibleEditing}
        onClose={() => setEditingDeadline(null)}
        deadline={visibleEditing}
        lockSelection={lockTermSelection}
        onSuccess={() => refetch()}
      />
    </div>
  );
};
