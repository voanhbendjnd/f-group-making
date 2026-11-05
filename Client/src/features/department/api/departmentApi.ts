import { apiClient } from '@/services/api/client';
import type { DepartmentOverview, DepartmentClassDetail, DepartmentFilters } from '../types';

export const departmentApi = {
  overview: (params: DepartmentFilters, signal?: AbortSignal) =>
    apiClient.get<unknown, DepartmentOverview>('/api/department-overview', { params, signal }),
  detail: (classId: number, termId: number, signal?: AbortSignal) =>
    apiClient.get<unknown, DepartmentClassDetail>(`/api/department-overview/classes/${classId}`, { params: { termId }, signal }),
};
