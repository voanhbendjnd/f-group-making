import React, { useRef, useState } from 'react';
import { ArrowLeft, Send, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
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
import { TermSelect } from '@/features/terms/components/TermSelect';
import type { ImportResult } from '@/features/import/types';
import { useTerm } from '@/app/providers/TermContext';
import { TermScope } from '@/features/terms/components/TermScope';
import { useUnsavedChanges } from '@/app/providers/NavigationGuard';
import { getApiError } from '@/services/api/types';

export const StudentImportPage: React.FC = () => <TermScope><StudentImportContent /></TermScope>;

const StudentImportContent: React.FC = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { selectedTermId, selectedTerm, lockTermSelection } = useTerm();
  const [pendingMajorCodes, setPendingMajorCodes] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isParsingClient, setIsParsingClient] = useState<boolean>(false);
  const [clientParseResult, setClientParseResult] = useState<ParseExcelResult | null>(null);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [serverResult, setServerResult] = useState<ImportResult | null>(null);
  const [genericError, setGenericError] = useState<string | null>(null);
  const [unknown, setUnknown] = useState(false);
  const submitting = useRef(false);
  const discard = useUnsavedChanges(Boolean(selectedFile && !serverResult?.success), isParsingClient || isSubmitting);

  const handleFileSelect = async (file: File) => {
    const unlock = lockTermSelection();
    setSelectedFile(file);
    setClientParseResult(null);
    setServerResult(null);
    setPendingMajorCodes([]);
    setGenericError(null);
    setUnknown(false);
    setIsParsingClient(true);

    try {
      const result = await parseExcelClientSide(file);
      setClientParseResult(result);
    } catch (err: any) {
      setGenericError(err.message || t('import.errorOccurred'));
      setClientParseResult(null);
    } finally {
      setIsParsingClient(false);
      unlock();
    }
  };

  const handleFileRemove = () => discard(() => {
    setSelectedFile(null);
    setClientParseResult(null);
    setServerResult(null);
    setPendingMajorCodes([]);
    setGenericError(null);
    setUnknown(false);
  });

  const handleConfirmImport = async (confirmedMajorCodes: string[] = []) => {
    if (!selectedFile || submitting.current || unknown || selectedTermId === null) return;
    submitting.current = true;
    const unlock = lockTermSelection();

    setIsSubmitting(true);
    setGenericError(null);

    try {
      const result = await importApi.importExcel(selectedFile, selectedTermId, confirmedMajorCodes);
      setServerResult(result);
      setPendingMajorCodes(result.confirmationRequired ? result.newMajorCodes || [] : []);

      if (result.success) {
        void queryClient.invalidateQueries({ queryKey: ['students'] });
        void queryClient.invalidateQueries({ queryKey: ['majors'] });
        void queryClient.invalidateQueries({ queryKey: ['school-classes'] });
        void queryClient.invalidateQueries({ queryKey: ['school-class'] });
        void queryClient.invalidateQueries({ queryKey: ['school-class-students'] });
        void queryClient.invalidateQueries({ queryKey: ['lecturers'] });
        void queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] });
      }
    } catch (err: unknown) {
      const error = getApiError(err);
      const uncertain = Boolean(error.outcomeUnknown || error.status === 0 || error.status >= 500);
      setUnknown(uncertain);
      setGenericError(uncertain ? t('adminUx.unknownWrite') : error.message || t('import.errorOccurred'));
    } finally {
      submitting.current = false;
      setIsSubmitting(false);
      unlock();
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
        <p className="admin-workflow-caption">{t('adminUx.importSteps')}</p>
        {/* Step 1: File Dropzone & Term Selection */}
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h3 className="card-title">{t('import.step1Title')}</h3>
              <p className="card-subtitle">
                {t('import.step1Sub')}
              </p>
            </div>
            <TermSelect
              disabled={isParsingClient || isSubmitting}
            />
          </div>

          <FileDropzone
            selectedFile={selectedFile}
            onFileSelect={handleFileSelect}
            onFileRemove={handleFileRemove}
            disabled={isParsingClient || isSubmitting}
          />
          <p className="form-hint">{t('adminUx.studentFileHelp')}</p>
          <p className="form-hint">{t('adminUx.importScope', { term: selectedTerm?.name ?? '' })}</p>
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
            {unknown && <Link to="/admin/students" className="btn btn-secondary btn-sm">{t('adminUx.checkList')}</Link>}
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
                disabled={unknown || clientParseResult.rows.length === 0 || clientParseResult.hasErrors}
              >
                {t('import.confirmImportBtn', { count: clientParseResult.validCount })}
              </Button>
            </div>

            <ImportPreviewTable
              rows={clientParseResult.rows}
              validCount={clientParseResult.validCount}
              invalidCount={clientParseResult.invalidCount}
            />
            <p className="form-hint">{t('adminUx.localValidation')}</p>

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
                  disabled={unknown || clientParseResult.rows.length === 0 || clientParseResult.hasErrors}
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
