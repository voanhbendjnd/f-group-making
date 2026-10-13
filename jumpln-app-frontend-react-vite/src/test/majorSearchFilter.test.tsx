import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MajorSearchFilter } from '@/features/students/components/MajorSearchFilter';
import { majorApi } from '@/features/majors/api/majorApi';
import { studentApi } from '@/features/students/api/studentApi';
import { apiClient } from '@/services/api/client';
import type { StudentFilterParams } from '@/features/students/types';
import i18n from '@/locales/i18n';

vi.mock('@/features/majors/api/majorApi', () => ({ majorApi: { getMajors: vi.fn() } }));
vi.mock('@/services/api/client', () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }));
let client: QueryClient;
const change = vi.fn();
function Harness() {
  const [filters, setFilters] = useState<StudentFilterParams>({ page: 2, majorSearch: '' });
  return <MajorSearchFilter filters={filters} onFilterChange={(next) => { change(next); setFilters(next); }} />;
}

describe('Major search and selection', () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    await i18n.changeLanguage('en');
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.mocked(majorApi.getMajors).mockResolvedValue({ meta: { page: 1, pageSize: 10, total: 2, pages: 1 }, result: [
      { id: 1, code: 'KT', name: 'Korean Studies' }, { id: 2, code: 'MKT', name: 'Marketing' },
    ] });
  });
  afterEach(() => { cleanup(); client.clear(); });

  it('searches text, selects an exact ID, clears that ID on edit and resets the filter', async () => {
    render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'KT' } });
    await waitFor(() => expect(change).toHaveBeenLastCalledWith(expect.objectContaining({ majorSearch: 'KT', page: 1 })));
    fireEvent.click(await screen.findByRole('option', { name: 'KT — Korean Studies' }));
    expect(change).toHaveBeenLastCalledWith(expect.objectContaining({ majorId: 1, majorSearch: undefined, page: 1 }));
    expect(input).toHaveValue('KT — Korean Studies');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(change).toHaveBeenLastCalledWith(expect.objectContaining({ majorId: 1 }));
    fireEvent.change(input, { target: { value: 'MK' } });
    expect(change).toHaveBeenLastCalledWith(expect.objectContaining({ majorId: undefined, majorSearch: 'MK' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear major filter' }));
    expect(change).toHaveBeenLastCalledWith(expect.objectContaining({ majorId: undefined, majorSearch: '' }));
  });

  it('supports keyboard selection and Escape', async () => {
    render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    await screen.findByRole('option', { name: 'KT — Korean Studies' });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input).toHaveAttribute('aria-expanded', 'false');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(change).toHaveBeenLastCalledWith(expect.objectContaining({ majorId: 1 }));
  });

  it('listing and batch activation send the same exact ID without the text label', async () => {
    await studentApi.getStudents({ majorId: 1, majorSearch: 'KT', majorLabel: 'KT — Korean Studies' });
    expect(apiClient.get).toHaveBeenCalledWith('/api/students', { params: { majorId: 1, page: 1, size: 10 } });
    await studentApi.sendActivateAllMatching('Student', 'KT', 1);
    expect(apiClient.post).toHaveBeenCalledWith('/api/students/activate/all', null, { params: { search: 'Student', majorId: 1 } });
  });
});
