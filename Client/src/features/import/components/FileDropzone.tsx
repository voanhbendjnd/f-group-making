import React, { useRef, useState } from 'react';
import { UploadCloud, FileSpreadsheet, X, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/common/Button';
import { ImportTemplateGuide } from './ImportTemplateGuide';

export interface FileDropzoneProps {
  selectedFile: File | null;
  onFileSelect: (file: File) => void;
  onFileRemove: () => void;
  disabled?: boolean;
  kind?: 'students' | 'lecturers';
}

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export const FileDropzone: React.FC<FileDropzoneProps> = ({
  selectedFile,
  onFileSelect,
  onFileRemove,
  disabled = false,
  kind = 'students',
}) => {
  const { t } = useTranslation();
  const [isDragOver, setIsDragOver] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateAndSelect = (file: File) => {
    setErrorMessage(null);

    // Validate extension
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      setErrorMessage(t('import.invalidFormat'));
      return;
    }

    // Validate size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setErrorMessage(t('import.exceedsSize'));
      return;
    }

    if (file.size === 0) {
      setErrorMessage(t('import.emptyFile'));
      return;
    }

    onFileSelect(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (disabled) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndSelect(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndSelect(e.target.files[0]);
    }
    e.target.value = '';
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <ImportTemplateGuide kind={kind} />
      {errorMessage && (
        <div className="alert alert-error" role="alert">
          <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div className="alert-content">{errorMessage}</div>
        </div>
      )}

      {selectedFile ? (
        // File selected card
        <div
          style={{
            padding: '1.25rem 1.5rem',
            backgroundColor: '#f8fafc',
            border: '2px solid #bfdbfe',
            borderRadius: 'var(--radius-lg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', minWidth: 0 }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: '#dbeafe',
                color: 'var(--color-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <FileSpreadsheet size={24} />
            </div>

            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontWeight: 600,
                  color: 'var(--color-text-main)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {selectedFile.name}
              </div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                {formatFileSize(selectedFile.size)} · Excel Workbook (.xlsx)
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
            >
              {t('adminUx.replaceFile')}
            </Button>
            <button
              type="button"
              onClick={onFileRemove}
              disabled={disabled}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--color-error)',
                padding: '6px',
                borderRadius: 'var(--radius-sm)',
                display: 'flex',
                alignItems: 'center',
              }}
              title={t('adminUx.removeFile')}
              aria-label={t('adminUx.removeFile')}
            >
              <X size={18} />
            </button>
          </div>
        </div>
      ) : (
        // Dropzone area
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-disabled={disabled}
          aria-label={t('adminUx.chooseFile')}
          onKeyDown={event => {
            if (!disabled && ['Enter', ' '].includes(event.key)) { event.preventDefault(); fileInputRef.current?.click(); }
          }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => { if (!disabled) fileInputRef.current?.click(); }}
          style={{
            padding: '3rem 2rem',
            border: `2px dashed ${isDragOver ? 'var(--color-primary)' : 'var(--color-border)'}`,
            borderRadius: 'var(--radius-lg)',
            backgroundColor: isDragOver ? 'var(--color-primary-light)' : '#fafafa',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: disabled ? 'not-allowed' : 'pointer',
            transition: 'all var(--transition-fast)',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: '60px',
              height: '60px',
              borderRadius: 'var(--radius-full)',
              backgroundColor: isDragOver ? '#dbeafe' : 'var(--color-surface)',
              color: 'var(--color-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1rem',
              boxShadow: 'var(--shadow-xs)',
            }}
          >
            <UploadCloud size={32} />
          </div>

          <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--color-text-main)', marginBottom: '0.375rem' }}>
            {t('import.dropPrompt')}{' '}
            <span style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}>
              {t('import.dropBrowse')}
            </span>
          </h3>

          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', maxWidth: '420px' }}>
            {t(kind === 'lecturers' ? 'adminUx.lecturerDropHint' : 'import.dropHint')}
          </p>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        disabled={disabled}
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
      />

    </div>
  );
};
