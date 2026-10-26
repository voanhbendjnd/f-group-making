import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Alert, Empty, Segmented, Select } from 'antd';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/app/providers/AuthContext';
import { useTerm } from '@/app/providers/TermContext';
import { PageHeader } from '@/components/common/PageHeader';
import { TermScope } from '@/features/terms/components/TermScope';
import { classApi } from '@/features/classes/api/classApi';
import { lecturerApi } from '@/features/lecturers/api/lecturerApi';
import { ZaloManagementPanel } from '@/features/zalo/components/ZaloManagementPanel';
import { zaloError } from '@/features/zalo/api/zaloErrors';
import type { ZaloTarget } from '@/features/zalo/api/zaloApi';

export function LecturerZaloPage() {
  return <TermScope><ZaloPageContent /></TermScope>;
}

function ZaloPageContent() {
  const { t } = useTranslation(); const { user, isAdmin } = useAuth(); const { selectedTermId, isLocked } = useTerm();
  const [params] = useSearchParams();
  const requestedClass = Number(params.get('classId'));
  const [scope, setScope] = useState<'LECTURER' | 'CLASS'>(params.get('scope') === 'CLASS' ? 'CLASS' : 'LECTURER');
  const [classId, setClassId] = useState<number | null>(Number.isSafeInteger(requestedClass) && requestedClass > 0 ? requestedClass : null);
  const [lecturerId, setLecturerId] = useState<number | null>(isAdmin ? null : user?.id ?? null);
  const [classSearch, setClassSearch] = useState(''); const [lecturerSearch, setLecturerSearch] = useState('');
  const classes = useQuery({ queryKey: ['zalo-class-options', user?.id, selectedTermId, classSearch],
    queryFn: ({ signal }) => (isAdmin ? classApi.getClasses : classApi.getMyClasses)({ termId: selectedTermId!, search: classSearch, size: 50 }, signal),
    enabled: scope === 'CLASS', retry: false });
  const lecturers = useQuery({ queryKey: ['zalo-lecturer-options', user?.id, lecturerSearch],
    queryFn: () => lecturerApi.getLecturers({ search: lecturerSearch, size: 50 }), enabled: isAdmin && scope === 'LECTURER', retry: false });
  const selectedClass = useQuery({ queryKey: ['school-class', selectedTermId, classId],
    queryFn: ({ signal }) => classApi.getClassById(classId!, signal), enabled: scope === 'CLASS' && classId !== null, retry: false });
  const classAllowed = selectedClass.data?.termId === selectedTermId
    && (isAdmin || selectedClass.data?.lecturerId === user?.id);
  const target: ZaloTarget | null = scope === 'LECTURER'
    ? lecturerId ? { scope, lecturerId, termId: selectedTermId! } : null
    : classId && classAllowed ? { scope, classId, termId: selectedTermId! } : null;
  const classOptions = classes.data?.result ?? [];
  const selected = selectedClass.data;
  const options = selected && classAllowed && !classOptions.some(item => item.id === selected.id) ? [selected, ...classOptions] : classOptions;
  return <div className="space-y-6">
    <PageHeader title={t('zalo.title')} description={t('zalo.pageDescription')} />
    <section className="card zalo-management">
      <Segmented<'LECTURER' | 'CLASS'> block value={scope} disabled={isLocked}
        options={[{ label: t(isAdmin ? 'zalo.lecturerScope' : 'zalo.myLecturerScope'), value: 'LECTURER' }, { label: t('zalo.classScope'), value: 'CLASS' }]}
        onChange={setScope} />
      {scope === 'CLASS' && <div className="zalo-target-select"><label htmlFor="zalo-class-select">{t('zalo.selectClass')}</label>
        <Select id="zalo-class-select" value={classId} disabled={isLocked} showSearch filterOption={false} onSearch={setClassSearch}
          loading={classes.isFetching || selectedClass.isFetching} placeholder={t('zalo.selectClass')} onChange={setClassId}
          options={options.map(item => ({ value: item.id, label: `${item.name} · ${item.termName || t('lecturer.noTerm')}` }))}
          notFoundContent={t(classes.isError ? 'zalo.loadFailed' : 'zalo.noClasses')} />
        <span className="zalo-helper">{t('zalo.searchHint')}</span></div>}
      {scope === 'LECTURER' && isAdmin && <div className="zalo-target-select"><label htmlFor="zalo-lecturer-select">{t('zalo.selectLecturer')}</label>
        <Select id="zalo-lecturer-select" value={lecturerId} disabled={isLocked} showSearch filterOption={false} onSearch={setLecturerSearch}
          loading={lecturers.isFetching} placeholder={t('zalo.selectLecturer')} onChange={setLecturerId}
          options={lecturers.data?.result.map(item => ({ value: item.userId, label: `${item.name} · ${item.code}` }))}
          notFoundContent={t(lecturers.isError ? 'zalo.loadFailed' : 'zalo.noLecturers')} /></div>}
      {scope === 'CLASS' && selectedClass.isError && <Alert type="error" showIcon title={zaloError(selectedClass.error, t)} />}
      {scope === 'CLASS' && selectedClass.data && !classAllowed && <Alert type="warning" showIcon title={t('zalo.errors.zaloInvalidScope')} />}
    </section>
    {target ? <ZaloManagementPanel key={JSON.stringify(target)} target={target} />
      : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t(scope === 'CLASS' ? 'zalo.chooseClassFirst' : 'zalo.chooseLecturerFirst')} />}
  </div>;
}
