import React from 'react';
import { RouterProvider } from 'react-router-dom';
import { ToastProvider } from '@/app/providers/ToastContext';
import { AuthProvider } from '@/app/providers/AuthContext';
import { QueryProvider } from '@/app/providers/QueryProvider';
import { router } from '@/app/router/routes';
import '@/styles/index.css';

export const App: React.FC = () => {
  return (
    <ToastProvider>
      <AuthProvider>
        <QueryProvider>
          <RouterProvider router={router} />
        </QueryProvider>
      </AuthProvider>
    </ToastProvider>
  );
};

export default App;
