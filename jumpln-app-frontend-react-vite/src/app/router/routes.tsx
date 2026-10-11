import React from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { StudentLayout } from '@/components/layout/StudentLayout';
import { ProtectedRoute } from './ProtectedRoute';
import { RoleRoute } from './RoleRoute';
import { PublicRoute } from './PublicRoute';
import { useAuth } from '@/app/providers/AuthContext';

// Pages
import { LoginPage } from '@/pages/auth/LoginPage';
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage';
import { ActivateAccountPage } from '@/pages/activation/ActivateAccountPage';
import { AdminDashboardPage } from '@/pages/admin/AdminDashboardPage';
import { StudentListPage } from '@/pages/admin/StudentListPage';
import { StudentImportPage } from '@/pages/admin/StudentImportPage';
import { MajorListPage } from '@/pages/admin/MajorListPage';
import { StudentDashboardPage } from '@/pages/student/StudentDashboardPage';
import { UnauthorizedPage } from '@/pages/errors/UnauthorizedPage';
import { NotFoundPage } from '@/pages/errors/NotFoundPage';

// Root index redirector
const RootRedirector: React.FC = () => {
  const { isAuthenticated, isAdmin, isStudent } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (isAdmin) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  if (isStudent) {
    return <Navigate to="/student/dashboard" replace />;
  }

  return <Navigate to="/login" replace />;
};

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootRedirector />,
  },

  // Public Auth & Activation routes
  {
    element: <AuthLayout />,
    children: [
      {
        path: '/login',
        element: (
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        ),
      },
      {
        path: '/forgot-password',
        element: (
          <PublicRoute>
            <ForgotPasswordPage />
          </PublicRoute>
        ),
      },
      {
        path: '/reset-password',
        element: <ResetPasswordPage />,
      },
      {
        path: '/account/reset/finish',
        element: <ResetPasswordPage />,
      },
      // Both /activate and /account/activate supported for email links
      {
        path: '/activate',
        element: <ActivateAccountPage />,
      },
      {
        path: '/account/activate',
        element: <ActivateAccountPage />,
      },
    ],
  },

  // Admin routes
  {
    path: '/admin',
    element: (
      <ProtectedRoute>
        <RoleRoute requiredRole="ROLE_ADMIN">
          <AdminLayout />
        </RoleRoute>
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: <Navigate to="/admin/dashboard" replace />,
      },
      {
        path: 'dashboard',
        element: <AdminDashboardPage />,
      },
      {
        path: 'students',
        element: <StudentListPage />,
      },
      {
        path: 'students/import',
        element: <StudentImportPage />,
      },
      {
        path: 'majors',
        element: <MajorListPage />,
      },
    ],
  },

  // Student routes
  {
    path: '/student',
    element: (
      <ProtectedRoute>
        <RoleRoute requiredRole="ROLE_STUDENT">
          <StudentLayout />
        </RoleRoute>
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: <Navigate to="/student/dashboard" replace />,
      },
      {
        path: 'dashboard',
        element: <StudentDashboardPage />,
      },
    ],
  },

  // Error pages
  {
    path: '/unauthorized',
    element: <UnauthorizedPage />,
  },
  {
    path: '*',
    element: <NotFoundPage />,
  },
]);
