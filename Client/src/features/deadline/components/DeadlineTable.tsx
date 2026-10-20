import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Edit3, Eye } from 'lucide-react';
import type { Deadline } from '../types';
import { DeadlineStatusBadge } from './DeadlineStatusBadge';
import { DeadlineDetailModal } from './DeadlineDetailModal';
import { useDeadlineBoundary } from '../hooks/useDeadlineBoundary';
import { deadlinePresentation, formatDeadlineDate } from '../presentation';
import { Button } from '@/components/common/Button';
import './deadline.css';

interface DeadlineTableProps {
  deadlines: Deadline[];
  onEdit?: (deadline: Deadline) => void;
  onCancel?: (deadline: Deadline) => void;
  canManage?: boolean;
}

export function DeadlineTable({ deadlines, onEdit, onCancel, canManage = true }: DeadlineTableProps) {
  const { t, i18n } = useTranslation();
  const now = useDeadlineBoundary(deadlines);
  const locale = i18n.language === 'en' ? 'en-US' : 'vi-VN';
  const [selected, setSelected] = useState<Deadline | null>(null);
  return <>
    <div className="table-container deadline-list">
      <table className="table">
        <thead><tr>
          <th scope="col" className="deadline-name-column">{t('deadline.table.name')}</th>
          <th scope="col" className="deadline-status-column">{t('deadline.table.status')}</th>
          <th scope="col" className="deadline-end-column">{t('deadline.table.endTime')}</th>
          <th scope="col" className="deadline-actions-column">{t('deadline.table.actions')}</th>
        </tr></thead>
        <tbody>{deadlines.map(deadline => {
          const view = deadlinePresentation(deadline, now);
          return <tr key={deadline.id}>
            <td className="deadline-list-name">{deadline.name}</td>
            <td data-label={t('deadline.table.status')}>
              {view.mixedStatus ? <span className="badge badge-neutral">{t('deadlineScope.mixed')}</span>
                : <DeadlineStatusBadge status={view.status} />}
            </td>
            <td data-label={t('deadline.table.endTime')}>
              <span className="deadline-list-summary">{view.differentEnds ? t('deadlineDetail.perClass')
                : formatDeadlineDate(view.windows[0]?.endTime ?? deadline.endTime, locale)}</span>
            </td>
            <td className="deadline-list-action-cell"><div className="deadline-list-actions">
              <Button size="sm" variant="secondary" icon={<Eye size={15} />} onClick={() => setSelected(deadline)}
                aria-label={t('deadlineDetail.openNamed', { name: deadline.name })}>{t('deadlineDetail.open')}</Button>
              {canManage && onEdit && deadline.canEdit !== false && <Button size="sm" variant="primary"
                icon={<Edit3 size={15} />} onClick={() => onEdit(deadline)}>{t(view.editLabel)}</Button>}
            </div></td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    {selected && <DeadlineDetailModal key={selected.id} deadline={selected} onClose={() => setSelected(null)}
      onEdit={onEdit} onCancel={onCancel} canManage={canManage} />}
  </>;
}
