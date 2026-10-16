import i18n from '@/locales/i18n';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { effectiveDeadlineStatus, useDeadlineBoundary } from '@/features/deadline/hooks/useDeadlineBoundary';
import { syncDeadlineQueries } from '@/features/deadline/realtime';
import { DeadlineTable } from '@/features/deadline/components/DeadlineTable';
import { StudentGroupWidget } from '@/pages/student/components/StudentGroupWidget';
import { deadlineApi } from '@/features/deadline/api/deadlineApi';
import type { Deadline } from '@/features/deadline/types';

vi.mock('@/features/deadline/api/deadlineApi', () => ({ deadlineApi: { getMyActivities: vi.fn() } }));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });

const startTime = '2026-10-16T00:00:00Z';
const endTime = '2026-10-31T00:00:00Z';
const deadline: Deadline = { id: 1, name: 'Round one', status: 'CANCELLED', startTime, endTime,
  schoolClassIds: [1], schoolClassNames: ['EXE101'], canEdit: false, canCancel: false };

function wrapper(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>;
}

describe('deadline lifecycle contract', () => {
  it('cancellation overrides clocks and endTime is exclusive', () => {
    expect(effectiveDeadlineStatus('CANCELLED', startTime, endTime, Date.parse(startTime) - 1)).toBe('EXPIRED');
    expect(effectiveDeadlineStatus('CANCELLED', startTime, endTime, Date.parse(endTime) + 1)).toBe('EXPIRED');
    expect(effectiveDeadlineStatus('ACTIVE', startTime, endTime, Date.parse(startTime))).toBe('ACTIVE');
    expect(effectiveDeadlineStatus('ACTIVE', startTime, endTime, Date.parse(endTime))).toBe('EXPIRED');
  });

  it('management keeps the cancelled round visible without edit or cancel controls', () => {
    render(<DeadlineTable deadlines={[deadline]} onEdit={vi.fn()} onCancel={vi.fn()} />, { wrapper: wrapper() });
    expect(screen.getByText(i18n.t('deadline.status.expired'))).toBeInTheDocument();
    expect(screen.getByText('Round one')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: i18n.t('deadlineDetail.openNamed', { name: deadline.name }) })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: i18n.t('deadlineLifecycle.reopen') })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: i18n.t('deadline.table.cancelTitle') })).not.toBeInTheDocument();
  });

  it('student dashboard preserves the group link without a countdown or invitation to join', async () => {
    vi.mocked(deadlineApi.getMyActivities).mockResolvedValue([{ deadlineId: 1, deadlineName: 'Round one',
      startTime, endTime, status: 'CANCELLED', schoolClassId: 1, schoolClassName: 'EXE101', hasGroup: true, groupName: 'Existing team' }]);
    render(<StudentGroupWidget />, { wrapper: wrapper() });
    expect(await screen.findByText('Deadline chọn nhóm đã kết thúc')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xem nhóm' })).toBeInTheDocument();
    expect(screen.queryByText('Tham Gia Chọn Nhóm Ngay')).not.toBeInTheDocument();
    expect(screen.queryByText('Thời gian còn lại')).not.toBeInTheDocument();
  });

  it('cancellation updates all cached roles and aborts reads that could restore stale controls', async () => {
    const client = new QueryClient();
    const key = ['group-workspace', 1, 1];
    client.setQueryData(key, { deadlineId: 1, deadlineStatus: 'ACTIVE', canJoinGroup: true });
    client.setQueryData(['admin-deadlines', 1], { result: [deadline, { ...deadline, id: 2, status: 'ACTIVE' }] });
    client.setQueryData(['student-deadline-activities'], [{ deadlineId: 1, schoolClassId: 1, status: 'ACTIVE', hasGroup: true }]);
    let signal: AbortSignal | undefined;
    let finish!: (value: unknown) => void;
    const pending = client.fetchQuery({ queryKey: key, queryFn: context => {
      signal = context.signal;
      return new Promise(resolve => { finish = resolve; });
    } }).catch(() => undefined);
    await syncDeadlineQueries(client, { eventId: 'cancel', eventType: 'DEADLINE_CANCELLED', deadlineId: 1 });
    expect(signal?.aborted).toBe(true);
    finish({ deadlineId: 1, deadlineStatus: 'ACTIVE', canJoinGroup: true });
    await pending;
    expect(client.getQueryData(key)).toMatchObject({ deadlineStatus: 'EXPIRED', canJoinGroup: false });
    expect(client.getQueryData(['student-deadline-activities'])).toEqual([expect.objectContaining({ status: 'EXPIRED', hasGroup: true })]);
    expect((client.getQueryData(['admin-deadlines', 1]) as any).result[1].status).toBe('ACTIVE');
    client.clear();
  });

  it('reconnect invalidates dashboard, validation, workspace and management lists', async () => {
    const client = new QueryClient();
    for (const key of ['student-deadline-activities', 'validate-deadline', 'group-workspace', 'admin-deadlines', 'lecturer-deadlines']) client.setQueryData([key], {});
    await syncDeadlineQueries(client);
    expect(client.getQueryCache().getAll().every(query => query.state.isInvalidated)).toBe(true);
    client.clear();
  });

  it('crosses the end boundary locally and resynchronizes without a socket message', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse(endTime) - 1000);
    const client = new QueryClient();
    client.setQueryData(['validate-deadline', 1, 1], {});
    function Boundary() {
      const item = { status: 'ACTIVE' as const, startTime, endTime };
      const now = useDeadlineBoundary([item]);
      return <span>{effectiveDeadlineStatus(item.status, startTime, endTime, now)}</span>;
    }
    render(<Boundary />, { wrapper: wrapper(client) });
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
    expect(screen.getByText('EXPIRED')).toBeInTheDocument();
    expect(client.getQueryState(['validate-deadline', 1, 1])?.isInvalidated).toBe(true);
    client.clear();
  });
});
