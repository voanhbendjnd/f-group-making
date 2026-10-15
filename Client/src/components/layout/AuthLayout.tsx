import React from 'react';
import { Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '@/components/common/LanguageSwitcher';

export const AuthLayout: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="auth-layout-container">
      {/* Top right language switcher */}
      <header className="auth-header-bar">
        <LanguageSwitcher size="sm" showLabel />
      </header>

      <main className="auth-content-box">
        {/* Brand header */}
        <div className="auth-brand-header">
          <div className="auth-brand-logo">
            F
          </div>
          <h2 className="auth-brand-title">
            {t('common.systemBrand')}
          </h2>
          <p className="auth-brand-subtitle">
            {t('common.systemTitle')}
          </p>
        </div>

        <Outlet />

        {/* Footer info */}
        <footer className="auth-footer-info">
          {t('common.copyright')}
        </footer>
      </main>
    </div>
  );
};

