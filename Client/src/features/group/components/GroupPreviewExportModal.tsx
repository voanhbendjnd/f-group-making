import { useMemo, useState } from 'react';
import { Modal, Table, Input, Select, Tag } from 'antd';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  FileSpreadsheet,
  Users,
  CheckCircle2,
  AlertCircle,
  Layers,
  Search,
  Download,
  Info,
} from 'lucide-react';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ErrorState } from '@/components/common/ErrorState';
import { useToast } from '@/app/providers/ToastContext';
import {
  fetchClassAllocationData,
  exportGroupResultExcel,
  type StudentGroupExportRow,
} from '../utils/exportGroupResultExcel';
import './GroupPreviewExportModal.css';

interface GroupPreviewExportModalProps {
  open: boolean;
  onClose: () => void;
  classId: number | null;
  className: string;
  deadlineId?: number | null;
  termId?: number | null;
  termName?: string;
  lecturerCode?: string;
}

export function GroupPreviewExportModal({
  open,
  onClose,
  classId,
  className,
  deadlineId,
  termId,
  termName,
  lecturerCode,
}: GroupPreviewExportModalProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'assigned' | 'unassigned'>('all');

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['class-allocation-preview', classId, deadlineId, termId],
    queryFn: () =>
      fetchClassAllocationData(classId!, {
        deadlineId: deadlineId ?? undefined,
        termId: termId ?? undefined,
        termName,
        lecturerCode,
        className,
      }),
    enabled: open && !!classId,
    staleTime: 10000,
  });

  const allRows = data?.rows || [];

  // Thống kê
  const totalStudents = allRows.length;
  const assignedCount = allRows.filter((r) => Boolean(r.groupMentor)).length;
  const unassignedCount = allRows.filter((r) => !r.groupMentor).length;
  const groupsCount = new Set(allRows.map((r) => r.groupMentor).filter(Boolean)).size;

  // Lọc dữ liệu theo tìm kiếm và trạng thái
  const filteredRows = useMemo(() => {
    let result = allRows;

    if (filterType === 'assigned') {
      result = result.filter((r) => Boolean(r.groupMentor));
    } else if (filterType === 'unassigned') {
      result = result.filter((r) => !r.groupMentor);
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (r) =>
          r.rollNumber.toLowerCase().includes(q) ||
          r.fullName.toLowerCase().includes(q) ||
          r.email.toLowerCase().includes(q) ||
          r.memberCode.toLowerCase().includes(q) ||
          (r.groupMentor && r.groupMentor.toLowerCase().includes(q)) ||
          (r.groupCode && r.groupCode.toLowerCase().includes(q)) ||
          r.khoa.toLowerCase().includes(q)
      );
    }

    return result;
  }, [allRows, filterType, search]);

  const handleExport = () => {
    if (!data || allRows.length === 0) {
      toast.error(t('groupExport.noDataToExport', 'Không có dữ liệu sinh viên để xuất file.'));
      return;
    }

    try {
      exportGroupResultExcel(allRows, data.meta);
      toast.success(t('groupReview.exportSuccess', 'Đã xuất file Excel kết quả phân nhóm thành công!'));
    } catch {
      toast.error(t('groupReview.exportError', 'Có lỗi xảy ra khi tạo file Excel.'));
    }
  };

  const columns = [
    {
      title: t('groupExport.colStt', 'STT'),
      key: 'stt',
      width: 60,
      align: 'center' as const,
      render: (_: unknown, __: StudentGroupExportRow, index: number) => index + 1,
    },
    {
      title: t('groupExport.colRollNumber', 'Mã SV'),
      dataIndex: 'rollNumber',
      key: 'rollNumber',
      width: 110,
      render: (val: string) => <strong>{val}</strong>,
    },
    {
      title: t('groupExport.colFullName', 'Họ và tên'),
      dataIndex: 'fullName',
      key: 'fullName',
      width: 200,
    },
    {
      title: t('groupExport.colKhoa', 'Khoá / Ngành'),
      dataIndex: 'khoa',
      key: 'khoa',
      width: 140,
      render: (val: string) => <span className="text-secondary">{val || '—'}</span>,
    },
    {
      title: t('groupExport.colMemberCode', 'Mã TV'),
      dataIndex: 'memberCode',
      key: 'memberCode',
      width: 140,
    },
    {
      title: t('groupExport.colEmail', 'Email'),
      dataIndex: 'email',
      key: 'email',
      width: 220,
    },
    {
      title: t('groupExport.colGroupCode', 'Mã nhóm'),
      dataIndex: 'groupCode',
      key: 'groupCode',
      width: 90,
      render: (value?: string) => value || '—',
    },
    {
      title: t('groupExport.colGroupMentor', 'Nhóm (Group Mentor)'),
      key: 'groupMentor',
      width: 180,
      render: (_: unknown, record: StudentGroupExportRow) => {
        if (record.groupMentor) {
          return (
            <span className="export-badge-assigned">
              {record.groupMentor}
              {record.groupStatus && (
                <Tag
                  color={
                    record.groupStatus === 'ACCEPTED'
                      ? 'success'
                      : record.groupStatus === 'PENDING'
                      ? 'processing'
                      : 'warning'
                  }
                  style={{ marginLeft: 6, fontSize: '0.7rem' }}
                >
                  {record.groupStatus}
                </Tag>
              )}
            </span>
          );
        }
        return <span className="export-badge-unassigned">{t('groupExport.noGroup', 'Chưa có nhóm')}</span>;
      },
    },
  ];

  return (
    <Modal
      className="group-export-modal"
      open={open}
      onCancel={onClose}
      width={1060}
      footer={null}
      destroyOnHidden
    >
      <div className="export-modal-header">
        <h2 className="export-modal-title">
          <FileSpreadsheet size={24} aria-hidden="true" />
          <span>
            {t('groupExport.modalTitle', 'Xem trước kết quả phân nhóm')} - {className}
          </span>
        </h2>
        <p className="export-modal-subtitle">
          {t(
            'groupExport.modalSubtitle',
            'Kiểm tra thông tin phân nhóm của toàn bộ sinh viên trong lớp trước khi xuất file Excel'
          )}
        </p>
      </div>

      {isLoading ? (
        <div style={{ padding: '60px 0', textAlign: 'center' }}>
          <LoadingSpinner size={36} message={t('groupExport.loading', 'Đang tải dữ liệu phân nhóm...')} />
        </div>
      ) : isError ? (
        <ErrorState
          message={error instanceof Error ? error.message : t('groupExport.loadError', 'Không thể tải dữ liệu')}
          onRetry={() => {
            void refetch();
          }}
        />
      ) : (
        <>
          <div className="export-stats-grid" aria-label={t('groupExport.statsTitle', 'Thống kê phân nhóm')}>
            <div className="export-stat-card total">
              <div className="export-stat-icon">
                <Users size={20} />
              </div>
              <div className="export-stat-info">
                <span className="export-stat-label">{t('groupExport.totalStudents', 'Tổng số SV')}</span>
                <span className="export-stat-value">{totalStudents}</span>
              </div>
            </div>

            <div className="export-stat-card assigned">
              <div className="export-stat-icon">
                <CheckCircle2 size={20} />
              </div>
              <div className="export-stat-info">
                <span className="export-stat-label">{t('groupExport.assignedStudents', 'Đã có nhóm')}</span>
                <span className="export-stat-value">{assignedCount}</span>
              </div>
            </div>

            <div className="export-stat-card unassigned">
              <div className="export-stat-icon">
                <AlertCircle size={20} />
              </div>
              <div className="export-stat-info">
                <span className="export-stat-label">{t('groupExport.unassignedStudents', 'Chưa có nhóm')}</span>
                <span className="export-stat-value">{unassignedCount}</span>
              </div>
            </div>

            <div className="export-stat-card groups">
              <div className="export-stat-icon">
                <Layers size={20} />
              </div>
              <div className="export-stat-info">
                <span className="export-stat-label">{t('groupExport.totalGroups', 'Số nhóm')}</span>
                <span className="export-stat-value">{groupsCount}</span>
              </div>
            </div>
          </div>

          <div className="export-filter-bar">
            <Input
              className="export-search-input"
              prefix={<Search size={16} aria-hidden="true" />}
              placeholder={t('groupExport.searchPlaceholder', 'Tìm theo MSSV, họ tên, email, nhóm...')}
              value={search}
              allowClear
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select
              className="export-status-select"
              value={filterType}
              onChange={(val) => setFilterType(val)}
              options={[
                { value: 'all', label: t('groupExport.filterAll', 'Tất cả sinh viên') },
                { value: 'assigned', label: t('groupExport.filterAssigned', 'Đã có nhóm') },
                { value: 'unassigned', label: t('groupExport.filterUnassigned', 'Chưa có nhóm') },
              ]}
            />
          </div>

          <div className="export-table-container">
            <Table
              rowKey={(record) => record.studentId}
              columns={columns}
              dataSource={filteredRows}
              pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: [10, 20, 50] }}
              size="middle"
              locale={{ emptyText: t('groupExport.empty', 'Không có dữ liệu sinh viên') }}
            />
          </div>

          <div className="export-modal-footer">
            <p className="export-footer-hint">
              <Info size={16} aria-hidden="true" />
              <span>
                {t(
                  'groupExport.footerHint',
                  'Cột Group Mentor trong file Excel sẽ lưu tên nhóm của sinh viên (để trống nếu chưa có nhóm).'
                )}
              </span>
            </p>
            <div className="export-footer-actions">
              <Button variant="secondary" onClick={onClose}>
                {t('groupExport.closeBtn', 'Đóng')}
              </Button>
              <Button
                variant="primary"
                icon={<Download size={16} />}
                onClick={handleExport}
                disabled={allRows.length === 0}
              >
                {t('groupExport.exportBtn', 'Xuất file Excel (.xlsx)')}
              </Button>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}
