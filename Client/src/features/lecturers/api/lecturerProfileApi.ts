import { apiClient } from '@/services/api/client';

export interface LecturerProfile {
  name: string | null;
  code: string | null;
  email: string;
  activated: boolean;
  profileComplete: boolean;
}

export const lecturerProfileApi = {
  async getCurrentProfile(signal?: AbortSignal): Promise<LecturerProfile> {
    return apiClient.get<unknown, LecturerProfile>('/api/me/lecturer-profile', { signal });
  },
};
