import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthContext';
import { getHomeRoute } from '@/features/auth/utils/roleRouting';

export const PublicRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { isAuthenticated, user } = useAuth();

  if (isAuthenticated) {
    return <Navigate to={getHomeRoute(user?.authorities || [])} replace />;
  }

  return children;
};
