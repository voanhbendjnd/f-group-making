import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { Modal } from '@/components/common/Modal';
import { majorApi } from '../api/majorApi';
import { getMajorErrorKey } from '../utils/majorErrors';
import type { Major, MajorFormValues } from '../types';

interface MajorFormModalProps {
  major: Major | null;
  onClose: () => void;
  onSuccess: (isEdit: boolean) => void;
}

export function MajorFormModal({ major, onClose, onSuccess }: MajorFormModalProps) {
  const { t } = useTranslation();
  const [serverErrorKey, setServerErrorKey] = useState('');
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<MajorFormValues>({
    defaultValues: { code: major?.code || '', name: major?.name || '' },
  });

  async function saveMajor(values: MajorFormValues) {
    setServerErrorKey('');
    const payload = { code: values.code.trim().toUpperCase(), name: values.name.trim() };
    try {
      if (major) {
        await majorApi.updateMajor(major.id, payload);
      } else {
        await majorApi.createMajor(payload);
      }
    } catch (error) {
      setServerErrorKey(getMajorErrorKey(error));
      return;
    }
    onSuccess(major !== null);
  }

  function closeModal() {
    if (!isSubmitting) onClose();
  }

  return (
    <Modal open onClose={closeModal} title={t(major ? 'majors.editTitle' : 'majors.createTitle')}
      footer={
        <>
          <Button variant="secondary" onClick={closeModal} disabled={isSubmitting}>{t('common.cancel')}</Button>
          <Button type="submit" form="major-form" loading={isSubmitting}>{t('common.save')}</Button>
        </>
      }>
      <form id="major-form" noValidate onSubmit={handleSubmit(saveMajor)}>
        {serverErrorKey && <div className="alert alert-error" role="alert">{t(serverErrorKey)}</div>}
        <Input id="major-code" label={t('majors.code')} placeholder={t('majors.codePlaceholder')}
          required maxLength={20} disabled={isSubmitting} autoFocus
          hint={t('majors.codeHint')} error={errors.code?.message ? t(errors.code.message) : undefined}
          {...register('code', {
            validate: (value) => {
              if (!value.trim()) return 'majors.validation.codeRequired';
              if (!/^[A-Z0-9][A-Z0-9-]{0,19}$/.test(value.trim().toUpperCase())) return 'majors.validation.codeLength';
              return true;
            },
          })} />
        <Input id="major-name" label={t('majors.name')} placeholder={t('majors.namePlaceholder')}
          required maxLength={50} disabled={isSubmitting}
          hint={t('majors.nameHint')} error={errors.name?.message ? t(errors.name.message) : undefined}
          {...register('name', {
            validate: (value) => {
              if (!value.trim()) return 'majors.validation.nameRequired';
              if (value.trim().length < 1 || value.trim().length > 50) return 'majors.validation.nameLength';
              return true;
            },
          })} />
        {major && <p className="form-hint">{t('majors.editNotice')}</p>}
      </form>
    </Modal>
  );
}
