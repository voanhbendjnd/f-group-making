import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/common/Button';
import { Modal } from '@/components/common/Modal';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ErrorState } from '@/components/common/ErrorState';
import { useTerm } from '@/app/providers/TermContext';
import { getApiError } from '@/services/api/types';
import { studentApi } from '../api/studentApi';
import { getActivationRecipients } from '../api/activationRecipients';
import type { BatchActivationResult, Student, StudentFilterParams } from '../types';
import { useUnsavedChanges } from '@/app/providers/NavigationGuard';

export interface BatchActivationModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  userIds: number[];
  selectedStudents?: Student[];
  totalSelected: number;
  alreadyActiveCount: number;
  isAllMatching: boolean;
  filters: StudentFilterParams;
  totalFilteredCount: number;
}

export function BatchActivationModal({ open, onClose, onSuccess, userIds, selectedStudents,
  totalSelected, alreadyActiveCount, isAllMatching, filters, totalFilteredCount }: BatchActivationModalProps) {
  const { t } = useTranslation();
  const { selectedTerm, lockTermSelection } = useTerm();
  const busy = useRef(false);
  const [isSending, setIsSending] = useState(false);
  const [result, setResult] = useState<BatchActivationResult | null>(null);
  const [error, setError] = useState('');
  const [unknown, setUnknown] = useState(false);
  useUnsavedChanges(false, isSending);
  const recipients = useQuery({
    queryKey: ['activation-recipients', filters.termId, filters.search, filters.majorId,
      filters.majorSearch, filters.activated, filters.hasActivationKey],
    queryFn: ({ signal }) => getActivationRecipients(filters, signal),
    enabled: open && isAllMatching && !result,
    staleTime: 0, retry: false,
  });
  const records = isAllMatching ? recipients.data : selectedStudents;
  const eligible = records?.filter(student => !student.activated);
  const count = eligible?.length ?? Math.max(0, totalSelected - alreadyActiveCount);
  const total = records?.length ?? (isAllMatching ? totalFilteredCount : totalSelected);
  const unavailable = isAllMatching && (recipients.isPending || recipients.isError || recipients.isFetching);
  const close = () => { if (!busy.current) onClose(); };
  const send = async () => {
    if (busy.current || unavailable || !count || unknown || !filters.termId) return;
    busy.current = true;
    const release = lockTermSelection();
    setIsSending(true); setError('');
    try {
      // activate/all does not accept every list filter: submit only the reviewed IDs.
      const response = await studentApi.sendBatchActivation(eligible?.map(student => student.userId) ?? userIds, filters.termId);
      setResult(response); onSuccess();
    } catch (value) {
      const apiError = getApiError(value);
      const uncertain = Boolean(apiError.outcomeUnknown || apiError.status === 0 || apiError.status >= 500);
      setUnknown(uncertain);
      setError(uncertain ? t('adminUx.unknownActivation') : apiError.message || t('errors.generalFailure'));
    } finally { release(); busy.current = false; setIsSending(false); }
  };
  return <Modal open={open} onClose={close} title={t(result ? 'modals.batchSuccessTitle' : 'modals.batchTitle')}
    footer={result || unknown ? <Button onClick={close}>{t('common.close')}</Button> : <>
      <Button variant="secondary" onClick={close} disabled={isSending}>{t('common.cancel')}</Button>
      <Button onClick={() => void send()} loading={isSending} disabled={unavailable || count === 0}>
        {t('adminUx.sendRecipients', { count })}
      </Button>
    </>}>
    {result ? <div role="status">
      <p className="alert alert-success">{t('adminUx.activationAccepted')}</p>
      <dl className="admin-summary-grid">
        <div><dt>{t('adminUx.requested')}</dt><dd>{result.totalRequested}</dd></div>
        <div><dt>{t('modals.batchSuccessSent')}</dt><dd>{result.totalProcessed}</dd></div>
        <div><dt>{t('modals.batchSuccessSkipped')}</dt><dd>{result.totalSkippedAlreadyActive}</dd></div>
      </dl>
    </div> : <>
      <p className="form-hint">{t('adminUx.recipientScope', { term: selectedTerm?.name ?? '', total, eligible: count, skipped: total - count })}</p>
      {isAllMatching && recipients.isPending && <LoadingSpinner message={t('adminUx.resolvingRecipients')} />}
      {isAllMatching && recipients.isError && <ErrorState message={t('adminUx.recipientError')} onRetry={() => void recipients.refetch()} />}
      {records && !unavailable && <div className="admin-recipient-preview" aria-label={t('adminUx.recipients')}>
        <ul>{eligible?.map(student => <li key={student.userId}><strong>{student.rollNumber} · {student.fullName}</strong><span>{student.email}</span></li>)}</ul>
        {!count && <p>{t('adminUx.noRecipients')}</p>}
      </div>}
      <p className="form-hint">{t('adminUx.activationAccepted')}</p>
      {error && <p className="alert alert-error" role="alert">{error}</p>}
    </>}
  </Modal>;
}
