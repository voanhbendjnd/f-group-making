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
    const token = storage.getToken();
    if (config.headers) {
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
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
      const isAuthEndpoint = error.config?.url?.includes('/login') || error.config?.url?.includes('/activate');
      if (!isAuthEndpoint) {
        // Session expired on protected route
        storage.clearAll();
        window.dispatchEvent(new CustomEvent('app:unauthorized', { detail: { message: friendlyMessage } }));
      }
    }

    return Promise.reject(apiError);
  }
);
