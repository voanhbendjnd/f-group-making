import { apiClient } from '@/services/api/client';
import type { Term, CreateTermPayload } from '../types';

export const termApi = {
  async getTerms(currentAndFutureOnly = true): Promise<Term[]> {
    const data = await apiClient.get<any, Term[]>('/api/terms', {
      params: { currentAndFutureOnly },
    });
    return data;
  },

  async getCurrentTerm(): Promise<Term> {
    const data = await apiClient.get<any, Term>('/api/terms/current');
    return data;
  },

  async createTerm(payload: CreateTermPayload): Promise<Term> {
    const data = await apiClient.post<any, Term>('/api/terms', payload);
    return data;
  },
};
