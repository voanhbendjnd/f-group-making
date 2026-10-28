import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider } from 'antd';
import { MemoryRouter } from 'react-router-dom';
import { RealtimeProvider } from '@/app/providers/RealtimeProvider';
import { LecturerGroupWorkspacePage } from '@/pages/lecturer/LecturerGroupWorkspacePage';
import { groupApi } from '@/features/group/api/groupApi';
import type { WorkspaceDTO } from '@/features/group/types/groupTypes';
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
vi.mock('@/app/providers/TermContext', () => ({ useTerm: () => ({ lockTermSelection: () => () => {} }) }));
vi.mock('@/app/providers/ToastContext', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/features/students/hooks/useStudentProfile', () => ({ useStudentProfile: () => ({ data: undefined }) }));
vi.mock('@/features/group/api/groupApi', () => ({ groupApi: {
  getWorkspace: vi.fn(), lecturerAddMember: vi.fn(), getRecommendedStudents: vi.fn(),
} }));
vi.mock('@/features/group/components/LecturerGroupModal', () => ({ LecturerGroupModal: () => null }));
vi.mock('@/features/group/components/RejectGroupModal', () => ({ RejectGroupModal: () => null }));
vi.mock('@/features/group/components/GroupPreviewExportModal', () => ({ GroupPreviewExportModal: () => null }));

const key = ['group-workspace', 8, 1];
let client: QueryClient;
let eventId = 0;
function fixture(): WorkspaceDTO {
  return {
    deadlineId: 8, deadlineName: 'Session', deadlineStatus: 'UNSCHEDULED', deadlineStartTime: null,
    deadlineEndTime: null, deadlineExpired: false, canManageGroups: true, schoolClassId: 1,
    schoolClassName: 'CLASS_A', lecturerId: 1, rulesVersion: 0, isLeader: false, isLecturer: true,
    canCreateGroup: false, canJoinGroup: false, rules: [],
    unassignedStudents: [{ studentId: 4, fullName: 'Pool Student', rollNumber: 'SE4', memberCode: 'M4',
      majorCode: 'SE', majorName: 'Software', role: 'MEMBER' }],
    groups: [{ id: 10, deadlineId: 8, schoolClassId: 1, name: 'Stable group', leaderId: 3,
      leaderName: 'Leader', status: 'OPEN', memberCount: 1, maxMembers: 6, version: 0,
      members: [{ studentId: 3, fullName: 'Leader', rollNumber: 'SE3', memberCode: 'M3',
        majorCode: 'SE', majorName: 'Software', role: 'LEADER' }],
      ruleEvaluations: [], allRulesPassed: true, hasHardRuleViolations: false }],
  };
}
function assigned(): WorkspaceDTO {
  const data = fixture();
  data.groups[0].members.push({ ...data.unassignedStudents[0], groupId: 10 });
  data.groups[0].memberCount++;
  data.unassignedStudents = [];
  return data;
}
async function tick(ms = 500) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}
async function mount() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<ConfigProvider theme={{ token: { motion: false } }}><QueryClientProvider client={client}>
    <RealtimeProvider><MemoryRouter initialEntries={['/lecturer/group-review/advanced?classId=1&deadlineId=8']}>
      <LecturerGroupWorkspacePage />
    </MemoryRouter></RealtimeProvider>
  </QueryClientProvider></ConfigProvider>);
  await tick(800);
  expect(screen.getByText('Stable group')).toBeInTheDocument();
  expect(client.isFetching()).toBe(0);
}
function emit(eventType = 'GROUP_UPDATED', extra = {}) {
  socket.listeners.get('/topic/classes/1/deadlines/8/groups')!({ body: JSON.stringify({
    eventId: String(++eventId), eventType, deadlineId: 8, schoolClassId: 1, groupId: 10, ...extra,
  }) });
}
function transfer() {
  return { setData: vi.fn(), getData: () => JSON.stringify({
    studentId: 4, fromGroupId: null, classId: 1, deadlineId: 8,
  }), effectAllowed: '', dropEffect: '' };
}

beforeEach(async () => {
  vi.resetAllMocks(); socket.listeners.clear(); socket.client = null; eventId = 0;
  await i18n.changeLanguage('en'); vi.useFakeTimers();
  vi.stubGlobal('matchMedia', () => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.mocked(groupApi.getWorkspace).mockImplementation(async () => fixture());
  vi.mocked(groupApi.getRecommendedStudents).mockResolvedValue([]);
});
afterEach(() => { cleanup(); client?.clear(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('interactive group board synchronization', () => {
  it('does not poll while connected and preserves columns, filters and scroll during background reads', async () => {
    await mount();
    const calls = vi.mocked(groupApi.getWorkspace).mock.calls.length;
    const column = document.querySelector('[data-group-id="10"]');
    const track = document.querySelector('.group-board-track')!;
    track.scrollLeft = 123;
    fireEvent.change(screen.getByLabelText(i18n.t('groupBoard.searchGroups')), { target: { value: 'Stable' } });
    await tick(61000);
    expect(groupApi.getWorkspace).toHaveBeenCalledTimes(calls);
    let finish!: (data: WorkspaceDTO) => void;
    vi.mocked(groupApi.getWorkspace).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await act(async () => { emit(); emit('MEMBER_JOINED'); });
    await tick();
    expect(groupApi.getWorkspace).toHaveBeenCalledTimes(calls + 1);
    expect(document.querySelector('[data-group-id="10"]')).toBe(column);
    expect(screen.queryByText(i18n.t('common.processing'))).not.toBeInTheDocument();
    expect(track.scrollLeft).toBe(123);
    await act(async () => { finish(fixture()); });
    await tick();
    expect(screen.getByLabelText(i18n.t('groupBoard.searchGroups'))).toHaveValue('Stable');
    expect(document.querySelector('[data-group-id="10"]')).toBe(column);
  });

  it('keeps an optimistic drop during socket events and reconciles once after the save', async () => {
    await mount();
    const calls = vi.mocked(groupApi.getWorkspace).mock.calls.length;
    const column = document.querySelector('[data-group-id="10"]')!;
    let finish!: () => void;
    vi.mocked(groupApi.lecturerAddMember).mockImplementationOnce(() => new Promise(resolve => {
      finish = () => resolve(assigned().groups[0]);
    }));
    fireEvent.drop(column, { dataTransfer: transfer() });
    await tick(10);
    expect(groupApi.lecturerAddMember).toHaveBeenCalledExactlyOnceWith(8, 1, 10, 4);
    expect(column).toHaveTextContent('Pool Student');
    await act(async () => { emit(); emit('MEMBER_JOINED'); });
    await tick(1000);
    expect(groupApi.getWorkspace).toHaveBeenCalledTimes(calls);
    expect(column).toHaveTextContent('Pool Student');
    vi.mocked(groupApi.getWorkspace).mockResolvedValue(assigned());
    await act(async () => { finish(); emit(); });
    await tick(1000);
    expect(groupApi.getWorkspace).toHaveBeenCalledTimes(calls + 1);
    expect(document.querySelector('[data-group-id="10"]')).toBe(column);
    expect(column).toHaveTextContent('Pool Student');
  });

  it('defers remote updates during a drag even with a recommendation observer on the shared cache', async () => {
    await mount();
    fireEvent.click(screen.getByRole('button', { name: i18n.t('groupBoard.suggestMembers') }));
    await tick();
    const calls = vi.mocked(groupApi.getWorkspace).mock.calls.length;
    const card = document.querySelector('[data-student-id="4"]')!;
    fireEvent.dragStart(card, { dataTransfer: transfer() });
    await act(async () => { emit(); emit(); });
    await tick(1000);
    expect(groupApi.getWorkspace).toHaveBeenCalledTimes(calls);
    expect(card).toBeInTheDocument();
    fireEvent.dragEnd(card);
    await tick();
    expect(groupApi.getWorkspace).toHaveBeenCalledTimes(calls + 1);
    expect(document.querySelector('[data-student-id="4"]')).toBe(card);
  });

  it('polls in the background only while disconnected and resynchronizes after reconnecting', async () => {
    await mount();
    const column = document.querySelector('[data-group-id="10"]');
    const calls = vi.mocked(groupApi.getWorkspace).mock.calls.length;
    await act(async () => { socket.client!.connected = false; socket.client!.config.onWebSocketClose(); });
    await tick(31000);
    expect(groupApi.getWorkspace).toHaveBeenCalledTimes(calls + 1);
    await act(async () => { socket.client!.connected = true; socket.client!.config.onConnect(); });
    await tick();
    expect(groupApi.getWorkspace).toHaveBeenCalledTimes(calls + 2);
    await tick(61000);
    expect(groupApi.getWorkspace).toHaveBeenCalledTimes(calls + 2);
    expect(document.querySelector('[data-group-id="10"]')).toBe(column);
  });

  it('reads again for an event received during a pending read without cancelling that read', async () => {
    await mount();
    const calls = vi.mocked(groupApi.getWorkspace).mock.calls.length;
    let finish!: (data: WorkspaceDTO) => void;
    let signal!: AbortSignal;
    vi.mocked(groupApi.getWorkspace).mockImplementationOnce((_deadline, _class, requestSignal) => {
      signal = requestSignal!;
      return new Promise(resolve => { finish = resolve; });
    });
    await act(async () => { emit(); });
    await tick();
    await act(async () => { emit(); });
    await tick();
    expect(signal.aborted).toBe(false);
    expect(groupApi.getWorkspace).toHaveBeenCalledTimes(calls + 1);
    vi.mocked(groupApi.getWorkspace).mockResolvedValue(assigned());
    await act(async () => { finish(fixture()); });
    await tick();
    expect(groupApi.getWorkspace).toHaveBeenCalledTimes(calls + 2);
    expect(document.querySelector('[data-group-id="10"]')).toHaveTextContent('Pool Student');
  });

  it('keeps the board on temporary refresh errors and allows a manual retry', async () => {
    await mount();
    const column = document.querySelector('[data-group-id="10"]');
    vi.mocked(groupApi.getWorkspace).mockRejectedValueOnce({ status: 503, message: 'Refresh unavailable' });
    await act(async () => { emit(); });
    await tick();
    expect(document.querySelector('[data-group-id="10"]')).toBe(column);
    expect(screen.getByRole('alert')).toHaveTextContent(i18n.t('errors.status500'));
    fireEvent.click(screen.getByRole('button', { name: i18n.t('common.refresh'), exact: true }));
    await tick();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(document.querySelector('[data-group-id="10"]')).toBe(column);
  });

  it('hides cached workspace content when access is revoked', async () => {
    await mount();
    vi.mocked(groupApi.getWorkspace).mockRejectedValueOnce({ status: 403, message: 'Access revoked' });
    await act(async () => { emit(); });
    await tick();
    expect(screen.queryByText('Stable group')).not.toBeInTheDocument();
  });

  it('applies deadline closure immediately while deferring the server read until drag end', async () => {
    await mount();
    const calls = vi.mocked(groupApi.getWorkspace).mock.calls.length;
    const card = document.querySelector('[data-student-id="4"]')!;
    fireEvent.dragStart(card, { dataTransfer: transfer() });
    await act(async () => { emit('DEADLINE_CLOSED', { version: 1, affectedClassIds: [1] }); });
    expect(client.getQueryData<WorkspaceDTO>(key)?.deadlineStatus).toBe('EXPIRED');
    expect(client.getQueryData<WorkspaceDTO>(key)?.canJoinGroup).toBe(false);
    await tick(1000);
    expect(groupApi.getWorkspace).toHaveBeenCalledTimes(calls);
    fireEvent.dragEnd(card);
    await tick();
    expect(groupApi.getWorkspace).toHaveBeenCalledTimes(calls + 1);
  });
});
