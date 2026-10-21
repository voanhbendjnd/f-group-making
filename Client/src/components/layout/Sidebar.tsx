import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  Users,
  LogOut,
  Sparkles,
  ShieldCheck,
  UserCheck,
  GraduationCap,
  Layers,
  Clock,
} from 'lucide-react';
import { useAuth } from '@/app/providers/AuthContext';
import { TermSelect } from '@/features/terms/components/TermSelect';
import { useNavigationGuard } from '@/app/providers/NavigationGuard';

export interface SidebarProps {
  area?: 'admin' | 'lecturer' | 'student';
  showTermFilter?: boolean;
  isOpen?: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  area,
  isOpen,
  onClose,
  showTermFilter = false,
}) => {
  const { user, isAdmin: hasAdminRole, logout } = useAuth();
  const isAdmin = area ? area === 'admin' : hasAdminRole;
  const isLecturer = area === 'lecturer';
  const isStudentArea = !isAdmin && !isLecturer;
  const lecturerProfile = isLecturer && Boolean(user?.authorities?.some(role => role === 'ROLE_LECTURE' || role === 'ROLE_LECTURE_MASTER'));
  const profilePath = isStudentArea ? '/student/profile' : lecturerProfile ? '/lecturer/profile' : null;
  const FooterProfile = profilePath ? 'button' : 'div';
  const isMaster = Boolean(user?.authorities?.includes('ROLE_LECTURE_MASTER'));

  const navigate = useNavigate();
  const { t } = useTranslation();
  const requestLeave = useNavigationGuard();

  const handleLogout = () => {
    requestLeave(() => { logout(); navigate('/login'); });
  };

  const navItems: Array<{ to: string; label: string; icon: React.ReactNode; group?: string }> = isAdmin
    ? [
        {
          to: '/admin/dashboard',
          group: 'adminUx.navigationOperations',
          label: t('nav.dashboard'),
          icon: <LayoutDashboard size={18} />,
        },
        { to: '/admin/deadlines', label: t('nav.adminDeadlines'), icon: <Clock size={18} /> },
        {
          to: '/admin/classes',
          group: 'adminUx.navigationClasses',
          label: t('classes.label'),
          icon: <Layers size={18} />,
        },
        { to: '/admin/group-review', label: t('groupReview.title'), icon: <Users size={18} /> },
        {
          to: '/admin/students',
          group: 'adminUx.navigationPeople',
          label: t('nav.students'),
          icon: <Users size={18} />,
        },
        {
          to: '/admin/lecturers',
          label: t('lecturer.role'),
          icon: <UserCheck size={18} />,
        },
        { to: '/admin/majors', label: t('majors.navLabel'), icon: <GraduationCap size={18} />, group: 'adminUx.navigationCatalog' },
      ]
    : isLecturer ? [
        { to: '/lecturer/group-review', label: t('groupReview.title'), icon: <Users size={18} /> },
        { to: '/lecturer/deadlines', label: t('nav.lecturerDeadlines'), icon: <Clock size={18} /> },
        { to: '/lecturer/automatic-allocation', label: t('allocation.title'), icon: <Sparkles size={18} /> },
        { to: '/lecturer/classes', label: t('lecturer.classesAndRules'), icon: <Layers size={18} /> },
      ] : [
        {
          to: '/student/dashboard',
          label: t('nav.studentDashboard'),
          icon: <LayoutDashboard size={18} />,
        },
        {
          to: '/student/groups/select',
          label: t('nav.selectGroup', 'Chọn nhóm'),
          icon: <Users size={18} />,
        },
      ];

  if (isStudentArea) navItems.push({ to: '/student/profile', label: t('studentProfile.title'), icon: <UserCheck size={18} /> });

  return (
    <aside className={`sidebar ${isOpen ? 'is-open' : ''}`}>
      {/* Brand Header */}
      <div
        style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
        }}
      >
        <div
          style={{
            width: '38px',
            height: '38px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-primary)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: '1.125rem',
            boxShadow: '0 2px 8px rgba(29, 78, 216, 0.35)',
          }}
        >
          F
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--color-text-main)', letterSpacing: '-0.01em' }}>
            {t('common.systemBrand')}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)' }}>
            {t('sidebar.brandSub')}
          </div>
        </div>
      </div>

      {showTermFilter && (
        <div style={{ padding: '1rem 0.75rem', borderBottom: '1px solid var(--color-border)' }}>
          <TermSelect compact />
        </div>
      )}

      {/* Navigation Links */}
      <div style={{ flex: 1, padding: '1rem 0.75rem', overflowY: 'auto' }}>
        <div
          style={{
            fontSize: '0.6875rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--color-text-subtle)',
            padding: '0.5rem 0.75rem',
            marginBottom: '0.25rem',
          }}
        >
          {isAdmin ? t('sidebar.adminSection') : isLecturer ? t('lecturer.section') : t('sidebar.studentSection')}
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {navItems.map((item) => (
            <React.Fragment key={item.to}>
            {item.group && <span className="sidebar-nav-heading">{t(item.group)}</span>}
            <NavLink
              to={item.to}
              onClick={onClose}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.6875rem 0.875rem',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.875rem',
                fontWeight: isActive ? 600 : 500,
                color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
                backgroundColor: isActive ? 'var(--color-primary-light)' : 'transparent',
                textDecoration: 'none',
                transition: 'all var(--transition-fast)',
              })}
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
            </React.Fragment>
          ))}
        </nav>

      </div>

      {/* User Profile & Logout Footer */}
      <div
        style={{
          padding: '1rem 1.25rem',
          borderTop: '1px solid var(--color-border)',
          backgroundColor: '#fafafa',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <FooterProfile className={profilePath ? 'sidebar-profile-link' : undefined}
          type={profilePath ? 'button' : undefined}
          aria-label={profilePath ? t('studentProfile.open') : undefined}
          onClick={profilePath ? () => { navigate(profilePath); onClose?.(); } : undefined}
          style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', minWidth: 0 }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: 'var(--radius-full)',
              backgroundColor: isAdmin ? '#dbeafe' : '#fef3c7',
              color: isAdmin ? '#1e40af' : '#b45309',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '0.875rem',
              flexShrink: 0,
            }}
          >
            {user?.name ? user.name.charAt(0).toUpperCase() : user?.email?.charAt(0).toUpperCase() || 'U'}
          </div>

          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: '0.8125rem',
                fontWeight: 600,
                color: 'var(--color-text-main)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={user?.name || user?.email}
            >
              {user?.name || user?.email}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '1px' }}>
              {isAdmin ? (
                <span className="badge badge-info" style={{ fontSize: '0.6875rem', padding: '1px 6px' }}>
                  <ShieldCheck size={11} /> {t('sidebar.adminRole')}
                </span>
              ) : (
                <span className="badge badge-success" style={{ fontSize: '0.6875rem', padding: '1px 6px' }}>
                  <UserCheck size={11} /> {isLecturer ? t(isMaster ? 'lecturer.masterRole' : 'lecturer.role') : t('sidebar.studentRole')}
                </span>
              )}
            </div>
          </div>
        </FooterProfile>

        {!isAdmin && <button
          type="button"
          onClick={handleLogout}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--color-text-subtle)',
            cursor: 'pointer',
            padding: '6px',
            borderRadius: 'var(--radius-sm)',
            display: 'flex',
            alignItems: 'center',
            transition: 'color var(--transition-fast)',
          }}
          title={t('common.logout')}
          aria-label={t('common.logout')}
        >
          <LogOut size={18} />
        </button>}
      </div>
    </aside>
  );
};
