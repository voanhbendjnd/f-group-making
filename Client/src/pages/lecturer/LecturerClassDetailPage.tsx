import { useTerm } from '@/app/providers/TermContext';
import { TermScope } from '@/features/terms/components/TermScope';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Users } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ErrorState } from '@/components/common/ErrorState';
import { classApi } from '@/features/classes/api/classApi';
import { ClassStudentsPanel } from '@/features/classes/components/ClassStudentsPanel';
import { ClassRulesDisclosure } from '@/features/rules/components/ClassRulesDisclosure';
import { getApiError } from '@/services/api/types';
import { useAuth } from '@/app/providers/AuthContext';
import { canManageClassRules } from '@/features/auth/utils/roleRouting';
import { advancedGroupPath } from '@/features/group/navigation';

export function LecturerClassDetailPage() {
  return <TermScope><LecturerClassDetailPageContent /></TermScope>;
}

function LecturerClassDetailPageContent() {
  const { selectedTermId } = useTerm();
  const { id } = useParams();
  const { user } = useAuth();
  const classId = Number(id);
  const validId = Boolean(id && /^\d+$/.test(id) && Number.isSafeInteger(classId) && classId > 0);
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ['school-class', selectedTermId, classId],
    queryFn: ({ signal }) => classApi.getClassById(classId, signal),
    enabled: validId,
    retry: (count, error) => count < 1 && ![401, 403, 404].includes(getApiError(error).status),
  });
  const back = <Link to="/lecturer/classes" className="btn btn-secondary"><ArrowLeft size={18} aria-hidden="true" />{t('lecturer.back')}</Link>;
  const actionButtons = (
    <div style={{ display: 'flex', gap: '8px' }}>
      {back}
      <Link to={advancedGroupPath(classId, new URLSearchParams({ termId: String(selectedTermId) }))} className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
        <Users size={18} aria-hidden="true" />
        {t('groupBoard.open')}
      </Link>
    </div>
  );

  if (!validId || query.isError) {
    const error = getApiError(query.error);
    return <div className="space-y-6"><PageHeader title={t('lecturer.detailTitle')} action={back} />
      <div className="card lecturer-card"><ErrorState message={validId ? error.message || t('lecturer.loadFailed') : t('lecturer.classNotFound')}
        onRetry={validId && ![401, 403, 404].includes(error.status) ? () => { void query.refetch(); } : undefined} /></div></div>;
  }
  if (query.isPending || !query.data) return <LoadingSpinner message={t('lecturer.loadingClass')} />;
  const schoolClass = query.data;
  if (schoolClass.termId !== selectedTermId) return <div className="card lecturer-card">
    <p role="alert">{t('terms.classOutsideTerm')}</p>{back}
  </div>;
  const readOnly = !canManageClassRules(user, schoolClass.lecturerId);
  return <div className="space-y-6 lecturer-page">
    <PageHeader title={t('lecturer.classTitle', { name: schoolClass.name })}
      description={t(readOnly ? 'lecturer.readOnlyDetailDescription' : 'lecturer.detailDescription')} action={actionButtons} />
    <dl className="card lecturer-card lecturer-overview">
      <div><dt>{t('lecturer.term')}</dt><dd>{schoolClass.termName || t('lecturer.noTerm')}</dd></div>
      <div><dt>{t('lecturer.studentCount')}</dt><dd>{t('lecturer.students', { count: schoolClass.studentCount })}</dd></div>
      <div><dt>{t('lecturer.assignedLecturer')}</dt><dd>{schoolClass.lecturerName || schoolClass.lecturerCode || '—'}</dd></div>
    </dl>
    <ClassRulesDisclosure key={`${classId}-${readOnly}`} classId={classId} readOnly={readOnly} />
    <ClassStudentsPanel key={classId} classId={classId} />
  </div>;
}
