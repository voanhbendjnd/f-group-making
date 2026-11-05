import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Tabs } from 'antd';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { RoleRoute } from '@/app/router/RoleRoute';
import { useAuth } from '@/app/providers/AuthContext';
import { useTerm } from '@/app/providers/TermContext';
import { useRealtime } from '@/app/providers/realtimeContext';
import { TermScope } from '@/features/terms/components/TermScope';
import { departmentApi } from '@/features/department/api/departmentApi';
import { DepartmentStatistics, DepartmentProgress } from '@/features/department/components/DepartmentStatistics';
import { ClassStudentsPanel } from '@/features/classes/components/ClassStudentsPanel';
import { ClassMajorDistributionCard } from '@/features/classes/components/ClassMajorDistributionCard';
import { ClassRulesDisclosure } from '@/features/rules/components/ClassRulesDisclosure';
import { ZaloManagementPanel } from '@/features/zalo/components/ZaloManagementPanel';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ErrorState } from '@/components/common/ErrorState';
import { EmptyState } from '@/components/common/EmptyState';
import { getApiError } from '@/services/api/types';
import { positiveId } from '@/features/group/navigation';
import './DepartmentOverviewPage.css';

export function DepartmentClassDetailPage() {
  return <RoleRoute requiredRole="ROLE_LECTURE_MASTER"><TermScope><ClassOverview /></TermScope></RoleRoute>;
}

function ClassOverview() {
  const { t } = useTranslation();
  const { id } = useParams();
  const classId = positiveId(id ?? null);
  const { user } = useAuth();
  const { selectedTermId } = useTerm();
  const { subscribe } = useRealtime();
  const query = useQuery({ queryKey: ['department-class-overview', user?.id, selectedTermId, classId],
    queryFn: ({ signal }) => departmentApi.detail(classId!, selectedTermId!, signal), enabled: classId !== null,
    retry: (count, error) => count < 1 && ![400, 401, 403, 404].includes(getApiError(error).status),
    refetchInterval: 60000, refetchOnWindowFocus: true });
  const loadedClassId = query.isSuccess ? query.data.schoolClass.id : null;
  useEffect(() => loadedClassId ? subscribe(`/topic/classes/${loadedClassId}/deadlines`) : undefined, [subscribe, loadedClassId]);
  const back = <Link to="/lecturer/department-overview" className="btn btn-secondary"><ArrowLeft size={16} />{t('departmentOverview.back')}</Link>;
  if (classId === null || query.isError) return <div className="department-page">{back}<ErrorState
    message={classId === null ? t('lecturer.classNotFound') : getApiError(query.error).message || t('errors.generalFailure')}
    onRetry={classId !== null ? () => void query.refetch() : undefined} /></div>;
  if (query.isPending || !query.data) return <LoadingSpinner message={t('lecturer.loadingClass')} />;
  const { schoolClass, statistics, groups, assignedStudentIds } = query.data;
  if (schoolClass.termId !== selectedTermId) return <div className="department-page">{back}<p role="alert">{t('terms.classOutsideTerm')}</p></div>;
  return <div className="department-page">
    <PageHeader title={schoolClass.name} description={t('departmentOverview.classDescription')}
      action={<div className="admin-inline-actions">{back}<Button variant="secondary" icon={<RefreshCw size={16} />} loading={query.isFetching} onClick={() => void query.refetch()}>{t('groupReview.refresh')}</Button></div>} />
    <p className="department-notice">{t('departmentOverview.readOnly')}</p>
    <dl className="card department-class-identity"><div><dt>{t('lecturer.term')}</dt><dd>{schoolClass.termName || t('lecturer.noTerm')}</dd></div>
      <div><dt>{t('classVisibility.lecturer')}</dt><dd>{schoolClass.lecturerName || schoolClass.lecturerCode || t('classVisibility.unassigned')}</dd></div>
      <div><dt>{t('departmentOverview.access')}</dt><dd><span className="badge badge-info">{t('classVisibility.readOnly')}</span></dd></div></dl>
    <DepartmentStatistics statistics={statistics} />
    <Tabs key={`${classId}:${selectedTermId}`} defaultActiveKey="overview" items={[
      { key: 'overview', label: t('departmentOverview.overview'), children: <div className="department-page">
        <DepartmentProgress statistics={statistics} />
        <ClassMajorDistributionCard classId={classId} className={schoolClass.name} assignedStudentIds={assignedStudentIds} />
      </div> },
      { key: 'groups', label: t('departmentOverview.groups'), children: <section className="card department-panel"><h2>{t('departmentOverview.groupList')}</h2>
        {!groups.length ? <EmptyState title={t('departmentOverview.noGroups')} description={t('departmentOverview.noGroupsHint')} />
          : <div className="table-container"><table className="table"><thead><tr><th>{t('groupReview.group')}</th><th>{t('groupReview.leader')}</th>
            <th>{t('groupReview.members')}</th><th>{t('groupReview.status')}</th><th>{t('departmentOverview.session')}</th></tr></thead>
            <tbody>{groups.map(group => <tr key={group.id}><th scope="row">{group.sequenceNo ? `G${String(group.sequenceNo).padStart(2, '0')} · ` : ''}{group.name}</th>
              <td>{group.leaderName || '—'}</td><td>{group.members}</td><td><span className={`badge ${group.status === 'ACCEPTED' ? 'badge-success' : 'badge-neutral'}`}>{t(`groupReview.statuses.${group.status}`)}</span></td><td>{group.deadlineName || '—'}</td></tr>)}</tbody></table></div>}
      </section> },
      { key: 'students', label: t('departmentOverview.students'), children: <ClassStudentsPanel classId={classId} /> },
      { key: 'rules', label: t('groupReview.rules'), children: <ClassRulesDisclosure classId={classId} readOnly /> },
      { key: 'zalo', label: t('zalo.title'), children: <ZaloManagementPanel target={{ scope: 'CLASS', classId, termId: selectedTermId! }} canManage={false} /> },
    ]} />
  </div>;
}
