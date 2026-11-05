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
import { ClassScopeFilter, useClassScope } from '@/features/classes/components/ClassScopeFilter';
import { canManageClassRules } from '@/features/auth/utils/roleRouting';

export function LecturerZaloPage() {
  return <TermScope><ZaloPageContent /></TermScope>;
}

function ZaloPageContent() {
  const { t } = useTranslation(); const { user, isAdmin } = useAuth(); const { selectedTermId, isLocked } = useTerm();
  const { viewAll, classScope, setClassScope, scopeParams } = useClassScope();
  const [params] = useSearchParams();
  const requestedClass = Number(params.get('classId'));
  const [scope, setScope] = useState<'LECTURER' | 'CLASS'>(params.get('scope') === 'CLASS' ? 'CLASS' : 'LECTURER');
  const [classId, setClassId] = useState<number | null>(Number.isSafeInteger(requestedClass) && requestedClass > 0 ? requestedClass : null);
  const [lecturerId, setLecturerId] = useState<number | null>(isAdmin ? null : user?.id ?? null);
  const [classSearch, setClassSearch] = useState(''); const [lecturerSearch, setLecturerSearch] = useState('');
  const classes = useQuery({ queryKey: ['zalo-class-options', user?.id, selectedTermId, classSearch, classScope],
    queryFn: async ({ signal }) => {
      const fetchClasses = viewAll ? classApi.getClasses : classApi.getMyClasses;
      const filters = { termId: selectedTermId!, ...scopeParams, search: classSearch, size: 50 };
      const first = await fetchClasses(filters, signal);
      const result = [...first.result];
      for (let page = 2; page <= first.meta.pages; page++) result.push(...(await fetchClasses({ ...filters, page }, signal)).result);
      return { ...first, result };
    },
    enabled: scope === 'CLASS', retry: false });
  const lecturers = useQuery({ queryKey: ['zalo-lecturer-options', user?.id, lecturerSearch],
    queryFn: async () => {
      const fetchLecturers = isAdmin ? lecturerApi.getLecturers : lecturerApi.getOptions;
      const first = await fetchLecturers({ search: lecturerSearch, size: 50 });
      const result = [...first.result];
      for (let page = 2; page <= first.meta.pages; page++) result.push(...(await fetchLecturers({ search: lecturerSearch, size: 50, page })).result);
      return { ...first, result };
    }, enabled: viewAll && scope === 'LECTURER', retry: false });
  const selectedClass = useQuery({ queryKey: ['school-class', user?.id, selectedTermId, classId],
    queryFn: ({ signal }) => classApi.getClassById(classId!, signal), enabled: scope === 'CLASS' && classId !== null, retry: false });
  const classAllowed = selectedClass.data?.termId === selectedTermId
    && (viewAll || selectedClass.data?.lecturerId === user?.id);
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
        options={[{ label: t(viewAll ? 'zalo.lecturerScope' : 'zalo.myLecturerScope'), value: 'LECTURER' }, { label: t('zalo.classScope'), value: 'CLASS' }]}
        onChange={setScope} />
      {scope === 'CLASS' && viewAll && <ClassScopeFilter value={classScope} disabled={isLocked} onChange={scope => { setClassScope(scope); setClassId(null); }} />}
      {scope === 'CLASS' && <div className="zalo-target-select"><label htmlFor="zalo-class-select">{t('zalo.selectClass')}</label>
        <Select id="zalo-class-select" value={classId} disabled={isLocked} showSearch filterOption={false} onSearch={setClassSearch}
          loading={classes.isFetching || selectedClass.isFetching} placeholder={t('zalo.selectClass')} onChange={setClassId}
          options={options.map(item => ({ value: item.id, label: `${item.name} · ${item.termName || t('lecturer.noTerm')}` }))}
          notFoundContent={t(classes.isError ? 'zalo.loadFailed' : 'zalo.noClasses')} />
        <span className="zalo-helper">{t('zalo.searchHint')}</span></div>}
      {scope === 'LECTURER' && viewAll && <div className="zalo-target-select"><label htmlFor="zalo-lecturer-select">{t('zalo.selectLecturer')}</label>
        <Select id="zalo-lecturer-select" value={lecturerId} disabled={isLocked} showSearch filterOption={false} onSearch={setLecturerSearch}
          loading={lecturers.isFetching} placeholder={t('zalo.selectLecturer')} onChange={setLecturerId}
          options={lecturers.data?.result.map(item => ({ value: item.userId, label: `${item.name} · ${item.code}` }))}
          notFoundContent={t(lecturers.isError ? 'zalo.loadFailed' : 'zalo.noLecturers')} /></div>}
      {scope === 'CLASS' && selectedClass.isError && <Alert type="error" showIcon title={zaloError(selectedClass.error, t)} />}
      {scope === 'CLASS' && selectedClass.data && !classAllowed && <Alert type="warning" showIcon title={t('zalo.errors.zaloInvalidScope')} />}
    </section>
    {target ? <ZaloManagementPanel key={JSON.stringify(target)} target={target} canManage={target.scope === 'CLASS'
      ? canManageClassRules(user, selectedClass.data?.lecturerId ?? null) : isAdmin || target.lecturerId === user?.id} />
      : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t(scope === 'CLASS' ? 'zalo.chooseClassFirst' : 'zalo.chooseLecturerFirst')} />}
  </div>;
}
