import { apiClient } from '@/services/api/client';
import type { Major, MajorFormValues, MajorListParams, PaginatedMajors } from '../types';

export const majorApi = {
  async getMajors(params: MajorListParams): Promise<PaginatedMajors> {
    return apiClient.get<unknown, PaginatedMajors>('/api/majors', { params });
  },

  async getMajorById(id: number): Promise<Major> {
    return apiClient.get<unknown, Major>(`/api/majors/${id}`);
  },

  async createMajor(values: MajorFormValues): Promise<Major> {
    return apiClient.post<unknown, Major>('/api/majors', values);
  },

  async updateMajor(id: number, values: MajorFormValues): Promise<Major> {
    return apiClient.put<unknown, Major>(`/api/majors/${id}`, values);
  },

  async deleteMajor(id: number): Promise<void> {
    await apiClient.delete(`/api/majors/${id}`);
  },
};
