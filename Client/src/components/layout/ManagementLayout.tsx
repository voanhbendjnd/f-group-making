import React, { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopNavbar } from './TopNavbar';
import { TermProvider } from '@/app/providers/TermContext';
import { TermFilterNotice } from '@/features/terms/components/TermFilterNotice';
import { useAuth } from '@/app/providers/AuthContext';
import { NavigationGuardProvider } from '@/app/providers/NavigationGuard';

export const ManagementLayout: React.FC<{ area: 'admin' | 'lecturer'; showTermFilter?: boolean }> = ({
  area,
  showTermFilter = false,
}) => {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const isGroupBoard = /\/(group-review\/advanced|groups)$/.test(pathname) || /\/classes\/\d+\/deadlines\/\d+\/groups$/.test(pathname);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => {
    if (!mobileOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setMobileOpen(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [mobileOpen]);

  const handleToggleSidebar = () => {
    if (window.innerWidth <= 900) {
      setMobileOpen((prev) => !prev);
    } else {
      setIsCollapsed((prev) => {
        const next = !prev;
        try {
          localStorage.setItem('sidebar_collapsed', String(next));
        } catch {
          // ignore localStorage errors
        }
        return next;
      });
    }
  };

  const layout = (
    <div className={`app-layout ${isCollapsed ? 'sidebar-collapsed' : ''}`}>
      {mobileOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <Sidebar area={area} isOpen={mobileOpen} onClose={() => setMobileOpen(false)} showTermFilter={showTermFilter && area !== 'admin'} />

      <div className="main-content">
        <TopNavbar
          area={area}
          isSidebarCollapsed={isCollapsed}
          onToggleSidebar={handleToggleSidebar}
        />
        <main id="main-content" className={`page-container${isGroupBoard ? ' group-board-container' : ''}`}>
          {area === 'lecturer' && showTermFilter && <TermFilterNotice area="lecturer" />}
          <Outlet />
        </main>
      </div>
    </div>
  );

  if (showTermFilter || area === 'admin') {
    return <NavigationGuardProvider key={user?.id}><TermProvider>{layout}</TermProvider></NavigationGuardProvider>;
  }

  return layout;
};
