import { apiClient } from '@/services/api/client';
import type {
  LoginRequest,
  LoginResponse,
  ResetKeyVerifyResult,
  ResetPasswordFinishRequest,
  ResetPasswordInitRequest,
} from '../types';

export const authApi = {
  async login(request: LoginRequest): Promise<LoginResponse> {
    const data = await apiClient.post<any, LoginResponse>('/api/login', {
      username: request.username.trim().toLowerCase(),
      password: request.password,
    });
    return data;
  },

  async requestPasswordReset(request: ResetPasswordInitRequest): Promise<void> {
    await apiClient.post('/api/account/reset-password/init', {
      email: request.email.trim().toLowerCase(),
    });
  },

  async verifyResetKey(key: string): Promise<ResetKeyVerifyResult> {
    const data = await apiClient.get<any, ResetKeyVerifyResult>('/api/account/reset-password/verify', {
      params: { key },
    });
    return data;
  },

  async finishPasswordReset(request: ResetPasswordFinishRequest): Promise<void> {
    await apiClient.post('/api/account/reset-password/finish', {
      resetKey: request.resetKey.trim(),
      newPassword: request.newPassword,
    });
  },
};

