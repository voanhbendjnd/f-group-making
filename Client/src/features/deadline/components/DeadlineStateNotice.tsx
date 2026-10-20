import { useTranslation } from 'react-i18next';
import type { DeadlineStatus } from '../types';
import { DeadlineStatusBadge } from './DeadlineStatusBadge';

export function DeadlineStateNotice({ status }: { status: DeadlineStatus }) {
  const { t } = useTranslation();
  if (status === 'ACTIVE') return null;
  return <div className="card" role="status" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
    <DeadlineStatusBadge status={status} />
    <h2 style={{ marginTop: '0.75rem' }}>{t(`deadline.closed.${status}.title`)}</h2>
    <p style={{ marginTop: '0.5rem', color: 'var(--color-text-muted)' }}>{t(`deadline.closed.${status}.description`)}</p>
  </div>;
}
