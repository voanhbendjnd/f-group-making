import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider } from 'antd';
import { MemoryRouter } from 'react-router-dom';
import { RealtimeProvider } from '@/app/providers/RealtimeProvider';
import { LecturerGroupWorkspacePage } from '@/pages/lecturer/LecturerGroupWorkspacePage';
import { groupApi } from '@/features/group/api/groupApi';
import { syncDeadlineQueries } from '@/features/deadline/realtime';
import type { GroupDTO, GroupMemberDTO, WorkspaceDTO } from '@/features/group/types/groupTypes';
import i18n from '@/locales/i18n';

const socket = vi.hoisted(() => ({ listeners: new Map<string, (frame: { body: string }) => void>() }));
vi.mock('@stomp/stompjs', () => ({ Client: class {
  connected = false;
  constructor(private config: { onConnect: () => void }) {}
  activate() { this.connected = true; this.config.onConnect(); }
  deactivate() { this.connected = false; return Promise.resolve(); }
  subscribe(topic: string, listener: (frame: { body: string }) => void) {
    socket.listeners.set(topic, listener);
    return { unsubscribe: () => socket.listeners.delete(topic) };
  }
} }));
vi.mock('sockjs-client', () => ({ default: vi.fn() }));
vi.mock('@/app/providers/AuthContext', () => ({ useAuth: () => ({ user: { id: 1, authorities: ['ROLE_LECTURE'] }, isLecturer: true, isAdmin: false, isStudent: false }) }));
vi.mock('@/app/providers/ToastContext', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/app/providers/TermContext', () => ({ useTerm: () => ({ lockTermSelection: () => () => {} }) }));
vi.mock('@/features/students/hooks/useStudentProfile', () => ({ useStudentProfile: () => ({ data: undefined }) }));
vi.mock('@/features/group/api/groupApi', () => ({ groupApi: { getWorkspace: vi.fn(), getRecommendedStudents: vi.fn(), lecturerAddMember: vi.fn() } }));

const student = (studentId: number, fullName: string): GroupMemberDTO => ({ studentId, fullName, rollNumber: `SE${studentId}`, memberCode: `M${studentId}`, majorCode: 'SE', majorName: 'Software', role: 'MEMBER' });
const candidate = student(4, 'Suggested Student');
const remaining = student(5, 'Remaining Student');
let client: QueryClient;
let workspace: WorkspaceDTO;

beforeEach(async () => {
  vi.resetAllMocks(); socket.listeners.clear(); await i18n.changeLanguage('en');
  vi.stubGlobal('matchMedia', () => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  const group = (id: number): GroupDTO => ({ id, deadlineId: 8, schoolClassId: 1, name: `Group ${id}`, leaderId: id, leaderName: `Leader ${id}`,
    status: 'OPEN', memberCount: 1, maxMembers: 6, version: 0, members: [student(id, `Leader ${id}`)], ruleEvaluations: [], allRulesPassed: true, hasHardRuleViolations: false });
  workspace = { deadlineId: 8, deadlineName: 'Session', deadlineStatus: 'ACTIVE', deadlineStartTime: '2020-01-01T00:00:00Z', deadlineEndTime: '2099-01-01T00:00:00Z',
    deadlineExpired: false, canManageGroups: true, schoolClassId: 1, schoolClassName: 'CLASS_A', lecturerId: 1, rulesVersion: 0, isLeader: false, isLecturer: true,
    canCreateGroup: false, canJoinGroup: false, rules: [], groups: [group(10), group(11)], unassignedStudents: [candidate, remaining] };
  vi.mocked(groupApi.getWorkspace).mockImplementation(async () => workspace);
  vi.mocked(groupApi.getRecommendedStudents).mockImplementation(async () => workspace.unassignedStudents.map(s => ({ ...s, matchScore: workspace.unassignedStudents.length === 2 ? 80 : 40 })));
});
afterEach(() => { cleanup(); client?.clear(); vi.unstubAllGlobals(); });

async function mountBoard() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<ConfigProvider theme={{ token: { motion: false } }}><QueryClientProvider client={client}><RealtimeProvider>
    <MemoryRouter initialEntries={['/lecturer/group-review/advanced?classId=1&deadlineId=8']}><LecturerGroupWorkspacePage /></MemoryRouter>
  </RealtimeProvider></QueryClientProvider></ConfigProvider>);
  await screen.findByRole('heading', { name: 'Group 10' });
  for (const id of [10, 11]) {
    const column = document.querySelector(`[data-group-id="${id}"]`)! as HTMLElement;
    fireEvent.click(within(column).getByRole('button', { name: i18n.t('groupBoard.suggestMembers'), exact: true }));
    await within(column.querySelector('.board-column-recommendations')! as HTMLElement).findByText(candidate.fullName);
  }
  fireEvent.change(screen.getByLabelText(i18n.t('groupBoard.suggestForGroup')), { target: { value: '10' } });
  await waitFor(() => expect(client.getQueryData(['recommended-students-pool', 8, 1, 10])).toHaveLength(2));
}

function lists() { return Array.from(document.querySelectorAll<HTMLElement>('.board-column-recommendations')); }
function assignCandidate() {
  workspace = { ...workspace, unassignedStudents: [remaining], groups: workspace.groups.map(group => group.id === 10
    ? { ...group, memberCount: 2, members: [...group.members, candidate] } : group) };
}
function emit(eventType: string) {
  const listener = socket.listeners.get('/topic/classes/1/deadlines/8/groups');
  expect(listener).toBeDefined();
  listener!({ body: JSON.stringify({ eventId: eventType, eventType, deadlineId: 8, schoolClassId: 1 }) });
}

describe('group recommendation realtime updates', () => {
  it('removes a quick-added student from every open list immediately and refreshes scores after success', async () => {
    let finish!: (group: GroupDTO) => void;
    vi.mocked(groupApi.lecturerAddMember).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    await mountBoard();
    fireEvent.click(lists()[0].querySelector('button')!);
    await waitFor(() => expect(groupApi.lecturerAddMember).toHaveBeenCalledExactlyOnceWith(8, 1, 10, 4));
    for (const list of lists()) expect(within(list).queryByText(candidate.fullName)).not.toBeInTheDocument();
    assignCandidate();
    await act(async () => { finish(workspace.groups[0]); });
    await waitFor(() => {
      for (const list of lists()) {
        expect(within(list).queryByText(candidate.fullName)).not.toBeInTheDocument();
        expect(within(list).getByText('40%')).toBeInTheDocument();
      }
      expect(client.getQueryData(['recommended-students-pool', 8, 1, 10])).toEqual([expect.objectContaining({ studentId: 5, matchScore: 40 })]);
    });
  });

  it('restores the candidate in open lists when adding fails', async () => {
    let fail!: (error: Error) => void;
    vi.mocked(groupApi.lecturerAddMember).mockImplementation(() => new Promise((_, reject) => { fail = reject; }));
    await mountBoard();
    fireEvent.click(lists()[0].querySelector('button')!);
    await waitFor(() => expect(groupApi.lecturerAddMember).toHaveBeenCalledOnce());
    for (const list of lists()) expect(within(list).queryByText(candidate.fullName)).not.toBeInTheDocument();
    await act(async () => { fail(new Error('Conflict')); });
    await waitFor(() => { for (const list of lists()) expect(within(list).getByText(candidate.fullName)).toBeInTheDocument(); });
  });

  it('updates open suggestions when another session joins and leaves a group', async () => {
    await mountBoard();
    const before = workspace;
    assignCandidate();
    await act(async () => { emit('MEMBER_JOINED'); });
    await waitFor(() => {
      for (const list of lists()) expect(within(list).queryByText(candidate.fullName)).not.toBeInTheDocument();
      expect(client.getQueryData(['recommended-students-pool', 8, 1, 10])).toHaveLength(1);
    });
    workspace = before;
    await act(async () => { emit('MEMBER_LEFT'); });
    await waitFor(() => {
      for (const list of lists()) expect(within(list).getByText(candidate.fullName)).toBeInTheDocument();
      expect(client.getQueryData(['recommended-students-pool', 8, 1, 10])).toHaveLength(2);
    });
    expect(groupApi.lecturerAddMember).not.toHaveBeenCalled();
  });

  it.each(['recommended-students-group', 'recommended-students-pool', 'recommended-students', 'recommended-groups'])('aborts stale %s requests before realtime resync', async key => {
    client = new QueryClient();
    const queryKey = [key, 8, 1, 10];
    client.setQueryData(queryKey, []);
    let signal!: AbortSignal; let finish!: (value: unknown[]) => void;
    const pending = client.fetchQuery({ queryKey, queryFn: context => {
      signal = context.signal;
      return new Promise<unknown[]>(resolve => { finish = resolve; });
    } }).catch(() => undefined);
    await syncDeadlineQueries(client, { eventType: 'MEMBER_JOINED', deadlineId: 8, schoolClassId: 1 });
    expect(signal.aborted).toBe(true);
    finish([candidate]); await pending;
    expect(client.getQueryData(queryKey)).toEqual([]);
    expect(client.getQueryState(queryKey)?.isInvalidated).toBe(true);
  });
});
