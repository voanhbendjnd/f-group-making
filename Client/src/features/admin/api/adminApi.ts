import { apiClient } from '@/services/api/client';
import type { CreateAdminRequest, AdminUserResponse } from '../types';

export const adminApi = {
  async createAdmin(payload: CreateAdminRequest): Promise<AdminUserResponse> {
    const response = await apiClient.post<any, any>('/api/admin/users', {
      name: payload.name.trim(),
      email: payload.email.trim().toLowerCase(),
      password: payload.password,
      sendActivationEmail: payload.sendActivationEmail ?? true,
    });
    // If backend response is wrapped by ResFormatResponse ({ statusCode, data, message })
    return response?.data ?? response;
  },
};
