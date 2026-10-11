import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  Users,
  Upload,
  LogOut,
  Sparkles,
  ShieldCheck,
  UserCheck,
  GraduationCap,
} from 'lucide-react';
import { useAuth } from '@/app/providers/AuthContext';

export interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = isAdmin
    ? [
        {
          to: '/admin/dashboard',
          label: t('nav.dashboard'),
          icon: <LayoutDashboard size={18} />,
        },
        {
          to: '/admin/students',
          label: t('nav.students'),
          icon: <Users size={18} />,
        },
        {
          to: '/admin/students/import',
          label: t('nav.importExcel'),
          icon: <Upload size={18} />,
        },
        {
          to: '/admin/majors',
          label: t('majors.navLabel'),
          icon: <GraduationCap size={18} />,
        },
      ]
    : [
        {
          to: '/student/dashboard',
          label: t('nav.studentDashboard'),
          icon: <LayoutDashboard size={18} />,
        },
      ];

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
          {isAdmin ? t('sidebar.adminSection') : t('sidebar.studentSection')}
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
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
          ))}
        </nav>

        {isAdmin && (
          <div
            style={{
              margin: '1.5rem 0.75rem 0',
              padding: '1rem',
              backgroundColor: '#f0fdf4',
              borderRadius: 'var(--radius-md)',
              border: '1px solid #bbf7d0',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem', color: '#166534', fontWeight: 600, fontSize: '0.8125rem' }}>
              <Sparkles size={16} />
              <span>{t('sidebar.workflowTitle')}</span>
            </div>
            <p style={{ fontSize: '0.75rem', color: '#14532d', lineHeight: 1.4 }}>
              {t('sidebar.step1')}<br />
              {t('sidebar.step2')}<br />
              {t('sidebar.step3')}
            </p>
          </div>
        )}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', minWidth: 0 }}>
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
                  <UserCheck size={11} /> {t('sidebar.studentRole')}
                </span>
              )}
            </div>
          </div>
        </div>

        <button
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
        </button>
      </div>
    </aside>
  );
};
