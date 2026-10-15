import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopNavbar } from './TopNavbar';
import { TermProvider } from '@/app/providers/TermContext';
import { useAuth } from '@/app/providers/AuthContext';
import { TermFilterNotice } from '@/features/terms/components/TermFilterNotice';

export const StudentLayout: React.FC = () => {
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

  return (
    <TermProvider key={user?.id}>
    <div className={`app-layout ${isCollapsed ? 'sidebar-collapsed' : ''}`}>
      {mobileOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <Sidebar showTermFilter area="student" isOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

      <div className="main-content">
        <TopNavbar
          area="student"
          isSidebarCollapsed={isCollapsed}
          onToggleSidebar={handleToggleSidebar}
        />
        <main className="page-container">
          <TermFilterNotice area="student" />
          <Outlet />
        </main>
      </div>
    </div>
    </TermProvider>
  );
};
