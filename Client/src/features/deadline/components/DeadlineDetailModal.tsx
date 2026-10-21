import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import { advancedGroupPath } from '@/features/group/navigation';
import { useTranslation } from 'react-i18next';
import { CalendarClock, CircleStop, Edit3, Users } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { Button } from '@/components/common/Button';
import { deadlineApi } from '../api/deadlineApi';
import { useDeadlineBoundary } from '../hooks/useDeadlineBoundary';
import { deadlinePresentation, formatDeadlineDate } from '../presentation';
import { DeadlineStatusBadge } from './DeadlineStatusBadge';
import type { Deadline } from '../types';

interface Props {
  deadline: Deadline;
  onClose: () => void;
  onEdit?: (deadline: Deadline) => void;
  onCancel?: (deadline: Deadline) => void;
  canManage: boolean;
}

export function DeadlineDetailModal({ deadline, onClose, onEdit, onCancel, canManage }: Props) {
  const { t, i18n } = useTranslation();
  const { pathname } = useLocation();
  const { data, isFetching, isError, refetch } = useQuery({
    queryKey: ['deadline-detail', deadline.id],
    queryFn: ({ signal }) => deadlineApi.getDeadlineById(deadline.id, signal),
    initialData: deadline,
    initialDataUpdatedAt: 0,
    staleTime: 0,
    retry: false,
  });
  const now = useDeadlineBoundary([data]);
  const view = deadlinePresentation(data, now);
  const locale = i18n.language === 'en' ? 'en-US' : 'vi-VN';
  const stale = isFetching || isError;
  const edit = () => { onClose(); onEdit?.(data); };
  const closeDeadline = () => { onClose(); onCancel?.(data); };
  return <div className="deadline-detail">
    <Modal open onClose={onClose} title={t('deadlineDetail.title')} maxWidth="860px"
      footer={<div className="deadline-detail-actions">
        <Button variant="secondary" onClick={onClose}>{t('deadlineDetail.close')}</Button>
        {canManage && onCancel && view.canClose && <Button variant="ghost" disabled={stale}
          icon={<CircleStop size={16} />} onClick={closeDeadline}>{t('deadline.table.cancelTitle')}</Button>}
        {canManage && onEdit && data.canEdit !== false && <Button disabled={stale}
          icon={<Edit3 size={16} />} onClick={edit}>{t(view.editLabel)}</Button>}
      </div>}>
      <div className="deadline-detail-heading">
        <h2>{data.name}</h2>
        {view.mixedStatus ? <span className="badge badge-neutral">{t('deadlineScope.mixed')}</span>
          : <DeadlineStatusBadge status={view.status} />}
      </div>
      {isFetching && <p className="deadline-detail-feedback" role="status">{t('deadlineDetail.refreshing')}</p>}
      {isError && <div className="alert alert-warning deadline-detail-error" role="alert">
        <p>{t('deadlineDetail.loadError')}</p>
        <Button size="sm" variant="secondary" onClick={() => { void refetch(); }}>{t('deadlineDetail.retry')}</Button>
      </div>}
      {data.description && <p className="deadline-detail-description">{data.description}</p>}
      <dl className="deadline-detail-meta">
        <div><dt><CalendarClock size={15} />{t('deadline.table.startTime')}</dt>
          <dd>{formatDeadlineDate(data.startTime, locale)}</dd></div>
        {data.lastModifiedDate && <div><dt>{t('deadlineDetail.updated')}</dt>
          <dd>{formatDeadlineDate(data.lastModifiedDate, locale)}</dd></div>}
      </dl>
      <section aria-labelledby="deadline-class-heading">
        <div className="deadline-detail-section-heading">
          <h3 id="deadline-class-heading"><Users size={17} />{t('deadline.table.classes')}</h3>
          <span>{t('deadline.table.classesCount', { count: view.windows.length })}</span>
        </div>
        <p className="deadline-detail-hint">{t('deadlineDetail.groupNotice')}</p>
        <div className="deadline-class-grid">
          {view.windows.map(window => <article className="deadline-class-card" key={window.schoolClassId}>
            <div className="deadline-class-card-heading"><h4>{window.schoolClassName}</h4>
              <DeadlineStatusBadge status={window.status} /></div>
            <dl>
              <div><dt>{t('deadline.table.startTime')}</dt><dd>{formatDeadlineDate(window.startTime, locale)}</dd></div>
              <div><dt>{t('deadline.table.endTime')}</dt><dd>{formatDeadlineDate(window.endTime, locale)}</dd></div>
            </dl>
            {canManage && window.canEdit && <Link className="btn btn-secondary btn-sm"
              to={advancedGroupPath(window.schoolClassId, new URLSearchParams(), data.id, pathname.startsWith('/admin') ? 'admin' : 'lecturer')} onClick={onClose}>
              <Users size={14} />{t('deadline.table.manageGroups')}
            </Link>}
          </article>)}
        </div>
      </section>
    </Modal>
  </div>;
}
