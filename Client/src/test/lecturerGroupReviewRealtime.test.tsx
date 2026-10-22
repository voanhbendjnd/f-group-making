import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider } from 'antd';
import { MemoryRouter } from 'react-router-dom';
import { RealtimeProvider } from '@/app/providers/RealtimeProvider';
import { LecturerGroupReviewPage } from '@/pages/lecturer/LecturerGroupReviewPage';
import { groupApi } from '@/features/group/api/groupApi';
import { classApi } from '@/features/classes/api/classApi';
import type { GroupReviewPage, GroupStatus } from '@/features/group/types/groupTypes';
import i18n from '@/locales/i18n';

const socket = vi.hoisted(() => ({
  listeners: new Map<string, (frame: { body: string }) => void>(),
  client: null as null | { connected: boolean; config: { onConnect: () => void; onWebSocketClose: () => void } },
}));
vi.mock('@stomp/stompjs', () => ({ Client: class {
  connected = false;
  constructor(public config: { onConnect: () => void; onWebSocketClose: () => void }) { socket.client = this; }
  activate() { this.connected = true; this.config.onConnect(); }
  deactivate() { this.connected = false; return Promise.resolve(); }
  subscribe(topic: string, listener: (frame: { body: string }) => void) {
    socket.listeners.set(topic, listener);
    return { unsubscribe: () => socket.listeners.delete(topic) };
  }
} }));
vi.mock('sockjs-client', () => ({ default: vi.fn() }));
vi.mock('@/app/providers/AuthContext', () => ({ useAuth: () => ({
  user: { id: 1, authorities: ['ROLE_LECTURE'] }, isLecturer: true, isAdmin: false, isStudent: false,
}) }));
vi.mock('@/app/providers/TermContext', () => ({ useTerm: () => ({ selectedTermId: 8, lockTermSelection: () => () => {} }) }));
vi.mock('@/app/providers/ToastContext', () => ({ useToast: () => ({ success: vi.fn() }) }));
vi.mock('@/features/students/hooks/useStudentProfile', () => ({ useStudentProfile: () => ({ data: undefined }) }));
vi.mock('@/features/group/api/groupApi', () => ({ groupApi: { getReviews: vi.fn() } }));
vi.mock('@/features/classes/api/classApi', () => ({ classApi: { getMyClasses: vi.fn() } }));

let client: QueryClient;
function page(status: GroupStatus = 'PENDING'): GroupReviewPage {
  return { result: [{ className: 'Class A', submittedAt: null, deadlineStatus: 'EXPIRED', eligible: true,
    canReview: status === 'PENDING', canReopen: status === 'ACCEPTED',
    group: { id: 1, schoolClassId: 2, deadlineId: 3, sequenceNo: 1, groupCode: 'G01', name: 'Realtime review group',
      leaderId: 4, leaderName: 'Leader', status, memberCount: 4, maxMembers: 6, version: 0,
      members: [], ruleEvaluations: [], allRulesPassed: true, hasHardRuleViolations: false },
  }], meta: { total: 1, page: 1, pageSize: 10, pages: 1 } };
}
const emptyPage: GroupReviewPage = { result: [], meta: { total: 0, page: 1, pageSize: 10, pages: 0 } };

function renderReview() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<ConfigProvider theme={{ token: { motion: false } }}><QueryClientProvider client={client}><RealtimeProvider>
    <MemoryRouter><LecturerGroupReviewPage /></MemoryRouter>
  </RealtimeProvider></QueryClientProvider></ConfigProvider>);
}
async function mount() {
  renderReview();
  await waitFor(() => {
    expect(socket.listeners.has('/topic/classes/2/deadlines')).toBe(true);
    expect(client.isFetching()).toBe(0);
  });
}
function emit(eventType: string) {
  socket.listeners.get('/topic/classes/2/deadlines')!({ body: JSON.stringify({
    eventId: eventType, eventType, deadlineId: 3, schoolClassId: 2, groupId: 1,
  }) });
}

beforeEach(async () => {
  vi.resetAllMocks(); socket.listeners.clear(); socket.client = null; await i18n.changeLanguage('en');
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.mocked(groupApi.getReviews).mockResolvedValue(page());
  vi.mocked(classApi.getMyClasses).mockResolvedValue({ result: [
    { id: 2, name: 'Class A', termId: 8, lecturerId: 1, studentCount: 4 },
  ], meta: { total: 1, page: 1, pageSize: 50, pages: 1 } });
});
afterEach(() => { cleanup(); client?.clear(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('group review realtime updates', () => {
  it('preserves the row, detail dialog and draft search while refreshing from a socket event', async () => {
    await mount();
    const originalRow = document.querySelector('.review-table tbody tr[data-row-key="1"]')!;
    fireEvent.change(screen.getByLabelText(i18n.t('groupReview.search')), { target: { value: 'Draft search' } });
    fireEvent.click(screen.getByRole('button', { name: i18n.t('groupReview.view'), exact: true }));
    const dialog = await screen.findByRole('dialog');
    let finish!: (value: GroupReviewPage) => void;
    vi.mocked(groupApi.getReviews).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await act(async () => { emit('GROUP_ACCEPTED'); });
    await waitFor(() => expect(client.isFetching()).toBe(1));
    expect(document.querySelector('.review-table tbody tr[data-row-key="1"]')).toBe(originalRow);
    expect(document.querySelector('.review-table .ant-spin-spinning')).toBeNull();
    expect(document.querySelector('.review-summary')).not.toBeInTheDocument();
    expect(within(originalRow as HTMLElement).getByText(i18n.t('groupReview.statuses.PENDING'))).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(screen.getByLabelText(i18n.t('groupReview.search'))).toHaveValue('Draft search');
    await act(async () => { finish(page('ACCEPTED')); });
    await waitFor(() => expect(within(originalRow as HTMLElement).getByText(i18n.t('groupReview.statuses.ACCEPTED'))).toBeInTheDocument());
    expect(within(originalRow as HTMLElement).queryByRole('button', { name: i18n.t('groupReview.approve'), exact: true })).not.toBeInTheDocument();
    expect(within(originalRow as HTMLElement).getByRole('button', { name: i18n.t('groupReview.reopen'), exact: true })).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBe(dialog);
  });

  it('receives the first group for an empty class and removes a disbanded group without polling', async () => {
    vi.mocked(groupApi.getReviews).mockResolvedValue(emptyPage);
    await mount();
    expect(screen.queryByText('Realtime review group')).not.toBeInTheDocument();
    vi.mocked(groupApi.getReviews).mockResolvedValue(page());
    await act(async () => { emit('GROUP_CREATED'); });
    expect(await screen.findByText('Realtime review group')).toBeInTheDocument();
    vi.mocked(groupApi.getReviews).mockResolvedValue(emptyPage);
    await act(async () => { emit('GROUP_DISBANDED'); });
    await waitFor(() => expect(screen.queryByText('Realtime review group')).not.toBeInTheDocument());
  });

  it('polls only while the socket is disconnected and resynchronizes on reconnection', async () => {
    vi.useFakeTimers();
    renderReview();
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(screen.getByText('Realtime review group')).toBeInTheDocument();
    const connectedCalls = vi.mocked(groupApi.getReviews).mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(61000); });
    expect(groupApi.getReviews).toHaveBeenCalledTimes(connectedCalls);
    await act(async () => { socket.client!.connected = false; socket.client!.config.onWebSocketClose(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(30100); });
    expect(groupApi.getReviews).toHaveBeenCalledTimes(connectedCalls + 1);
    await act(async () => { socket.client!.connected = true; socket.client!.config.onConnect(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    const reconnectedCalls = vi.mocked(groupApi.getReviews).mock.calls.length;
    expect(reconnectedCalls).toBeGreaterThan(connectedCalls + 1);
    await act(async () => { await vi.advanceTimersByTimeAsync(61000); });
    expect(groupApi.getReviews).toHaveBeenCalledTimes(reconnectedCalls);
  });

  it('retains the last successful rows and status when a background request fails', async () => {
    await mount();
    vi.mocked(groupApi.getReviews).mockRejectedValue({ status: 403, message: 'Review refresh failed' });
    await act(async () => { emit('GROUP_UPDATED'); });
    await waitFor(() => expect(client.getQueryCache().find({ queryKey: ['group-reviews'], exact: false })?.state.status).toBe('error'));
    expect(screen.getByText('Realtime review group')).toBeInTheDocument();
    const row = document.querySelector('.review-table tbody tr[data-row-key="1"]')!;
    expect(within(row as HTMLElement).getByText(i18n.t('groupReview.statuses.PENDING'))).toBeInTheDocument();
  });
});
