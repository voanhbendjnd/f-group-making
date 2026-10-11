import { apiClient } from '@/services/api/client';
import type { PaginatedLecturers, LecturerFilterParams } from '../types';
import type { ImportResult } from '@/features/import/types';
import type { BatchActivationResult } from '@/features/students/types';

export const lecturerApi = {
  async getLecturers(params: LecturerFilterParams = {}): Promise<PaginatedLecturers> {
    const queryParams: Record<string, any> = {};

    if (params.search && params.search.trim()) {
      queryParams.search = params.search.trim();
    }
    if (params.activated !== undefined) {
      queryParams.activated = params.activated;
    }
    if (params.hasActivationKey !== undefined) {
      queryParams.hasActivationKey = params.hasActivationKey;
    }

    queryParams.page = params.page && params.page > 0 ? params.page : 1;
    queryParams.size = params.size || 10;
    if (params.sort) {
      queryParams.sort = params.sort;
    }

    const data = await apiClient.get<any, PaginatedLecturers>('/api/lecturers', {
      params: queryParams,
    });
    return data;
  },

  async importExcel(file: File, termId?: number | null): Promise<ImportResult> {
    const formData = new FormData();
    formData.append('file', file);
    if (termId !== undefined && termId !== null) {
      formData.append('termId', String(termId));
    }

    const data = await apiClient.post<any, ImportResult>('/api/lecturers/import', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
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

  async sendActivateAllMatching(search?: string): Promise<BatchActivationResult> {
    const params: Record<string, any> = {};
    if (search && search.trim()) {
      params.search = search.trim();
    }

    const data = await apiClient.post<any, BatchActivationResult>('/api/lecturers/activate-all', null, {
      params,
    });
    return data;
  },

  async deleteLecturer(userId: number): Promise<void> {
    await apiClient.delete(`/api/lecturers/${userId}`);
  },

  async deleteBatchLecturers(userIds: number[]): Promise<void> {
    await apiClient.post('/api/lecturers/batch-delete', userIds);
  },
};
