import React, { useState } from 'react';
import { ArrowLeft, Send, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import confetti from 'canvas-confetti';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { Modal } from '@/components/common/Modal';
import { FileDropzone } from '@/features/import/components/FileDropzone';
import { ImportErrorList } from '@/features/import/components/ImportErrorList';
import { LecturerImportPreviewTable } from '@/features/lecturers/components/LecturerImportPreviewTable';
import { parseLecturerExcelClientSide } from '@/features/lecturers/utils/lecturerExcelParser';
import { lecturerApi } from '@/features/lecturers/api/lecturerApi';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/app/providers/ToastContext';
import type { ParseLecturerExcelResult } from '@/features/lecturers/types';
import type { ImportResult } from '@/features/import/types';

export const LecturerImportPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { success } = useToast();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isParsingClient, setIsParsingClient] = useState<boolean>(false);
  const [clientParseResult, setClientParseResult] = useState<ParseLecturerExcelResult | null>(null);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [serverResult, setServerResult] = useState<ImportResult | null>(null);
  const [genericError, setGenericError] = useState<string | null>(null);

  // Success popup modal state
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState<boolean>(false);
  const [importedCount, setImportedCount] = useState<number>(0);

  const handleFileSelect = async (file: File) => {
    setSelectedFile(file);
    setClientParseResult(null);
    setServerResult(null);
    setGenericError(null);
    setIsParsingClient(true);

    try {
      const result = await parseLecturerExcelClientSide(file);
      setClientParseResult(result);
    } catch (err: any) {
      setGenericError(err.message || 'Có lỗi xảy ra khi đọc file Excel.');
      setClientParseResult(null);
    } finally {
      setIsParsingClient(false);
    }
  };

  const handleFileRemove = () => {
    setSelectedFile(null);
    setClientParseResult(null);
    setServerResult(null);
    setGenericError(null);
  };

  const handleConfirmImport = async () => {
    if (!selectedFile || isSubmitting) return;

    setIsSubmitting(true);
    setGenericError(null);

    try {
      const result = await lecturerApi.importExcel(selectedFile);
      setServerResult(result);

      if (result.success) {
        setImportedCount(result.totalImported);
        setIsSuccessModalOpen(true);
        success(`Import thành công ${result.totalImported} giảng viên!`);
        void queryClient.invalidateQueries({ queryKey: ['lecturers'] });
        try {
          confetti({ particleCount: 70, spread: 60 });
        } catch {
          // ignore
        }
      }
    } catch (err: any) {
      setGenericError(err.message || 'Có lỗi xảy ra khi gửi dữ liệu lên máy chủ.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloseSuccessModal = () => {
    setIsSuccessModalOpen(false);
    handleFileRemove();
  };

  return (
    <div>
      <PageHeader
        title="Import Giảng viên / Mentor"
        description="Tải lên file Excel danh sách giảng viên để khởi tạo tài khoản và phân quyền."
        breadcrumbs={[
          { label: 'Admin', href: '/admin/dashboard' },
          { label: 'Giảng viên', href: '/admin/lecturers' },
          { label: 'Import' },
        ]}
        action={
          <Link to="/admin/lecturers" className="btn btn-secondary btn-sm" style={{ textDecoration: 'none' }}>
            <ArrowLeft size={16} />
            <span>Quay lại danh sách</span>
          </Link>
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Step 1: File Dropzone */}
        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Bước 1: Chọn file Excel (.xlsx)</h3>
              <p className="card-subtitle">
                Hệ thống hỗ trợ file mẫu (như DS_Mentor_email.xlsx) có các cột Mentor và Email.
              </p>
            </div>
          </div>

          <FileDropzone
            selectedFile={selectedFile}
            onFileSelect={handleFileSelect}
            onFileRemove={handleFileRemove}
            disabled={isParsingClient || isSubmitting}
          />
        </div>

        {/* Parsing state */}
        {isParsingClient && (
          <div className="card" style={{ padding: '2rem' }}>
            <LoadingSpinner message="Đang phân tích cấu trúc file Excel..." />
          </div>
        )}

        {/* Generic or transport error */}
        {genericError && (
          <div className="alert alert-error">
            <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div className="alert-content">{genericError}</div>
          </div>
        )}

        {/* Server Validation Errors (success = false) */}
        {serverResult && !serverResult.success && serverResult.errors?.length > 0 && (
          <div className="card">
            <div className="card-header">
              <h3 className="card-title" style={{ color: 'var(--color-error)' }}>
                Dữ liệu không hợp lệ từ máy chủ
              </h3>
            </div>
            <ImportErrorList errors={serverResult.errors} />
          </div>
        )}

        {/* Step 2: Client Preview and Validation */}
        {clientParseResult && (
          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 className="card-title">Bước 2: Xem trước và kiểm tra tính hợp lệ</h3>
                <p className="card-subtitle">
                  Kiểm tra các dòng dữ liệu bình thường ổn và các dòng bị lỗi trước khi import.
                </p>
              </div>

              <Button
                variant="primary"
                onClick={handleConfirmImport}
                loading={isSubmitting}
                icon={<Send size={16} />}
                disabled={clientParseResult.rows.length === 0 || clientParseResult.hasErrors}
              >
                Xác nhận Import ({clientParseResult.validCount} giảng viên)
              </Button>
            </div>

            <LecturerImportPreviewTable
              rows={clientParseResult.rows}
              validCount={clientParseResult.validCount}
              invalidCount={clientParseResult.invalidCount}
            />

            {/* Bottom confirmation action */}
            <div
              style={{
                marginTop: '1.5rem',
                paddingTop: '1.25rem',
                borderTop: '1px solid var(--color-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '1rem',
              }}
            >
              <div style={{ fontSize: '0.875rem' }}>
                {clientParseResult.invalidCount > 0 ? (
                  <span style={{ color: 'var(--color-error)', fontWeight: 500 }}>
                    * Phát hiện {clientParseResult.invalidCount} dòng dữ liệu lỗi. Vui lòng sửa file trước khi tiến hành import.
                  </span>
                ) : (
                  <span style={{ color: 'var(--color-success)', fontWeight: 500 }}>
                    ✓ Tất cả {clientParseResult.validCount} dòng đều hợp lệ và sẵn sàng import.
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <Button variant="secondary" onClick={handleFileRemove} disabled={isSubmitting}>
                  Hủy bỏ
                </Button>

                <Button
                  variant="primary"
                  onClick={handleConfirmImport}
                  loading={isSubmitting}
                  icon={<Send size={16} />}
                  disabled={clientParseResult.rows.length === 0 || clientParseResult.hasErrors}
                >
                  Xác nhận Import ({clientParseResult.validCount})
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Success Popup Modal */}
      <Modal
        open={isSuccessModalOpen}
        onClose={handleCloseSuccessModal}
        title="Import giảng viên thành công"
        maxWidth="500px"
        footer={
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', width: '100%' }}>
            <Button variant="secondary" onClick={handleCloseSuccessModal}>
              Tiếp tục ở lại
            </Button>
            <Button variant="primary" onClick={() => navigate('/admin/lecturers')}>
              Xem danh sách Giảng viên
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
          <div
            style={{
              padding: '0.625rem',
              borderRadius: 'var(--radius-full)',
              backgroundColor: '#f0fdf4',
              color: 'var(--color-success)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <CheckCircle2 size={26} />
          </div>
          <div>
            <h4 style={{ margin: '0 0 0.375rem', color: 'var(--color-text-main)', fontSize: '1rem', fontWeight: 600 }}>
              Đã thêm thành công {importedCount} giảng viên!
            </h4>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
              Tài khoản giảng viên đã được tạo với vai trò <strong>ROLE_LECTURE</strong> và ở trạng thái chờ kích hoạt.
              Bạn có thể gửi liên kết kích hoạt tài khoản ngay tại trang danh sách.
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
};
