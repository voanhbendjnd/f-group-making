import React from 'react';
import { Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '@/components/common/LanguageSwitcher';

export const AuthLayout: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div
      style={{
        minHeight: '100vh',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f8fafc',
        backgroundImage: 'radial-gradient(at 50% 0%, #eff6ff 0%, #f8fafc 75%)',
        padding: '2rem 1rem',
      }}
    >
      {/* Top right language switcher */}
      <div
        style={{
          position: 'absolute',
          top: '1.25rem',
          right: '1.25rem',
          zIndex: 10,
        }}
      >
        <LanguageSwitcher size="sm" showLabel />
      </div>

      <div style={{ width: '100%', maxWidth: '460px', margin: '0 auto' }}>
        {/* Brand header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: 'var(--radius-lg)',
              backgroundColor: 'var(--color-primary)',
              color: '#ffffff',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '1.5rem',
              boxShadow: '0 4px 14px rgba(29, 78, 216, 0.35)',
              marginBottom: '0.875rem',
            }}
          >
            F
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-text-main)', letterSpacing: '-0.02em' }}>
            {t('common.systemBrand')}
          </h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
            {t('common.systemTitle')}
          </p>
        </div>

        <Outlet />

        {/* Footer info */}
        <div style={{ textAlign: 'center', marginTop: '2rem', fontSize: '0.75rem', color: 'var(--color-text-subtle)' }}>
          {t('common.copyright')}
        </div>
      </div>
    </div>
  );
};
