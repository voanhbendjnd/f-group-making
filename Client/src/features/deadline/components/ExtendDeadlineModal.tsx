import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/common/Modal';
import { Input } from '@/components/common/Input';
import { Button } from '@/components/common/Button';
import { useToast } from '@/app/providers/ToastContext';
import { deadlineApi } from '../api/deadlineApi';
import { deadlineClassWindows } from '../classWindows';
import type { Deadline } from '../types';
import { Clock } from 'lucide-react';
import { useUnsavedChanges } from '@/app/providers/NavigationGuard';
import { getApiError } from '@/services/api/types';

interface ExtendDeadlineModalProps {
  open: boolean;
  onClose: () => void;
  deadline: Deadline | null;
  onSuccess: () => void;
  lockSelection?: () => () => void;
}
const localTime = (value: string) => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const ExtendDeadlineModal: React.FC<ExtendDeadlineModalProps> = ({ open, onClose, deadline, onSuccess, lockSelection }) => {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [scope, setScope] = useState<'ALL' | 'SELECTED'>('SELECTED');
  const [selected, setSelected] = useState<number[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [version, setVersion] = useState<number | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const busy = useRef(false);
  const [requestError, setRequestError] = useState('');
  const [unknown, setUnknown] = useState(false);
  const discard = useUnsavedChanges(open && Boolean(deadline && (name !== deadline.name || description !== (deadline.description ?? '')
    || startTime !== localTime(deadline.startTime) || endTime !== localTime(deadline.endTime))), open && isSubmitting);
  const close = () => { if (!busy.current) discard(onClose); };
  const reset = () => {
    if (!deadline) return;
    setName(deadline.name); setDescription(deadline.description ?? '');
    setStartTime(localTime(deadline.startTime)); setEndTime(localTime(deadline.endTime));
    setSelected(deadline.schoolClassIds.length === 1 ? [...deadline.schoolClassIds] : []);
    setScope('SELECTED'); setConfirmed(false); setVersion(deadline.version);
    setRequestError(''); setUnknown(false);
  };
  useEffect(() => {
    if (open) reset();
    // Preserve the draft on realtime updates; require an explicit refresh if the version changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline?.id, open]);
  if (!deadline) return null;
  const windows = deadlineClassWindows(deadline);
  const allEditable = windows.every(w => w.canEdit);
  const targets = scope === 'ALL' ? windows : windows.filter(w => selected.includes(w.schoolClassId));
  const targetIds = targets.map(w => w.schoolClassId);
  const shared = windows.length > 1;
  const allSelected = targetIds.length === windows.length;
  const upcoming = windows.every(w => w.status === 'UPCOMING') && allSelected;
  const reopening = targets.length > 0 && targets.every(w => w.status === 'EXPIRED');
  const changed = version !== undefined && deadline.version !== version;
  const label = reopening ? t('deadlineLifecycle.reopen') : upcoming ? t('deadline.modal.submitSave') : t('deadline.modal.submitExtend');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy.current || unknown || changed || !targetIds.length || (shared && !confirmed)) return;
    const end = new Date(endTime);
    if (!name.trim()) return toast.error(t('deadline.modal.nameRequired'));
    if (!Number.isFinite(end.getTime()) || end.getTime() <= Date.now()) return toast.error(t('deadline.modal.timeFutureError'));
    const start = new Date(startTime);
    if (upcoming && (start.getTime() < Date.now() || end <= start)) return toast.error(t('deadline.modal.timeOrderError'));
    if (!upcoming && targets.some(w => end.getTime() <= Date.parse(w.startTime))) return toast.error(t('deadline.modal.timeOrderError'));
    if (targets.some(w => w.status === 'ACTIVE' && end.getTime() <= Date.parse(w.endTime))) {
      return toast.error(t('deadline.modal.extendTimeMustBeGreater'));
    }
    busy.current = true; setIsSubmitting(true);
    const release = lockSelection?.();
    try {
      await deadlineApi.updateDeadline(deadline.id, {
        id: deadline.id, name: name.trim(), description,
        scope, targetClassIds: targetIds, confirmedClassIds: targetIds, expectedVersion: version,
        startTime: upcoming ? start.toISOString() : undefined, endTime: end.toISOString(),
      });
      toast.success(reopening ? t('deadlineLifecycle.reopened') : t('deadline.messages.updateSuccess'));
      await onSuccess(); onClose();
    } catch (value: unknown) {
      const error = getApiError(value);
      const uncertain = Boolean(error.outcomeUnknown || error.status === 0 || error.status >= 500);
      setUnknown(uncertain);
      setRequestError(uncertain ? t('adminUx.unknownWrite') : error.message || t('deadline.messages.updateError'));
    } finally { release?.(); busy.current = false; setIsSubmitting(false); }
  };
  const choose = (ids: number[]) => { setSelected(ids); setConfirmed(false); };
  return <Modal open={open} onClose={close}
    title={t('deadlineScope.title')} maxWidth="640px">
    <form onSubmit={submit} aria-busy={isSubmitting}>
      {requestError && <p className="alert alert-error" role="alert">{requestError}</p>}
      <p className="alert alert-info" style={{ padding: '0.75rem', marginBottom: '1rem' }}>{t('deadlineScope.groupNotice')}</p>
      {changed && <div role="alert" className="alert alert-warning">
        <p>{t('deadlineScope.changed')}</p>
        <Button type="button" onClick={reset} disabled={isSubmitting}>{t('deadlineScope.refresh')}</Button>
      </div>}
      <Input label={t('deadline.modal.nameLabel')} required value={name}
        disabled={!allEditable || !allSelected || isSubmitting} onChange={e => setName(e.target.value)} />
      <label style={{ display: 'block', marginBottom: '1rem' }}>{t('deadline.modal.descLabel')}
        <textarea className="input" rows={2} value={description} style={{ width: '100%' }}
          disabled={!allEditable || !allSelected || isSubmitting} onChange={e => setDescription(e.target.value)} />
      </label>
      <fieldset disabled={isSubmitting} style={{ border: 0, padding: 0, marginBottom: '1rem' }}>
        <legend>{t('deadlineScope.scope')}</legend>
        <label style={{ display: 'block', margin: '0.5rem 0' }}>
          <input type="radio" name="deadline-scope" checked={scope === 'SELECTED'} onChange={() => { setScope('SELECTED'); setConfirmed(false); }} /> {t('deadlineScope.selected')}
        </label>
        <label style={{ display: 'block', marginBottom: '0.75rem' }}>
          <input type="radio" name="deadline-scope" checked={scope === 'ALL'} disabled={!allEditable}
            onChange={() => { setScope('ALL'); setConfirmed(false); }} /> {t('deadlineScope.all')}
        </label>
        {!allEditable && <p style={{ color: 'var(--color-text-muted)' }}>{t('deadlineScope.ownership')}</p>}
        <div style={{ maxHeight: '240px', overflowY: 'auto', display: 'grid', gap: '0.75rem' }}>
          {windows.map(w => <div key={w.schoolClassId} style={{ padding: '0.5rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
            <label style={{ display: 'flex', gap: '0.5rem' }}>
              <input type="checkbox" aria-label={w.schoolClassName}
                checked={targetIds.includes(w.schoolClassId)} disabled={scope === 'ALL' || !w.canEdit}
                onChange={e => choose(e.target.checked ? [...selected, w.schoolClassId] : selected.filter(id => id !== w.schoolClassId))} />
              {w.schoolClassName}
            </label>
            <small style={{ color: 'var(--color-text-muted)' }}>
              {t('deadlineScope.current')}: {new Date(w.endTime).toLocaleString(i18n.language === 'vi' ? 'vi-VN' : 'en-US')} · {t(`deadline.status.${w.status.toLowerCase()}`)}
            </small>
          </div>)}
        </div>
      </fieldset>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        <Input label={t('deadline.modal.startTime')} type="datetime-local" required value={startTime}
          disabled={!upcoming || !allEditable || isSubmitting} onChange={e => setStartTime(e.target.value)} />
        <Input label={t('deadline.modal.endTimeExtend')} type="datetime-local" required value={endTime}
          disabled={isSubmitting} onChange={e => setEndTime(e.target.value)} />
      </div>
      {shared && <label style={{ display: 'flex', gap: '0.5rem', margin: '1rem 0' }}>
        <input type="checkbox" checked={confirmed} disabled={isSubmitting || !targetIds.length} onChange={e => setConfirmed(e.target.checked)} />
        {t('deadlineLifecycle.confirmScope')}
      </label>}
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
        <Button type="button" variant="secondary" disabled={isSubmitting} onClick={close}>{t('deadline.modal.cancelBtn')}</Button>
        <Button type="submit" icon={<Clock size={16} />} loading={isSubmitting}
          disabled={unknown || changed || !targetIds.length || (shared && !confirmed)}>{label}</Button>
      </div>
    </form>
  </Modal>;
};
