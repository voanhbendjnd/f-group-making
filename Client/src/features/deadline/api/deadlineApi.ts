import { apiClient } from '@/services/api/client';
import type {
  Deadline,
  CreateDeadlineRequest,
  UpdateDeadlineRequest,
  DeadlineValidateResult,
  PaginatedDeadlines,
  StudentDeadlineActivity,
} from '../types';

export const deadlineApi = {
  async getDeadlines(params?: { page?: number; size?: number }, signal?: AbortSignal): Promise<PaginatedDeadlines> {
    const data = await apiClient.get<unknown, any>('/api/deadlines', {
      params,
      signal,
    });
    if (data?.content && Array.isArray(data.content)) {
      return {
        meta: {
          page: (data.number ?? 0) + 1,
          pageSize: data.size ?? (params?.size || 10),
          pages: data.totalPages ?? 1,
          total: data.totalElements ?? data.content.length,
        },
        result: data.content,
      };
    }
    if (data?.result && Array.isArray(data.result)) {
      return data;
    }
    if (Array.isArray(data)) {
      return {
        meta: { page: 1, pageSize: data.length, pages: 1, total: data.length },
        result: data,
      };
    }
    return {
      meta: { page: 1, pageSize: 10, pages: 1, total: 0 },
      result: [],
    };
  },

  async getDeadlineById(id: number, signal?: AbortSignal): Promise<Deadline> {
    const data = await apiClient.get<unknown, Deadline>(`/api/deadlines/${id}`, { signal });
    return data;
  },

  async createDeadline(request: CreateDeadlineRequest): Promise<Deadline> {
    const data = await apiClient.post<unknown, Deadline>('/api/deadlines', request);
    return data;
  },

  async updateDeadline(id: number, request: UpdateDeadlineRequest): Promise<Deadline> {
    const data = await apiClient.put<unknown, Deadline>(`/api/deadlines/${id}`, request);
    return data;
  },

  async cancelDeadline(id: number): Promise<void> {
    await apiClient.delete(`/api/deadlines/${id}`);
  },

  async validateDeadline(deadlineId: number, classId: number, signal?: AbortSignal): Promise<DeadlineValidateResult> {
    const data = await apiClient.get<unknown, DeadlineValidateResult>(`/api/deadlines/${deadlineId}/validate`, {
      params: { classId },
      signal,
    });
    return data;
  },

  async getMyActivities(signal?: AbortSignal): Promise<StudentDeadlineActivity[]> {
    const data = await apiClient.get<unknown, any>('/api/deadlines/my-activities', { signal });
    if (data?.data && Array.isArray(data.data)) {
      return data.data;
    }
    if (Array.isArray(data)) {
      return data;
    }
    return [];
  },
};
