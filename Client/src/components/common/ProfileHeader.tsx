import type { ReactNode } from 'react';
import { CheckCircle2, CircleAlert, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function ProfileHeader({ name, role, activated, initials, fallback }: {
  name: string; role: string; activated: boolean; initials?: string; fallback?: ReactNode;
}) {
  const { t } = useTranslation();
  return <div className="student-profile-header">
    <div className="student-profile-avatar" aria-hidden="true">{initials || fallback || <UserRound size={26} />}</div>
    <div className="student-profile-identity"><h2>{name}</h2><p>{role}</p></div>
    <span className={`badge ${activated ? 'badge-success' : 'badge-warning'}`}>
      {activated ? <CheckCircle2 size={14} aria-hidden="true" /> : <CircleAlert size={14} aria-hidden="true" />}
      {t(activated ? 'studentProfile.active' : 'studentProfile.inactive')}
    </span>
  </div>;
}
