import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { User, Mail, IdCard, Layers, CalendarDays, Users, CheckCircle2, CircleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/app/providers/AuthContext';
import { useStudentProfile } from '@/features/students/hooks/useStudentProfile';
import { useLecturerProfile } from '@/features/lecturers/hooks/useLecturerProfile';
import type { ProfileInfo } from '@/features/students/api/profileApi';
import { getApiError } from '@/services/api/types';

export function AccountPopover({ onOpenProfile }: { onOpenProfile?: () => void }) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 340, maxHeight: 400 });
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useId();
  const cancelClose = () => { if (timer.current) clearTimeout(timer.current); };
  const closeSoon = () => { cancelClose(); timer.current = setTimeout(() => setOpen(false), 200); };
  const show = () => {
    cancelClose();
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(340, window.innerWidth - 16);
    const top = Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - 56));
    setPosition({ top, left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)), width,
      maxHeight: Math.max(40, window.innerHeight - top - 8) });
    setHasOpened(true);
    setOpen(true);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => {
    if (!open) return;
    const outside = (event: Event) => {
      const target = event.target as Node;
      if (!trigger.current?.contains(target) && !panel.current?.contains(target)) setOpen(false);
    };
    const close = (event: Event) => {
      if (event.type !== 'scroll' || !panel.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);
  const roles = user?.authorities || [];
  const role = roles.includes('ROLE_ADMIN') ? 'sidebar.adminRole' : roles.includes('ROLE_LECTURE_MASTER')
    ? 'lecturer.masterRole' : roles.includes('ROLE_LECTURE') ? 'lecturer.role' : roles.includes('ROLE_STUDENT')
    ? 'sidebar.studentRole' : 'studentProfile.account';
  const isStudent = role === 'sidebar.studentRole';
  const isLecturer = role === 'lecturer.role' || role === 'lecturer.masterRole';
  const query = useStudentProfile(hasOpened && isStudent);
  const lecturerQuery = useLecturerProfile(hasOpened && isLecturer);
  const lecturerProfile = isLecturer ? lecturerQuery.data : undefined;
  const activeQuery = isStudent ? query : lecturerQuery;
  const profile = isStudent ? query.data : undefined;
  const name = profile?.fullName?.trim() || lecturerProfile?.name?.trim() || user?.name?.trim() || t('studentProfile.missingName');
  const accountProfile = profile || lecturerProfile;
  const initials = (profile?.fullName || lecturerProfile?.name || user?.name || user?.email || '').trim().split(/\s+/)
    .filter(Boolean).slice(-2).map((part) => part.charAt(0).toUpperCase()).join('');
  const value = (info: ProfileInfo, emptyKey: string) => info.state === 'AVAILABLE' && info.name?.trim()
    ? info.name : t(info.state === 'UNASSIGNED' ? emptyKey : 'studentProfile.invalidLink');
  const fields = [
    { key: 'email', label: 'studentProfile.email', text: accountProfile?.email?.trim() || user?.email || t('studentProfile.unavailable'), icon: Mail },
    ...(lecturerProfile ? [{ key: 'code', label: 'lecturerProfile.code', text: lecturerProfile.code?.trim() || t('studentProfile.unavailable'), icon: IdCard }] : []),
    ...(profile ? [
      { key: 'studentId', label: 'studentProfile.studentId', text: profile.rollNumber?.trim() || t('studentProfile.unavailable'), icon: IdCard },
      { key: 'class', label: 'studentProfile.class', text: value(profile.schoolClass, 'studentProfile.noClass'), icon: Layers },
      { key: 'term', label: 'studentProfile.term', text: value(profile.term, 'studentProfile.noTerm'), icon: CalendarDays },
      { key: 'group', label: 'studentProfile.group', text: value(profile.group, 'accountPreview.noGroup'), icon: Users },
    ] : []),
  ];
  return <>
    <button ref={trigger} type="button" className="top-navbar-profile account-popover-trigger"
      aria-label={t(onOpenProfile ? 'studentProfile.open' : 'studentProfile.accountDetails')} aria-expanded={open} aria-describedby={open ? id : undefined}
      onMouseEnter={show} onMouseLeave={closeSoon} onFocus={show} onBlur={closeSoon}
      onClick={onOpenProfile ? () => { cancelClose(); setOpen(false); onOpenProfile(); } : show}
      onKeyDown={(event) => { if (event.key === 'Escape') { cancelClose(); setOpen(false); } }}>
      <User size={16} aria-hidden="true" /><span>{user?.name || user?.email || t('studentProfile.account')}</span>
    </button>
    {open && createPortal(<div ref={panel} id={id} role="tooltip" className="account-popover" style={position}
      onMouseEnter={cancelClose} onMouseLeave={closeSoon}>
      <div className="account-preview-heading">
        <div className="account-preview-avatar" aria-hidden="true">{initials || <User size={24} />}</div>
        <div className="account-preview-identity">
          <strong>{name}</strong>
          <span className="account-preview-role">{t(role)}</span>
          {accountProfile && <span className={`account-preview-status ${accountProfile.activated ? 'is-active' : 'is-pending'}`}>
            {accountProfile.activated ? <CheckCircle2 size={14} aria-hidden="true" /> : <CircleAlert size={14} aria-hidden="true" />}
            {t(accountProfile.activated ? 'studentProfile.active' : 'studentProfile.inactive')}
          </span>}
        </div>
      </div>
      <dl className="account-preview-fields">
        {fields.map(({ key, label, text, icon: Icon }) => <div key={key} className="account-preview-field">
          <Icon size={16} aria-hidden="true" />
          <div><dt>{t(label)}</dt><dd>{text}</dd></div>
        </div>)}
      </dl>
      {(isStudent || isLecturer) && !accountProfile && <p className="account-preview-note" role="status">
        {t(activeQuery.isError ? getApiError(activeQuery.error).status === 404 ? 'accountPreview.noProfile' : 'accountPreview.loadError' : 'accountPreview.loading')}
      </p>}
      {accountProfile && activeQuery.isError && <p className="account-preview-note" role="status">{t('accountPreview.refreshError')}</p>}
      {lecturerProfile && !lecturerProfile.profileComplete && <p className="account-preview-note" role="status">{t('lecturerProfile.incomplete')}</p>}
    </div>, document.body)}
  </>;
}
