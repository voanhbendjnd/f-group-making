import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';

export interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title,
  message,
  onRetry,
}) => {
  const { t } = useTranslation();
  const displayTitle = title ?? t('common.errorTitle');
  const displayMessage = message ?? t('common.errorDesc');

  return (
    <div
      style={{
        padding: '3rem 1.5rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        backgroundColor: '#fffbfa',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-error-border)',
        margin: '1.5rem 0',
      }}
    >
      <div
        style={{
          width: '56px',
          height: '56px',
          borderRadius: 'var(--radius-full)',
          backgroundColor: 'var(--color-error-bg)',
          color: 'var(--color-error)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '1rem',
        }}
      >
        <AlertCircle size={28} />
      </div>

      <h3 style={{ fontSize: '1.125rem', color: 'var(--color-error)', marginBottom: '0.375rem' }}>
        {displayTitle}
      </h3>
      <p style={{ maxWidth: '420px', fontSize: '0.875rem', marginBottom: onRetry ? '1.25rem' : '0' }}>
        {displayMessage}
      </p>

      {onRetry && (
        <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={onRetry}>
          {t('common.retry')}
        </Button>
      )}
    </div>
  );
};
