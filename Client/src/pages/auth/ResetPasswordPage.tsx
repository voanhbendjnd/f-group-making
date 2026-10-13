import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { KeyRound, CheckCircle2, ShieldAlert, ArrowRight, ShieldCheck, Check, RotateCcw } from 'lucide-react';
import confetti from 'canvas-confetti';
import { useTranslation } from 'react-i18next';
import { authApi } from '@/features/auth/api/authApi';
import type { ResetKeyVerifyResult } from '@/features/auth/types';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

export const ResetPasswordPage: React.FC = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const resetKey = searchParams.get('key') || searchParams.get('token');

  const [isVerifying, setIsVerifying] = useState<boolean>(true);
  const [verifyResult, setVerifyResult] = useState<ResetKeyVerifyResult | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  // Pre-verify reset key on mount
  useEffect(() => {
    if (!resetKey || !resetKey.trim()) {
      setIsVerifying(false);
      setVerifyError(t('resetPassword.missingKeyError'));
      return;
    }

    let isMounted = true;
    authApi
      .verifyResetKey(resetKey.trim())
      .then((res) => {
        if (isMounted) {
          setVerifyResult(res);
          setIsVerifying(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setVerifyError(
            err.message || t('resetPassword.invalidOrExpiredKey')
          );
          setIsVerifying(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [resetKey, t]);

  const hasMinLength = password.length >= 4;
  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const isFormValid = hasMinLength && passwordsMatch;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetKey || !resetKey.trim() || !isFormValid) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await authApi.finishPasswordReset({
        resetKey: resetKey.trim(),
        newPassword: password,
      });

      setIsSuccess(true);
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
        });
      } catch {
        // ignore confetti errors
      }
    } catch (err: any) {
      setErrorMessage(
        err.message || t('resetPassword.submitErrorDefault')
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // State 1: Verifying reset key on mount
  if (isVerifying) {
    return (
      <div className="card" style={{ padding: '2.5rem 2rem', textAlign: 'center' }}>
        <LoadingSpinner message={t('resetPassword.checkingLink')} />
      </div>
    );
  }

  // State 2: Key is invalid, expired, or already used
  if (verifyError || !resetKey || !resetKey.trim()) {
    return (
      <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
        <div
          style={{
            width: '54px',
            height: '54px',
            borderRadius: 'var(--radius-full)',
            backgroundColor: '#fee2e2',
            color: 'var(--color-error)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.25rem',
          }}
        >
          <ShieldAlert size={28} />
        </div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-main)' }}>
          {t('resetPassword.invalidKeyTitle')}
        </h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginTop: '0.5rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
          {verifyError || t('resetPassword.invalidKeyDefaultDesc')}
        </p>
        <Link to="/forgot-password" style={{ textDecoration: 'none' }}>
          <Button variant="primary" icon={<RotateCcw size={16} />} style={{ width: '100%' }}>
            {t('resetPassword.resendRequest')}
          </Button>
        </Link>
      </div>
    );
  }

  // State 3: Successfully reset password
  if (isSuccess) {
    return (
      <div className="card" style={{ padding: '2.5rem 2rem', textAlign: 'center' }}>
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: 'var(--radius-full)',
            backgroundColor: '#dcfce7',
            color: 'var(--color-success)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.5rem',
          }}
        >
          <CheckCircle2 size={36} />
        </div>
        <h2 style={{ fontSize: '1.375rem', fontWeight: 700, color: '#166534' }}>
          {t('resetPassword.successTitle')}
        </h2>
        <p style={{ fontSize: '0.9375rem', color: 'var(--color-text-muted)', marginTop: '0.5rem', marginBottom: '1.75rem', lineHeight: 1.5 }}>
          {t('resetPassword.successDesc')}
        </p>
        <Link to="/login" style={{ textDecoration: 'none' }}>
          <Button variant="primary" icon={<ArrowRight size={18} />} style={{ width: '100%' }}>
            {t('resetPassword.loginNow')}
          </Button>
        </Link>
      </div>
    );
  }

  // State 4: Valid key -> Display password form
  return (
    <div className="card" style={{ padding: '2rem' }}>
      <div style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: 'var(--radius-full)',
            backgroundColor: 'var(--color-primary-light)',
            color: 'var(--color-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1rem',
          }}
        >
          <KeyRound size={24} />
        </div>
        <h2 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-main)' }}>
          {t('resetPassword.title')}
        </h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
          {verifyResult?.email ? (
            <>
              {t('resetPassword.formSubtitleWithEmail', { email: verifyResult.email })}
            </>
          ) : (
            t('resetPassword.formSubtitle')
          )}
        </p>
      </div>

      {errorMessage && (
        <div className="alert alert-error" role="alert" style={{ marginBottom: '1.25rem' }}>
          <ShieldAlert size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div className="alert-content">{errorMessage}</div>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <Input
          label={t('resetPassword.newPasswordLabel')}
          type="password"
          placeholder="••••••••"
          required
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <Input
          label={t('resetPassword.confirmPasswordLabel')}
          type="password"
          placeholder="••••••••"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />

        {/* Validation checklist */}
        <div
          style={{
            margin: '1rem 0 1.5rem',
            padding: '0.875rem',
            backgroundColor: 'var(--color-surface-muted)',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.8125rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: hasMinLength ? 'var(--color-success)' : 'var(--color-text-muted)',
            }}
          >
            {hasMinLength ? <Check size={14} /> : <div style={{ width: 14 }} />}
            <span>{t('resetPassword.min4Chars')}</span>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: passwordsMatch ? 'var(--color-success)' : 'var(--color-text-muted)',
            }}
          >
            {passwordsMatch ? <Check size={14} /> : <div style={{ width: 14 }} />}
            <span>{t('resetPassword.passwordsMatch')}</span>
          </div>
        </div>

        <Button
          type="submit"
          variant="primary"
          loading={isSubmitting}
          disabled={!isFormValid || isSubmitting}
          icon={<ShieldCheck size={18} />}
          style={{ width: '100%' }}
        >
          {t('resetPassword.saveNewPassword')}
        </Button>
      </form>
    </div>
  );
};
