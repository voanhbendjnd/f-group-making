import { useSearchParams } from 'react-router-dom';
import type { Dispatch, SetStateAction } from 'react';

interface ListFilters {
  page?: number; size?: number; search?: string; majorSearch?: string; majorId?: number;
  majorLabel?: string; activated?: boolean; hasActivationKey?: boolean;
}
const keys = ['page', 'size', 'search', 'majorSearch', 'majorId', 'majorLabel', 'activated', 'hasActivationKey'] as const;

/** Only list navigation state is stored in the URL, never a selection or file. */
export function useListFilters<T extends ListFilters>(defaults: T, termId?: number): [T, Dispatch<SetStateAction<T>>] {
  const [params, setParams] = useSearchParams();
  const sameTerm = termId === undefined || !params.has('termId') || params.get('termId') === String(termId);
  const filters = { ...defaults } as ListFilters;
  if (sameTerm) for (const key of keys) {
    const value = params.get(key);
    if (value === null) continue;
    if (key === 'activated' || key === 'hasActivationKey') {
      if (value === 'true' || value === 'false') filters[key] = value === 'true';
    } else if (key === 'page' || key === 'size' || key === 'majorId') {
      const number = Number(value);
      if (Number.isSafeInteger(number) && number > 0 && (key !== 'size' || [10, 20, 50, 100].includes(number))) filters[key] = number;
    } else filters[key] = value;
  }
  const update: Dispatch<SetStateAction<T>> = value => {
    const nextFilters = typeof value === 'function' ? value(filters as T) : value;
    const next = new URLSearchParams(params);
    keys.forEach(key => {
      const current = nextFilters[key];
      if (current === undefined || current === '') next.delete(key); else next.set(key, String(current));
    });
    if (termId !== undefined) next.set('termId', String(termId));
    setParams(next, { replace: true });
  };
  return [filters as T, update];
}
