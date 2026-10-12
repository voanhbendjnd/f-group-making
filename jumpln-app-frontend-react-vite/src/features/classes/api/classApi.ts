import { apiClient } from '@/services/api/client';
import type { PaginatedSchoolClasses, SchoolClass, SchoolClassFilterParams } from '../types';
import type { Student } from '@/features/students/types';
import { parseClassPage, parseSchoolClass } from './classContract';

export const classApi = {
  async getMyClasses(params: SchoolClassFilterParams = {}, signal?: AbortSignal): Promise<PaginatedSchoolClasses> {
    const data = await apiClient.get<unknown, unknown>('/api/me/school-classes', {
      params: { search: params.search?.trim() || undefined, termId: params.termId,
        page: params.page || 1, size: params.size || 10 }, signal,
    });
    return parseClassPage(data);
  },
  async getClasses(params: SchoolClassFilterParams = {}, signal?: AbortSignal): Promise<PaginatedSchoolClasses> {
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

    const data = await apiClient.get<unknown, unknown>('/api/school-classes', {
      params: queryParams, signal,
    });
    return parseClassPage(data);
  },

  async getClassById(id: number, signal?: AbortSignal): Promise<SchoolClass> {
    const data = await apiClient.get<unknown, unknown>(`/api/school-classes/${id}`, { signal });
    return parseSchoolClass(data);
  },

  async getClassStudents(id: number, signal?: AbortSignal): Promise<Student[]> {
    const data = await apiClient.get<any, Student[]>(`/api/school-classes/${id}/students`, { signal });
    return data;
  },
};
