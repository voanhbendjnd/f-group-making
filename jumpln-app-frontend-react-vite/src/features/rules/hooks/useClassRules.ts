import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ruleApi } from '../api/ruleApi';
import type { SaveClassRules } from '../types';
import { getApiError } from '@/services/api/types';

export function useClassRules(classId: number) {
  const queryClient = useQueryClient();
  const queryKey = ['class-rules', classId];
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => ruleApi.getRules(classId, signal),
    retry: (count, error) => count < 1 && ![401, 403, 404].includes(getApiError(error).status),
    refetchOnWindowFocus: false,
  });
  const mutation = useMutation({
    mutationFn: (request: SaveClassRules) => ruleApi.saveRules(classId, request),
    retry: false,
    onSuccess: data => queryClient.setQueryData(queryKey, data),
  });
  return { query, mutation };
}
