import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/common/Modal';
import { Button } from '@/components/common/Button';
import { useTerm } from '@/app/providers/TermContext';
import { useUnsavedChanges } from '@/app/providers/NavigationGuard';
import { lecturerApi } from '../api/lecturerApi';
import { getApiError } from '@/services/api/types';
import type { Lecturer, LecturerRole } from '../types';

export function EditLecturerRoleModal({ lecturer, onClose, onSaved }: {
  lecturer: Lecturer; onClose: () => void; onSaved: () => void;
}) {
  const { t } = useTranslation();
  const { lockTermSelection } = useTerm();
  const currentRole: LecturerRole = lecturer.authorities?.includes('ROLE_LECTURE_MASTER') ? 'ROLE_LECTURE_MASTER' : 'ROLE_LECTURE';
  const [role, setRole] = useState<LecturerRole>(currentRole);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const busy = useRef(false);
  const confirmDiscard = useUnsavedChanges(role !== currentRole, pending);
  const close = () => { if (!busy.current) confirmDiscard(onClose); };
  const save = async () => {
    if (busy.current || conflict || role === currentRole) return;
    busy.current = true; setPending(true); setError('');
    const release = lockTermSelection();
    try {
      await lecturerApi.updateRole(lecturer.userId, role, currentRole);
      onSaved();
    } catch (value) {
      const apiError = getApiError(value);
      setConflict(apiError.status === 409);
      setError(t(apiError.status === 409 ? 'facultyRole.conflict' : 'facultyRole.failed'));
    } finally { busy.current = false; setPending(false); release(); }
  };
  return <Modal open title={t('facultyRole.edit')} onClose={close} footer={<>
    <Button variant="secondary" disabled={pending} onClick={close}>{t('common.cancel')}</Button>
    <Button loading={pending} disabled={conflict || role === currentRole} onClick={() => void save()}>{t('facultyRole.save')}</Button>
  </>}>
    <p><strong>{lecturer.code}</strong> · {lecturer.name || lecturer.email}</p>
    <label htmlFor="faculty-role">{t('facultyRole.label')}</label>
    <select id="faculty-role" className="form-control" value={role} disabled={pending || conflict}
      onChange={event => setRole(event.target.value as LecturerRole)}>
      <option value="ROLE_LECTURE">{t('lecturer.role')}</option>
      <option value="ROLE_LECTURE_MASTER">{t('lecturer.masterRole')}</option>
    </select>
    <p className="form-hint">{t('facultyRole.scopeHint')}</p>
    <p className="alert alert-info">{t('facultyRole.sessionHint')}</p>
    {error && <p className="alert alert-error" role="alert">{error}</p>}
  </Modal>;
}
