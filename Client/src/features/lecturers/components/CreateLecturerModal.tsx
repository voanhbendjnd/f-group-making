import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { UserPlus } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { Input } from '@/components/common/Input';
import { Button } from '@/components/common/Button';
import { getApiError } from '@/services/api/types';
import { lecturerApi } from '../api/lecturerApi';
import type { CreateLecturerValues } from '../types';

export function CreateLecturerModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const root = useRef<HTMLDivElement>(null);
  const previousFocus = useRef(document.activeElement as HTMLElement | null);
  const sending = useRef(false);
  const [serverError, setServerError] = useState('');
  const [unknownResult, setUnknownResult] = useState(false);
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<CreateLecturerValues>({
    defaultValues: { code: '', email: '' },
  });
  const mutation = useMutation({ mutationFn: lecturerApi.createLecturer, retry: false });
  const busy = isSubmitting || mutation.isPending;
  useEffect(() => { const previous = previousFocus.current; return () => previous?.focus(); }, []);
  const close = () => { if (!busy) onClose(); };

  async function save(values: CreateLecturerValues) {
    if (sending.current || unknownResult) return;
    sending.current = true; setServerError('');
    try {
      await mutation.mutateAsync({ code: values.code.trim(), email: values.email.trim().toLowerCase() });
    } catch (error) {
      const apiError = getApiError(error);
      for (const violation of apiError.violations || []) {
        if (violation.field !== 'code' && violation.field !== 'email') continue;
        const duplicate = violation.message === (violation.field === 'code' ? 'lecturerCreate.duplicateCode' : 'lecturerCreate.duplicateEmail');
        setError(violation.field, { message: `addLecturer.${duplicate ? `duplicate${violation.field === 'code' ? 'Code' : 'Email'}` : `invalid.${violation.field}`}` });
      }
      const uncertain = Boolean(apiError.outcomeUnknown || apiError.status === 0 || apiError.status >= 500);
      setUnknownResult(uncertain);
      setServerError(uncertain ? 'addLecturer.unknown' : apiError.status === 403 ? 'addLecturer.forbidden'
        : apiError.status === 409 ? 'addLecturer.conflict' : 'addLecturer.failed');
      if (uncertain) void client.invalidateQueries({ queryKey: ['lecturers'] });
      return;
    } finally { sending.current = false; }
    onSuccess();
  }

  const fieldError = (field: keyof CreateLecturerValues) => errors[field]?.message ? t(errors[field].message) : undefined;
  return <div className="student-create-modal lecturer-create-modal" ref={root} onKeyDown={(event) => {
    if (event.key !== 'Tab') return;
    const elements = root.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)');
    const first = elements?.[0], last = elements?.[elements.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }}>
    <Modal open title={t('addLecturer.title')} description={t('addLecturer.description')} onClose={close} maxWidth="520px"
      headerIcon={<span className="student-create-header-icon"><UserPlus size={23} aria-hidden="true" /></span>}
      footer={<><Button variant="secondary" onClick={close} disabled={busy}>{t('common.cancel')}</Button>
        <Button type="submit" form="lecturer-create-form" loading={busy} disabled={busy || unknownResult} aria-label={t(busy ? 'addLecturer.creating' : 'addLecturer.submit')}>
          {t(busy ? 'addLecturer.creating' : 'addLecturer.submit')}
        </Button></>}>
      <form id="lecturer-create-form" noValidate onSubmit={(event) => { void handleSubmit(save)(event); }}>
        {serverError && <div role="alert" className="alert alert-error">{t(serverError)}</div>}
        <fieldset disabled={busy} className="lecturer-create-fields">
          <Input id="create-lecturer-code" label={t('addLecturer.code')} placeholder={t('addLecturer.codePlaceholder')} required autoFocus maxLength={50}
            hint={t('addLecturer.codeHint')} error={fieldError('code')} {...register('code', { validate: (value) => {
              if (!value.trim()) return 'addLecturer.required';
              return (value.trim().length >= 2 && value.trim().length <= 50) || 'addLecturer.invalid.code';
            } })} />
          <Input id="create-lecturer-email" type="email" label={t('addLecturer.email')} placeholder={t('addLecturer.emailPlaceholder')} required maxLength={254}
            error={fieldError('email')} {...register('email', { validate: (value) => {
              if (!value.trim()) return 'addLecturer.required';
              return (value.trim().length <= 254 && /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(value.trim())) || 'addLecturer.invalid.email';
            } })} />
        </fieldset>
        <p className="student-create-note">{t('addLecturer.hint')}</p>
      </form>
    </Modal>
  </div>;
}
