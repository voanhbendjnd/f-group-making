import { IdCard, Mail } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/app/providers/AuthContext';
import { PageHeader } from '@/components/common/PageHeader';
import { ProfileHeader } from '@/components/common/ProfileHeader';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ErrorState } from '@/components/common/ErrorState';
import { useLecturerProfile } from '@/features/lecturers/hooks/useLecturerProfile';
import { getApiError } from '@/services/api/types';

export function LecturerProfilePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const allowed = Boolean(user?.authorities.some(role => role === 'ROLE_LECTURE' || role === 'ROLE_LECTURE_MASTER'));
  const profile = useLecturerProfile(allowed);
  const header = <PageHeader title={t('studentProfile.title')} description={t('lecturerProfile.description')} />;
  if (!allowed) return <div>{header}<ErrorState message={t('lecturerProfile.forbidden')} /></div>;
  if (profile.isPending) return <div>{header}<LoadingSpinner message={t('lecturerProfile.loading')} /></div>;
  if (profile.isError) {
    const status = getApiError(profile.error).status;
    return <div>{header}<ErrorState message={t(status === 403 ? 'lecturerProfile.forbidden' : status === 401 ? 'common.sessionExpired' : 'lecturerProfile.error')}
      onRetry={![401, 403].includes(status) ? () => { void profile.refetch(); } : undefined} /></div>;
  }
  const data = profile.data;
  const fields = [{ label: 'lecturerProfile.code', text: data.code?.trim() || t('studentProfile.unavailable'), icon: IdCard },
    { label: 'studentProfile.email', text: data.email?.trim() || t('studentProfile.unavailable'), icon: Mail }];
  return <div className="lecturer-profile-page">
    {header}
    <section className="card student-profile-card" aria-label={t('lecturerProfile.details')}>
      <ProfileHeader name={data.name?.trim() || t('studentProfile.missingName')}
        role={t(user?.authorities.includes('ROLE_LECTURE_MASTER') ? 'lecturer.masterRole' : 'lecturer.role')}
        activated={data.activated} initials={data.name?.trim().split(/\s+/).slice(-2).map(word => word[0].toUpperCase()).join('')} />
      {!data.profileComplete && <p role="status" className="alert alert-warning lecturer-profile-notice">{t('lecturerProfile.incomplete')}</p>}
      <dl className="student-profile-fields">{fields.map(({ label, text, icon: Icon }) => <div className="student-profile-field" key={label}>
        <div className="student-profile-field-icon" aria-hidden="true"><Icon size={20} /></div><div><dt>{t(label)}</dt><dd>{text}</dd></div>
      </div>)}</dl>
    </section>
  </div>;
}
