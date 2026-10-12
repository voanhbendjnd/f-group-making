import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { LogIn, Info, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/app/providers/AuthContext';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import type { LoginRequest } from '../types';
import { canAccessPath, getHomeRoute } from '../utils/roleRouting';

export const LoginForm: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const [formError, setFormError] = useState<string | null>(null);

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
      // Determine redirection based on target or user role
      const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
      if (from && canAccessPath(from, user.authorities)) {
        navigate(from, { replace: true });
      } else {
        navigate(getHomeRoute(user.authorities), { replace: true });
      }
    } catch (err: any) {
      setFormError(err.message || t('auth.loginFailed'));
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

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '-0.375rem', marginBottom: '1rem' }}>
          <Link
            to="/forgot-password"
            style={{
              fontSize: '0.8125rem',
              color: 'var(--color-primary)',
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
    </div>
  );
};
