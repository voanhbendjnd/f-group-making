import { useTranslation } from 'react-i18next';

export function LoginBrand() {
  const { t } = useTranslation();
  return <div className="login-brand">
    <img className="login-brand-mark" src="/logo.png" alt="" aria-hidden="true" />
    <div><strong>{t('common.systemBrand')}</strong><span>{t('auth.university')}</span></div>
  </div>;
}
