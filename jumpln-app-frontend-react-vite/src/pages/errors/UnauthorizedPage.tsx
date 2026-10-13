import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/common/Button';
import { useAuth } from '@/app/providers/AuthContext';

export const UnauthorizedPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isStudent, isAdmin } = useAuth();

  const handleGoHome = () => {
    if (isAdmin) navigate('/admin/dashboard');
    else if (isStudent) navigate('/student/dashboard');
    else navigate('/login');
  };

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
          backgroundColor: 'var(--color-error-bg)',
          color: 'var(--color-error)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '1.25rem',
        }}
      >
        <ShieldAlert size={40} />
      </div>

      <h1 style={{ fontSize: '1.875rem', marginBottom: '0.5rem', color: 'var(--color-error)' }}>
        {t('errorPages.unauthorizedTitle')}
      </h1>
      <p style={{ maxWidth: '460px', color: 'var(--color-text-muted)', marginBottom: '1.75rem', lineHeight: 1.6 }}>
        {t('errorPages.unauthorizedDesc')}
      </p>

      <Button variant="primary" onClick={handleGoHome}>
        {t('errorPages.goMain')}
      </Button>
    </div>
  );
};
