import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { FileDropzone } from '@/features/import/components/FileDropzone';
import { ImportErrorList } from '@/features/import/components/ImportErrorList';
import { LecturerImportPreviewTable } from '@/features/lecturers/components/LecturerImportPreviewTable';
import { parseLecturerExcelClientSide } from '@/features/lecturers/utils/lecturerExcelParser';
import { lecturerApi } from '@/features/lecturers/api/lecturerApi';
import { useTerm } from '@/app/providers/TermContext';
import { useUnsavedChanges } from '@/app/providers/NavigationGuard';
import { getApiError } from '@/services/api/types';
import type { ParseLecturerExcelResult } from '@/features/lecturers/types';
import type { ImportResult } from '@/features/import/types';

export function LecturerImportPage() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const { lockTermSelection } = useTerm();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ParseLecturerExcelResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [parsing, setParsing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [unknown, setUnknown] = useState(false);
  const busy = useRef(false);
  const discard = useUnsavedChanges(Boolean(file && !result?.success), parsing || sending);
  const reset = () => { setFile(null); setPreview(null); setResult(null); setError(''); setUnknown(false); };
  const choose = async (value: File) => {
    if (busy.current) return;
    const release = lockTermSelection();
    busy.current = true; reset(); setFile(value); setParsing(true);
    try { setPreview(await parseLecturerExcelClientSide(value)); }
    catch (value) { setError(getApiError(value).message || t('import.errorOccurred')); }
    finally { busy.current = false; setParsing(false); release(); }
  };
  const submit = async () => {
    if (!file || busy.current || unknown || !preview || preview.hasErrors || !preview.rows.length) return;
    busy.current = true;
    const release = lockTermSelection();
    setSending(true); setError('');
    try {
      const response = await lecturerApi.importExcel(file);
      setResult(response);
      if (response.success) void client.invalidateQueries({ queryKey: ['lecturers'] });
    } catch (value) {
      const apiError = getApiError(value);
      const uncertain = Boolean(apiError.outcomeUnknown || apiError.status === 0 || apiError.status >= 500);
      setUnknown(uncertain);
      setError(uncertain ? t('adminUx.unknownWrite') : apiError.message || t('import.errorOccurred'));
    } finally { busy.current = false; setSending(false); release(); }
  };
  return <div>
    <PageHeader title={t('adminUx.lecturerImportTitle')} description={t('adminUx.lecturerImportDescription')}
      breadcrumbs={[{ label: t('breadcrumbs.admin'), href: '/admin/dashboard' }, { label: t('lecturer.role'), href: '/admin/lecturers?scope=all' }, { label: t('breadcrumbs.import') }]}
      action={<Link className="btn btn-secondary btn-sm" to="/admin/lecturers?scope=all">{t('import.backToList')}</Link>} />
    {result?.success ? <section className="card admin-import-result" role="status">
      <span className="badge badge-success">{t('adminUx.complete')}</span>
      <h2>{t('adminUx.lecturerImportSuccess', { count: result.totalImported })}</h2>
      <p>{t('adminUx.lecturerCreated')}</p>
      <div className="admin-inline-actions">
        <Link to="/admin/lecturers?scope=all" className="btn btn-primary">{t('adminUx.allLecturers')}</Link>
        <Button variant="secondary" onClick={reset}>{t('adminUx.importAnother')}</Button>
      </div>
    </section> : <>
      <p className="admin-workflow-caption">{t('adminUx.importSteps')}</p>
      <section className="card">
        <h2 className="card-title">{t('import.step1Title')}</h2>
        <p className="form-hint">{t('adminUx.lecturerFileHelp')}</p>
        <FileDropzone kind="lecturers" selectedFile={file} onFileSelect={value => void choose(value)}
          onFileRemove={() => discard(reset)} disabled={parsing || sending} />
      </section>
      {parsing && <LoadingSpinner message={t('import.parsing')} />}
      {error && <div className="alert alert-error" role="alert">{error}
        {unknown && <Link to="/admin/lecturers?scope=all" className="btn btn-secondary btn-sm">{t('adminUx.checkList')}</Link>}
      </div>}
      {result && !result.success && result.errors?.length > 0 && <section className="card"><ImportErrorList errors={result.errors} /></section>}
      {preview && <section className="card">
        <h2 className="card-title">{t('import.step2Title')}</h2>
        <p className="form-hint">{t('adminUx.localValidation')}</p>
        <LecturerImportPreviewTable rows={preview.rows} validCount={preview.validCount} invalidCount={preview.invalidCount} />
        <div className="admin-form-actions">
          <Button variant="secondary" onClick={() => discard(reset)} disabled={sending}>{t('adminUx.removeFile')}</Button>
          <Button onClick={() => void submit()} loading={sending} disabled={unknown || preview.hasErrors || !preview.rows.length}>
            {t('import.confirmImportBtn', { count: preview.validCount })}
          </Button>
        </div>
      </section>}
    </>}
  </div>;
}
