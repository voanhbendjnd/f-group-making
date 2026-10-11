import React, { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { act, cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StudentFilterBar } from '../features/students/components/StudentFilterBar';
import type { StudentFilterParams } from '../features/students/types';
import i18n from '@/locales/i18n';

describe('StudentFilterBar Component', () => {
  const initialFilters = {
    page: 1,
    size: 10,
    search: '',
    majorSearch: '',
  };

  it('always shows clear filters and resets all filters plus pending input', async () => {
    await i18n.changeLanguage('vi');
    vi.useFakeTimers();
    const onChange = vi.fn();
    const onReset = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    function Harness() {
      const [filters, setFilters] = useState<StudentFilterParams>({
        ...initialFilters, search: 'old', majorId: 1, majorLabel: 'SE', activated: true, hasActivationKey: true,
      });
      return <StudentFilterBar filters={filters}
        onFilterChange={(next) => { onChange(next); setFilters(next); }}
        onReset={() => { onReset(); setFilters(initialFilters); }} />;
    }
    try {
      render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>);
      fireEvent.change(screen.getByPlaceholderText('Nhập mã SV, họ tên hoặc email...'), { target: { value: 'pending' } });
      act(() => vi.advanceTimersByTime(200));
      fireEvent.click(screen.getByRole('button', { name: 'Xóa bộ lọc' }));
      expect(onReset).toHaveBeenCalledTimes(1);
      expect(screen.getByPlaceholderText('Nhập mã SV, họ tên hoặc email...')).toHaveValue('');
      const controls = screen.getAllByRole('combobox');
      expect(controls[0]).toHaveValue('');
      expect(controls[1]).toHaveValue('all');
      expect(controls[2]).toHaveValue('all');
      expect(screen.getByRole('button', { name: 'Xóa bộ lọc' })).toBeVisible();
      act(() => vi.advanceTimersByTime(500));
      expect(onChange).not.toHaveBeenCalled();
    } finally {
      cleanup();
      client.clear();
      vi.useRealTimers();
    }
  });

  it('allows user to type smoothly without inputs being disabled', () => {
    const handleFilterChange = vi.fn();
    const handleReset = vi.fn();

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><StudentFilterBar
        filters={initialFilters}
        onFilterChange={handleFilterChange}
        onReset={handleReset}
        isLoading={true}
      /></QueryClientProvider>
    );

    const searchInput = screen.getByPlaceholderText('Nhập mã SV, họ tên hoặc email...');
    // Crucial check: input should NOT be disabled when isLoading is true (background fetching)
    expect(searchInput).not.toBeDisabled();

    fireEvent.change(searchInput, { target: { value: 'SE123456' } });
    expect(searchInput).toHaveValue('SE123456');
  });

  it('immediately applies filter on Enter key press without reloading', () => {
    const handleFilterChange = vi.fn();
    const handleReset = vi.fn();

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><StudentFilterBar
        filters={initialFilters}
        onFilterChange={handleFilterChange}
        onReset={handleReset}
        isLoading={false}
      /></QueryClientProvider>
    );

    const searchInput = screen.getByPlaceholderText('Nhập mã SV, họ tên hoặc email...');
    fireEvent.change(searchInput, { target: { value: 'SE123456' } });
    fireEvent.keyDown(searchInput, { key: 'Enter', code: 'Enter' });

    expect(handleFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'SE123456',
        page: 1,
      })
    );
  });

  it('debounces filter changes when typing', async () => {
    const handleFilterChange = vi.fn();
    const handleReset = vi.fn();

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><StudentFilterBar
        filters={initialFilters}
        onFilterChange={handleFilterChange}
        onReset={handleReset}
        isLoading={false}
      /></QueryClientProvider>
    );

    const searchInput = screen.getByPlaceholderText('Nhập mã SV, họ tên hoặc email...');
    fireEvent.change(searchInput, { target: { value: 'Nguyễn' } });

    // Immediately after typing, callback should not be fired yet due to 350ms debounce
    expect(handleFilterChange).not.toHaveBeenCalled();

    // After debounce interval, it should fire
    await waitFor(
      () => {
        expect(handleFilterChange).toHaveBeenCalledWith(
          expect.objectContaining({
            search: 'Nguyễn',
            page: 1,
          })
        );
      },
      { timeout: 1000 }
    );
  });
});
