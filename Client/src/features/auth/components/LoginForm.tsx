import React, { useState, useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Input as AntInput } from 'antd';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { AlertCircle, Eye, EyeOff, LockKeyhole, LogIn, Info, Mail, ShieldAlert, MailCheck, Send, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/app/providers/AuthContext';
import { useToast } from '@/app/providers/ToastContext';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { Modal } from '@/components/common/Modal';
import { activationApi } from '@/features/activation/api/activationApi';
import type { LoginRequest } from '../types';
import { canAccessPath, getHomeRoute } from '../utils/roleRouting';
import { LoginBrand } from './LoginBrand';

export const LoginForm: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

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
    control,
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
    <div className="login-form-card">
      <LoginBrand />
      <div className="login-form-heading">
        <h1>{t('auth.welcomeBack')}</h1>
        <div className="login-form-status">
          {formError ? <div className="alert alert-error login-form-error" role="alert">
            <ShieldAlert size={18} aria-hidden="true" /><div className="alert-content">{formError}</div>
          </div> : <p>{t('auth.welcomeSubtitle')}</p>}
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="login-field">
          <label htmlFor="login-email">{t('common.email')}<span className="login-field-required" aria-hidden="true">*</span></label>
          <Controller name="username" control={control} rules={{
            required: t('auth.emailRequired'),
            pattern: { value: /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/, message: t('auth.emailInvalid') },
          }} render={({ field }) => <AntInput {...field} id="login-email" type="email" required autoComplete="username" autoFocus
            placeholder={t('auth.emailPlaceholder')} prefix={<Mail size={18} aria-hidden="true" />}
            status={errors.username ? 'error' : undefined} aria-invalid={!!errors.username} aria-describedby={errors.username ? 'login-email-error' : undefined} />} />
          <div className="login-field-feedback">{errors.username && <div id="login-email-error" className="login-field-error" role="alert"><AlertCircle size={14} aria-hidden="true" />{errors.username.message}</div>}</div>
        </div>
        <div className="login-field">
          <label htmlFor="login-password">{t('common.password')}<span className="login-field-required" aria-hidden="true">*</span></label>
          <Controller name="password" control={control} rules={{
            required: t('auth.passwordRequired'),
            minLength: { value: 4, message: t('auth.passwordMinLength') },
          }} render={({ field }) => <AntInput {...field} id="login-password" type={showPassword ? 'text' : 'password'} required autoComplete="current-password"
            placeholder={t('auth.passwordPlaceholder')} prefix={<LockKeyhole size={18} aria-hidden="true" />}
            suffix={<button type="button" className="login-password-toggle" onClick={() => setShowPassword(previous => !previous)}
              aria-label={t(showPassword ? 'common.hidePassword' : 'common.showPassword')} aria-pressed={showPassword}>
              {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            </button>} status={errors.password ? 'error' : undefined} aria-invalid={!!errors.password} aria-describedby={errors.password ? 'login-password-error' : undefined} />} />
          <div className="login-field-feedback">{errors.password && <div id="login-password-error" className="login-field-error" role="alert"><AlertCircle size={14} aria-hidden="true" />{errors.password.message}</div>}</div>
        </div>
        <div className="login-form-options"><Link to="/forgot-password">{t('auth.forgotPasswordLink')}</Link></div>
        <Button type="submit" variant="primary" loading={isSubmitting} icon={<LogIn size={18} aria-hidden="true" />} className="login-submit">
          {t('auth.loginButton')}
        </Button>
      </form>
      <button type="button" className="login-activation-link" onClick={() => { setActivationSentSuccess(false); setIsActivationModalOpen(true); }}>
        <UserRound size={16} aria-hidden="true" />{t('auth.notActivatedPrompt')}
      </button>
      <div className="login-account-notice"><Info size={18} aria-hidden="true" /><div>
        <strong>{t('auth.noAccountTitle')}</strong><p>{t('auth.noAccountDesc')}</p>
      </div></div>

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
              placeholder={t('auth.activationEmailPlaceholder')}
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
                  ? t('auth.cooldownSeconds', { seconds: cooldownSeconds })
                  : t('auth.sendActivationLink', 'Gửi email kích hoạt')}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};
