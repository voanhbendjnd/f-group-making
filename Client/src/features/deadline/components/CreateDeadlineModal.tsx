import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/common/Modal';
import { Input } from '@/components/common/Input';
import { Button } from '@/components/common/Button';
import { useToast } from '@/app/providers/ToastContext';
import { deadlineApi } from '../api/deadlineApi';
import { CalendarPlus, Check, Clock, Info, Mail, Search } from 'lucide-react';
import { useUnsavedChanges } from '@/app/providers/NavigationGuard';
import { getApiError } from '@/services/api/types';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ErrorState } from '@/components/common/ErrorState';

interface CreateDeadlineModalProps {
  open: boolean;
  onClose: () => void;
  availableClasses: { id: number; name: string }[];
  onSuccess: () => void;
  classesLoading?: boolean;
  classesError?: boolean;
  onRetryClasses?: () => void;
  lockSelection?: () => () => void;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DESCRIPTION_MAX = 500;
const SEARCH_THRESHOLD = 6;

const DURATION_PRESET_ITEMS = [
  { key: '3days', days: 3 },
  { key: '1week', days: 7 },
  { key: '2weeks', days: 14 },
  { key: '1month', days: 30 },
] as const;

// Format Date -> YYYY-MM-DDTHH:mm cho input datetime-local
const toDateTimeLocalString = (date: Date) => {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
};

const formatDuration = (ms: number, isEn: boolean) => {
  const totalMinutes = Math.round(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days) parts.push(isEn ? `${days} day${days > 1 ? 's' : ''}` : `${days} ngày`);
  if (hours) parts.push(isEn ? `${hours} hr${hours > 1 ? 's' : ''}` : `${hours} giờ`);
  if (!days && minutes) parts.push(isEn ? `${minutes} min${minutes > 1 ? 's' : ''}` : `${minutes} phút`);
  return parts.join(' ') || (isEn ? 'under 1 min' : 'dưới 1 phút');
};

const formatDisplayDate = (value: string, locale: string) =>
  new Date(value).toLocaleString(locale, {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const getInitialTimes = () => {
  const now = new Date();
  return {
    start: toDateTimeLocalString(now),
    end: toDateTimeLocalString(new Date(now.getTime() + 7 * DAY_MS)),
  };
};

// ---------- styles ----------
const styles = {
  section: { marginBottom: '1.25rem' } as React.CSSProperties,
  sectionHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: '0.75rem',
    marginBottom: '0.5rem',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: '0.9375rem',
    fontWeight: 600,
    color: 'var(--color-text-main)',
    margin: 0,
  } as React.CSSProperties,
  hint: {
    fontSize: '0.8125rem',
    color: 'var(--color-text-muted)',
    margin: '0.25rem 0 0',
  } as React.CSSProperties,
  error: {
    fontSize: '0.8125rem',
    color: 'var(--color-danger, #dc2626)',
    margin: '0.375rem 0 0',
  } as React.CSSProperties,
  linkButton: {
    background: 'none',
    border: 'none',
    padding: '0.125rem 0.25rem',
    color: 'var(--color-primary)',
    fontSize: '0.8125rem',
    fontWeight: 500,
    cursor: 'pointer',
  } as React.CSSProperties,
};

export const CreateDeadlineModal: React.FC<CreateDeadlineModalProps> = ({
  open,
  onClose,
  availableClasses,
  onSuccess,
  classesLoading = false,
  classesError = false,
  onRetryClasses,
  lockSelection,
}) => {
  const { t, i18n } = useTranslation();
  const isEn = i18n.language === 'en';
  const currentLocale = isEn ? 'en-US' : 'vi-VN';
  const toast = useToast();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [baseline, setBaseline] = useState(getInitialTimes);
  const [startTime, setStartTime] = useState(() => getInitialTimes().start);
  const [endTime, setEndTime] = useState(() => getInitialTimes().end);
  const [selectedClassIds, setSelectedClassIds] = useState<number[]>([]);
  const [classQuery, setClassQuery] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const busy = useRef(false);
  const [requestError, setRequestError] = useState('');
  const [unknown, setUnknown] = useState(false);
  const discard = useUnsavedChanges(open && Boolean(name || description || selectedClassIds.length
    || startTime !== baseline.start || endTime !== baseline.end), open && isSubmitting);
  const close = () => { if (!busy.current) discard(onClose); };

  // Mỗi lần mở lại modal: xoá dữ liệu cũ và tính lại mốc thời gian theo "bây giờ"
  useEffect(() => {
    if (!open) return;
    const tTimes = getInitialTimes();
    setBaseline(tTimes);
    setRequestError(''); setUnknown(false);
    setName('');
    setDescription('');
    setStartTime(tTimes.start);
    setEndTime(tTimes.end);
    setSelectedClassIds([]);
    setClassQuery('');
    setShowErrors(false);
    setIsSubmitting(false);
  }, [open]);

  // ---------- validation ----------
  const errors = useMemo(() => {
    const result: { name?: string; time?: string; classes?: string } = {};
    if (!name.trim()) result.name = t('deadline.modal.nameRequired');
    if (selectedClassIds.length === 0) result.classes = t('deadline.modal.classesRequired');

    const start = new Date(startTime);
    const end = new Date(endTime);
    if (!startTime || !endTime || isNaN(start.getTime()) || isNaN(end.getTime())) {
      result.time = t('deadline.modal.timeRequired');
    } else if (start >= end) {
      result.time = t('deadline.modal.timeOrderError');
    } else if (end <= new Date()) {
      result.time = t('deadline.modal.timeFutureError');
    }
    return result;
  }, [name, startTime, endTime, selectedClassIds, t]);

  const timeError = errors.time && (showErrors || (startTime && endTime)) ? errors.time : undefined;

  const durationMs = useMemo(() => {
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    return !isNaN(start) && !isNaN(end) && end > start ? end - start : null;
  }, [startTime, endTime]);

  const activePresetDays = durationMs ? Math.round(durationMs / DAY_MS) : null;
  const isPresetActive = (days: number) =>
    durationMs !== null && Math.abs(durationMs - days * DAY_MS) < 60000 && activePresetDays === days;

  const applyPreset = (days: number) => {
    const base = startTime && !isNaN(new Date(startTime).getTime()) ? new Date(startTime) : new Date();
    setEndTime(toDateTimeLocalString(new Date(base.getTime() + days * DAY_MS)));
  };

  // ---------- classes ----------
  const filteredClasses = useMemo(() => {
    const q = classQuery.trim().toLowerCase();
    return q ? availableClasses.filter((c) => c.name.toLowerCase().includes(q)) : availableClasses;
  }, [availableClasses, classQuery]);

  const allFilteredSelected =
    filteredClasses.length > 0 && filteredClasses.every((c) => selectedClassIds.includes(c.id));

  const toggleClass = (classId: number) => {
    setSelectedClassIds((prev) =>
      prev.includes(classId) ? prev.filter((id) => id !== classId) : [...prev, classId]
    );
  };

  const toggleAllFiltered = () => {
    const ids = filteredClasses.map((c) => c.id);
    setSelectedClassIds((prev) =>
      allFilteredSelected ? prev.filter((id) => !ids.includes(id)) : Array.from(new Set([...prev, ...ids]))
    );
  };

  // ---------- submit ----------
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy.current || unknown || classesLoading || classesError) return;

    setShowErrors(true);
    if (errors.name || errors.classes || errors.time) {
      toast.error(errors.name || errors.time || errors.classes || t('common.errorDesc'));
      return;
    }

    busy.current = true;
    const release = lockSelection?.();
    setIsSubmitting(true); setRequestError('');
    try {
      await deadlineApi.createDeadline({
        name: name.trim(),
        description: description.trim(),
        startTime: new Date(startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
        schoolClassIds: selectedClassIds,
      });
      toast.success(t('deadline.messages.createSuccess'));
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const error = getApiError(err);
      const uncertain = Boolean(error.outcomeUnknown || error.status === 0 || error.status >= 500);
      setUnknown(uncertain);
      setRequestError(uncertain ? t('adminUx.unknownWrite') : error.message || t('deadline.messages.createError'));
    } finally {
      release?.(); busy.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title={t('deadline.modal.createTitle')} maxWidth="800px">
      {/* Hover / focus cho các phần tử tương tác (không làm được bằng inline style) */}
      <style>{`
        .cdm-chip, .cdm-class { transition: background-color .12s, border-color .12s; }
        .cdm-chip:hover { border-color: var(--color-primary); }
        .cdm-chip:focus-visible, .cdm-link:focus-visible {
          outline: 2px solid var(--color-primary); outline-offset: 2px;
        }
        .cdm-class:hover { border-color: var(--color-primary); }
        .cdm-class:has(input:focus-visible) { outline: 2px solid var(--color-primary); outline-offset: 1px; }
        .input.cdm-field {
          border-radius: 12px;
          padding: 0.625rem 0.875rem;
          line-height: 1.5;
          transition: border-color .15s, box-shadow .15s;
        }
        .input.cdm-field:focus {
          outline: none;
          border-color: var(--color-primary);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 18%, transparent);
        }
        .input.cdm-field::placeholder { color: var(--color-text-muted); opacity: .8; }
        .input.cdm-field[type="search"] { border-radius: 999px; padding-left: 2.25rem; }
        .cdm-sr { position: absolute; opacity: 0; width: 1px; height: 1px; pointer-events: none; }
        @media (max-width: 520px) { .cdm-time-grid { grid-template-columns: 1fr !important; } }
      `}</style>

      <form onSubmit={handleSubmit} noValidate>
        <fieldset disabled={isSubmitting} style={{ border: 0, padding: 0, margin: 0 }}>
        {requestError && <div className="alert alert-error" role="alert">{requestError}
          {unknown && <Button type="button" variant="secondary" onClick={() => { onSuccess(); onClose(); }}>{t('adminUx.checkList')}</Button>}
        </div>}
        {/* 1. Thông tin chung */}
        <div style={styles.section}>
          <Input
            label={t('deadline.modal.nameLabel')}
            placeholder={t('deadline.modal.namePlaceholder')}
            required
            autoFocus
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          {showErrors && errors.name && (
            <p style={{ ...styles.error, marginTop: '-0.5rem' }} role="alert">
              {errors.name}
            </p>
          )}

          <div style={{ marginTop: '1rem' }}>
            <div style={styles.sectionHead}>
              <label htmlFor="cdm-description" style={{ ...styles.sectionTitle, fontSize: '0.875rem', fontWeight: 500 }}>
                {t('deadline.modal.descLabel')}{' '}
                <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>{t('deadline.modal.optional')}</span>
              </label>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                {description.length}/{DESCRIPTION_MAX}
              </span>
            </div>
            <textarea
              id="cdm-description"
              className="input cdm-field"
              rows={3}
              maxLength={DESCRIPTION_MAX}
              placeholder={t('deadline.modal.descPlaceholder')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{ width: '100%', resize: 'vertical' }}
            />
          </div>
        </div>

        {/* 2. Thời gian */}
        <div style={styles.section}>
          <div style={styles.sectionHead}>
            <h3 style={styles.sectionTitle}>{t('deadline.modal.timeHeading')}</h3>
            {durationMs !== null && !timeError && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  fontSize: '0.8125rem',
                  color: 'var(--color-text-muted)',
                }}
              >
                <Clock size={14} /> {t('deadline.modal.duration', { duration: formatDuration(durationMs, isEn) })}
              </span>
            )}
          </div>

          <div
            className="cdm-time-grid"
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}
          >
            <Input
              label={t('deadline.modal.startTime')}
              type="datetime-local"
              required
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
            <Input
              label={t('deadline.modal.endTime')}
              type="datetime-local"
              required
              min={startTime}
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </div>

          <div
            role="group"
            aria-label={t('deadline.modal.quickSelect')}
            style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}
          >
            <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>{t('deadline.modal.quickSelect')}</span>
            {DURATION_PRESET_ITEMS.map((p) => {
              const active = isPresetActive(p.days);
              return (
                <button
                  key={p.days}
                  type="button"
                  className="cdm-chip"
                  aria-pressed={active}
                  onClick={() => applyPreset(p.days)}
                  style={{
                    padding: '0.25rem 0.75rem',
                    borderRadius: '999px',
                    fontSize: '0.8125rem',
                    cursor: 'pointer',
                    fontWeight: active ? 600 : 400,
                    border: `1px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    backgroundColor: active ? 'var(--color-primary-light, #eff6ff)' : 'var(--color-surface)',
                    color: active ? 'var(--color-primary)' : 'var(--color-text-main)',
                  }}
                >
                  {t(`deadline.modal.presets.${p.key}`)}
                </button>
              );
            })}
          </div>

          {timeError ? (
            <p style={styles.error} role="alert">
              {timeError}
            </p>
          ) : (
            durationMs !== null && (
              <p style={styles.hint}>
                {t('deadline.modal.studentSummaryHint', {
                  start: formatDisplayDate(startTime, currentLocale),
                  end: formatDisplayDate(endTime, currentLocale),
                })}
              </p>
            )
          )}
        </div>

        {/* 3. Lớp áp dụng */}
        <div style={styles.section}>
          <div style={styles.sectionHead}>
            <h3 style={styles.sectionTitle}>
              {t('deadline.modal.classesHeading')}{' '}
              <span style={{ fontWeight: 400, color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>
                {t('deadline.modal.classesSelected', { selected: selectedClassIds.length, total: availableClasses.length })}
              </span>
            </h3>
            {filteredClasses.length > 0 && (
              <button type="button" className="cdm-link" style={styles.linkButton} onClick={toggleAllFiltered}>
                {allFilteredSelected
                  ? classQuery
                    ? t('deadline.modal.deselectAllFiltered')
                    : t('deadline.modal.deselectAll')
                  : classQuery
                    ? t('deadline.modal.selectAllFiltered')
                    : t('deadline.modal.selectAll')}
              </button>
            )}
          </div>

          {classesLoading && <LoadingSpinner message={t('adminUx.classOptionsLoading')} />}
          {classesError && <ErrorState message={t('adminUx.classOptionsError')} onRetry={onRetryClasses} />}
          {availableClasses.length > SEARCH_THRESHOLD && (
            <div style={{ position: 'relative', marginBottom: '0.5rem' }}>
              <Search
                size={16}
                aria-hidden
                style={{
                  position: 'absolute',
                  left: '0.625rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--color-text-muted)',
                }}
              />
              <input
                className="input cdm-field"
                type="search"
                aria-label={t('deadline.modal.searchClasses')}
                placeholder={t('deadline.modal.searchClasses')}
                value={classQuery}
                onChange={(e) => setClassQuery(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>
          )}

          <div
            style={{
              maxHeight: '280px',
              overflowY: 'auto',
              border: `1px solid ${showErrors && errors.classes ? 'var(--color-danger, #dc2626)' : 'var(--color-border)'}`,
              borderRadius: 'var(--radius-md)',
              padding: '0.5rem',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
              gap: '0.5rem',
              backgroundColor: 'var(--color-surface-muted)',
            }}
          >
            {availableClasses.length === 0 ? (
              <div style={{ ...styles.hint, gridColumn: '1 / -1', padding: '0.5rem' }}>
                {t('deadline.modal.noClassesAvailable')}
              </div>
            ) : filteredClasses.length === 0 ? (
              <div style={{ ...styles.hint, gridColumn: '1 / -1', padding: '0.5rem' }}>
                {t('deadline.modal.noClassesFound', { query: classQuery })}
              </div>
            ) : (
              filteredClasses.map((sc) => {
                const isSelected = selectedClassIds.includes(sc.id);
                return (
                  <label
                    key={sc.id}
                    className="cdm-class"
                    title={sc.name}
                    style={{
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.5rem 0.625rem',
                      border: `1px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: isSelected ? 'var(--color-primary-light, #eff6ff)' : 'var(--color-surface)',
                      cursor: 'pointer',
                      fontSize: '0.8125rem',
                      fontWeight: isSelected ? 600 : 400,
                      color: isSelected ? 'var(--color-primary)' : 'var(--color-text-main)',
                    }}
                  >
                    <input
                      type="checkbox"
                      className="cdm-sr"
                      checked={isSelected}
                      onChange={() => toggleClass(sc.id)}
                    />
                    <span
                      aria-hidden
                      style={{
                        flexShrink: 0,
                        width: 16,
                        height: 16,
                        borderRadius: 4,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: `1.5px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                        backgroundColor: isSelected ? 'var(--color-primary)' : 'transparent',
                        color: '#fff',
                      }}
                    >
                      {isSelected && <Check size={12} strokeWidth={3} />}
                    </span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {sc.name}
                    </span>
                  </label>
                );
              })
            )}
          </div>

          {showErrors && errors.classes && (
            <p style={styles.error} role="alert">
              {errors.classes}
            </p>
          )}
          {selectedClassIds.length > 0 && <div className="admin-selected-classes">
            <strong>{t('adminUx.selectedClasses', { count: selectedClassIds.length })}</strong>
            <div>{availableClasses.filter(item => selectedClassIds.includes(item.id)).map(item =>
              <button type="button" className="btn btn-secondary btn-sm" key={item.id} onClick={() => toggleClass(item.id)}
                aria-label={t('adminUx.removeClass', { name: item.name })}>{item.name} ×</button>)}</div>
          </div>}
        </div>

        {/* Ghi chú về email */}
        <div
          style={{
            display: 'flex',
            gap: '0.625rem',
            alignItems: 'flex-start',
            padding: '0.75rem 0.875rem',
            marginBottom: '1.25rem',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-primary-light, #eff6ff)',
            color: 'var(--color-text-main)',
            fontSize: '0.8125rem',
            lineHeight: 1.5,
          }}
        >
          <Info size={16} style={{ flexShrink: 0, marginTop: 2, color: 'var(--color-primary)' }} aria-hidden />
          <span>
            {selectedClassIds.length > 0
              ? t('deadline.modal.emailNoticeAdminWithCount', { count: selectedClassIds.length })
              : t('deadline.modal.emailNoticeAdmin')}
          </span>
        </div>

        {/* Hành động */}
        <p className="form-hint">{t('adminUx.timezone', { zone: Intl.DateTimeFormat().resolvedOptions().timeZone })}</p>
        <div className="admin-form-actions">
          <Button type="button" variant="secondary" onClick={close} disabled={isSubmitting}>
            {t('deadline.modal.cancelBtn')}
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={isSubmitting}
            disabled={classesLoading || classesError || unknown}
            icon={selectedClassIds.length > 0 ? <Mail size={16} /> : <CalendarPlus size={16} />}
          >
            {isSubmitting ? t('deadline.modal.creating') : t('deadline.modal.submitCreate')}
          </Button>
        </div>
        </fieldset>
      </form>
    </Modal>
  );
};
