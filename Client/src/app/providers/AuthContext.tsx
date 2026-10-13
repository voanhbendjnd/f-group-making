import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import i18n from '@/locales/i18n';
import { authApi } from '@/features/auth/api/authApi';
import type { LoginRequest } from '@/features/auth/types';
import { storage, type StoredUser } from '@/utils/storage';
import { useToast } from './ToastContext';

interface AuthContextType {
  user: StoredUser | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isStudent: boolean;
  isLecturer: boolean;
  isLoading: boolean;
  login: (request: LoginRequest) => Promise<StoredUser>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<StoredUser | null>(() => storage.getUser());
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const { info, error } = useToast();

  const handleUnauthorized = useCallback(
    (e: Event) => {
      const customEvent = e as CustomEvent<{ message?: string }>;
      setUser(null);
      storage.clearAll();
      info(customEvent.detail?.message || i18n.t('common.sessionExpired'));
    },
    [info]
  );

  useEffect(() => {
    window.addEventListener('app:unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('app:unauthorized', handleUnauthorized);
    };
  }, [handleUnauthorized]);

  const login = async (request: LoginRequest): Promise<StoredUser> => {
    setIsLoading(true);
    try {
      const response = await authApi.login(request);
      storage.setToken(response.accessToken);
      const storedUser: StoredUser = {
        id: response.user.id,
        email: response.user.email,
        name: response.user.name,
        authorities: Array.from(response.user.authorities || []),
      };
      storage.setUser(storedUser);
      setUser(storedUser);
      return storedUser;
    } catch (err: any) {
      error(err.message || i18n.t('auth.loginFailed'));
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = useCallback(() => {
    storage.clearAll();
    setUser(null);
    info(i18n.t('common.logoutSuccess'));
  }, [info]);

  const authorities = user?.authorities || [];
  const isAdmin = authorities.includes('ROLE_ADMIN');
  const isStudent = authorities.includes('ROLE_STUDENT');
  const isLecturer = authorities.includes('ROLE_LECTURE') || authorities.includes('ROLE_LECTURE_MASTER');
  const isAuthenticated = !!user && !!storage.getToken();

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isAdmin,
        isStudent,
        isLecturer,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
