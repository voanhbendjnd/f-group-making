import { Modal } from 'antd';
import { cleanup, render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { LecturerGroupWorkspacePage } from '@/pages/lecturer/LecturerGroupWorkspacePage';
import { groupApi } from '@/features/group/api/groupApi';
import { classApi } from '@/features/classes/api/classApi';
import { deadlineApi } from '@/features/deadline/api/deadlineApi';
import type { GroupStatus, WorkspaceDTO } from '@/features/group/types/groupTypes';
import i18n from '@/locales/i18n';

const auth = vi.hoisted(() => ({ user: { id: 1, authorities: ['ROLE_LECTURE'] } }));
vi.mock('@/app/providers/ToastContext', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }) }));
vi.mock('@/app/providers/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/app/providers/TermContext', () => ({ useTerm: () => ({ lockTermSelection: () => () => {} }) }));
vi.mock('@/features/group/api/groupApi', () => ({ groupApi: { getWorkspace: vi.fn(), lecturerCreateGroup: vi.fn(), lecturerRemoveMember: vi.fn(), lecturerDisbandGroup: vi.fn(), lecturerMoveMember: vi.fn(), lecturerAddMember: vi.fn(), lecturerSubmitGroup: vi.fn() } }));
vi.mock('@/features/classes/api/classApi', () => ({ classApi: { getClasses: vi.fn(), getMyClasses: vi.fn() } }));
vi.mock('@/features/deadline/api/deadlineApi', () => ({ deadlineApi: { getDeadlines: vi.fn() } }));
vi.mock('@/features/group/hooks/useGroupWebSocket', () => ({ useGroupWebSocket: () => ({ status: 'connected' }) }));
vi.mock('@/features/group/components/LecturerGroupModal', () => ({ LecturerGroupModal: (props: { open: boolean; initialStudentIds: number[] }) => props.open ? <div role="dialog" aria-label="Create fixture">{props.initialStudentIds.join(',')}</div> : null }));
vi.mock('@/features/group/components/RejectGroupModal', () => ({ RejectGroupModal: () => null }));
let client: QueryClient;
function mount(state: GroupStatus, deadlineStatus = 'EXPIRED', count = 4, prepare?: (data: WorkspaceDTO) => void, entry = '/lecturer/groups?classId=1&deadlineId=8') {
  const workspace: WorkspaceDTO = { deadlineId: 8, deadlineName: 'Session', deadlineStatus, deadlineStartTime: '2020-01-01T00:00:00Z',
    deadlineEndTime: '2020-01-02T00:00:00Z', deadlineExpired: true, canManageGroups: true, schoolClassId: 1, schoolClassName: 'CLASS_A',
    lecturerId: 1, rulesVersion: 0, isLeader: false, isLecturer: true, canCreateGroup: false, canJoinGroup: false,
    rules: [], unassignedStudents: [{ studentId: 4, fullName: 'Unassigned Student', rollNumber: 'SE4', memberCode: 'M4', majorCode: 'SE', majorName: 'Software', role: 'MEMBER' }], groups: [{ id: 10, deadlineId: 8, schoolClassId: 1, name: 'Policy group', leaderId: 3,
      leaderName: 'Leader', status: state, memberCount: count, maxMembers: 6, version: 0, members: [{ studentId: 3, fullName: 'Last Member', rollNumber: 'SE3', memberCode: 'M3', majorCode: 'SE', majorName: 'Software', role: 'LEADER' }], ruleEvaluations: [], allRulesPassed: true, hasHardRuleViolations: false }] };
  prepare?.(workspace);
  vi.mocked(groupApi.getWorkspace).mockResolvedValue(workspace);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[entry]}><LecturerGroupWorkspacePage /></MemoryRouter></QueryClientProvider>);
}
beforeEach(async () => {
  vi.clearAllMocks(); auth.user = { id: 1, authorities: ['ROLE_LECTURE'] }; await i18n.changeLanguage('en');
  vi.mocked(classApi.getClasses).mockResolvedValue({ result: [], meta: { page: 1, pageSize: 10, pages: 0, total: 0 } });
  vi.mocked(classApi.getMyClasses).mockResolvedValue({ result: [], meta: { page: 1, pageSize: 10, pages: 0, total: 0 } });
  vi.mocked(deadlineApi.getDeadlines).mockResolvedValue({ result: [], meta: { page: 1, pageSize: 10, pages: 0, total: 0 } });
});
afterEach(() => { cleanup(); client?.clear(); });

describe('lecturer group policy controls', () => {
  it('keeps columns in numeric group order after submit and a shuffled server refresh', async () => {
    let initial!: WorkspaceDTO;
    mount('OPEN', 'EXPIRED', 4, data => {
      const base = data.groups[0];
      data.groups = [
        { ...base, id: 110, name: 'Hundredth group', sequenceNo: 100, groupCode: 'G100', status: 'ACCEPTED', members: [] },
        { ...base, id: 12, name: 'Third group', sequenceNo: 3, groupCode: 'G03', status: 'REVOKED', members: [] },
        { ...base, id: 10, sequenceNo: 1, groupCode: 'G01' },
        { ...base, id: 11, name: 'Second group', sequenceNo: 2, groupCode: 'G02', status: 'PENDING', members: [] },
      ];
      initial = data;
    });
    await screen.findByText('Policy group');
    const ids = () => [...document.querySelectorAll('[data-group-id]')].map(column => Number(column.getAttribute('data-group-id')));
    expect(ids()).toEqual([10, 11, 12, 110]);
    const originalColumn = document.querySelector('[data-group-id="10"]')!;
    vi.mocked(groupApi.lecturerSubmitGroup).mockImplementation(async () => {
      const submitted = { ...initial.groups.find(g => g.id === 10)!, status: 'PENDING' as const };
      vi.mocked(groupApi.getWorkspace).mockResolvedValue({ ...initial,
        groups: [...initial.groups.filter(g => g.id !== 10), submitted] });
      return submitted;
    });
    fireEvent.click(within(originalColumn as HTMLElement).getByRole('button', { name: i18n.t('groupLifecycle.submit'), exact: true }));
    await waitFor(() => expect(groupApi.lecturerSubmitGroup).toHaveBeenCalledExactlyOnceWith(8, 1, 10));
    await waitFor(() => expect(within(originalColumn as HTMLElement).getByRole('button', { name: i18n.t('groupWorkspace.approve'), exact: true })).toBeEnabled());
    expect(ids()).toEqual([10, 11, 12, 110]);
    expect(document.querySelector('[data-group-id="10"]')).toBe(originalColumn);
    expect(originalColumn).toHaveTextContent('G01');
  });

  it('searches by group code without renumbering filtered columns', async () => {
    mount('OPEN', 'EXPIRED', 4, data => {
      data.groups[0].sequenceNo = 3; data.groups[0].groupCode = 'G03';
      data.groups.push({ ...data.groups[0], id: 11, sequenceNo: 1, groupCode: 'G01', name: 'First group', members: [] });
    });
    await screen.findByText('Policy group');
    fireEvent.change(screen.getByLabelText(i18n.t('groupBoard.searchGroups')), { target: { value: 'G03' } });
    expect(document.querySelectorAll('[data-group-id]')).toHaveLength(1);
    expect(document.querySelector('[data-group-id="10"]')).toHaveTextContent('G03');
    expect(screen.queryByText('First group')).not.toBeInTheDocument();
  });

  it('moves between groups atomically, renders immediately, and rolls back after a conflict', async () => {
    let reject!: (error: unknown) => void;
    vi.mocked(groupApi.lecturerMoveMember).mockReturnValue(new Promise((_, fail) => { reject = fail; }));
    mount('OPEN', 'EXPIRED', 1, data => { data.groups.push({ ...data.groups[0], id: 11, name: 'Target group', members: [], memberCount: 0 }); });
    await screen.findByText('Last Member');
    const target = document.querySelector('[data-group-id="11"]')!;
    fireEvent.drop(target, { dataTransfer: { getData: () => JSON.stringify({ studentId: 3, fromGroupId: 10, classId: 1, deadlineId: 8 }) } });
    await waitFor(() => expect(groupApi.lecturerMoveMember).toHaveBeenCalledExactlyOnceWith(8, 1, 10, 11, 3));
    expect(target).toHaveTextContent('Last Member');
    expect(target.querySelector('button.btn')).toBeDisabled();
    expect(screen.queryByText('Policy group')).not.toBeInTheDocument();
    expect(groupApi.lecturerRemoveMember).not.toHaveBeenCalled();
    await act(async () => { reject(new Error('Conflict')); });
    await screen.findByText('Policy group');
    expect(document.querySelector('[data-group-id="10"]')).toHaveTextContent('Last Member');
    expect(target).not.toHaveTextContent('Last Member');
  });

  it.each(['ACCEPTED', 'PENDING', 'FULL', 'OTHER_CLASS'] as const)('refuses a drop into %s', async scenario => {
    mount('OPEN', 'EXPIRED', 1, data => { data.groups[0].status = scenario === 'ACCEPTED' || scenario === 'PENDING' ? scenario : 'OPEN';
      if (scenario === 'FULL') data.groups[0].maxMembers = 1;
    });
    await screen.findByText('Unassigned Student');
    fireEvent.drop(document.querySelector('[data-group-id="10"]')!, { dataTransfer: { getData: () => JSON.stringify({ studentId: 4, fromGroupId: null, classId: scenario === 'OTHER_CLASS' ? 2 : 1, deadlineId: 8 }) } });
    expect(groupApi.lecturerAddMember).not.toHaveBeenCalled();
  });

  it('preserves student search and major filters when hidden and restored', async () => {
    mount('OPEN'); await screen.findByText('Unassigned Student');
    fireEvent.change(screen.getByLabelText(i18n.t('groupWorkspace.searchPlaceholder')), { target: { value: 'SE4' } });
    fireEvent.change(screen.getByLabelText(i18n.t('groupBoard.majorFilter')), { target: { value: 'SE' } });
    fireEvent.click(screen.getAllByRole('button', { name: i18n.t('groupBoard.hideStudents'), exact: true })[0]);
    expect(screen.queryByText('Unassigned Student')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: i18n.t('groupBoard.showStudents'), exact: true }));
    expect(screen.getByLabelText(i18n.t('groupWorkspace.searchPlaceholder'))).toHaveValue('SE4');
    expect(screen.getByLabelText(i18n.t('groupBoard.majorFilter'))).toHaveValue('SE');
  });

  it('never falls back to a different class when opened without class context', async () => {
    mount('OPEN', 'EXPIRED', 4, undefined, '/lecturer/group-review/advanced');
    expect(await screen.findByText(i18n.t('groupBoard.chooseClass'))).toBeInTheDocument();
    expect(groupApi.getWorkspace).not.toHaveBeenCalled();
  });

  it('resolves the class deadline across catalog pages without choosing another class', async () => {
    const deadline = { id: 8, name: 'Session', schoolClassIds: [1], schoolClassNames: ['CLASS_A'], status: 'EXPIRED' as const, startTime: '', endTime: '' };
    vi.mocked(deadlineApi.getDeadlines).mockImplementation(async ({ page } = {}) => ({ result: page === 2 ? [deadline] : [{ ...deadline, id: 99, schoolClassIds: [99] }], meta: { pages: 2, page: page ?? 1, pageSize: 50, total: 2 } }));
    mount('OPEN', 'EXPIRED', 4, undefined, '/lecturer/group-review/advanced?classId=1&termId=8');
    await screen.findByText('Policy group');
    expect(groupApi.getWorkspace).toHaveBeenCalledWith(8, 1, expect.anything());
    expect(groupApi.getWorkspace).not.toHaveBeenCalledWith(99, 1, expect.anything());
  });

  it('requires an explicit deadline if a class has several sessions', async () => {
    vi.mocked(deadlineApi.getDeadlines).mockResolvedValue({ result: [8, 9].map(id => ({ id, name: `Session ${id}`, schoolClassIds: [1], schoolClassNames: ['CLASS_A'], status: 'EXPIRED', startTime: '', endTime: '' })), meta: { pages: 1, page: 1, pageSize: 50, total: 2 } });
    mount('OPEN', 'EXPIRED', 4, undefined, '/lecturer/group-review/advanced?classId=1');
    await screen.findByText(i18n.t('groupBoard.multipleSessions'));
    expect(groupApi.getWorkspace).not.toHaveBeenCalled();
  });
  it('drops an unassigned student into a preselected modal without writing or removing the student', async () => {
    mount('OPEN'); await screen.findByText('Unassigned Student');
    const zone = screen.getByText(i18n.t('groupWorkspace.quickDropIdle')).closest('[role="button"]')!;
    const transfer = { getData: () => JSON.stringify({ studentId: 4, fromGroupId: null, classId: 1, deadlineId: 8 }), dropEffect: '' };
    fireEvent.dragOver(zone, { dataTransfer: transfer }); expect(transfer.dropEffect).toBe('move');
    fireEvent.drop(zone, { dataTransfer: transfer });
    expect(screen.getByRole('dialog', { name: 'Create fixture' })).toHaveTextContent('4');
    expect(screen.getByText('Unassigned Student')).toBeInTheDocument();
    expect(groupApi.lecturerCreateGroup).not.toHaveBeenCalled();
  });

  it('keeps click and keyboard opening without preselecting a student', async () => {
    mount('OPEN'); await screen.findByText('Unassigned Student');
    const zone = screen.getByText(i18n.t('groupWorkspace.quickDropIdle')).closest('[role="button"]')!;
    fireEvent.keyDown(zone, { key: 'Enter' });
    expect(screen.getByRole('dialog', { name: 'Create fixture' })).toBeEmptyDOMElement();
  });

  it('requires confirmation to disband the last-member group and never calls remove-member', async () => {
    const confirm = vi.spyOn(Modal, 'confirm').mockReturnValue({ destroy: vi.fn(), update: vi.fn() });
    vi.mocked(groupApi.lecturerDisbandGroup).mockResolvedValue(undefined);
    mount('OPEN', 'EXPIRED', 1); await screen.findByText('Last Member');
    const pool = document.querySelector('.unassigned-pool')!;
    fireEvent.drop(pool, { dataTransfer: { getData: () => JSON.stringify({ studentId: 3, fromGroupId: 10, classId: 1, deadlineId: 8 }) } });
    expect(confirm).toHaveBeenCalledOnce(); expect(groupApi.lecturerDisbandGroup).not.toHaveBeenCalled();
    await act(async () => { await confirm.mock.calls[0]![0].onOk?.(); });
    await waitFor(() => expect(groupApi.lecturerDisbandGroup).toHaveBeenCalledWith(8, 1, 10));
    expect(groupApi.lecturerRemoveMember).not.toHaveBeenCalled(); confirm.mockRestore();
  });

  it.each(['PENDING', 'ACCEPTED'] as const)('does not disband the last member of %s by drag', async state => {
    const confirm = vi.spyOn(Modal, 'confirm').mockReturnValue({ destroy: vi.fn(), update: vi.fn() });
    mount(state, 'EXPIRED', 1); await screen.findByText('Last Member');
    fireEvent.drop(document.querySelector('.unassigned-pool')!, { dataTransfer: { getData: () => JSON.stringify({ studentId: 3, fromGroupId: 10, classId: 1, deadlineId: 8 }) } });
    expect(confirm).not.toHaveBeenCalled(); expect(groupApi.lecturerDisbandGroup).not.toHaveBeenCalled(); confirm.mockRestore();
  });

  it.each(['OPEN', 'PENDING', 'ACCEPTED', 'REVOKED'] as const)('only shows Approve for PENDING, not %s indiscriminately', async state => {
    mount(state); await screen.findByText('Policy group');
    expect(screen.queryByRole('button', { name: i18n.t('groupWorkspace.approve'), exact: true }) !== null).toBe(state === 'PENDING');
    expect(screen.queryByRole('button', { name: i18n.t('groupLifecycle.submit'), exact: true }) !== null).toBe(['OPEN', 'REVOKED'].includes(state));
  });
  it('hides unlock from an unassigned Lecturer Master', async () => {
    auth.user = { id: 2, authorities: ['ROLE_LECTURE_MASTER'] }; mount('ACCEPTED'); await screen.findByText('Policy group');
    expect(screen.queryByRole('button', { name: i18n.t('groupLifecycle.unlock') })).not.toBeInTheDocument();
  });
  it.each(['ROLE_ADMIN', 'ROLE_LECTURE_MASTER'])('allows unlock for %s when authorized', async role => {
    auth.user = { id: role === 'ROLE_ADMIN' ? 2 : 1, authorities: [role] }; mount('ACCEPTED'); await screen.findByText('Policy group');
    expect(screen.getByRole('button', { name: i18n.t('groupLifecycle.unlock') })).toBeEnabled();
  });
});
