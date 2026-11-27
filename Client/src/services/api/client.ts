import axios, { type AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { storage } from '@/utils/storage';
import i18n from '@/locales/i18n';
import { translateErrorMessage } from './errorTranslator';
import type { ApiError, RestResponse } from './types';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  timeout: 30000,
});

// Request interceptor: Attach JWT Bearer token and Accept-Language header
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const isAuthEndpoint =
      config.url?.includes('/login') ||
      config.url?.includes('/register') ||
      config.url?.includes('/account/activate') ||
      config.url?.includes('/account/reset-password');

    if (config.headers) {
      if (isAuthEndpoint) {
        if (typeof config.headers.delete === 'function') {
          config.headers.delete('Authorization');
        } else {
          delete (config.headers as Record<string, any>).Authorization;
        }
      } else {
        const token = storage.getToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      }
      config.headers['Accept-Language'] = i18n.language || 'vi';
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: Unwrap ResFormatResponse and normalize errors
apiClient.interceptors.response.use(
  (response) => {
    // If backend wrapped in ResFormatResponse ({ statusCode, message, data })
    const body = response.data;
    if (body && typeof body === 'object' && 'statusCode' in body && 'data' in body) {
      // Return the wrapped payload directly
      return (body as RestResponse<any>).data;
    }
    return body;
  },
  (error: AxiosError) => {
    const status = error.response?.status || 500;
    const data = error.response?.data as any;

    const friendlyMessage = translateErrorMessage(error);

    const apiError: ApiError = {
      status,
      message: friendlyMessage,
      errorKey: data?.errorKey || data?.message || data?.title,
      detail: data?.detail,
      violations: data?.violations || data?.fieldErrors,
      raw: data,
      outcomeUnknown: !error.response || status >= 500,
    };

    // If 401 Unauthorized, notify application if needed
    if (status === 401) {
      const isAuthEndpoint =
        error.config?.url?.includes('/login') ||
        error.config?.url?.includes('/register') ||
        error.config?.url?.includes('/activate') ||
        error.config?.url?.includes('/account/reset-password');

      if (!isAuthEndpoint) {
        const authHeader = (error.config?.headers?.Authorization as string) || '';
        const requestToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
        const currentToken = storage.getToken();

        // If the request was made with a token different from the currently active token,
        // it is a stale in-flight response from a previous session and should not invalidate the new session.
        if (requestToken && currentToken && requestToken !== currentToken) {
          return Promise.reject(apiError);
        }

        // Session expired on protected route
        storage.clearAll();
        window.dispatchEvent(
          new CustomEvent('app:unauthorized', {
            detail: {
              message: friendlyMessage,
              code: data?.code,
              errorKey: data?.errorKey,
            },
          })
        );
      }
    }

    return Promise.reject(apiError);
  }
);
