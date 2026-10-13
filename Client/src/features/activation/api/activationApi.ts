import { apiClient } from '@/services/api/client';
import type { ActivateAccountRequest, ActivationKeyVerifyResult } from '../types';

export const activationApi = {
  async verifyKey(key: string): Promise<ActivationKeyVerifyResult> {
    const data = await apiClient.get<any, ActivationKeyVerifyResult>('/api/account/activate/verify', {
      params: { key },
    });
    return data;
  },

  async activateAccount(request: ActivateAccountRequest): Promise<void> {
    await apiClient.post('/api/account/activate', {
      key: request.key,
      password: request.password,
    });
  },
};
