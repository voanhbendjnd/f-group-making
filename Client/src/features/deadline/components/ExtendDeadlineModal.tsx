import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/common/Modal';
import { Input } from '@/components/common/Input';
import { Button } from '@/components/common/Button';
import { useToast } from '@/app/providers/ToastContext';
import { deadlineApi } from '../api/deadlineApi';
import { deadlineClassWindows } from '../classWindows';
import type { Deadline } from '../types';
import { Clock, Info } from 'lucide-react';
import { useUnsavedChanges } from '@/app/providers/NavigationGuard';
import { getApiError } from '@/services/api/types';
import { Tag } from 'antd';

interface ExtendDeadlineModalProps {
  open: boolean;
  onClose: () => void;
  deadline: Deadline | null;
  onSuccess: () => void;
  lockSelection?: () => () => void;
  assignedOnly?: boolean;
  availableClassIds?: number[];
}

const localTime = (value: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const ExtendDeadlineModal: React.FC<ExtendDeadlineModalProps> = ({
  open,
  onClose,
  deadline,
  onSuccess,
  lockSelection,
  assignedOnly = false,
  availableClassIds,
}) => {
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

  const discard = useUnsavedChanges(
    open &&
      Boolean(
        deadline &&
          (name !== deadline.name ||
            description !== (deadline.description ?? '') ||
            startTime !== localTime(deadline.startTime) ||
            endTime !== localTime(deadline.endTime))
      ),
    open && isSubmitting
  );

  const close = () => {
    if (!busy.current) discard(onClose);
  };

  const windows = deadline ? deadlineClassWindows(deadline) : [];
  const myClassIdSet =
    availableClassIds && availableClassIds.length > 0 ? new Set(availableClassIds) : null;
  const displayWindows = assignedOnly
    ? windows.filter((w) => w.canEdit && (!myClassIdSet || myClassIdSet.has(w.schoolClassId)))
    : windows;

  const reset = () => {
    if (!deadline) return;
    setName(deadline.name);
    setDescription(deadline.description ?? '');
    setStartTime(localTime(deadline.startTime));
    setEndTime(localTime(deadline.endTime));

    const initialSelected = assignedOnly
      ? displayWindows.length === 1
        ? [displayWindows[0].schoolClassId]
        : []
      : deadline.schoolClassIds.length === 1
      ? [...deadline.schoolClassIds]
      : [];

    setSelected(initialSelected);
    setScope('SELECTED');
    setConfirmed(false);
    setVersion(deadline.version);
    setRequestError('');
    setUnknown(false);
  };

  useEffect(() => {
    if (open) reset();
    // Preserve the draft on realtime updates; require an explicit refresh if the version changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline?.id, open]);

  useEffect(() => {
    if (open && assignedOnly && displayWindows.length === 1 && selected.length === 0) {
      setSelected([displayWindows[0].schoolClassId]);
    }
  }, [open, assignedOnly, displayWindows, selected.length]);

  if (!deadline) return null;

  const allEditable = windows.every((w) => w.canEdit);
  const targets =
    scope === 'ALL'
      ? displayWindows
      : displayWindows.filter((w) => selected.includes(w.schoolClassId));
  const targetIds = targets.map((w) => w.schoolClassId);
  const shared = windows.length > 1;
  const allSelected = targetIds.length === windows.length;
  const unscheduled = windows.every((w) => w.status === 'UNSCHEDULED');
  const upcoming =
    windows.every((w) => w.status === 'UPCOMING' || w.status === 'UNSCHEDULED') && allSelected;
  const reopening = targets.length > 0 && targets.every((w) => w.status === 'EXPIRED');
  const changed = version !== undefined && deadline.version !== version;
  const label = unscheduled
    ? t('deadlineLifecycle.schedule')
    : reopening
    ? t('deadlineLifecycle.reopen')
    : upcoming
    ? t('deadline.modal.submitSave')
    : t('deadline.modal.submitExtend');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy.current || unknown || changed || !targetIds.length || (shared && !confirmed)) return;
    const end = new Date(endTime);
    if (!name.trim()) return toast.error(t('deadline.modal.nameRequired'));
    if (!Number.isFinite(end.getTime()) || end.getTime() <= Date.now()) {
      return toast.error(t('deadline.modal.timeFutureError'));
    }
    const start = new Date(startTime);
    if (upcoming && (!Number.isFinite(start.getTime()) || start.getTime() < Date.now() || end <= start)) {
      return toast.error(t('deadline.modal.timeOrderError'));
    }
    if (!upcoming && targets.some((w) => end.getTime() <= Date.parse(w.startTime ?? ''))) {
      return toast.error(t('deadline.modal.timeOrderError'));
    }
    if (targets.some((w) => w.status === 'ACTIVE' && end.getTime() <= Date.parse(w.endTime ?? ''))) {
      return toast.error(t('deadline.modal.extendTimeMustBeGreater'));
    }
    busy.current = true;
    setIsSubmitting(true);
    const release = lockSelection?.();
    try {
      await deadlineApi.updateDeadline(deadline.id, {
        id: deadline.id,
        name: name.trim(),
        description,
        scope,
        targetClassIds: targetIds,
        confirmedClassIds: targetIds,
        expectedVersion: version,
        startTime: upcoming ? start.toISOString() : undefined,
        endTime: end.toISOString(),
      });
      toast.success(reopening ? t('deadlineLifecycle.reopened') : t('deadline.messages.updateSuccess'));
      await onSuccess();
      onClose();
    } catch (value: unknown) {
      const error = getApiError(value);
      const uncertain = Boolean(error.outcomeUnknown || error.status === 0 || error.status >= 500);
      setUnknown(uncertain);
      setRequestError(
        uncertain ? t('adminUx.unknownWrite') : error.message || t('deadline.messages.updateError')
      );
    } finally {
      release?.();
      busy.current = false;
      setIsSubmitting(false);
    }
  };

  const choose = (ids: number[]) => {
    setSelected(ids);
    setConfirmed(false);
  };

  return (
    <Modal open={open} onClose={close} title={t('deadlineScope.title')} maxWidth="680px">
      <form onSubmit={submit} aria-busy={isSubmitting}>
        {requestError && (
          <p className="alert alert-error" role="alert" style={{ padding: '0.5rem 0.75rem', marginBottom: '0.75rem', fontSize: '0.8125rem' }}>
            {requestError}
          </p>
        )}

        <div
          className="alert alert-info"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 0.75rem',
            marginBottom: '0.75rem',
            fontSize: '0.8125rem',
            borderRadius: 'var(--radius-md, 6px)',
          }}
        >
          <Info size={16} style={{ flexShrink: 0, color: 'var(--color-primary)' }} />
          <span>{t('deadlineScope.groupNotice')}</span>
        </div>

        {changed && (
          <div
            role="alert"
            className="alert alert-warning"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.75rem',
              padding: '0.5rem 0.75rem',
              marginBottom: '0.75rem',
              borderRadius: 'var(--radius-md, 6px)',
            }}
          >
            <p style={{ margin: 0, fontSize: '0.8125rem' }}>{t('deadlineScope.changed')}</p>
            <Button type="button" size="sm" onClick={reset} disabled={isSubmitting}>
              {t('deadlineScope.refresh')}
            </Button>
          </div>
        )}

        {/* Name & Description in compact side-by-side grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '0.75rem',
            marginBottom: '0.75rem',
          }}
        >
          <Input
            label={t('deadline.modal.nameLabel')}
            required
            value={name}
            disabled={!allEditable || !allSelected || isSubmitting}
            onChange={(e) => setName(e.target.value)}
          />
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 500,
                marginBottom: '0.25rem',
                color: 'var(--color-text-main)',
              }}
            >
              {t('deadline.modal.descLabel')}
            </label>
            <input
              className="input"
              value={description}
              placeholder={t('deadline.modal.descPlaceholder') || ''}
              disabled={!allEditable || !allSelected || isSubmitting}
              onChange={(e) => setDescription(e.target.value)}
              style={{ width: '100%', height: '40px' }}
            />
          </div>
        </div>

        {/* Scope selection & Classes */}
        <fieldset disabled={isSubmitting} style={{ border: 0, padding: 0, margin: '0 0 0.5rem 0' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.5rem',
              marginBottom: '0.375rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
              <legend
                style={{
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  color: 'var(--color-text-main)',
                  float: 'left',
                  margin: 0,
                }}
              >
                {t('deadlineScope.scope')}:
              </legend>
              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  margin: 0,
                }}
              >
                <input
                  type="radio"
                  name="deadline-scope"
                  checked={scope === 'SELECTED'}
                  onChange={() => {
                    setScope('SELECTED');
                    setConfirmed(false);
                  }}
                />
                <span>{t('deadlineScope.selected')}</span>
              </label>
              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  cursor: allEditable ? 'pointer' : 'not-allowed',
                  opacity: allEditable ? 1 : 0.6,
                  fontSize: '0.875rem',
                  margin: 0,
                }}
              >
                <input
                  type="radio"
                  name="deadline-scope"
                  checked={scope === 'ALL'}
                  disabled={!allEditable}
                  onChange={() => {
                    setScope('ALL');
                    setConfirmed(false);
                  }}
                />
                <span>{t('deadlineScope.all')}</span>
              </label>
            </div>

            {displayWindows.length > 1 && scope === 'SELECTED' && (
              <button
                type="button"
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  color: 'var(--color-primary, #3b82f6)',
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
                onClick={() => {
                  if (selected.length === displayWindows.length) {
                    setSelected([]);
                  } else {
                    setSelected(displayWindows.map((w) => w.schoolClassId));
                  }
                  setConfirmed(false);
                }}
              >
                {selected.length === displayWindows.length
                  ? t('deadline.modal.deselectAll', 'Bỏ chọn tất cả')
                  : t('deadline.modal.selectAll', 'Chọn tất cả')}
              </button>
            )}
          </div>

          {!allEditable && (
            <p
              style={{
                color: 'var(--color-text-muted)',
                fontSize: '0.75rem',
                margin: '0.125rem 0 0.5rem 0',
                lineHeight: '1.4',
              }}
            >
              {t('deadlineScope.ownership')}
            </p>
          )}

          {displayWindows.length === 0 ? (
            <p
              className="alert alert-warning"
              style={{ padding: '0.5rem 0.75rem', fontSize: '0.8125rem', margin: '0.5rem 0' }}
            >
              {t(
                'deadlineScope.noAssignedClasses',
                'Bạn không phụ trách lớp nào trong deadline này.'
              )}
            </p>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  displayWindows.length > 1 ? 'repeat(auto-fill, minmax(280px, 1fr))' : '1fr',
                gap: '0.5rem',
                maxHeight: displayWindows.length > 4 ? '150px' : 'none',
                overflowY: displayWindows.length > 4 ? 'auto' : 'visible',
                marginBottom: '0.75rem',
              }}
            >
              {displayWindows.map((w) => {
                const isTargeted = targetIds.includes(w.schoolClassId);
                const isDisabled = scope === 'ALL' || !w.canEdit;
                const tagColor =
                  w.status === 'ACTIVE'
                    ? 'processing'
                    : w.status === 'EXPIRED'
                    ? 'default'
                    : 'warning';
                const formattedEndTime = w.endTime
                  ? new Date(w.endTime).toLocaleString(i18n.language === 'vi' ? 'vi-VN' : 'en-US', {
                      month: 'numeric',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '—';

                return (
                  <label
                    key={w.schoolClassId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.5rem 0.75rem',
                      border: `1.5px solid ${
                        isTargeted
                          ? 'var(--color-primary, #3b82f6)'
                          : 'var(--color-border, #e2e8f0)'
                      }`,
                      borderRadius: 'var(--radius-md, 8px)',
                      backgroundColor: isTargeted
                        ? 'var(--color-primary-light, #eff6ff)'
                        : 'var(--color-surface, #ffffff)',
                      cursor: isDisabled ? 'default' : 'pointer',
                      opacity: !w.canEdit ? 0.6 : 1,
                      transition: 'all 0.15s ease',
                      margin: 0,
                      userSelect: 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                      <input
                        type="checkbox"
                        aria-label={w.schoolClassName}
                        checked={isTargeted}
                        disabled={isDisabled}
                        onChange={(e) =>
                          choose(
                            e.target.checked
                              ? [...selected, w.schoolClassId]
                              : selected.filter((id) => id !== w.schoolClassId)
                          )
                        }
                        style={{ cursor: isDisabled ? 'default' : 'pointer' }}
                      />
                      <span
                        style={{
                          fontWeight: 600,
                          fontSize: '0.875rem',
                          color: 'var(--color-text-main, #1e293b)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {w.schoolClassName}
                      </span>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.375rem',
                        flexShrink: 0,
                      }}
                    >
                      <Tag
                        color={tagColor}
                        style={{
                          margin: 0,
                          fontSize: '0.75rem',
                          lineHeight: '18px',
                          padding: '0 6px',
                        }}
                      >
                        {t(`deadline.status.${w.status.toLowerCase()}`)}
                      </Tag>
                      <span
                        style={{ fontSize: '0.75rem', color: 'var(--color-text-muted, #64748b)' }}
                        title={`${t('deadlineScope.current')}: ${
                          w.endTime ? new Date(w.endTime).toLocaleString() : '—'
                        }`}
                      >
                        {formattedEndTime}
                      </span>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </fieldset>

        {/* Start & End time in 2-column grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '0.75rem',
            marginBottom: '0.75rem',
          }}
        >
          <Input
            label={t('deadline.modal.startTime')}
            type="datetime-local"
            required
            value={startTime}
            disabled={!upcoming || !allEditable || isSubmitting}
            onChange={(e) => setStartTime(e.target.value)}
          />
          <Input
            label={t('deadline.modal.endTimeExtend')}
            type="datetime-local"
            required
            value={endTime}
            disabled={isSubmitting}
            onChange={(e) => setEndTime(e.target.value)}
          />
        </div>

        {/* Scope confirmation */}
        {shared && (
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              margin: '0.5rem 0 0.75rem 0',
              cursor: isSubmitting || !targetIds.length ? 'default' : 'pointer',
              fontSize: '0.875rem',
              color: 'var(--color-text-main)',
            }}
          >
            <input
              type="checkbox"
              checked={confirmed}
              disabled={isSubmitting || !targetIds.length}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span>{t('deadlineLifecycle.confirmScope')}</span>
          </label>
        )}

        {/* Footer buttons */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.75rem',
            marginTop: '0.75rem',
            paddingTop: '0.75rem',
            borderTop: '1px solid var(--color-border)',
          }}
        >
          <Button type="button" variant="secondary" disabled={isSubmitting} onClick={close}>
            {t('deadline.modal.cancelBtn')}
          </Button>
          <Button
            type="submit"
            variant="primary"
            icon={<Clock size={16} />}
            loading={isSubmitting}
            disabled={unknown || changed || !targetIds.length || (shared && !confirmed)}
          >
            {label}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
