import { useId, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useTerm } from '@/app/providers/TermContext';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { Select } from '@/components/common/Select';
import { Pagination } from '@/components/common/Pagination';
import { ErrorState } from '@/components/common/ErrorState';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { lecturerApi } from '@/features/lecturers/api/lecturerApi';
import { getApiError } from '@/services/api/types';
import { classApi } from '../api/classApi';
import type { SchoolClass } from '../types';

export function ClassLecturerAssignment({ schoolClass }: { schoolClass: SchoolClass }) {
  const { t } = useTranslation();
  const { selectedTermId, lockTermSelection } = useTerm();
  const client = useQueryClient();
  const selectId = useId();
  const busy = useRef(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [lecturerId, setLecturerId] = useState('');
  const [notice, setNotice] = useState<{ key: string; message?: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const [needsReload, setNeedsReload] = useState(false);
  const [reloading, setReloading] = useState(false);
  const assigned = schoolClass.lecturerId !== null;
  const list = useQuery({
    // Global catalog includes lecturers who do not have a class in the selected term yet.
    queryKey: ['lecturers', 'class-assignment', search, page],
    queryFn: () => lecturerApi.getLecturers({ search, page, size: 10 }),
    retry: false,
  });
  const updateClass = (data: SchoolClass) => {
    client.setQueriesData<SchoolClass>({ queryKey: ['school-class'] }, previous =>
      previous?.id === data.id ? data : previous);
    client.setQueryData(['school-class', selectedTermId, schoolClass.id], data);
    void client.invalidateQueries({ queryKey: ['school-classes'] });
    void client.invalidateQueries({ queryKey: ['my-school-classes'] });
    void client.invalidateQueries({ queryKey: ['lecturers'] });
  };
  const mutation = useMutation({
    mutationFn: (id: number) => classApi.assignLecturer(schoolClass.id, id, schoolClass.lecturerId),
    retry: false,
  });
  const submit = async () => {
    const id = Number(lecturerId);
    if (busy.current || needsReload || id === schoolClass.lecturerId || !Number.isSafeInteger(id) || id <= 0
        || !list.data?.result.some(lecturer => lecturer.userId === id)) return;
    busy.current = true;
    const release = lockTermSelection();
    setNotice(null);
    setSaved(false);
    try {
      const data = await mutation.mutateAsync(id);
      updateClass(data);
      setLecturerId('');
      setSaved(true);
    } catch (value) {
      const error = getApiError(value);
      const unknown = error.outcomeUnknown || error.status === 0 || error.status >= 500;
      setNeedsReload(unknown || [401, 403, 404, 409].includes(error.status));
      setNotice({ key: error.status === 409 ? 'classAssignment.conflict'
        : unknown ? 'classAssignment.unknown' : 'classAssignment.failed', message: error.message });
    } finally {
      busy.current = false;
      release();
    }
  };
  const reload = async () => {
    if (busy.current) return;
    busy.current = true;
    setReloading(true);
    const release = lockTermSelection();
    try {
      const data = await classApi.getClassById(schoolClass.id);
      if (!data || data.id !== schoolClass.id || data.termId !== selectedTermId) throw new Error();
      updateClass(data);
      setNeedsReload(false);
      setNotice(null);
      if (data.lecturerId !== schoolClass.lecturerId) setLecturerId('');
    } catch {
      setNotice({ key: 'classAssignment.reloadFailed' });
    } finally {
      busy.current = false;
      setReloading(false);
      release();
    }
  };
  return <section className="card lecturer-card class-lecturer-assignment" aria-labelledby={`${selectId}-title`}>
    <h3 id={`${selectId}-title`}>{t('classAssignment.title')}</h3>
    {saved && <p role="status" className="alert alert-success">{t('classAssignment.saved')}</p>}
    {assigned && <>
      <p className="class-lecturer-name">{[schoolClass.lecturerCode, schoolClass.lecturerName, schoolClass.lecturerEmail]
        .filter(Boolean).join(' · ') || t('classAssignment.assigned')}</p>
    </>}
    <>
      <p className="form-hint">{t('classAssignment.hint')}</p>
      {notice && <p role="alert" className="alert alert-error">{t(notice.key, { message: notice.message })}</p>}
      {needsReload && <Button type="button" variant="secondary" loading={reloading} onClick={() => void reload()}>
        {t('classAssignment.reload')}
      </Button>}
      <fieldset disabled={mutation.isPending || reloading || needsReload} className="class-assignment-fields">
        <form className="class-assignment-search" onSubmit={event => {
          event.preventDefault(); setSearch(searchInput.trim()); setPage(1); setLecturerId('');
        }}>
          <Input label={t('classAssignment.search')} placeholder={t('classAssignment.searchPlaceholder')}
            value={searchInput} onChange={event => setSearchInput(event.target.value)} />
          <Button type="submit" variant="secondary">{t('classAssignment.searchButton')}</Button>
        </form>
        {list.isPending ? <LoadingSpinner message={t('classAssignment.loading')} />
          : list.isError ? <ErrorState message={getApiError(list.error).message || t('classAssignment.loadFailed')}
            onRetry={() => void list.refetch()} /> : <>
            <Select id={selectId} label={t('classAssignment.select')} value={lecturerId}
              onChange={event => setLecturerId(event.target.value)} options={[
                { value: '', label: t('classAssignment.placeholder') },
                ...(list.data?.result ?? []).map(lecturer => ({ value: lecturer.userId,
                  label: [lecturer.code, lecturer.name, lecturer.email].filter(Boolean).join(' · ') })),
              ]} />
            {!list.data?.result.length && <p>{t('classAssignment.empty')}</p>}
            {list.data && <Pagination meta={list.data.meta} currentPage={page}
              onPageChange={next => { setPage(next); setLecturerId(''); }} />}
            <Button type="button" loading={mutation.isPending}
              disabled={!lecturerId || Number(lecturerId) === schoolClass.lecturerId || list.isFetching}
              onClick={() => void submit()}>{t('classAssignment.save')}</Button>
          </>}
      </fieldset>
    </>
  </section>;
}
