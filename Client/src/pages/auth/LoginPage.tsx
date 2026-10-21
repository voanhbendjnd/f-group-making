import React from 'react';
import { ChartNoAxesColumnIncreasing, ClipboardCheck, UsersRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LoginForm } from '@/features/auth/components/LoginForm';
import { LoginBrand } from '@/features/auth/components/LoginBrand';
import { LanguageSwitcher } from '@/components/common/LanguageSwitcher';
import loginImage from '@/assets/login_image.png';
import './LoginPage.css';

export const LoginPage: React.FC = () => {
  const { t } = useTranslation();
  const features = [
    ['matching', UsersRound], ['rules', ClipboardCheck], ['workflow', ChartNoAxesColumnIncreasing],
  ] as const;
  return <main className="login-page">
    <section className="login-visual" aria-label={t('auth.campusIllustration')}>
      <div className="login-visual-brand"><LoginBrand /></div>
      <div className="login-scene">
        <img className="login-campus-image" src={loginImage} width={1536} height={1024} alt={t('auth.campusIllustration')} fetchPriority="high" />
        <div className="login-visual-content">
          <p className="login-visual-description">{t('auth.visualDescription')}</p>
          <ul className="login-feature-badges">{features.map(([key, Icon]) => <li key={key}>
            <span className="login-feature-icon"><Icon size={20} aria-hidden="true" /></span><span>{t(`auth.loginFeatures.${key}`)}</span>
          </li>)}</ul>
        </div>
      </div>
    </section>
    <section className="login-panel" aria-label={t('auth.loginTitle')}>
      <div className="login-language"><LanguageSwitcher size="sm" showLabel /></div>
      <div className="login-form-wrap">
        <span className="login-corner-accent" aria-hidden="true"><i /><i /><i /></span>
        <svg className="login-paper-plane" viewBox="0 0 120 100" fill="none" aria-hidden="true" focusable="false">
          <path d="M4 88c22 1 48-28 32-37-17-9-10 30 16 24 14-3 22-16 27-28" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 5" strokeLinecap="round" opacity=".45" />
          <path d="m50 27 61-17-25 47-10-23-26-7Z" fill="var(--color-primary-light)" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
          <path d="m76 34 35-24-44 20 9 4Zm0 0-4 17 10-9" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </svg>
        <LoginForm />
      </div>
    </section>
  </main>;
};
