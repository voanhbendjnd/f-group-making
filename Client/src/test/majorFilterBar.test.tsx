import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/locales/i18n';
import { MajorFilterBar } from '@/features/majors/components/MajorFilterBar';
import type { MajorFilters } from '@/features/majors/types';

describe('Major automatic filters', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  function renderFilters() {
    const onApply = vi.fn();
    function Harness() {
      const [filters, setFilters] = useState<MajorFilters>({});
      return <MajorFilterBar filters={filters} onApply={(next) => { onApply(next); setFilters(next); }} />;
    }
    render(<Harness />);
    return onApply;
  }

  it('applies only the latest input after 350ms and does not repeat it', () => {
    const onApply = renderFilters();
    const input = screen.getByLabelText('Search code or name');
    fireEvent.change(input, { target: { value: 'S' } });
    act(() => vi.advanceTimersByTime(200));
    fireEvent.change(input, { target: { value: ' SE ' } });
    act(() => vi.advanceTimersByTime(349));
    expect(onApply).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onApply).toHaveBeenCalledExactlyOnceWith({ search: 'SE' });
    act(() => vi.advanceTimersByTime(500));
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it('applies name selection and Enter immediately without losing pending search', () => {
    const onApply = renderFilters();
    fireEvent.change(screen.getByLabelText('Search code or name'), { target: { value: 'SE' } });
    fireEvent.change(screen.getByLabelText('Major name'), { target: { value: 'temporary' } });
    expect(onApply).toHaveBeenLastCalledWith({ temporaryName: true });
    fireEvent.keyDown(screen.getByLabelText('Search code or name'), { key: 'Enter' });
    expect(onApply).toHaveBeenLastCalledWith({ temporaryName: true, search: 'SE' });
    act(() => vi.advanceTimersByTime(500));
    expect(onApply).toHaveBeenCalledTimes(2);
  });

  it('clears all filters and cancels an unapplied search', () => {
    const onApply = renderFilters();
    fireEvent.change(screen.getByLabelText('Major name'), { target: { value: 'named' } });
    fireEvent.change(screen.getByLabelText('Search code or name'), { target: { value: 'pending' } });
    act(() => vi.advanceTimersByTime(200));
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(onApply).toHaveBeenLastCalledWith({});
    expect(screen.getByLabelText('Search code or name')).toHaveValue('');
    expect(screen.getByLabelText('Major name')).toHaveValue('all');
    act(() => vi.advanceTimersByTime(500));
    expect(onApply).toHaveBeenCalledTimes(2);
  });
});
