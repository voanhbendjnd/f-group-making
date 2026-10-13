import React from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface LoadingSpinnerProps {
  size?: number;
  message?: string;
  fullPage?: boolean;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 32,
  message,
  fullPage = false,
}) => {
  const { t } = useTranslation();
  const displayMessage = message ?? t('common.loading');

  const content = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2.5rem 1rem',
        gap: '0.75rem',
        color: 'var(--color-text-muted)',
      }}
    >
      <Loader2 size={size} className="animate-spin" style={{ color: 'var(--color-primary)' }} />
      {displayMessage && <p style={{ fontSize: '0.9375rem', fontWeight: 500 }}>{displayMessage}</p>}
    </div>
  );

  if (fullPage) {
    return (
      <div
        style={{
          minHeight: '60vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {content}
      </div>
    );
  }

  return content;
};
