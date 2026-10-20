import React from 'react';
import { FolderSearch } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';

export interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  actionText?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon,
  actionText,
  onAction,
}) => {
  const { t } = useTranslation();
  const displayTitle = title ?? t('common.emptyTitle');
  const displayDesc = description ?? t('common.emptyDesc');

  return (
    <div
      style={{
        padding: '3.5rem 1.5rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        backgroundColor: 'var(--color-surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px dashed var(--color-border)',
        margin: '1.5rem 0',
      }}
    >
      <div
        style={{
          width: '64px',
          height: '64px',
          borderRadius: 'var(--radius-full)',
          backgroundColor: 'var(--color-surface-muted)',
          color: 'var(--color-text-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '1rem',
        }}
      >
        {icon || <FolderSearch size={32} />}
      </div>

      <h3 style={{ fontSize: '1.125rem', marginBottom: '0.375rem' }}>{displayTitle}</h3>
      <p style={{ maxWidth: '420px', fontSize: '0.875rem', marginBottom: actionText ? '1.25rem' : '0' }}>
        {displayDesc}
      </p>

      {actionText && onAction && (
        <Button variant="primary" size="sm" onClick={onAction}>
          {actionText}
        </Button>
      )}
    </div>
  );
};
