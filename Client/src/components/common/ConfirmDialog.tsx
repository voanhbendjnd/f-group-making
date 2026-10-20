import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';
import { Modal } from './Modal';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  confirmText,
  cancelText,
  isDanger = false,
  isLoading = false,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation();
  const displayConfirm = confirmText ?? t('common.confirm');
  const displayCancel = cancelText ?? t('common.cancel');

  return (
    <Modal
      open={open}
      onClose={isLoading ? () => {} : onCancel}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={isLoading}>
            {displayCancel}
          </Button>
          <Button
            variant={isDanger ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={isLoading}
          >
            {displayConfirm}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
        <div
          style={{
            padding: '0.625rem',
            borderRadius: 'var(--radius-full)',
            backgroundColor: isDanger ? 'var(--color-error-bg)' : 'var(--color-warning-bg)',
            color: isDanger ? 'var(--color-error)' : 'var(--color-warning)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <AlertTriangle size={24} />
        </div>
        <div style={{ flex: 1, fontSize: '0.9375rem', color: 'var(--color-text-muted)' }}>
          {message}
        </div>
      </div>
    </Modal>
  );
};
