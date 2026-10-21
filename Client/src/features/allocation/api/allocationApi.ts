import { apiClient } from '@/services/api/client';
import type { ApplyResult, HistoryPage, Overview, PlanDetail, PlanPage, Preview, PreviewRequest, Setup } from '../types';

const path = (deadlineId: number, classId: number) => `/api/deadlines/${deadlineId}/classes/${classId}/allocation`;
export const allocationApi = {
  plans: (deadlineId: number, classId: number, page: number, signal?: AbortSignal) =>
    apiClient.get<unknown, PlanPage>(`${path(deadlineId, classId)}/plans`, { params: { page, size: 10 }, signal }),
  plan: (deadlineId: number, classId: number, planId: string, signal?: AbortSignal) =>
    apiClient.get<unknown, PlanDetail>(`${path(deadlineId, classId)}/plans/${encodeURIComponent(planId)}`, { signal }),
  overview: (deadlineId: number, classId: number, signal?: AbortSignal) =>
    apiClient.get<unknown, Overview>(`${path(deadlineId, classId)}/overview`, { signal }),
  setup: (deadlineId: number, classId: number, signal?: AbortSignal) =>
    apiClient.get<unknown, Setup>(`${path(deadlineId, classId)}/setup`, { signal }),
  preview: (deadlineId: number, classId: number, body: PreviewRequest, signal?: AbortSignal) =>
    apiClient.post<unknown, Preview>(`${path(deadlineId, classId)}/preview`, body, { signal }),
  async apply(deadlineId: number, classId: number, previewId: string, key: string): Promise<ApplyResult> {
    const result = await apiClient.post<unknown, ApplyResult>(`${path(deadlineId, classId)}/apply`, { previewId }, { headers: { 'Idempotency-Key': key } });
    if (!result || !Number.isSafeInteger(result.runId) || result.runId < 1 || result.previewId !== previewId
        || result.classId !== classId || result.deadlineId !== deadlineId || !Array.isArray(result.approvedGroupIds) || !result.report) {
      throw { status: 0, message: '', outcomeUnknown: true };
    }
    return result;
  },
  history: (deadlineId: number, classId: number, page: number, signal?: AbortSignal) =>
    apiClient.get<unknown, HistoryPage>(`${path(deadlineId, classId)}/history`, { params: { page, size: 10 }, signal }),
  historyDetail: (deadlineId: number, classId: number, runId: number, signal?: AbortSignal) =>
    apiClient.get<unknown, ApplyResult>(`${path(deadlineId, classId)}/history/${runId}`, { signal }),
};
