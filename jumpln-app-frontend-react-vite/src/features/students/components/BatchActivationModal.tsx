import React, { useState } from 'react';
import { Mail, CheckCircle2, AlertCircle, Send } from 'lucide-react';
import confetti from 'canvas-confetti';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/common/Button';
import { Modal } from '@/components/common/Modal';
import { studentApi } from '../api/studentApi';
import type { BatchActivationResult, StudentFilterParams } from '../types';

export interface BatchActivationModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  userIds: number[];
  totalSelected: number;
  alreadyActiveCount: number;
  isAllMatching: boolean;
  filters: StudentFilterParams;
  totalFilteredCount: number;
}

export const BatchActivationModal: React.FC<BatchActivationModalProps> = ({
  open,
  onClose,
  onSuccess,
  userIds,
  totalSelected,
  alreadyActiveCount,
  isAllMatching,
  filters,
  totalFilteredCount,
}) => {
  const { t } = useTranslation();
  const [isSending, setIsSending] = useState(false);
  const [result, setResult] = useState<BatchActivationResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const eligibleCount = isAllMatching
    ? totalFilteredCount
    : Math.max(0, totalSelected - alreadyActiveCount);

  const handleSend = async () => {
    setIsSending(true);
    setErrorMsg(null);

    try {
      let res: BatchActivationResult;
      if (isAllMatching) {
        res = await studentApi.sendActivateAllMatching(filters.search, filters.majorSearch, filters.majorId);
      } else {
        res = await studentApi.sendBatchActivation(userIds);
      }

      setResult(res);
      try {
        confetti({ particleCount: 75, spread: 60 });
      } catch {
        // ignore
      }
      onSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || t('errors.generalFailure'));
    } finally {
      setIsSending(false);
    }
  };

  const handleClose = () => {
    setResult(null);
    setErrorMsg(null);
    onClose();
  };

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={isSending ? () => {} : handleClose}
      title={result ? t('modals.batchSuccessTitle') : t('modals.batchTitle')}
      footer={
        result ? (
          <Button variant="primary" onClick={handleClose}>
            {t('common.close')}
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={handleClose} disabled={isSending}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={handleSend}
              loading={isSending}
              icon={<Send size={16} />}
              disabled={eligibleCount === 0}
            >
              {t('modals.batchSubmit')} ({eligibleCount})
            </Button>
          </>
        )
      }
    >
      {result ? (
        // Results View
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div
            style={{
              padding: '1.25rem',
              borderRadius: 'var(--radius-lg)',
              backgroundColor: '#f0fdf4',
              border: '1px solid #bbf7d0',
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
            }}
          >
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: '#dcfce7',
                color: 'var(--color-success)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <CheckCircle2 size={28} />
            </div>
            <div>
              <h4 style={{ color: '#166534', fontWeight: 700, fontSize: '1.125rem' }}>
                {t('modals.batchSuccessTitle')}
              </h4>
            </div>
          </div>

          {/* Metrics summary */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '0.75rem',
              textAlign: 'center',
            }}
          >
            <div style={{ padding: '0.875rem', backgroundColor: 'var(--color-surface-muted)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)' }}>{t('common.status')}</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-text-main)' }}>
                {result.totalRequested}
              </div>
            </div>

            <div style={{ padding: '0.875rem', backgroundColor: '#f0fdf4', borderRadius: 'var(--radius-md)', border: '1px solid #bbf7d0' }}>
              <div style={{ fontSize: '0.75rem', color: '#15803d' }}>{t('modals.batchSuccessSent')}</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-success)' }}>
                {result.totalProcessed}
              </div>
            </div>

            <div style={{ padding: '0.875rem', backgroundColor: '#fffbeb', borderRadius: 'var(--radius-md)', border: '1px solid #fde68a' }}>
              <div style={{ fontSize: '0.75rem', color: '#b45309' }}>{t('modals.batchSuccessSkipped')}</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-warning)' }}>
                {result.totalSkippedAlreadyActive}
              </div>
            </div>
          </div>
        </div>
      ) : (
        // Confirmation View
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {errorMsg && (
            <div className="alert alert-error">
              <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div className="alert-content">{errorMsg}</div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: 'var(--color-primary-light)',
                color: 'var(--color-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Mail size={24} />
            </div>
            <div>
              <h4 style={{ fontSize: '1.0625rem', fontWeight: 700, color: 'var(--color-text-main)' }}>
                {t('modals.batchTitle')}
              </h4>
              <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginTop: '4px', lineHeight: 1.5 }}>
                {isAllMatching
                  ? t('modals.batchDescAll', { total: totalFilteredCount })
                  : t('modals.batchDescSelected', { total: totalSelected })}
              </p>
            </div>
          </div>

          {alreadyActiveCount > 0 && !isAllMatching && (
            <div
              style={{
                backgroundColor: '#fffbeb',
                border: '1px solid #fde68a',
                borderRadius: 'var(--radius-md)',
                padding: '0.875rem 1rem',
                fontSize: '0.8125rem',
                color: '#b45309',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.5rem',
              }}
            >
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
              <span>
                {t('modals.batchSkipNotice', { count: alreadyActiveCount })}
              </span>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};
