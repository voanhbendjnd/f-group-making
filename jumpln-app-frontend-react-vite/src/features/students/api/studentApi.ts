import { apiClient } from '@/services/api/client';
import type { BatchActivationResult, PaginatedStudents, Student, StudentFilterParams } from '../types';

export const studentApi = {
  async getStudents(params: StudentFilterParams = {}): Promise<PaginatedStudents> {
    const queryParams: Record<string, any> = {};

    if (params.search && params.search.trim()) {
      queryParams.search = params.search.trim();
    }
    if (params.majorId !== undefined) {
      queryParams.majorId = params.majorId;
    } else if (params.majorSearch?.trim()) {
      queryParams.majorSearch = params.majorSearch.trim();
    }
    if (params.activated !== undefined) {
      queryParams.activated = params.activated;
    }
    if (params.hasActivationKey !== undefined) {
      queryParams.hasActivationKey = params.hasActivationKey;
    }

    // Spring Data pageable with one-indexed-parameters=true: page starts at 1
    queryParams.page = params.page && params.page > 0 ? params.page : 1;
    queryParams.size = params.size || 10;
    if (params.sort) {
      queryParams.sort = params.sort;
    }

    const data = await apiClient.get<any, PaginatedStudents>('/api/students', {
      params: queryParams,
    });
    return data;
  },

  async getStudentByUserId(userId: number): Promise<Student> {
    const data = await apiClient.get<any, Student>(`/api/students/${userId}`);
    return data;
  },

  async sendSingleActivation(userId: number, email?: string): Promise<void> {
    await apiClient.post('/api/activate', {
      userId,
      email,
    });
  },

  async sendBatchActivation(userIds: number[]): Promise<BatchActivationResult> {
    const data = await apiClient.post<any, BatchActivationResult>('/api/activate/mul', {
      userIds,
    });
    return data;
  },

  async sendActivateAllMatching(search?: string, majorSearch?: string, majorId?: number): Promise<BatchActivationResult> {
    const params: Record<string, any> = {};
    if (search && search.trim()) {
      params.search = search.trim();
    }
    if (majorId !== undefined) {
      params.majorId = majorId;
    } else if (majorSearch?.trim()) {
      params.majorSearch = majorSearch.trim();
    }

    const data = await apiClient.post<any, BatchActivationResult>('/api/students/activate/all', null, {
      params,
    });
    return data;
  },
};
