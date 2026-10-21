import { useEffect, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { GraduationCap, RefreshCw, Sparkles, UserPlus, UserRound } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/common/Modal';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { StudentFormSelect } from './StudentFormSelect';
import { generateMemberCode } from '../utils/memberCode';
import { useTerm } from '@/app/providers/TermContext';
import { getApiError } from '@/services/api/types';
import { studentApi } from '../api/studentApi';
import { useStudentCreateOptions } from '../hooks/useStudentCreateOptions';
import { useUnsavedChanges } from '@/app/providers/NavigationGuard';

interface FormValues {
  fullName: string;
  rollNumber: string;
  memberCode: string;
  email: string;
  majorId: string;
  termId: string;
  schoolClassId: string;
}

export function CreateStudentModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { t } = useTranslation();
  const { terms, currentTerm, selectedTermId: viewingTermId, isLoading, isError, refreshTerms, lockTermSelection } = useTerm();
  const [serverError, setServerError] = useState('');
  const [unknownResult, setUnknownResult] = useState(false);
  const [manualMemberCode, setManualMemberCode] = useState(false);
  const sending = useRef(false);
  const initializedTerm = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(document.activeElement as HTMLElement | null);
  const client = useQueryClient();
  const { register, handleSubmit, control, setValue, setError, clearErrors, formState: { errors, isSubmitting, isDirty } } = useForm<FormValues>({
    defaultValues: { fullName: '', rollNumber: '', memberCode: '', email: '', majorId: '', termId: '', schoolClassId: '' },
  });
  const selectedTermId = Number(useWatch({ control, name: 'termId' }));
  const classId = Number(useWatch({ control, name: 'schoolClassId' }));
  const fullName = useWatch({ control, name: 'fullName' });
  const rollNumber = useWatch({ control, name: 'rollNumber' });
  const suggestedMemberCode = generateMemberCode(fullName, rollNumber);
  useEffect(() => {
    if (!manualMemberCode) setValue('memberCode', suggestedMemberCode, { shouldValidate: false });
  }, [manualMemberCode, suggestedMemberCode, setValue]);
  const { majors, classes } = useStudentCreateOptions(selectedTermId);
  const selectedClass = classes.data?.find((value) => value.id === classId && value.termId === selectedTermId);
  const validLecturer = Boolean(selectedClass?.lecturerId && selectedClass.lecturerCode?.trim());
  const mutation = useMutation({ mutationFn: studentApi.createStudent, retry: false });

  useEffect(() => {
    if (initializedTerm.current || isLoading) return;
    initializedTerm.current = true;
    const initialTerm = viewingTermId ?? currentTerm?.id;
    if (initialTerm && terms.some(term => term.id === initialTerm)) setValue('termId', String(initialTerm));
  }, [currentTerm, viewingTermId, terms, isLoading, setValue]);
  useEffect(() => {
    const previous = previousFocus.current;
    return () => previous?.focus();
  }, []);

  const busy = isSubmitting || mutation.isPending;
  const discard = useUnsavedChanges(isDirty, busy);
  const close = () => { if (!busy) discard(onClose); };
  async function save(values: FormValues) {
    if (sending.current || unknownResult) return;
    if (!selectedClass || !validLecturer) {
      setError('schoolClassId', { message: 'addStudent.errors.lecturer' });
      return;
    }
    sending.current = true;
    const unlock = lockTermSelection();
    setServerError('');
    try {
      await mutation.mutateAsync({ fullName: values.fullName.trim(), rollNumber: values.rollNumber.trim(),
        memberCode: values.memberCode.trim(), email: values.email.trim().toLowerCase(),
        majorId: Number(values.majorId), termId: Number(values.termId), schoolClassId: Number(values.schoolClassId) });
    } catch (error) {
      const apiError = getApiError(error);
      const key = apiError.errorKey?.replace(/^error\./, '') || '';
      const fields: Record<string, keyof FormValues> = {
        fullName: 'fullName', rollNumber: 'rollNumber', memberCode: 'memberCode', email: 'email', majorId: 'majorId',
        originalMajor: 'majorId', schoolClassId: 'schoolClassId', groupName: 'schoolClassId', lecturer: 'schoolClassId', termId: 'termId',
      };
      const fieldKey = key.startsWith('studentCreate.') ? key.slice('studentCreate.'.length) : key === 'termNotFound' ? 'termId' : '';
      if (fields[fieldKey]) setError(fields[fieldKey], { message: `addStudent.errors.${fieldKey === 'originalMajor' ? 'majorId' : fieldKey === 'groupName' ? 'schoolClassId' : fieldKey}` });
      for (const violation of apiError.violations || []) {
        if (fields[violation.field]) setError(fields[violation.field], { message: `addStudent.errors.${fields[violation.field]}` });
      }
      const uncertain = apiError.outcomeUnknown || apiError.status === 0 || apiError.status >= 500;
      setUnknownResult(Boolean(uncertain));
      setServerError(uncertain ? 'addStudent.unknown' : apiError.status === 409 ? 'addStudent.conflict' : 'addStudent.failed');
      if (uncertain) void client.invalidateQueries({ queryKey: ['students'] });
      return;
    } finally {
      sending.current = false;
      unlock();
    }
    onSuccess();
  }

  const error = (field: keyof FormValues) => errors[field]?.message ? t(errors[field].message) : undefined;
  const optionsUnavailable = isLoading || isError || majors.isPending || majors.isError || !majors.data?.length
    || !selectedTermId || classes.isPending || classes.isError || !selectedClass || !validLecturer;
  const required = (value: string) => value.trim() ? true : 'addStudent.required';

  return <div className="student-create-modal" ref={root} onKeyDown={(event) => {
    if (event.key !== 'Tab') return;
    const elements = root.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]');
    const first = elements?.[0], last = elements?.[elements.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }}>
    <Modal open onClose={close} title={t('addStudent.title')} description={t('addStudent.description')}
      headerIcon={<span className="student-create-header-icon"><UserPlus size={23} aria-hidden="true" /></span>} maxWidth="680px" footer={<>
      <Button variant="secondary" onClick={close} disabled={busy}>{t('common.cancel')}</Button>
      <Button type="submit" form="student-create-form" loading={busy} disabled={busy || optionsUnavailable || unknownResult}>{t('addStudent.submit')}</Button>
    </>}>
      <form id="student-create-form" noValidate onSubmit={(event) => { void handleSubmit(save)(event); }}>
        {serverError && <div className="alert alert-error" role="alert">{t(serverError)}</div>}
        <fieldset disabled={busy} className="student-create-section">
          <legend><UserRound size={17} aria-hidden="true" />{t('addStudent.studentInformation')}</legend>
          <div className="student-create-fields">
          <Input id="create-student-name" label={t('addStudent.fullName')} placeholder={t('addStudent.namePlaceholder')} required autoFocus maxLength={50}
            error={error('fullName')} {...register('fullName', { validate: required, maxLength: { value: 50, message: 'addStudent.errors.fullName' } })} />
          <Input id="create-student-roll" label={t('addStudent.rollNumber')} placeholder={t('addStudent.rollPlaceholder')} required maxLength={255}
            error={error('rollNumber')} {...register('rollNumber', { validate: required, maxLength: { value: 255, message: 'addStudent.errors.rollNumber' } })} />
          <Input id="create-student-email" type="email" label={t('addStudent.email')} placeholder={t('addStudent.emailPlaceholder')} required maxLength={254}
            error={error('email')} {...register('email', { validate: (value) => {
              if (!value.trim()) return 'addStudent.required';
              return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(value.trim()) || 'addStudent.errors.email';
            }, maxLength: { value: 254, message: 'addStudent.errors.email' } })} />
          <div className={`student-create-member${manualMemberCode ? ' is-manual' : ''}`}>
            <Input id="create-student-member" label={t('addStudent.memberCode')} placeholder={t('addStudent.memberPlaceholder')} required maxLength={255}
              hint={t(manualMemberCode ? 'addStudent.manualHint' : suggestedMemberCode ? 'addStudent.autoHint' : 'addStudent.autoWaiting')}
              error={error('memberCode')} {...register('memberCode', { validate: required, maxLength: { value: 255, message: 'addStudent.errors.memberCode' } })}
              onChange={(event) => { setManualMemberCode(true); void register('memberCode').onChange(event); }} />
            <div className="student-create-member-actions">
              <span className="student-create-mode"><Sparkles size={13} aria-hidden="true" />{t(manualMemberCode ? 'addStudent.manual' : 'addStudent.automatic')}</span>
              <button type="button" className="student-create-regenerate" disabled={busy || !suggestedMemberCode}
                onClick={() => { setManualMemberCode(false); setValue('memberCode', suggestedMemberCode, { shouldDirty: true, shouldValidate: true }); }}>
                <RefreshCw size={13} aria-hidden="true" />{t('addStudent.regenerate')}
              </button>
            </div>
          </div>
          </div>
        </fieldset>
        <fieldset disabled={busy} className="student-create-section">
          <legend><GraduationCap size={18} aria-hidden="true" />{t('addStudent.academicInformation')}</legend>
          <div className="student-create-fields">
          <Controller name="majorId" control={control} rules={{ validate: required }} render={({ field }) => <StudentFormSelect {...field}
            id="create-student-major" label={t('addStudent.major')} disabled={busy || majors.isError} loading={majors.isPending}
            placeholder={t(majors.isPending ? 'addStudent.loadingMajors' : 'addStudent.chooseMajor')}
            options={(majors.data || []).map((major) => ({ value: String(major.id), label: `${major.code} — ${major.name}` }))} error={error('majorId')} />} />
          <Controller name="termId" control={control} rules={{ validate: required }} render={({ field }) => <StudentFormSelect {...field}
            id="create-student-term" label={t('addStudent.term')} disabled={busy || isError} loading={isLoading}
            placeholder={t(isLoading ? 'addStudent.loadingTerms' : 'addStudent.chooseTerm')}
            options={terms.map((term) => ({ value: String(term.id), label: term.name, badge: term.id === currentTerm?.id ? t('terms.current') : undefined }))}
            error={error('termId')} onChange={(value) => {
              field.onChange(value); initializedTerm.current = true;
              setValue('schoolClassId', ''); clearErrors(['schoolClassId', 'termId']);
            }} />} />
          <Controller name="schoolClassId" control={control} rules={{ validate: required }} render={({ field }) => <StudentFormSelect {...field}
            id="create-student-class" label={t('addStudent.class')} disabled={busy || !selectedTermId || classes.isError}
            loading={selectedTermId > 0 && classes.isPending} placeholder={t(classes.isFetching && selectedTermId ? 'addStudent.loadingClasses' : 'addStudent.chooseClass')}
            options={(classes.data || []).map((value) => ({ value: String(value.id), label: value.name }))} error={error('schoolClassId')} />} />
          <Input id="create-student-lecturer" label={t('addStudent.lecturer')} readOnly
            value={selectedClass ? selectedClass.lecturerName || selectedClass.lecturerCode || t('addStudent.noLecturer') : t('addStudent.chooseClassFirst')}
            hint={selectedClass && !validLecturer ? t('addStudent.noLecturer') : undefined} />
          </div>
        </fieldset>
        <p className="student-create-note">{t('addStudent.hint')}</p>
        {!isLoading && !isError && terms.length === 0 && <p role="status" className="form-hint">{t('addStudent.noTerms')}</p>}
        {!majors.isPending && !majors.isError && !majors.data?.length && <p role="status" className="form-hint">{t('addStudent.noMajors')}</p>}
        {selectedTermId > 0 && classes.isSuccess && classes.data.length === 0 && <p role="status" className="form-hint">{t('addStudent.noClasses')}</p>}
        {(isError || majors.isError || (selectedTermId > 0 && classes.isError)) && <div className="alert alert-error" role="alert">
          {t('addStudent.optionsFailed')} <Button variant="secondary" size="sm" disabled={busy} onClick={() => {
            if (isError) void refreshTerms(); if (majors.isError) void majors.refetch(); if (classes.isError) void classes.refetch();
          }}>{t('common.retry')}</Button>
        </div>}
      </form>
    </Modal>
  </div>;
}
