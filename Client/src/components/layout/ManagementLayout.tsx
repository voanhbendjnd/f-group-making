import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopNavbar } from './TopNavbar';
import { TermProvider } from '@/app/providers/TermContext';
import { TermFilterNotice } from '@/features/terms/components/TermFilterNotice';
import { useAuth } from '@/app/providers/AuthContext';

export const ManagementLayout: React.FC<{ area: 'admin' | 'lecturer'; showTermFilter?: boolean }> = ({
  area,
  showTermFilter = false,
}) => {
  const { user } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);

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

      <Sidebar area={area} isOpen={mobileOpen} onClose={() => setMobileOpen(false)} showTermFilter={showTermFilter} />

      <div className="main-content">
        <TopNavbar
          area={area}
          isSidebarCollapsed={isCollapsed}
          onToggleSidebar={handleToggleSidebar}
        />
        <main id="main-content" className="page-container">
          {area === 'lecturer' && showTermFilter && <TermFilterNotice area="lecturer" />}
          <Outlet />
        </main>
      </div>
    </div>
  );

  if (showTermFilter || area === 'admin') {
    return <TermProvider key={user?.id}>{layout}</TermProvider>;
  }

  return layout;
};
