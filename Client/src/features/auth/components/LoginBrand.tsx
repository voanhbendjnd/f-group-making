import { useTranslation } from 'react-i18next';

export function LoginBrand() {
  const { t } = useTranslation();
  return <div className="login-brand">
    <span className="login-brand-mark" aria-hidden="true">F</span>
    <div><strong>{t('common.systemBrand')}</strong><span>{t('auth.university')}</span></div>
  </div>;
}
