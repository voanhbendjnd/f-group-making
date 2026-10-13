import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/common/Modal';
import { Input } from '@/components/common/Input';
import { Button } from '@/components/common/Button';
import { useToast } from '@/app/providers/ToastContext';
import { deadlineApi } from '../api/deadlineApi';
import type { Deadline } from '../types';
import { Clock, Save, Lock } from 'lucide-react';

interface ExtendDeadlineModalProps {
  open: boolean;
  onClose: () => void;
  deadline: Deadline | null;
  onSuccess: () => void;
}

const toDateTimeLocalString = (dateStr?: string) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const pad = (n: number) => n.toString().padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

export const ExtendDeadlineModal: React.FC<ExtendDeadlineModalProps> = ({
  open,
  onClose,
  deadline,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const toast = useToast();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (deadline) {
      setName(deadline.name);
      setDescription(deadline.description || '');
      setStartTime(toDateTimeLocalString(deadline.startTime));
      setEndTime(toDateTimeLocalString(deadline.endTime));
    }
  }, [deadline]);

  if (!deadline) return null;

  const isActive = deadline.status === 'ACTIVE';
  const isUpcoming = deadline.status === 'UPCOMING';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error(t('deadline.modal.nameRequired'));
      return;
    }

    const newEnd = new Date(endTime);
    const oldEnd = new Date(deadline.endTime);
    const now = new Date();

    if (isActive) {
      if (newEnd <= oldEnd) {
        toast.error(t('deadline.modal.extendTimeMustBeGreater'));
        return;
      }
      if (newEnd <= now) {
        toast.error(t('deadline.modal.timeFutureError'));
        return;
      }
    } else if (isUpcoming) {
      const newStart = new Date(startTime);
      if (newStart < now) {
        toast.error(t('deadline.modal.startTimePastError'));
        return;
      }
      if (newEnd <= newStart) {
        toast.error(t('deadline.modal.timeOrderError'));
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await deadlineApi.updateDeadline(deadline.id, {
        id: deadline.id,
        name: name.trim(),
        description: description.trim(),
        startTime: isActive ? undefined : new Date(startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
      });
      toast.success(isActive ? t('deadline.messages.extendSuccess') : t('deadline.messages.updateSuccess'));
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || t('deadline.messages.updateError'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isActive ? t('deadline.modal.extendTitle') : t('deadline.modal.editTitle')}
      maxWidth="560px"
    >
      <form onSubmit={handleSubmit}>
        {isActive && (
          <div
            className="alert alert-info"
            style={{
              display: 'flex',
              gap: '8px',
              padding: '10px 14px',
              marginBottom: '1rem',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.8125rem',
              backgroundColor: 'var(--color-info-bg, #eff6ff)',
              color: 'var(--color-info, #1d4ed8)',
            }}
          >
            <Lock size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong>{t('deadline.modal.activeRuleNoticeTitle')}</strong> {t('deadline.modal.activeRuleNotice')}
            </div>
          </div>
        )}

        <Input
          label={t('deadline.modal.nameLabel')}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <div style={{ marginBottom: '1rem' }}>
          <label
            style={{
              display: 'block',
              fontSize: '0.875rem',
              fontWeight: 500,
              color: 'var(--color-text-main)',
              marginBottom: '0.375rem',
            }}
          >
            {t('deadline.modal.descLabel')}
          </label>
          <textarea
            className="input"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{ width: '100%', resize: 'vertical' }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
          <div>
            <Input
              label={t('deadline.modal.startTime')}
              type="datetime-local"
              disabled={isActive}
              required
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
            {isActive && (
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)' }}>
                {t('deadline.modal.fixedWhenActive')}
              </span>
            )}
          </div>

          <div>
            <Input
              label={t('deadline.modal.endTimeExtend')}
              type="datetime-local"
              required
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
            {isActive && (
              <span style={{ fontSize: '0.75rem', color: 'var(--color-primary)' }}>
                {t('deadline.modal.mustBeFuture')}
              </span>
            )}
          </div>
        </div>

        {/* Display assigned classes as read-only tags */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.375rem' }}>
            {t('deadline.modal.assignedClassesLabel')}
          </label>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {deadline.schoolClassNames?.map((cName, idx) => (
              <span key={idx} className="badge badge-neutral" style={{ fontSize: '0.8125rem' }}>
                {cName}
              </span>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            {t('deadline.modal.cancelBtn')}
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={isSubmitting}
            icon={isActive ? <Clock size={16} /> : <Save size={16} />}
          >
            {isActive ? t('deadline.modal.submitExtend') : t('deadline.modal.submitSave')}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
