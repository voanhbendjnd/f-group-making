import { apiClient } from '@/services/api/client';
import type { ImportResult } from '../types';

export const importApi = {
  async importExcel(
    file: File,
    termId?: number | null,
    confirmedMajorCodes: string[] = []
  ): Promise<ImportResult> {
    const formData = new FormData();
    formData.append('file', file);
    if (termId !== undefined && termId !== null) {
      formData.append('termId', String(termId));
    }
    confirmedMajorCodes.forEach((code) => formData.append('confirmedMajorCodes', code));

    const data = await apiClient.post<any, ImportResult>('/api/students/import', formData, {
      headers: {
        'Content-Type': undefined,
      },
    });
    return data;
  },
};
