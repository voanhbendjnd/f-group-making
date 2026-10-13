import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useTerm } from '@/app/providers/TermContext';
import { TermScope } from '@/features/terms/components/TermScope';
import { Upload, Users, Mail, Trash2, Clock } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ErrorState } from '@/components/common/ErrorState';
import { EmptyState } from '@/components/common/EmptyState';
import { Pagination } from '@/components/common/Pagination';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Select } from '@/components/common/Select';
import { LecturerFilterBar } from '@/features/lecturers/components/LecturerFilterBar';
import { LecturerTable } from '@/features/lecturers/components/LecturerTable';
import { lecturerApi } from '@/features/lecturers/api/lecturerApi';
import { useToast } from '@/app/providers/ToastContext';
import type { Lecturer, LecturerFilterParams } from '@/features/lecturers/types';

export const LecturerListPage: React.FC = () => {
  const { t } = useTranslation();
  const { isLocked } = useTerm();
  const [searchParams, setSearchParams] = useSearchParams();
  const global = searchParams.get('scope') === 'all';

  return <div>
    <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
      <Select id="lecturer-scope" label={t('terms.lecturerScope')} value={global ? 'all' : 'term'} disabled={isLocked}
        options={[
          { value: 'term', label: t('terms.selectedTermScope') },
          { value: 'all', label: t('terms.allLecturers') },
        ]}
        onChange={(event) => {
          const next = new URLSearchParams(searchParams);
          if (event.target.value === 'all') next.set('scope', 'all');
          else next.delete('scope');
          setSearchParams(next);
        }} />
      {global && <p className="card-subtitle" style={{ marginTop: '0.5rem' }}>{t('terms.globalLecturerNotice')}</p>}
    </div>
    <TermScope global={global}><LecturerListContent global={global} /></TermScope>
  </div>;
};

const LecturerListContent: React.FC<{ global: boolean }> = ({ global }) => {
  const { selectedTermId, lockTermSelection } = useTerm();
  const termId = global ? undefined : selectedTermId!;
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();

  const [filters, setFilters] = useState<LecturerFilterParams>({
    page: 1,
    size: 10,
    search: '',
  });

  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [isActivating, setIsActivating] = useState<boolean>(false);

  // Activation 60s cooldown states
  const [cooldownExpiries, setCooldownExpiries] = useState<Record<number, number>>(() => {
    try {
      const saved = sessionStorage.getItem('lecturer_activation_cooldowns');
      if (saved) {
        const parsed = JSON.parse(saved);
        const nowTime = Date.now();
        const valid: Record<number, number> = {};
        for (const [k, v] of Object.entries(parsed)) {
          if (Number(v) > nowTime) {
            valid[Number(k)] = Number(v);
          }
        }
        return valid;
      }
    } catch {
      // ignore
    }
    return {};
  });

  const [currentTime, setCurrentTime] = useState<number>(Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const getCooldown = (userId: number): number => {
    const expire = cooldownExpiries[userId] || 0;
    return Math.max(0, Math.ceil((expire - currentTime) / 1000));
  };

  // Delete states
  const [deletingLecturer, setDeletingLecturer] = useState<Lecturer | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [isBatchDeleteModalOpen, setIsBatchDeleteModalOpen] = useState<boolean>(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['lecturers', termId ?? 'all', filters],
    queryFn: () => lecturerApi.getLecturers({ ...filters, termId }),
  });

  const lecturers = data?.result || [];
  const meta = data?.meta || { page: filters.page || 1, pageSize: filters.size || 10, pages: 1, total: 0 };

  const handleToggleSelect = (userId: number) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleToggleSelectAll = () => {
    const currentPageIds = lecturers.map((l) => l.userId);
    const allSelected = currentPageIds.length > 0 && currentPageIds.every((id) => selectedUserIds.includes(id));

    if (allSelected) {
      setSelectedUserIds((prev) => prev.filter((id) => !currentPageIds.includes(id)));
    } else {
      setSelectedUserIds((prev) => Array.from(new Set([...prev, ...currentPageIds])));
    }
  };

  const handleFilterChange = (newFilters: Partial<LecturerFilterParams>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
    setSelectedUserIds([]);
  };

  const handleResetFilters = () => {
    setSelectedUserIds([]);
    setFilters({
      page: 1,
      size: 10,
      search: '',
      activated: undefined,
    });
  };

  const handlePageChange = (newPage: number) => {
    setFilters((prev) => ({ ...prev, page: newPage }));
  };

  const handlePageSizeChange = (newSize: number) => {
    setFilters((prev) => ({ ...prev, size: newSize, page: 1 }));
    setSelectedUserIds([]);
  };

  const handleSendSingleActivation = async (lecturer: Lecturer) => {
    if (isActivating) return;
    const unlock = lockTermSelection();
    setIsActivating(true);
    try {
      await lecturerApi.sendSingleActivation(lecturer.userId, lecturer.email, termId);
      success(t('terms.activationAccepted'));
      const newExpiries = { ...cooldownExpiries, [lecturer.userId]: Date.now() + 60000 };
      setCooldownExpiries(newExpiries);
      try {
        sessionStorage.setItem('lecturer_activation_cooldowns', JSON.stringify(newExpiries));
      } catch {
        // ignore
      }
      void queryClient.invalidateQueries({ queryKey: ['lecturers'] });
    } catch (err: any) {
      showError(err.message || 'Không thể gửi email kích hoạt');
    } finally {
      setIsActivating(false);
      unlock();
    }
  };

  const handleBatchActivation = async () => {
    if (selectedUserIds.length === 0 || isActivating) return;
    const unlock = lockTermSelection();
    setIsActivating(true);
    try {
      const res = await lecturerApi.sendBatchActivation(selectedUserIds, termId);
      success(t('terms.batchActivationAccepted', { count: res.totalProcessed }));
      const newExpiries = { ...cooldownExpiries };
      const expTime = Date.now() + 60000;
      selectedUserIds.forEach((id) => {
        newExpiries[id] = expTime;
      });
      setCooldownExpiries(newExpiries);
      try {
        sessionStorage.setItem('lecturer_activation_cooldowns', JSON.stringify(newExpiries));
      } catch {
        // ignore
      }
      setSelectedUserIds([]);
      void queryClient.invalidateQueries({ queryKey: ['lecturers'] });
    } catch (err: any) {
      showError(err.message || 'Không thể gửi email kích hoạt hàng loạt');
    } finally {
      setIsActivating(false);
      unlock();
    }
  };

  const handleConfirmDeleteSingle = async () => {
    if (!deletingLecturer || isDeleting) return;
    const unlock = lockTermSelection();
    setIsDeleting(true);
    try {
      if (termId !== undefined) await lecturerApi.deleteBatchLecturers([deletingLecturer.userId], termId);
      else await lecturerApi.deleteLecturer(deletingLecturer.userId);
      success(`Đã xóa giảng viên "${deletingLecturer.code}" (${deletingLecturer.email}) thành công.`);
      setDeletingLecturer(null);
      setSelectedUserIds((prev) => prev.filter((id) => id !== deletingLecturer.userId));
      void queryClient.invalidateQueries({ queryKey: ['lecturers'] });
      void queryClient.invalidateQueries({ queryKey: ['school-classes'] });
      void queryClient.invalidateQueries({ queryKey: ['school-class'] });
    } catch (err: any) {
      showError(err.message || 'Không thể xóa giảng viên');
    } finally {
      setIsDeleting(false);
      unlock();
    }
  };

  const handleConfirmBatchDelete = async () => {
    if (selectedUserIds.length === 0 || isDeleting) return;
    const unlock = lockTermSelection();
    setIsDeleting(true);
    try {
      await lecturerApi.deleteBatchLecturers(selectedUserIds, termId);
      success(`Đã xóa ${selectedUserIds.length} giảng viên đã chọn thành công.`);
      setSelectedUserIds([]);
      setIsBatchDeleteModalOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['lecturers'] });
      void queryClient.invalidateQueries({ queryKey: ['school-classes'] });
      void queryClient.invalidateQueries({ queryKey: ['school-class'] });
    } catch (err: any) {
      showError(err.message || 'Không thể xóa danh sách giảng viên');
    } finally {
      setIsDeleting(false);
      unlock();
    }
  };

  return (
    <div>
      <PageHeader
        title="Quản lý Giảng viên / Mentor"
        description="Danh sách giảng viên, mentor và công cụ kích hoạt tài khoản."
        breadcrumbs={[
          { label: 'Admin', href: '/admin/dashboard' },
          { label: 'Giảng viên' },
        ]}
        action={
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <Button
              variant="primary"
              icon={<Upload size={16} />}
              onClick={() => navigate('/admin/lecturers/import')}
            >
              Import Giảng viên
            </Button>
          </div>
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {/* Search & Filter Bar */}
        <LecturerFilterBar
          filters={filters}
          onChange={handleFilterChange}
          onReset={handleResetFilters}
        />

        {/* Bulk Action Toolbar */}
        {selectedUserIds.length > 0 && (
          <div
            className="card"
            style={{
              padding: '0.75rem 1.25rem',
              backgroundColor: '#eff6ff',
              borderColor: '#bfdbfe',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.75rem',
            }}
          >
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1e40af' }}>
              Đang chọn {selectedUserIds.length} giảng viên
            </span>
            {(() => {
              const maxCooldown = selectedUserIds.length > 0
                ? Math.max(0, ...selectedUserIds.map((id) => getCooldown(id)))
                : 0;
              return (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setSelectedUserIds([])}
                  >
                    Hủy chọn
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    icon={maxCooldown > 0 ? <Clock size={14} /> : <Mail size={14} />}
                    loading={isActivating}
                    disabled={maxCooldown > 0}
                    onClick={handleBatchActivation}
                    title={maxCooldown > 0 ? `Vui lòng đợi ${maxCooldown}s trước khi gửi lại` : undefined}
                  >
                    {maxCooldown > 0
                      ? `Gửi lại sau (${maxCooldown}s)`
                      : `Gửi email kích hoạt (${selectedUserIds.length})`}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    icon={<Trash2 size={14} />}
                    disabled={isDeleting}
                    onClick={() => setIsBatchDeleteModalOpen(true)}
                  >
                    Xóa ({selectedUserIds.length})
                  </Button>
                </div>
              );
            })()}
          </div>
        )}

        {/* Content area */}
        {isLoading ? (
          <div className="card" style={{ padding: '3rem' }}>
            <LoadingSpinner message="Đang tải danh sách giảng viên..." />
          </div>
        ) : isError ? (
          <div className="card">
            <ErrorState message={(error as any)?.message || 'Không thể tải dữ liệu'} onRetry={refetch} />
          </div>
        ) : lecturers.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={<Users size={32} />}
              title="Chưa có dữ liệu giảng viên"
              description="Chưa có giảng viên nào trong hệ thống hoặc không khớp với từ khóa tìm kiếm."
              actionText="Import file Excel ngay"
              onAction={() => navigate('/admin/lecturers/import')}
            />
          </div>
        ) : (
          <div className="card">
            <LecturerTable
              lecturers={lecturers}
              selectedUserIds={selectedUserIds}
              onToggleSelect={handleToggleSelect}
              onToggleSelectAll={handleToggleSelectAll}
              onSendActivation={handleSendSingleActivation}
              onDelete={(lecturer) => setDeletingLecturer(lecturer)}
              isSendingActivation={isActivating}
              getCooldown={getCooldown}
            />

            <Pagination
              meta={meta}
              currentPage={filters.page}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
            />
          </div>
        )}
      </div>

      {/* Confirm Single Delete Modal */}
      <ConfirmDialog
        open={deletingLecturer !== null}
        title="Xác nhận xóa giảng viên"
        isDanger={true}
        isLoading={isDeleting}
        confirmText="Xác nhận xóa"
        cancelText="Hủy"
        onCancel={() => setDeletingLecturer(null)}
        onConfirm={handleConfirmDeleteSingle}
        message={
          <div>
            Bạn có chắc chắn muốn xóa giảng viên{' '}
            <strong>{deletingLecturer?.code}</strong> ({deletingLecturer?.email}) khỏi hệ thống?
            <br />
            Hành động này sẽ xóa tài khoản người dùng và không thể hoàn tác.
          </div>
        }
      />

      {/* Confirm Batch Delete Modal */}
      <ConfirmDialog
        open={isBatchDeleteModalOpen}
        title="Xác nhận xóa nhiều giảng viên"
        isDanger={true}
        isLoading={isDeleting}
        confirmText={`Xóa ${selectedUserIds.length} giảng viên`}
        cancelText="Hủy"
        onCancel={() => setIsBatchDeleteModalOpen(false)}
        onConfirm={handleConfirmBatchDelete}
        message={
          <div>
            Bạn có chắc chắn muốn xóa <strong>{selectedUserIds.length}</strong> giảng viên đã chọn khỏi hệ thống?
            <br />
            Các tài khoản liên kết sẽ bị xóa vĩnh viễn và không thể khôi phục.
          </div>
        }
      />
    </div>
  );
};
