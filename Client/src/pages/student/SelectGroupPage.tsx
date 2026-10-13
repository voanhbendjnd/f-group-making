import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Clock, AlertTriangle, CheckCircle2, ArrowLeft, Users, ShieldAlert } from 'lucide-react';
import { deadlineApi } from '@/features/deadline/api/deadlineApi';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

export const SelectGroupPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const currentLocale = i18n.language === 'en' ? 'en-US' : 'vi-VN';
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const deadlineIdStr = searchParams.get('deadlineId');
  const classIdStr = searchParams.get('classId');

  const deadlineId = deadlineIdStr ? parseInt(deadlineIdStr, 10) : null;
  const classId = classIdStr ? parseInt(classIdStr, 10) : null;

  const {
    data: validateResult,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['validate-deadline', deadlineId, classId],
    queryFn: () => deadlineApi.validateDeadline(deadlineId!, classId!),
    enabled: !!deadlineId && !!classId,
    retry: false,
  });

  // Countdown timer calculation
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    isOver: boolean;
  }>({ days: 0, hours: 0, minutes: 0, seconds: 0, isOver: false });

  useEffect(() => {
    if (!validateResult?.endTime) return;

    const targetTime = new Date(validateResult.endTime).getTime();

    const updateCountdown = () => {
      const now = Date.now();
      const diff = targetTime - now;

      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, isOver: true });
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diff / (1000 * 60)) % 60);
      const seconds = Math.floor((diff / 1000) % 60);

      setTimeLeft({ days, hours, minutes, seconds, isOver: false });
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [validateResult?.endTime]);

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return '-';
    try {
      return new Intl.DateTimeFormat(currentLocale, {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(new Date(dateStr));
    } catch {
      return dateStr;
    }
  };

  // Missing query parameters
  if (!deadlineId || !classId) {
    return (
      <div style={{ maxWidth: '640px', margin: '3rem auto', padding: '0 1rem' }}>
        <div className="card" style={{ padding: '2.5rem', textAlign: 'center' }}>
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: 'var(--color-error-bg, #fee2e2)',
              color: 'var(--color-error, #ef4444)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1.25rem',
            }}
          >
            <ShieldAlert size={32} />
          </div>
          <h2 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-main)' }}>
            {t('deadline.student.invalidLinkTitle')}
          </h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9375rem', margin: '0.75rem 0 1.5rem' }}>
            {t('deadline.student.invalidLinkDesc')}
          </p>
          <Button variant="primary" icon={<ArrowLeft size={16} />} onClick={() => navigate('/student/dashboard')}>
            {t('deadline.student.backToDashboard')}
          </Button>
        </div>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div style={{ maxWidth: '640px', margin: '4rem auto', padding: '0 1rem', textAlign: 'center' }}>
        <div className="card" style={{ padding: '3rem' }}>
          <LoadingSpinner message={t('deadline.student.verifying')} />
        </div>
      </div>
    );
  }

  // Access denied or Error
  if (isError) {
    return (
      <div style={{ maxWidth: '640px', margin: '3rem auto', padding: '0 1rem' }}>
        <div className="card" style={{ padding: '2.5rem', textAlign: 'center' }}>
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: 'var(--color-error-bg, #fee2e2)',
              color: 'var(--color-error, #ef4444)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1.25rem',
            }}
          >
            <AlertTriangle size={32} />
          </div>
          <h2 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-main)' }}>
            {t('deadline.student.accessDeniedTitle')}
          </h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9375rem', margin: '0.75rem 0 1.5rem' }}>
            {(error as any)?.message || t('deadline.student.accessDeniedDesc')}
          </p>
          <Button variant="primary" icon={<ArrowLeft size={16} />} onClick={() => navigate('/student/dashboard')}>
            {t('deadline.student.backToDashboard')}
          </Button>
        </div>
      </div>
    );
  }

  const isExpired = !validateResult?.valid || validateResult?.status === 'EXPIRED' || timeLeft.isOver;

  return (
    <div style={{ maxWidth: '720px', margin: '2rem auto', padding: '0 1rem' }}>
      {/* Expired state alert */}
      {isExpired ? (
        <div className="card" style={{ padding: '2.5rem', textAlign: 'center' }}>
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: 'var(--color-error-bg, #fee2e2)',
              color: 'var(--color-error, #ef4444)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1.25rem',
            }}
          >
            <Clock size={32} />
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-text-main)' }}>
            {t('deadline.student.expiredTitle')}
          </h2>
          <p
            style={{
              color: 'var(--color-text-muted)',
              fontSize: '0.9375rem',
              margin: '0.75rem 0 1.5rem',
              lineHeight: 1.6,
              whiteSpace: 'pre-line',
            }}
          >
            {t('deadline.student.expiredDesc', {
              name: validateResult?.name,
              className: validateResult?.className,
              endTime: formatDateTime(validateResult?.endTime),
            })}
          </p>

          <Button variant="primary" icon={<ArrowLeft size={16} />} onClick={() => navigate('/student/dashboard')}>
            {t('deadline.student.backToDashboard')}
          </Button>
        </div>
      ) : (
        /* Active state: Placeholder page */
        <div className="card" style={{ padding: '2.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <span className="badge badge-success" style={{ marginBottom: '0.5rem', display: 'inline-flex' }}>
                {t('deadline.student.activeBadge')}
              </span>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-text-main)', margin: 0 }}>
                {validateResult?.name}
              </h2>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
              <Users size={16} />
              <span>{t('deadline.student.classLabel')} <strong style={{ color: 'var(--color-text-main)' }}>{validateResult?.className}</strong></span>
            </div>
          </div>

          {validateResult?.description && (
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9375rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
              {validateResult.description}
            </p>
          )}

          {/* Countdown card */}
          <div
            style={{
              backgroundColor: 'var(--color-surface-muted, #f8fafc)',
              borderRadius: 'var(--radius-lg, 12px)',
              padding: '1.5rem',
              marginBottom: '2rem',
              textAlign: 'center',
              border: '1px solid var(--color-border)',
            }}
          >
            <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', fontWeight: 500, marginBottom: '0.75rem' }}>
              {t('deadline.student.countdownTitle')}
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{ minWidth: '70px', padding: '0.75rem', backgroundColor: 'var(--color-surface, #ffffff)', borderRadius: 'var(--radius-md)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-primary)' }}>{timeLeft.days}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{t('deadline.student.days')}</div>
              </div>
              <div style={{ minWidth: '70px', padding: '0.75rem', backgroundColor: 'var(--color-surface, #ffffff)', borderRadius: 'var(--radius-md)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-primary)' }}>{timeLeft.hours}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{t('deadline.student.hours')}</div>
              </div>
              <div style={{ minWidth: '70px', padding: '0.75rem', backgroundColor: 'var(--color-surface, #ffffff)', borderRadius: 'var(--radius-md)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-primary)' }}>{timeLeft.minutes}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{t('deadline.student.minutes')}</div>
              </div>
              <div style={{ minWidth: '70px', padding: '0.75rem', backgroundColor: 'var(--color-surface, #ffffff)', borderRadius: 'var(--radius-md)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-primary)' }}>{timeLeft.seconds}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{t('deadline.student.seconds')}</div>
              </div>
            </div>

            <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-subtle)', marginTop: '0.75rem' }}>
              {t('deadline.student.endsAt', { time: formatDateTime(validateResult?.endTime) })}
            </div>
          </div>

          {/* Placeholder Notification Box */}
          <div
            style={{
              padding: '1.25rem',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-info-bg, #eff6ff)',
              border: '1px solid var(--color-info-border, #bfdbfe)',
              color: 'var(--color-info, #1e40af)',
              marginBottom: '1.75rem',
              display: 'flex',
              gap: '0.75rem',
              alignItems: 'flex-start',
            }}
          >
            <CheckCircle2 size={20} style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ fontSize: '0.875rem', lineHeight: 1.6 }}>
              <strong>{t('deadline.student.placeholderTitle')}</strong>
              <br />
              {t('deadline.student.placeholderDesc')}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Button variant="secondary" icon={<ArrowLeft size={16} />} onClick={() => navigate('/student/dashboard')}>
              {t('deadline.student.backToDashboard')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
