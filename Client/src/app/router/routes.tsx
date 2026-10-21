import { LecturerGroupReviewPage } from '@/pages/lecturer/LecturerGroupReviewPage';
import { LecturerAllocationPage } from '@/pages/lecturer/LecturerAllocationPage';
import React from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { StudentLayout } from '@/components/layout/StudentLayout';
import { LecturerLayout } from '@/components/layout/LecturerLayout';
import { LecturerClassListPage } from '@/pages/lecturer/LecturerClassListPage';
import { LecturerClassDetailPage } from '@/pages/lecturer/LecturerClassDetailPage';
import { LecturerProfilePage } from '@/pages/lecturer/LecturerProfilePage';
import { getHomeRoute } from '@/features/auth/utils/roleRouting';
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
import { LecturerListPage } from '@/pages/admin/LecturerListPage';
import { LecturerImportPage } from '@/pages/admin/LecturerImportPage';
import { ClassListPage } from '@/pages/admin/ClassListPage';
import { ClassDetailPage } from '@/pages/admin/ClassDetailPage';
import { AdminDeadlinePage } from '@/pages/admin/AdminDeadlinePage';
import { LecturerDeadlinePage } from '@/pages/lecturer/LecturerDeadlinePage';
import { LecturerGroupWorkspacePage } from '@/pages/lecturer/LecturerGroupWorkspacePage';
import { StudentDashboardPage } from '@/pages/student/StudentDashboardPage';
import { StudentProfilePage } from '@/pages/student/StudentProfilePage';
import { SelectGroupPage } from '@/pages/student/SelectGroupPage';
import { UnauthorizedPage } from '@/pages/errors/UnauthorizedPage';
import { NotFoundPage } from '@/pages/errors/NotFoundPage';

// Root index redirector
const RootRedirector: React.FC = () => {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Navigate to={getHomeRoute(user?.authorities || [])} replace />;
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
      {
        path: 'lecturers',
        element: <LecturerListPage />,
      },
      {
        path: 'lecturers/import',
        element: <LecturerImportPage />,
      },
      {
        path: 'classes',
        element: <ClassListPage />,
      },
      {
        path: 'classes/:id',
        element: <ClassDetailPage />,
      },
      {
        path: 'deadlines',
        element: <AdminDeadlinePage />,
      },
      { path: 'group-review', element: <LecturerGroupReviewPage /> },
      { path: 'group-review/advanced', element: <LecturerGroupWorkspacePage /> },
      { path: 'automatic-allocation', element: <LecturerAllocationPage /> },
      { path: 'automatic-allocation/:classId', element: <LecturerAllocationPage /> },
    ],
  },

  // Lecturer routes: the server also checks ownership for every class request.
  {
    path: '/lecturer',
    element: (
      <ProtectedRoute>
        <RoleRoute requiredRole="ROLE_LECTURE"><LecturerLayout /></RoleRoute>
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Navigate to="/lecturer/group-review" replace /> },
      { path: 'classes', element: <LecturerClassListPage /> },
      { path: 'classes/:id', element: <LecturerClassDetailPage /> },
      { path: 'deadlines', element: <LecturerDeadlinePage /> },
      { path: 'profile', element: <LecturerProfilePage /> },
      { path: 'groups', element: <LecturerGroupWorkspacePage /> },
      { path: 'group-review', element: <LecturerGroupReviewPage /> },
      { path: 'automatic-allocation', element: <LecturerAllocationPage /> },
      { path: 'automatic-allocation/:classId', element: <LecturerAllocationPage /> },
      { path: 'group-review/advanced', element: <LecturerGroupWorkspacePage /> },
      { path: 'classes/:classId/deadlines/:deadlineId/groups', element: <LecturerGroupWorkspacePage /> },
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
      { path: 'profile', element: <StudentProfilePage /> },
      {
        path: 'groups/select',
        element: <SelectGroupPage />,
      },
      {
        path: 'select-group',
        element: <SelectGroupPage />,
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
