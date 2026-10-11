import React, { useState } from 'react';
import { ArrowLeft, Send, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import confetti from 'canvas-confetti';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { FileDropzone } from '@/features/import/components/FileDropzone';
import { ImportPreviewTable } from '@/features/import/components/ImportPreviewTable';
import { ImportErrorList } from '@/features/import/components/ImportErrorList';
import { ImportSuccessSummary } from '@/features/import/components/ImportSuccessSummary';
import { parseExcelClientSide, type ParseExcelResult } from '@/features/import/utils/excelParser';
import { importApi } from '@/features/import/api/importApi';
import { useQueryClient } from '@tanstack/react-query';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import type { ImportResult } from '@/features/import/types';

export const StudentImportPage: React.FC = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [pendingMajorCodes, setPendingMajorCodes] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isParsingClient, setIsParsingClient] = useState<boolean>(false);
  const [clientParseResult, setClientParseResult] = useState<ParseExcelResult | null>(null);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [serverResult, setServerResult] = useState<ImportResult | null>(null);
  const [genericError, setGenericError] = useState<string | null>(null);

  const handleFileSelect = async (file: File) => {
    setSelectedFile(file);
    setClientParseResult(null);
    setServerResult(null);
    setPendingMajorCodes([]);
    setGenericError(null);
    setIsParsingClient(true);

    try {
      const result = await parseExcelClientSide(file);
      setClientParseResult(result);
    } catch (err: any) {
      setGenericError(err.message || t('import.errorOccurred'));
      setClientParseResult(null);
    } finally {
      setIsParsingClient(false);
    }
  };

  const handleFileRemove = () => {
    setSelectedFile(null);
    setClientParseResult(null);
    setServerResult(null);
    setPendingMajorCodes([]);
    setGenericError(null);
  };

  const handleConfirmImport = async (confirmedMajorCodes: string[] = []) => {
    if (!selectedFile || isSubmitting) return;

    setIsSubmitting(true);
    setGenericError(null);

    try {
      const result = await importApi.importExcel(selectedFile, confirmedMajorCodes);
      setServerResult(result);
      setPendingMajorCodes(result.confirmationRequired ? result.newMajorCodes || [] : []);

      if (result.success) {
        void queryClient.invalidateQueries({ queryKey: ['students'] });
        void queryClient.invalidateQueries({ queryKey: ['majors'] });
        try {
          confetti({ particleCount: 90, spread: 70 });
        } catch {
          // ignore
        }
      }
    } catch (err: any) {
      setGenericError(err.message || t('import.errorOccurred'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // State: Successfully imported
  if (serverResult && serverResult.success) {
    return (
      <div>
        <PageHeader
          title={t('import.resultTitle')}
          breadcrumbs={[
            { label: t('breadcrumbs.admin'), href: '/admin/dashboard' },
            { label: t('breadcrumbs.students'), href: '/admin/students' },
            { label: t('breadcrumbs.import') },
          ]}
        />
        <ImportSuccessSummary
          totalImported={serverResult.totalImported}
          createdMajorCodes={serverResult.createdMajorCodes}
          onReset={handleFileRemove}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={t('import.pageTitle')}
        description={t('import.pageDesc')}
        breadcrumbs={[
          { label: t('breadcrumbs.admin'), href: '/admin/dashboard' },
          { label: t('breadcrumbs.students'), href: '/admin/students' },
          { label: t('breadcrumbs.import') },
        ]}
        action={
          <Link to="/admin/students" className="btn btn-secondary btn-sm" style={{ textDecoration: 'none' }}>
            <ArrowLeft size={16} />
            <span>{t('import.backToList')}</span>
          </Link>
        }
      />

      <ConfirmDialog open={pendingMajorCodes.length > 0} title={t('import.newMajorsTitle')}
        confirmText={t('import.createMajorsAndImport')} isLoading={isSubmitting}
        onCancel={() => { if (!isSubmitting) setPendingMajorCodes([]); }}
        onConfirm={() => handleConfirmImport(pendingMajorCodes)}
        message={<div>
          <p>{t('import.newMajorsDescription')}</p>
          <ul style={{ margin: '0.75rem 0', paddingLeft: '1.25rem' }}>
            {pendingMajorCodes.map((code) => <li key={code}><strong>{code}</strong></li>)}
          </ul>
          <p>{t('import.newMajorsNotice')}</p>
          {genericError && <p role="alert" style={{ color: 'var(--color-error)' }}>{genericError}</p>}
        </div>} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Step 1: File Dropzone */}
        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">{t('import.step1Title')}</h3>
              <p className="card-subtitle">
                {t('import.step1Sub')}
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
            <LoadingSpinner message={t('import.parsing')} />
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
                {t('import.step3Title')}
              </h3>
            </div>
            <ImportErrorList errors={serverResult.errors} />
          </div>
        )}

        {/* Step 2: Client Preview and Validation */}
        {clientParseResult && !serverResult?.success && (
          <div className="card">
            <div className="card-header">
              <div>
                <h3 className="card-title">{t('import.step2Title')}</h3>
              </div>

              <Button
                variant="primary"
                onClick={() => handleConfirmImport()}
                loading={isSubmitting}
                icon={<Send size={16} />}
                disabled={clientParseResult.rows.length === 0 || clientParseResult.hasErrors}
              >
                {t('import.confirmImportBtn', { count: clientParseResult.validCount })}
              </Button>
            </div>

            <ImportPreviewTable
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
              <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                {clientParseResult.invalidCount > 0 ? (
                  <span style={{ color: 'var(--color-error)', fontWeight: 500 }}>
                    * {clientParseResult.invalidCount} {t('import.invalidRows')}
                  </span>
                ) : (
                  <span style={{ color: 'var(--color-success)', fontWeight: 500 }}>
                    ✓ {clientParseResult.validCount} {t('import.validRows')}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <Button variant="secondary" onClick={handleFileRemove} disabled={isSubmitting}>
                  {t('common.cancel')}
                </Button>

                <Button
                  variant="primary"
                  onClick={() => handleConfirmImport()}
                  loading={isSubmitting}
                  icon={<Send size={16} />}
                  disabled={clientParseResult.rows.length === 0 || clientParseResult.hasErrors}
                >
                  {t('import.confirmImportBtn', { count: clientParseResult.validCount })}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
