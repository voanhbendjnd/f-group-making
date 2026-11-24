import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StudentFilterBar } from '@/features/students/components/StudentFilterBar';
import i18n from '@/locales/i18n';

describe('StudentFilterBar responsive single-row layout and controls', () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const renderFilterBar = (props: Partial<Parameters<typeof StudentFilterBar>[0]> = {}) => {
    const onFilterChange = vi.fn();
    const onReset = vi.fn();

    const view = render(
      <QueryClientProvider client={queryClient}>
        <StudentFilterBar
          filters={{ page: 1, size: 10, search: '' }}
          onFilterChange={onFilterChange}
          onReset={onReset}
          isLoading={false}
          {...props}
        />
      </QueryClientProvider>
    );

    return { ...view, onFilterChange, onReset };
  };

  it('renders all 5 controls inside student-filter-grid container', () => {
    const { container } = renderFilterBar();

    const grid = container.querySelector('.student-filter-grid');
    expect(grid).toBeInTheDocument();

    // 1. Search input
    expect(screen.getByPlaceholderText(i18n.t('students.searchPlaceholder'))).toBeInTheDocument();

    // 2. Major input
    expect(screen.getByPlaceholderText(i18n.t('students.majorPlaceholder'))).toBeInTheDocument();

    // 3. Activation status select
    expect(screen.getByLabelText(i18n.t('students.activationStatusLabel'))).toBeInTheDocument();

    // 4. Link status select
    expect(screen.getByLabelText(i18n.t('adminUx.linkStatus'))).toBeInTheDocument();

    // 5. Clear filter button with compact class
    const clearBtn = screen.getByRole('button', { name: i18n.t('students.clearFilters') });
    expect(clearBtn).toBeInTheDocument();
    expect(clearBtn).toHaveClass('student-filter-reset-btn');
  });

  it('triggers onReset when clicking Clear Filter button', () => {
    const { onReset } = renderFilterBar({
      filters: { page: 1, size: 10, search: 'Nguyen', activated: true },
    });

    const clearBtn = screen.getByRole('button', { name: i18n.t('students.clearFilters') });
    fireEvent.click(clearBtn);

    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('triggers onFilterChange when changing dropdown status', () => {
    const { onFilterChange } = renderFilterBar();

    const statusSelect = screen.getByLabelText(i18n.t('students.activationStatusLabel'));
    fireEvent.change(statusSelect, { target: { value: 'activated' } });

    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({ activated: true, page: 1 })
    );

    const keySelect = screen.getByLabelText(i18n.t('adminUx.linkStatus'));
    fireEvent.change(keySelect, { target: { value: 'sent' } });

    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({ hasActivationKey: true, page: 1 })
    );
  });
});
