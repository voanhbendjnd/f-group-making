import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ExtendDeadlineModal } from '@/features/deadline/components/ExtendDeadlineModal';
import { deadlineApi } from '@/features/deadline/api/deadlineApi';
import { syncDeadlineQueries } from '@/features/deadline/realtime';
import type { Deadline } from '@/features/deadline/types';
import i18n from '@/locales/i18n';
import { RealtimeContext } from '@/app/providers/realtimeContext';
import { useGroupWebSocket } from '@/features/group/hooks/useGroupWebSocket';
import type { RealtimeEvent } from '@/features/deadline/realtime';

vi.mock('@/features/deadline/api/deadlineApi', () => ({ deadlineApi: { updateDeadline: vi.fn() } }));
vi.mock('@/app/providers/ToastContext', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
const deadline: Deadline = {
  id: 8, version: 2, name: 'Shared deadline', status: 'EXPIRED',
  startTime: '2020-01-01T00:00:00Z', endTime: '2020-02-01T00:00:00Z',
  schoolClassIds: [1, 2], schoolClassNames: ['CLASS_A', 'CLASS_B'], canEdit: true,
  classWindows: [1, 2].map(id => ({ schoolClassId: id, schoolClassName: id === 1 ? 'CLASS_A' : 'CLASS_B',
    startTime: '2020-01-01T00:00:00Z', endTime: '2020-02-01T00:00:00Z', status: 'EXPIRED', canEdit: true })),
};
beforeEach(async () => { vi.clearAllMocks(); await i18n.changeLanguage('en'); });
afterEach(cleanup);

describe('class-scoped deadline changes', () => {
  it('does not close a group dialog in response to another class sharing the same deadline', () => {
    const client = new QueryClient(); const onEvent = vi.fn();
    let receive!: (event: RealtimeEvent) => void;
    const subscribe = (_topic: string, listener?: (event: RealtimeEvent) => void) => {
      receive = listener!; return () => {};
    };
    const view = renderHook(() => useGroupWebSocket({ deadlineId: 8, classId: 1, onEvent }), {
      wrapper: ({ children }) => <QueryClientProvider client={client}>
        <RealtimeContext.Provider value={{ status: 'connected', subscribe }}>{children}</RealtimeContext.Provider>
      </QueryClientProvider>,
    });
    act(() => receive({ eventType: 'DEADLINE_EXPIRED', deadlineId: 8, affectedClassIds: [2] }));
    expect(onEvent).not.toHaveBeenCalled();
    act(() => receive({ eventType: 'DEADLINE_EXPIRED', deadlineId: 8, affectedClassIds: [1] }));
    expect(onEvent).toHaveBeenCalledOnce(); view.unmount(); client.clear();
  });
  it.each(['en', 'vi'])('selects a class without selecting or unlocking groups (%s)', async language => {
    await i18n.changeLanguage(language);
    vi.mocked(deadlineApi.updateDeadline).mockResolvedValue(deadline);
    const close = vi.fn();
    render(<ExtendDeadlineModal open deadline={deadline} onClose={close} onSuccess={vi.fn()} />);
    expect(screen.getByText(i18n.t('deadlineScope.groupNotice'))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'CLASS_A' }));
    fireEvent.change(screen.getByLabelText(i18n.t('deadline.modal.endTimeExtend'), { exact: false }), { target: { value: '2099-01-01T20:00' } });
    fireEvent.click(screen.getByRole('checkbox', { name: i18n.t('deadlineLifecycle.confirmScope') }));
    fireEvent.click(screen.getByRole('button', { name: i18n.t('deadlineLifecycle.reopen') }));
    await waitFor(() => expect(deadlineApi.updateDeadline).toHaveBeenCalledExactlyOnceWith(8, expect.objectContaining({
      scope: 'SELECTED', targetClassIds: [1], confirmedClassIds: [1], expectedVersion: 2,
    })));
    expect(vi.mocked(deadlineApi.updateDeadline).mock.calls[0][1]).not.toHaveProperty('groupIds');
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
  });

  it('disables all scope and unassigned classes without silently changing the scope', () => {
    const shared = { ...deadline, classWindows: deadline.classWindows!.map(w => ({ ...w, canEdit: w.schoolClassId === 1 })) };
    render(<ExtendDeadlineModal open deadline={shared} onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByRole('radio', { name: i18n.t('deadlineScope.all') })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'CLASS_B' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'CLASS_A' })).toBeEnabled();
  });

  it('requires review of fresh details after a realtime version change', () => {
    const props = { open: true, deadline, onClose: vi.fn(), onSuccess: vi.fn() };
    const view = render(<ExtendDeadlineModal {...props} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'CLASS_A' }));
    view.rerender(<ExtendDeadlineModal {...props} deadline={{ ...deadline, version: 3 }} />);
    expect(screen.getByRole('alert')).toHaveTextContent(i18n.t('deadlineScope.changed'));
    expect(screen.getByRole('button', { name: i18n.t('deadlineLifecycle.reopen') })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: i18n.t('deadlineScope.refresh') }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'CLASS_A' })).not.toBeChecked();
  });

  it('updates only the affected class and preserves staff rights and approved group state', async () => {
    const client = new QueryClient();
    const a = ['group-workspace', 8, 1]; const b = ['group-workspace', 8, 2];
    const groups = [{ id: 10, status: 'ACCEPTED' }];
    client.setQueryData(a, { deadlineId: 8, schoolClassId: 1, isLecturer: true, canManageGroups: true, deadlineStatus: 'ACTIVE', groups });
    client.setQueryData(b, { deadlineId: 8, schoolClassId: 2, canJoinGroup: true, deadlineStatus: 'ACTIVE' });
    await act(async () => { await syncDeadlineQueries(client, {
      eventType: 'DEADLINE_EXPIRED', deadlineId: 8, affectedClassIds: [1], version: 3,
      classWindows: deadline.classWindows,
    }); });
    expect(client.getQueryData(a)).toMatchObject({ deadlineStatus: 'EXPIRED', canManageGroups: true, groups });
    expect(client.getQueryData(b)).toMatchObject({ deadlineStatus: 'ACTIVE', canJoinGroup: true });
    client.clear();
  });

  it('ignores an older close event after a newer reopen', async () => {
    const client = new QueryClient(); const key = ['validate-deadline', 8, 1];
    client.setQueryData(key, { deadlineId: 8, schoolClassId: 1, status: 'EXPIRED', valid: false });
    const windows = deadline.classWindows!.map(w => ({ ...w, status: 'ACTIVE' as const, endTime: '2099-01-01T00:00:00Z' }));
    await syncDeadlineQueries(client, { eventType: 'DEADLINE_REOPENED', deadlineId: 8, affectedClassIds: [1], version: 4, classWindows: windows });
    await syncDeadlineQueries(client, { eventType: 'DEADLINE_CLOSED', deadlineId: 8, affectedClassIds: [1], version: 3, classWindows: deadline.classWindows });
    expect(client.getQueryData(key)).toMatchObject({ status: 'ACTIVE', version: 4 });
    client.clear();
  });
});
