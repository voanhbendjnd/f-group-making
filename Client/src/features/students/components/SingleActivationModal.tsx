import React, { useRef, useState } from 'react';
import { Mail, CheckCircle2, AlertCircle, Send } from 'lucide-react';
import { useTranslation, Trans } from 'react-i18next';
import { Button } from '@/components/common/Button';
import { Modal } from '@/components/common/Modal';
import { studentApi } from '../api/studentApi';
import type { Student } from '../types';
import { useTerm } from '@/app/providers/TermContext';
import { useUnsavedChanges } from '@/app/providers/NavigationGuard';
import { getApiError } from '@/services/api/types';

export interface SingleActivationModalProps {
  termId: number;
  open: boolean;
  student: Student | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const SingleActivationModal: React.FC<SingleActivationModalProps> = ({
  open,
  student,
  onClose,
  onSuccess,
  termId,
}) => {
  const { t } = useTranslation();
  const { lockTermSelection } = useTerm();
  const [isSending, setIsSending] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const busy = useRef(false);
  const [unknown, setUnknown] = useState(false);
  useUnsavedChanges(false, isSending);

  if (!open || !student) return null;

  const handleSend = async () => {
    if (busy.current || unknown) return;
    busy.current = true;
    const unlock = lockTermSelection();
    setIsSending(true);
    setErrorMsg(null);
    try {
      await studentApi.sendSingleActivation(student.userId, student.email, termId);
      setIsSuccess(true);
      onSuccess();
    } catch (err: unknown) {
      const error = getApiError(err);
      const uncertain = Boolean(error.outcomeUnknown || error.status === 0 || error.status >= 500);
      setUnknown(uncertain);
      setErrorMsg(uncertain ? t('adminUx.unknownActivation') : error.message || t('errors.generalFailure'));
    } finally {
      busy.current = false;
      setIsSending(false);
      unlock();
    }
  };

  const handleClose = () => {
    setIsSuccess(false);
    setErrorMsg(null);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={isSending ? () => {} : handleClose}
      title={isSuccess ? t('modals.singleSuccessTitle') : t('modals.singleTitle')}
      footer={
        isSuccess ? (
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
              disabled={unknown}
              icon={<Send size={16} />}
            >
              {t('modals.singleSubmit')}
            </Button>
          </>
        )
      }
    >
      {isSuccess ? (
        <div style={{ textAlign: 'center', padding: '1rem 0' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: 'var(--radius-full)',
              backgroundColor: '#f0fdf4',
              color: 'var(--color-success)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1rem',
            }}
          >
            <CheckCircle2 size={28} />
          </div>
          <h4 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-text-main)', marginBottom: '0.25rem' }}>
            {t('modals.singleSuccessTitle')}
          </h4>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
            <Trans
              i18nKey="modals.singleSuccessDesc"
              values={{ email: student.email }}
              components={{ strong: <strong /> }}
            />
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {errorMsg && (
            <div className="alert alert-error">
              <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div className="alert-content">{errorMsg}</div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: 'var(--color-primary-light)',
                color: 'var(--color-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Mail size={20} />
            </div>
            <div>
              <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-main)' }}>
                {t('modals.singleTitle')}
              </h4>
              <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                {t('modals.singleStatusWarning')}
              </p>
            </div>
          </div>

          <div
            style={{
              backgroundColor: 'var(--color-surface-muted)',
              borderRadius: 'var(--radius-md)',
              padding: '0.875rem 1rem',
              fontSize: '0.875rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.375rem',
            }}
          >
            <div>
              {t('students.colFullName')}: <strong>{student.fullName}</strong>
            </div>
            <div>
              {t('students.colRollNumber')}: <strong>{student.rollNumber}</strong>
            </div>
            <div>
              {t('students.colEmail')}: <strong>{student.email}</strong>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};
