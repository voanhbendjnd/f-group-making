import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Calendar, Users, Edit3, Trash2 } from 'lucide-react';
import type { Deadline } from '../types';
import { DeadlineStatusBadge } from './DeadlineStatusBadge';
import { useDeadlineBoundary, effectiveDeadlineStatus } from '../hooks/useDeadlineBoundary';
import { Button } from '@/components/common/Button';

interface DeadlineTableProps {
  deadlines: Deadline[];
  onEdit?: (deadline: Deadline) => void;
  onCancel?: (deadline: Deadline) => void;
  canManage?: boolean;
}

const formatDateTime = (dateStr?: string, locale: string = 'vi-VN') => {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    return new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(d);
  } catch {
    return dateStr;
  }
};

export const DeadlineTable: React.FC<DeadlineTableProps> = ({
  deadlines,
  onEdit,
  onCancel,
  canManage = true,
}) => {
  const { t, i18n } = useTranslation();
  const now = useDeadlineBoundary(deadlines);
  const currentLocale = i18n.language === 'en' ? 'en-US' : 'vi-VN';

  return (
    <div className="table-container" style={{ overflowX: 'auto' }}>
      <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th>{t('deadline.table.name')}</th>
            <th>{t('deadline.table.status')}</th>
            <th>{t('deadline.table.classes')}</th>
            <th>{t('deadline.table.startTime')}</th>
            <th>{t('deadline.table.endTime')}</th>
            {canManage && <th style={{ textAlign: 'right' }}>{t('deadline.table.actions')}</th>}
          </tr>
        </thead>
        <tbody>
          {deadlines.map((item) => {
            const deadline = { ...item, status: effectiveDeadlineStatus(item.status, item.startTime, item.endTime, now) };
            return (
            <tr key={deadline.id}>
              <td>
                <div style={{ fontWeight: 600, color: 'var(--color-text-main)' }}>
                  {deadline.name}
                </div>
                {deadline.description && (
                  <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                    {deadline.description}
                  </div>
                )}
              </td>
              <td>
                <DeadlineStatusBadge status={deadline.status} />
              </td>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <Users size={14} style={{ color: 'var(--color-text-subtle)' }} />
                  {deadline.schoolClassNames && deadline.schoolClassNames.length > 0 ? (
                    deadline.schoolClassNames.map((name, i) => (
                      <span
                        key={i}
                        className="badge badge-neutral"
                        style={{ fontSize: '0.75rem', padding: '2px 6px' }}
                      >
                        {name}
                      </span>
                    ))
                  ) : (
                    <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                      {t('deadline.table.classesCount', { count: deadline.schoolClassIds?.length || 0 })}
                    </span>
                  )}
                </div>
              </td>
              <td style={{ fontSize: '0.875rem', whiteSpace: 'nowrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Calendar size={14} style={{ color: 'var(--color-text-subtle)' }} />
                  {formatDateTime(deadline.startTime, currentLocale)}
                </div>
              </td>
              <td style={{ fontSize: '0.875rem', whiteSpace: 'nowrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Calendar size={14} style={{ color: 'var(--color-text-subtle)' }} />
                  <span style={{ fontWeight: 500 }}>{formatDateTime(deadline.endTime, currentLocale)}</span>
                </div>
              </td>
              {canManage && (
                <td style={{ textAlign: 'right' }}>
                  <div style={{ display: 'inline-flex', gap: '8px', alignItems: 'center' }}>
                    <Link
                      to={`/lecturer/groups?deadlineId=${deadline.id}${
                        deadline.schoolClassIds && deadline.schoolClassIds[0] ? `&classId=${deadline.schoolClassIds[0]}` : ''
                      }`}
                      className="btn btn-secondary btn-sm"
                      title={t('deadline.table.viewGroups')}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                      <Users size={14} /> {t(deadline.status === 'CANCELLED' ? 'deadline.table.viewGroups' : 'deadline.table.manageGroups')}
                    </Link>

                    {onEdit && deadline.canEdit !== false && ['ACTIVE', 'UPCOMING', 'EXPIRED'].includes(deadline.status) && (
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<Edit3 size={14} />}
                        onClick={() => onEdit(deadline)}
                        title={deadline.status === 'EXPIRED' ? t('deadlineLifecycle.reopen') : deadline.status === 'ACTIVE' ? t('deadline.table.extendTitle') : t('deadline.table.editTitle')}
                      >
                        {deadline.status === 'EXPIRED' ? t('deadlineLifecycle.reopen') : deadline.status === 'ACTIVE' ? t('deadline.table.extend') : t('deadline.table.edit')}
                      </Button>
                    )}
                    {onCancel && deadline.canCancel !== false && deadline.status !== 'CANCELLED' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Trash2 size={14} style={{ color: 'var(--color-error)' }} />}
                        onClick={() => onCancel(deadline)}
                        title={t('deadline.table.cancelTitle')}
                        aria-label={t('deadline.table.cancelTitle')}
                      />
                    )}
                  </div>
                </td>
              )}
            </tr>
          ); })}
        </tbody>
      </table>
    </div>
  );
};
