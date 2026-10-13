import React from 'react';
import { CheckCircle2, Clock, Mail, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface StatusBadgeProps {
  activated?: boolean;
  hasActivationKey?: boolean;
  isKeyExpired?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  activated,
  hasActivationKey,
  isKeyExpired,
}) => {
  const { t } = useTranslation();

  if (activated) {
    return (
      <span className="badge badge-success">
        <CheckCircle2 size={13} />
        <span>{t('statusBadge.activated')}</span>
      </span>
    );
  }

  if (hasActivationKey) {
    if (isKeyExpired) {
      return (
        <span className="badge badge-error">
          <AlertCircle size={13} />
          <span>{t('statusBadge.expired')}</span>
        </span>
      );
    }
    return (
      <span className="badge badge-info">
        <Mail size={13} />
        <span>{t('statusBadge.sent')}</span>
      </span>
    );
  }

  return (
    <span className="badge badge-neutral">
      <Clock size={13} />
      <span>{t('statusBadge.notSent')}</span>
    </span>
  );
};
