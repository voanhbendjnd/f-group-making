import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { LogIn, Info, ShieldAlert, MailCheck, Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/app/providers/AuthContext';
import { useToast } from '@/app/providers/ToastContext';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { Modal } from '@/components/common/Modal';
import { activationApi } from '@/features/activation/api/activationApi';
import type { LoginRequest } from '../types';
import { canAccessPath, getHomeRoute } from '../utils/roleRouting';

export const LoginForm: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);

  // Activation Request Modal State
  const [isActivationModalOpen, setIsActivationModalOpen] = useState(false);
  const [activationEmail, setActivationEmail] = useState('');
  const [isSendingActivation, setIsSendingActivation] = useState(false);
  const [activationSentSuccess, setActivationSentSuccess] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  // Redirect handling: Read from search param, location state, or sessionStorage
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const redirectParam = searchParams.get('redirect');
    if (redirectParam) {
      sessionStorage.setItem('fmaking_pending_redirect', decodeURIComponent(redirectParam));
    }
  }, [location.search]);

  // Cooldown timer
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const interval = setInterval(() => {
      setCooldownSeconds((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownSeconds]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginRequest>({
    defaultValues: {
      username: '',
      password: '',
    },
  });

  const onSubmit = async (data: LoginRequest) => {
    setFormError(null);
    try {
      const user = await login(data);

      // Resolve redirect destination
      const searchParams = new URLSearchParams(location.search);
      const redirectQuery = searchParams.get('redirect');
      const stateFrom = (location.state as { from?: { pathname?: string; search?: string } } | null)?.from;
      const stateFromUrl = stateFrom ? stateFrom.pathname + (stateFrom.search || '') : null;
      const storedRedirect = sessionStorage.getItem('fmaking_pending_redirect');

      const rawTarget = redirectQuery
        ? decodeURIComponent(redirectQuery)
        : stateFromUrl || storedRedirect;

      // Validate internal safe URL to prevent Open Redirect
      const isSafeInternal =
        rawTarget && rawTarget.startsWith('/') && !rawTarget.startsWith('//');

      if (isSafeInternal && canAccessPath(rawTarget, user.authorities)) {
        sessionStorage.removeItem('fmaking_pending_redirect');
        navigate(rawTarget, { replace: true });
      } else {
        sessionStorage.removeItem('fmaking_pending_redirect');
        navigate(getHomeRoute(user.authorities), { replace: true });
      }
    } catch (err: any) {
      setFormError(err.message || t('auth.loginFailed'));
    }
  };

  const handleRequestActivation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activationEmail || !activationEmail.includes('@') || cooldownSeconds > 0) return;

    setIsSendingActivation(true);
    try {
      await activationApi.requestActivation(activationEmail.trim());
      setActivationSentSuccess(true);
      setCooldownSeconds(60);
      toast.success(
        t('auth.activationEmailSentSuccess', 'Đã tiếp nhận yêu cầu. Vui lòng kiểm tra email của bạn!')
      );
    } catch (err: any) {
      toast.error(err.message || t('auth.activationEmailSentError', 'Không thể gửi email kích hoạt.'));
    } finally {
      setIsSendingActivation(false);
    }
  };

  return (
    <div className="card" style={{ padding: '2rem' }}>
      <div style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
        <h2 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text-main)' }}>
          {t('auth.loginTitle')}
        </h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
          {t('auth.loginSubtitle')}
        </p>
      </div>

      {formError && (
        <div className="alert alert-error" role="alert" style={{ marginBottom: '1.25rem' }}>
          <ShieldAlert size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div className="alert-content">{formError}</div>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <Input
          label={t('common.email')}
          type="email"
          placeholder={t('auth.emailPlaceholder')}
          required
          autoComplete="username"
          autoFocus
          error={errors.username?.message}
          {...register('username', {
            required: t('auth.emailRequired'),
            pattern: {
              value: /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/,
              message: t('auth.emailInvalid'),
            },
          })}
        />

        <Input
          label={t('common.password')}
          type="password"
          placeholder={t('auth.passwordPlaceholder')}
          required
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password', {
            required: t('auth.passwordRequired'),
            minLength: {
              value: 4,
              message: t('auth.passwordMinLength'),
            },
          })}
        />

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: '-0.375rem',
            marginBottom: '1rem',
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}
        >
          <button
            type="button"
            onClick={() => {
              setActivationSentSuccess(false);
              setIsActivationModalOpen(true);
            }}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              fontSize: '0.8125rem',
              color: 'var(--color-primary)',
              cursor: 'pointer',
              fontWeight: 500,
              textDecoration: 'underline',
            }}
          >
            {t('auth.notActivatedPrompt', 'Chưa kích hoạt tài khoản?')}
          </button>

          <Link
            to="/forgot-password"
            style={{
              fontSize: '0.8125rem',
              color: 'var(--color-text-muted)',
              textDecoration: 'none',
              fontWeight: 500,
            }}
          >
            {t('auth.forgotPasswordLink')}
          </Link>
        </div>

        <Button
          type="submit"
          variant="primary"
          loading={isSubmitting}
          icon={<LogIn size={18} />}
          style={{ width: '100%', marginTop: '0.25rem' }}
        >
          {t('auth.loginButton')}
        </Button>
      </form>

      {/* Notice regarding no public registration */}
      <div
        style={{
          marginTop: '1.5rem',
          paddingTop: '1.25rem',
          borderTop: '1px solid var(--color-border)',
          display: 'flex',
          gap: '0.625rem',
          alignItems: 'flex-start',
          fontSize: '0.8125rem',
          color: 'var(--color-text-muted)',
          backgroundColor: 'var(--color-surface-muted)',
          padding: '0.875rem',
          borderRadius: 'var(--radius-md)',
        }}
      >
        <Info size={16} style={{ color: 'var(--color-primary)', flexShrink: 0, marginTop: '2px' }} />
        <div>
          <strong style={{ color: 'var(--color-text-main)' }}>{t('auth.noAccountTitle')}</strong>
          <br />
          {t('auth.noAccountDesc')}
        </div>
      </div>

      {/* Modal: Gửi lại email kích hoạt */}
      <Modal
        open={isActivationModalOpen}
        onClose={() => setIsActivationModalOpen(false)}
        title={t('auth.activationModalTitle', 'Yêu cầu kích hoạt tài khoản')}
        maxWidth="480px"
      >
        {activationSentSuccess ? (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                backgroundColor: 'var(--color-success-bg, #ecfdf5)',
                color: 'var(--color-success, #10b981)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '1rem',
              }}
            >
              <MailCheck size={28} />
            </div>
            <h4 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--color-text-main)' }}>
              {t('auth.activationRequestSuccessTitle', 'Đã tiếp nhận yêu cầu')}
            </h4>
            <p
              style={{
                fontSize: '0.875rem',
                color: 'var(--color-text-muted)',
                marginTop: '0.5rem',
                lineHeight: 1.5,
              }}
            >
              {t(
                'auth.activationRequestSuccessDesc',
                'Nếu email tồn tại trong hệ thống và chưa được kích hoạt, liên kết kích hoạt đã được gửi tới hộp thư của bạn. Vui lòng kiểm tra hộp thư đến (hoặc thư rác).'
              )}
            </p>
            <Button
              variant="secondary"
              onClick={() => setIsActivationModalOpen(false)}
              style={{ marginTop: '1.25rem', width: '100%' }}
            >
              {t('common.close', 'Đóng')}
            </Button>
          </div>
        ) : (
          <form onSubmit={handleRequestActivation}>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '1.25rem' }}>
              {t(
                'auth.activationModalDesc',
                'Nhập địa chỉ email trường đã cấp cho bạn để nhận liên kết kích hoạt và thiết lập mật khẩu tài khoản.'
              )}
            </p>

            <Input
              label={t('common.email', 'Địa chỉ Email')}
              type="email"
              placeholder="student@fpt.edu.vn"
              required
              autoFocus
              value={activationEmail}
              onChange={(e) => setActivationEmail(e.target.value)}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsActivationModalOpen(false)}
                disabled={isSendingActivation}
              >
                {t('common.cancel', 'Hủy')}
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={isSendingActivation}
                disabled={!activationEmail || cooldownSeconds > 0}
                icon={<Send size={16} />}
              >
                {cooldownSeconds > 0
                  ? `${t('auth.cooldownWait', 'Đợi')} (${cooldownSeconds}s)`
                  : t('auth.sendActivationLink', 'Gửi email kích hoạt')}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};
