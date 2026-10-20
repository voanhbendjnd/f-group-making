import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FileQuestion } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/common/Button';

export const NotFoundPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div
      style={{
        minHeight: '70vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '2rem',
      }}
    >
      <div
        style={{
          width: '72px',
          height: '72px',
          borderRadius: 'var(--radius-full)',
          backgroundColor: 'var(--color-surface-muted)',
          color: 'var(--color-text-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '1.25rem',
        }}
      >
        <FileQuestion size={40} />
      </div>

      <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{t('errorPages.notFoundTitle')}</h1>
      <p style={{ maxWidth: '460px', color: 'var(--color-text-muted)', marginBottom: '1.75rem' }}>
        {t('errorPages.notFoundDesc')}
      </p>

      <Button variant="primary" onClick={() => navigate('/')}>
        {t('errorPages.goHome')}
      </Button>
    </div>
  );
};
