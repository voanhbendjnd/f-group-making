import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/app/providers/AuthContext';
import { getApiError } from '@/services/api/types';
import { profileApi } from '../api/profileApi';

export function useStudentProfile(enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['student-profile', user?.id],
    queryFn: ({ signal }) => profileApi.getCurrentProfile(signal),
    enabled: Boolean(user) && enabled,
    retry: (count, error) => count < 1 && ![401, 403, 404].includes(getApiError(error).status),
  });
}
