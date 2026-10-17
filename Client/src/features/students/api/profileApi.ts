import { apiClient } from '@/services/api/client';

export interface ProfileInfo {
  name: string | null;
  state: 'AVAILABLE' | 'UNASSIGNED' | 'MISSING';
}

export interface StudentProfile {
  schoolClassId?: number | null;
  fullName: string | null;
  rollNumber: string | null;
  email: string | null;
  activated: boolean;
  major: ProfileInfo;
  schoolClass: ProfileInfo;
  term: ProfileInfo;
  group: ProfileInfo;
  selfDescription?: string | null;
}

export const profileApi = {
  getCurrentProfile(signal?: AbortSignal): Promise<StudentProfile> {
    return apiClient.get<unknown, StudentProfile>('/api/me/student-profile', { signal });
  },
  updateBio(bio: string): Promise<{ bio: string }> {
    return apiClient.put('/api/me/student-profile/bio', { bio });
  },
  deleteBio(): Promise<void> {
    return apiClient.delete('/api/me/student-profile/bio');
  },
};
