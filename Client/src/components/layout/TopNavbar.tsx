import React from 'react';
import { Menu, LogOut } from 'lucide-react';
import { AccountPopover } from './AccountPopover';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/app/providers/AuthContext';
import { useNavigate } from 'react-router-dom';
import { LanguageSwitcher } from '@/components/common/LanguageSwitcher';

export interface TopNavbarProps {
  area?: 'admin' | 'lecturer' | 'student';
  onToggleSidebar?: () => void;
  isSidebarCollapsed?: boolean;
}

export const TopNavbar: React.FC<TopNavbarProps> = ({
  area,
  onToggleSidebar,
  isSidebarCollapsed = false,
}) => {
  const { user, isAdmin: hasAdminRole, logout } = useAuth();
  const isAdmin = area ? area === 'admin' : hasAdminRole;
  const canOpenLecturerProfile = area === 'lecturer' && user?.authorities.some(role => role === 'ROLE_LECTURE' || role === 'ROLE_LECTURE_MASTER');
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="top-navbar">
      <div className="top-navbar-leading">
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              cursor: 'pointer',
              color: 'var(--color-text-main)',
              padding: '0.45rem',
              borderRadius: 'var(--radius-md)',
              transition: 'all var(--transition-fast)',
              boxShadow: 'var(--shadow-xs)',
            }}
            title={isSidebarCollapsed ? t('nav.toggleSidebarOpen') : t('nav.toggleSidebarCollapse')}
            aria-label={t('nav.toggleSidebarOpen')}
          >
            <Menu size={20} />
          </button>
        )}

        <div className="top-navbar-subtitle">
          {isAdmin ? (
            <span>{t('nav.adminSubtitle')}</span>
          ) : (
            <span>{area === 'lecturer' ? t('lecturer.subtitle') : t('nav.studentSubtitle')}</span>
          )}
        </div>
      </div>

      <div className="top-navbar-actions">
        <LanguageSwitcher size="sm" />

        <AccountPopover onOpenProfile={canOpenLecturerProfile ? () => navigate('/lecturer/profile') : undefined} />

        <button
          type="button"
          onClick={handleLogout}
          className="btn btn-ghost btn-sm"
          style={{ gap: '0.375rem' }}
        >
          <LogOut size={16} />
          <span>{t('common.logout')}</span>
        </button>
      </div>
    </header>
  );
};
