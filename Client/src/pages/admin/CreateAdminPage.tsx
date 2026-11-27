import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import {
  ShieldCheck,
  User,
  RotateCcw,
  CheckCircle2,
  Copy,
  Check,
  Info,
  AlertCircle,
  Mail,
  Clock,
} from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { useToast } from '@/app/providers/ToastContext';
import { adminApi } from '@/features/admin/api/adminApi';
import type { AdminUserResponse } from '@/features/admin/types';

interface FormValues {
  name: string;
  email: string;
}

export const CreateAdminPage: React.FC = () => {
  const { t } = useTranslation();
  const toast = useToast();
  const [serverError, setServerError] = useState<string | null>(null);
  const [createdAdmin, setCreatedAdmin] = useState<AdminUserResponse | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      name: '',
      email: '',
    },
    mode: 'onTouched',
  });

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      const result = await adminApi.createAdmin({
        name: values.name.trim(),
        email: values.email.trim().toLowerCase(),
      });

      setCreatedAdmin(result);
      toast.success(t('createAdmin.successToast', 'Tạo tài khoản Admin thành công!'));
      reset();
    } catch (err: any) {
      const responseData = err?.response?.data;
      const errorKey =
        err?.errorKey ||
        err?.raw?.errorKey ||
        err?.raw?.message ||
        responseData?.errorKey ||
        responseData?.message;
      const serverMsg = err?.message || err?.detail || responseData?.message;
      const titleStr = String(err?.raw?.title || responseData?.title || '').toLowerCase();
      if (
        errorKey === 'emailexists' ||
        errorKey === 'userexists' ||
        titleStr.includes('already') ||
        String(serverMsg || '').toLowerCase().includes('email')
      ) {
        setServerError(
          t('createAdmin.errorDuplicateEmail', 'Email này đã được sử dụng trong hệ thống. Vui lòng chọn email khác.')
        );
      } else {
        setServerError(
          serverMsg ||
            t('createAdmin.errorDefault', 'Không thể tạo tài khoản Admin. Vui lòng thử lại sau.')
        );
      }
    }
  };

  const handleCopyEmail = (email: string) => {
    if (!navigator?.clipboard) return;
    navigator.clipboard.writeText(email).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  };

  const handleCreateAnother = () => {
    setCreatedAdmin(null);
    setServerError(null);
    reset();
  };

  return (
    <div className="create-admin-page" style={{ maxWidth: '800px', margin: '0 auto', paddingBottom: '2.5rem' }}>
      <style>{`
        .create-admin-form .form-label {
          justify-content: flex-start !important;
          text-align: left !important;
          gap: 0.375rem;
        }
      `}</style>
      <PageHeader
        title={t('createAdmin.pageTitle', 'Tạo tài khoản Admin')}
        description={t(
          'createAdmin.pageSubtitle',
          'Tạo tài khoản quản trị viên mới với toàn quyền quản lý hệ thống'
        )}
      />

      {createdAdmin ? (
        <div
          className="card"
          style={{
            padding: '2rem',
            backgroundColor: '#ffffff',
            borderRadius: 'var(--radius-lg, 12px)',
            border: '1px solid var(--color-success-border, #bbf7d0)',
            boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.05))',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                backgroundColor: 'var(--color-success-light, #f0fdf4)',
                color: 'var(--color-success, #16a34a)',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}
            >
              <CheckCircle2 size={28} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: 'var(--color-text-main)' }}>
                {t('createAdmin.successCardTitle', 'Khởi tạo tài khoản Admin thành công')}
              </h3>
              <p style={{ margin: '0.25rem 0 0', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                {t(
                  'createAdmin.successCardDesc',
                  'Hệ thống đã gửi email kích hoạt đến địa chỉ quản trị viên mới để thiết lập mật khẩu.'
                )}
              </p>
            </div>
          </div>

          <div
            style={{
              padding: '1.25rem',
              borderRadius: 'var(--radius-md, 8px)',
              backgroundColor: 'var(--color-surface-muted, #f8fafc)',
              border: '1px solid var(--color-border, #e2e8f0)',
              marginBottom: '1.5rem',
              display: 'grid',
              gap: '0.75rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                {t('createAdmin.createdAdminName', 'Họ tên:')}
              </span>
              <strong style={{ color: 'var(--color-text-main)', fontSize: '0.9375rem' }}>
                {createdAdmin.name}
              </strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                {t('createAdmin.createdAdminEmail', 'Email:')}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontFamily: 'monospace', fontSize: '0.9375rem', fontWeight: 600, color: 'var(--color-primary)' }}>
                  {createdAdmin.email}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopyEmail(createdAdmin.email)}
                  style={{
                    background: 'none',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm, 4px)',
                    padding: '2px 6px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '0.75rem',
                    color: isCopied ? 'var(--color-success)' : 'var(--color-text-muted)',
                  }}
                  title={t('createAdmin.copyEmail', 'Sao chép Email')}
                >
                  {isCopied ? <Check size={13} /> : <Copy size={13} />}
                  <span>{isCopied ? t('createAdmin.copied', 'Đã sao chép!') : t('createAdmin.copyEmail', 'Sao chép')}</span>
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                {t('createAdmin.createdAdminRole', 'Quyền hạn:')}
              </span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-sm, 4px)',
                  backgroundColor: 'var(--color-primary-light, #eff6ff)',
                  color: 'var(--color-primary, #2563eb)',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                }}
              >
                <ShieldCheck size={14} />
                ROLE_ADMIN
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                {t('createAdmin.statusLabel', 'Trạng thái:')}
              </span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-sm, 4px)',
                  backgroundColor: '#fef3c7',
                  color: '#b45309',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                }}
              >
                <Clock size={13} />
                {t('createAdmin.statusPendingActivation', 'Chờ kích hoạt qua email')}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <Button variant="primary" icon={<User size={16} />} onClick={handleCreateAnother}>
              {t('createAdmin.createNewAnother', 'Tạo thêm tài khoản khác')}
            </Button>
          </div>
        </div>
      ) : (
        <div
          className="card"
          style={{
            padding: '2rem',
            backgroundColor: '#ffffff',
            borderRadius: 'var(--radius-lg, 12px)',
            boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.05))',
          }}
        >
          {/* Form Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid var(--color-border, #e2e8f0)',
              paddingBottom: '1.25rem',
              marginBottom: '1.5rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: 'var(--radius-md, 8px)',
                  backgroundColor: 'var(--color-primary-light, #eff6ff)',
                  color: 'var(--color-primary, #2563eb)',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <ShieldCheck size={24} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, color: 'var(--color-text-main)' }}>
                  {t('createAdmin.cardTitle', 'Thông tin quản trị viên mới')}
                </h3>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                  {t('createAdmin.cardDesc', 'Vui lòng nhập đầy đủ và chính xác thông tin để khởi tạo tài khoản.')}
                </p>
              </div>
            </div>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.375rem',
                padding: '4px 10px',
                borderRadius: '999px',
                backgroundColor: 'var(--color-primary-light, #eff6ff)',
                color: 'var(--color-primary, #2563eb)',
                fontSize: '0.75rem',
                fontWeight: 600,
              }}
            >
              <ShieldCheck size={14} />
              {t('createAdmin.roleBadge', 'ROLE_ADMIN')}
            </span>
          </div>

          {serverError && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.625rem',
                padding: '0.875rem 1rem',
                borderRadius: 'var(--radius-md, 8px)',
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#b91c1c',
                fontSize: '0.875rem',
                marginBottom: '1.5rem',
              }}
            >
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <span>{serverError}</span>
            </div>
          )}

          <form className="create-admin-form" onSubmit={handleSubmit(onSubmit)}>
            <div style={{ display: 'grid', gap: '1.25rem' }}>
              {/* Full Name */}
              <Input
                id="admin-name"
                type="text"
                label={t('createAdmin.fullName', 'Họ và tên')}
                required
                placeholder={t('createAdmin.fullNamePlaceholder', 'Ví dụ: Nguyễn Văn An')}
                error={errors.name?.message}
                {...register('name', {
                  required: t('createAdmin.fullNameRequired', 'Họ và tên không được để trống'),
                  minLength: {
                    value: 2,
                    message: t('createAdmin.fullNameMin', 'Họ và tên phải có ít nhất 2 ký tự'),
                  },
                  maxLength: {
                    value: 50,
                    message: t('createAdmin.fullNameMax', 'Họ và tên không được quá 50 ký tự'),
                  },
                })}
              />

              {/* Email */}
              <Input
                id="admin-email"
                type="email"
                label={t('createAdmin.email', 'Email đăng nhập')}
                required
                placeholder={t('createAdmin.emailPlaceholder', 'Ví dụ: admin.new@fpt.edu.vn')}
                error={errors.email?.message}
                {...register('email', {
                  required: t('createAdmin.emailRequired', 'Email không được để trống'),
                  pattern: {
                    value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                    message: t('createAdmin.emailInvalid', 'Email không đúng định dạng'),
                  },
                })}
              />

              {/* Informational Notice */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.75rem',
                  padding: '0.875rem 1rem',
                  borderRadius: 'var(--radius-md, 8px)',
                  backgroundColor: 'var(--color-primary-light, #eff6ff)',
                  border: '1px solid #bfdbfe',
                  color: '#1e40af',
                  fontSize: '0.875rem',
                  lineHeight: 1.5,
                }}
              >
                <Info size={18} style={{ flexShrink: 0, marginTop: '2px', color: 'var(--color-primary, #2563eb)' }} />
                <span>
                  {t(
                    'createAdmin.notice',
                    'Hệ thống sẽ gửi email kích hoạt đến địa chỉ này để quản trị viên mới thiết lập mật khẩu.'
                  )}
                </span>
              </div>

              {/* Form Action Buttons */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                  gap: '0.75rem',
                  paddingTop: '0.75rem',
                  borderTop: '1px solid var(--color-border, #e2e8f0)',
                  marginTop: '0.5rem',
                }}
              >
                <Button
                  type="button"
                  variant="secondary"
                  icon={<RotateCcw size={15} />}
                  onClick={() => {
                    reset();
                    setServerError(null);
                  }}
                  disabled={isSubmitting}
                >
                  {t('createAdmin.resetBtn', 'Làm mới')}
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  loading={isSubmitting}
                  icon={<Mail size={16} />}
                >
                  {t('createAdmin.submitBtn', 'Tạo tài khoản & Gửi email kích hoạt')}
                </Button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
