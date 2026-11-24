import { useMemo, useState } from 'react';
import { Modal, Table, Input, Progress } from 'antd';
import { useTranslation } from 'react-i18next';
import {
  FileSpreadsheet,
  Users,
  GraduationCap,
  Layers,
  Search,
  Download,
  Info,
  CheckCircle2,
  CheckSquare,
  Square,
} from 'lucide-react';
import { Button } from '@/components/common/Button';
import { useToast } from '@/app/providers/ToastContext';
import {
  fetchMultipleClassesAllocationData,
  exportMultiClassResultExcel,
  extractSubjectCode,
} from '../utils/exportGroupResultExcel';
import './MultiClassExportModal.css';

export interface ExportClassItem {
  id: number;
  name: string;
  studentCount?: number;
  lecturerCode?: string | null;
  lecturerName?: string | null;
  termId?: number | null;
  termName?: string | null;
}

export interface MultiClassExportModalProps {
  open: boolean;
  onClose: () => void;
  classes: ExportClassItem[];
  termId?: number;
  termName?: string;
}

export function MultiClassExportModal({
  open,
  onClose,
  classes,
  termId,
  termName,
}: MultiClassExportModalProps) {
  const { t } = useTranslation();
  const toast = useToast();

  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set(classes.map(c => c.id)));
  const [search, setSearch] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{
    completed: number;
    total: number;
    name: string;
  } | null>(null);

  // Sync selectedIds if classes change when modal opens
  const classIdList = useMemo(() => classes.map(c => c.id), [classes]);
  const handleSelectAll = () => {
    setSelectedIds(new Set(classIdList));
  };

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Filter classes by search input
  const filteredClasses = useMemo(() => {
    if (!search.trim()) return classes;
    const q = search.trim().toLowerCase();
    return classes.filter(
      c =>
        c.name.toLowerCase().includes(q) ||
        extractSubjectCode(c.name).toLowerCase().includes(q) ||
        (c.lecturerCode && c.lecturerCode.toLowerCase().includes(q)) ||
        (c.lecturerName && c.lecturerName.toLowerCase().includes(q))
    );
  }, [classes, search]);

  // Statistics
  const totalStudentsInSelection = useMemo(() => {
    return classes
      .filter(c => selectedIds.has(c.id))
      .reduce((sum, c) => sum + (c.studentCount || 0), 0);
  }, [classes, selectedIds]);

  const handleExport = async () => {
    if (selectedIds.size === 0) {
      toast.error(t('groupReview.exportSelectClassPrompt'));
      return;
    }

    const selectedClasses = classes.filter(c => selectedIds.has(c.id));
    setIsExporting(true);
    setExportProgress({ completed: 0, total: selectedClasses.length, name: selectedClasses[0]?.name || '' });

    try {
      const bundles = await fetchMultipleClassesAllocationData(selectedClasses, {
        termId,
        termName,
        onProgress: (completed, total, currentClassName) => {
          setExportProgress({ completed, total, name: currentClassName });
        },
      });

      const totalRows = bundles.reduce((sum, b) => sum + b.rows.length, 0);
      if (totalRows === 0) {
        toast.error(t('groupExport.noDataToExport'));
        return;
      }

      exportMultiClassResultExcel(bundles, {
        termName,
        filenamePrefix: `DSSV_${bundles.length}Lop`,
      });

      toast.success(t('groupReview.exportSelectedSuccess', { count: bundles.length }));
      onClose();
    } catch {
      toast.error(t('groupReview.exportSelectedError'));
    } finally {
      setIsExporting(false);
      setExportProgress(null);
    }
  };

  const columns = [
    {
      title: t('groupExport.colClassName'),
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => (
        <div className="multi-export-class-name">
          <GraduationCap size={16} aria-hidden="true" />
          <strong>{name}</strong>
        </div>
      ),
    },
    {
      title: t('groupExport.colSubjectCode'),
      key: 'subjectCode',
      render: (_: unknown, record: ExportClassItem) => (
        <span className="badge badge-info">{extractSubjectCode(record.name)}</span>
      ),
    },
    {
      title: t('groupExport.colStudentCount'),
      dataIndex: 'studentCount',
      key: 'studentCount',
      render: (count?: number) => (
        <div className="multi-export-student-count">
          <Users size={14} aria-hidden="true" />
          <span>{count ?? 0}</span>
        </div>
      ),
    },
    {
      title: t('groupExport.colLecturer'),
      key: 'lecturer',
      render: (_: unknown, record: ExportClassItem) => (
        <span>{record.lecturerName || record.lecturerCode || '—'}</span>
      ),
    },
  ];

  return (
    <Modal
      className="group-export-modal multi-class-export-modal"
      open={open}
      onCancel={() => {
        if (!isExporting) onClose();
      }}
      width={780}
      title={
        <div className="export-modal-header">
          <div className="export-modal-title">
            <Layers size={22} aria-hidden="true" />
            <span>{t('groupExport.multiModalTitle')}</span>
          </div>
          <p className="export-modal-subtitle">
            {t('groupExport.multiModalSubtitle')}
          </p>
        </div>
      }
      footer={
        <div className="multi-export-footer">
          <div className="multi-export-footer-info">
            <span className="badge badge-neutral">
              {t('groupExport.selectedCount', {
                selected: selectedIds.size,
                total: classes.length,
              })}
            </span>
            {selectedIds.size > 0 && (
              <span className="badge badge-info">
                {t('groupExport.totalStudentsCount', { count: totalStudentsInSelection })}
              </span>
            )}
          </div>
          <div className="multi-export-footer-actions">
            <Button
              variant="secondary"
              disabled={isExporting}
              onClick={onClose}
            >
              {t('groupExport.closeBtn')}
            </Button>
            <Button
              variant="primary"
              icon={<Download size={16} />}
              loading={isExporting}
              disabled={selectedIds.size === 0 || isExporting}
              onClick={handleExport}
            >
              {t('groupExport.exportSelectedBtn', { count: selectedIds.size })}
            </Button>
          </div>
        </div>
      }
    >
      <div className="multi-export-body">
        {/* Statistics Cards */}
        <div className="export-stats-grid multi-class-stats-grid">
          <div className="export-stat-card total">
            <div className="export-stat-icon" aria-hidden="true">
              <Layers size={20} />
            </div>
            <div className="export-stat-content">
              <span className="export-stat-label">{t('classVisibility.classes')}</span>
              <strong className="export-stat-value">{classes.length}</strong>
            </div>
          </div>
          <div className="export-stat-card assigned">
            <div className="export-stat-icon" aria-hidden="true">
              <CheckCircle2 size={20} />
            </div>
            <div className="export-stat-content">
              <span className="export-stat-label">{t('groupExport.selectedCount', { selected: selectedIds.size, total: classes.length }).split(':')[0]}</span>
              <strong className="export-stat-value">{selectedIds.size}</strong>
            </div>
          </div>
          <div className="export-stat-card groups">
            <div className="export-stat-icon" aria-hidden="true">
              <Users size={20} />
            </div>
            <div className="export-stat-content">
              <span className="export-stat-label">{t('departmentOverview.students')}</span>
              <strong className="export-stat-value">~{totalStudentsInSelection}</strong>
            </div>
          </div>
        </div>

        {/* Toolbar: Search & Select All/Deselect All */}
        <div className="multi-export-toolbar">
          <div className="multi-export-search">
            <Input
              prefix={<Search size={15} aria-hidden="true" />}
              placeholder={t('groupExport.searchClassPlaceholder')}
              value={search}
              onChange={e => setSearch(e.target.value)}
              allowClear
              disabled={isExporting}
            />
          </div>
          <div className="multi-export-quick-select">
            <Button
              data-testid="select-all-classes-btn"
              size="sm"
              variant="ghost"
              icon={<CheckSquare size={14} />}
              disabled={isExporting || selectedIds.size === classes.length}
              onClick={handleSelectAll}
            >
              {t('groupExport.selectAll')}
            </Button>
            <Button
              data-testid="deselect-all-classes-btn"
              size="sm"
              variant="ghost"
              icon={<Square size={14} />}
              disabled={isExporting || selectedIds.size === 0}
              onClick={handleDeselectAll}
            >
              {t('groupExport.deselectAll')}
            </Button>
          </div>
        </div>

        {/* Informational Banner */}
        <div className="multi-export-notice">
          <Info size={16} aria-hidden="true" />
          <span>{t('groupExport.exportNoticeMulti')}</span>
        </div>

        {/* Export Progress Indicator */}
        {isExporting && exportProgress && (
          <div className="multi-export-progress-card">
            <div className="multi-export-progress-header">
              <FileSpreadsheet size={18} className="spin" aria-hidden="true" />
              <span>
                {t('groupExport.exportingProgress', {
                  completed: exportProgress.completed,
                  total: exportProgress.total,
                  name: exportProgress.name,
                })}
              </span>
            </div>
            <Progress
              percent={Math.round((exportProgress.completed / exportProgress.total) * 100)}
              status="active"
              strokeColor="#2563eb"
            />
          </div>
        )}

        {/* Classes Table */}
        <div className="multi-export-table-container">
          <Table
            rowKey="id"
            columns={columns}
            dataSource={filteredClasses}
            pagination={false}
            scroll={{ y: 280 }}
            rowSelection={{
              selectedRowKeys: Array.from(selectedIds),
              onChange: (keys) => {
                setSelectedIds(new Set(keys as number[]));
              },
              getCheckboxProps: () => ({
                disabled: isExporting,
              }),
            }}
            onRow={(record) => ({
              onClick: () => {
                if (!isExporting) toggleSelect(record.id);
              },
              style: { cursor: isExporting ? 'default' : 'pointer' },
            })}
          />
        </div>
      </div>
    </Modal>
  );
}
