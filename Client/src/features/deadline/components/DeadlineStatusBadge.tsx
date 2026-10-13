import React from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, PlayCircle, AlertCircle } from 'lucide-react';
import type { DeadlineStatus } from '../types';

export const DeadlineStatusBadge: React.FC<{ status: DeadlineStatus }> = ({ status }) => {
  const { t } = useTranslation();

  if (status === 'ACTIVE') {
    return (
      <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
        <PlayCircle size={13} />
        <span>{t('deadline.status.active')}</span>
      </span>
    );
  }
  if (status === 'UPCOMING') {
    return (
      <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
        <Clock size={13} />
        <span>{t('deadline.status.upcoming')}</span>
      </span>
    );
  }
  return (
    <span className="badge badge-error" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
      <AlertCircle size={13} />
      <span>{t('deadline.status.expired')}</span>
    </span>
  );
};
