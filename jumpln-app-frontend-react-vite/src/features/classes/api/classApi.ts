import { apiClient } from '@/services/api/client';
import type { PaginatedSchoolClasses, SchoolClass, SchoolClassFilterParams } from '../types';
import type { Student } from '@/features/students/types';

export const classApi = {
  async getClasses(params: SchoolClassFilterParams = {}): Promise<PaginatedSchoolClasses> {
    const queryParams: Record<string, any> = {};

    if (params.search && params.search.trim()) {
      queryParams.search = params.search.trim();
    }
    if (params.termId !== undefined && params.termId !== null) {
      queryParams.termId = params.termId;
    }

    queryParams.page = params.page && params.page > 0 ? params.page : 1;
    queryParams.size = params.size || 10;
    if (params.sort) {
      queryParams.sort = params.sort;
    }

    const data = await apiClient.get<any, PaginatedSchoolClasses>('/api/school-classes', {
      params: queryParams,
    });
    return data;
  },

  async getClassById(id: number): Promise<SchoolClass> {
    const data = await apiClient.get<any, SchoolClass>(`/api/school-classes/${id}`);
    return data;
  },

  async getClassStudents(id: number): Promise<Student[]> {
    const data = await apiClient.get<any, Student[]>(`/api/school-classes/${id}/students`);
    return data;
  },
};
