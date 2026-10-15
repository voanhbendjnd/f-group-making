import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

/** Explain pages whose existing APIs do not support academic-term filtering. */
export function TermFilterNotice({ area }: { area: 'student' | 'lecturer' }) {
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const key = pathname.endsWith('/profile') ? 'terms.profileGlobal'
    : area === 'student' ? 'terms.studentScopeNotice'
    : pathname.endsWith('/deadlines') ? 'terms.deadlineScopeNotice' : null;
  return key ? <p role="status" className="alert alert-info">{t(key)}</p> : null;
}
