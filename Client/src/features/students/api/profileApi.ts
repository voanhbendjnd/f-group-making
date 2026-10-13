import { apiClient } from '@/services/api/client';

export interface ProfileInfo {
  name: string | null;
  state: 'AVAILABLE' | 'UNASSIGNED' | 'MISSING';
}

export interface StudentProfile {
  fullName: string | null;
  rollNumber: string | null;
  email: string | null;
  activated: boolean;
  major: ProfileInfo;
  schoolClass: ProfileInfo;
  term: ProfileInfo;
  group: ProfileInfo;
}

export const profileApi = {
  getCurrentProfile(signal?: AbortSignal): Promise<StudentProfile> {
    return apiClient.get<unknown, StudentProfile>('/api/me/student-profile', { signal });
  },
};
