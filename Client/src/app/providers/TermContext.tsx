import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from './AuthContext';
import { termApi } from '@/features/terms/api/termApi';
import type { Term } from '@/features/terms/types';

interface TermCatalog {
  terms: Term[];
  currentTerm: Term;
}

interface TermContextType {
  terms: Term[];
  currentTerm: Term | null;
  selectedTermId: number | null;
  selectedTerm: Term | null;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  isLocked: boolean;
  selectTerm: (termId: number) => void;
  refreshTerms: () => Promise<{ isError: boolean }>;
  lockTermSelection: () => () => void;
}

const TermContext = createContext<TermContextType | undefined>(undefined);

export const TermProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const storageKey = `f_group_selected_term_${user?.id}`;
  const queryKey = ['terms', user?.id];
  const [savedTermId, setSavedTermId] = useState<number | null>(() => {
    try {
      const value = Number(localStorage.getItem(storageKey));
      return Number.isInteger(value) && value > 0 ? value : null;
    } catch {
      return null;
    }
  });
  const [pendingOperations, setPendingOperations] = useState(0);
  const operationCount = useRef(0);
  const catalog = useQuery({
    queryKey,
    queryFn: async (): Promise<TermCatalog> => {
      // Current Term comes from Backend. Load the full catalog after it has been ensured.
      const currentTerm = await termApi.getCurrentTerm();
      const terms = await termApi.getTerms(false);
      return { currentTerm, terms };
    },
  });

  const terms = catalog.data?.terms ?? [];
  const currentTerm = catalog.data?.currentTerm ?? null;
  const selectedTerm = terms.find((term) => term.id === savedTermId)
    ?? terms.find((term) => term.id === currentTerm?.id)
    ?? null;
  const selectedTermId = selectedTerm?.id ?? null;

  // Resolve the initial/saved choice once; Current Term may change independently later.
  if (catalog.isSuccess && savedTermId !== selectedTermId) setSavedTermId(selectedTermId);

  useEffect(() => {
    if (!catalog.isSuccess) return;
    try {
      if (selectedTermId !== null) localStorage.setItem(storageKey, String(selectedTermId));
      else localStorage.removeItem(storageKey);
    } catch {
      // Term selection still works when browser storage is unavailable.
    }
  }, [catalog.isSuccess, selectedTermId, storageKey]);

  const selectTerm = (termId: number) => {
    const latestCatalog = queryClient.getQueryData<TermCatalog>(queryKey);
    if (operationCount.current > 0 || !latestCatalog?.terms.some((term) => term.id === termId)) return;
    setSavedTermId(termId);
  };

  const lockTermSelection = useCallback(() => {
    operationCount.current += 1;
    setPendingOperations((count) => count + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      operationCount.current -= 1;
      setPendingOperations((count) => Math.max(0, count - 1));
    };
  }, []);

  return (
    <TermContext.Provider value={{
      terms, currentTerm, selectedTermId, selectedTerm,
      isLoading: catalog.isPending,
      isError: catalog.isError,
      error: catalog.error,
      isLocked: pendingOperations > 0,
      selectTerm,
      refreshTerms: catalog.refetch,
      lockTermSelection,
    }}>
      {children}
    </TermContext.Provider>
  );
};

export const useTerm = (): TermContextType => {
  const context = useContext(TermContext);
  if (!context) throw new Error('useTerm must be used within a TermProvider');
  return context;
};
