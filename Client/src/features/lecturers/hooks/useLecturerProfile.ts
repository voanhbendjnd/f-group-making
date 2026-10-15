import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/app/providers/AuthContext';
import { getApiError } from '@/services/api/types';
import { lecturerProfileApi } from '../api/lecturerProfileApi';

const retry = (count: number, error: unknown) => count < 1 && ![401, 403, 404].includes(getApiError(error).status);

export function useLecturerProfile(enabled = true) {
  const { user } = useAuth();
  return useQuery({ queryKey: ['lecturer-profile', user?.id],
    queryFn: ({ signal }) => lecturerProfileApi.getCurrentProfile(signal), enabled: Boolean(user) && enabled, retry });
}

