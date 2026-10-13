import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthContext';

export interface RoleRouteProps {
  requiredRole: 'ROLE_ADMIN' | 'ROLE_STUDENT' | 'ROLE_LECTURE';
  children: React.ReactElement;
}

export const RoleRoute: React.FC<RoleRouteProps> = ({ requiredRole, children }) => {
  const { user, isAdmin, isStudent, isLecturer } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole === 'ROLE_ADMIN' && !isAdmin) {
    if (isLecturer) return <Navigate to="/lecturer/classes" replace />;
    // If student tries to access admin route, redirect to student dashboard
    if (isStudent) {
      return <Navigate to="/student/dashboard" replace />;
    }
    return <Navigate to="/unauthorized" replace />;
  }

  if (requiredRole === 'ROLE_STUDENT' && !isStudent && !isAdmin) {
    return <Navigate to="/unauthorized" replace />;
  }

  if (requiredRole === 'ROLE_LECTURE' && !isLecturer && !isAdmin) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
};
