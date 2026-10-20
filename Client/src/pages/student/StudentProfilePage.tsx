import { CalendarDays, GraduationCap, IdCard, Layers, Mail, Users } from 'lucide-react';
import { ProfileHeader } from '@/components/common/ProfileHeader';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/common/PageHeader';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ErrorState } from '@/components/common/ErrorState';
import { EmptyState } from '@/components/common/EmptyState';
import { useStudentProfile } from '@/features/students/hooks/useStudentProfile';
import type { ProfileInfo } from '@/features/students/api/profileApi';
import { getApiError } from '@/services/api/types';
import { StudentBioCard } from '@/features/group/components/StudentBioCard';

export function StudentProfilePage() {
  const { t } = useTranslation();
  const query = useStudentProfile();
  const header = <PageHeader title={t('studentProfile.title')} description={t('studentProfile.description')} />;
  if (query.isPending) return <div>{header}<LoadingSpinner message={t('studentProfile.loading')} /></div>;
  if (query.isError) {
    const status = getApiError(query.error).status;
    return <div>{header}{status === 404
      ? <EmptyState title={t('studentProfile.emptyTitle')} description={t('studentProfile.emptyDescription')} />
      : <ErrorState message={t(status === 403 ? 'studentProfile.forbidden' : status === 401 ? 'common.sessionExpired' : 'studentProfile.error')}
          onRetry={![401, 403].includes(status) ? () => { void query.refetch(); } : undefined} />}</div>;
  }
  const profile = query.data;
  const value = (info: ProfileInfo, emptyKey: string) => info.state === 'AVAILABLE' && info.name?.trim()
    ? info.name : t(info.state === 'MISSING' || info.state === 'AVAILABLE' ? 'studentProfile.invalidLink' : emptyKey);
  const name = profile.fullName?.trim() || t('studentProfile.missingName');
  const fields = [
    { label: 'studentProfile.studentId', text: profile.rollNumber?.trim() || t('studentProfile.unavailable'), icon: IdCard },
    { label: 'studentProfile.major', text: value(profile.major, 'studentProfile.noMajor'), icon: GraduationCap },
    { label: 'studentProfile.class', text: value(profile.schoolClass, 'studentProfile.noClass'), icon: Layers },
    { label: 'studentProfile.term', text: value(profile.term, 'studentProfile.noTerm'), icon: CalendarDays },
    { label: 'studentProfile.email', text: profile.email?.trim() || t('studentProfile.unavailable'), icon: Mail },
    { label: 'studentProfile.group', text: value(profile.group, 'studentProfile.noGroup'), icon: Users },
  ];
  return <div className="student-profile-page">
    {header}
    <section className="card student-profile-card" aria-label={t('studentProfile.details')}>
      <ProfileHeader name={name} role={t('sidebar.studentRole')} activated={profile.activated}
        initials={profile.fullName?.trim().charAt(0).toUpperCase()} fallback={<Users size={26} />} />
      <dl className="student-profile-fields">
        {fields.map(({ label, text, icon: Icon }) => <div key={label} className="student-profile-field">
          <div className="student-profile-field-icon" aria-hidden="true"><Icon size={20} /></div>
          <div><dt>{t(label)}</dt><dd>{text}</dd></div>
        </div>)}
      </dl>
    </section>
    <div style={{ marginTop: 20 }}>
      <StudentBioCard initialBio={profile.selfDescription} onBioUpdated={() => void query.refetch()} />
    </div>
  </div>;
}
