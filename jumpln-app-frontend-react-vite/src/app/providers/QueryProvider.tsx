import React, { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuth } from './AuthContext';

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: 1,
        staleTime: 30000,
      },
    },
  });
}

const AccountQueryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [queryClient] = useState(createQueryClient);
  useEffect(() => () => queryClient.clear(), [queryClient]);
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
};

export const QueryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  // Remount the private data layer when the account changes, including logout.
  return <AccountQueryProvider key={user?.id ?? 'guest'}>{children}</AccountQueryProvider>;
};
