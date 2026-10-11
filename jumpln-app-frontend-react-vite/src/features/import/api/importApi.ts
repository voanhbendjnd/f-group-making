import { apiClient } from '@/services/api/client';
import type { ImportResult } from '../types';

export const importApi = {
  async importExcel(file: File, confirmedMajorCodes: string[] = []): Promise<ImportResult> {
    const formData = new FormData();
    formData.append('file', file);
    confirmedMajorCodes.forEach((code) => formData.append('confirmedMajorCodes', code));

    const data = await apiClient.post<any, ImportResult>('/api/students/import', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return data;
  },
};
