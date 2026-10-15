import { Modal } from 'antd';
import { cleanup, render, screen, fireEvent, waitFor, act } from '@testing-library/react';
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
vi.mock('@/features/group/api/groupApi', () => ({ groupApi: { getWorkspace: vi.fn(), lecturerCreateGroup: vi.fn(), lecturerRemoveMember: vi.fn(), lecturerDisbandGroup: vi.fn() } }));
vi.mock('@/features/classes/api/classApi', () => ({ classApi: { getClasses: vi.fn(), getMyClasses: vi.fn() } }));
vi.mock('@/features/deadline/api/deadlineApi', () => ({ deadlineApi: { getDeadlines: vi.fn() } }));
vi.mock('@/features/group/hooks/useGroupWebSocket', () => ({ useGroupWebSocket: () => ({ status: 'connected' }) }));
vi.mock('@/features/group/components/LecturerGroupModal', () => ({ LecturerGroupModal: (props: { open: boolean; initialStudentIds: number[] }) => props.open ? <div role="dialog" aria-label="Create fixture">{props.initialStudentIds.join(',')}</div> : null }));
vi.mock('@/features/group/components/RejectGroupModal', () => ({ RejectGroupModal: () => null }));
let client: QueryClient;
function mount(state: GroupStatus, deadlineStatus = 'EXPIRED', count = 4) {
  const workspace: WorkspaceDTO = { deadlineId: 8, deadlineName: 'Session', deadlineStatus, deadlineStartTime: '2020-01-01T00:00:00Z',
    deadlineEndTime: '2020-01-02T00:00:00Z', deadlineExpired: true, canManageGroups: true, schoolClassId: 1, schoolClassName: 'CLASS_A',
    lecturerId: 1, rulesVersion: 0, isLeader: false, isLecturer: true, canCreateGroup: false, canJoinGroup: false,
    rules: [], unassignedStudents: [{ studentId: 4, fullName: 'Unassigned Student', rollNumber: 'SE4', memberCode: 'M4', majorCode: 'SE', majorName: 'Software', role: 'MEMBER' }], groups: [{ id: 10, deadlineId: 8, schoolClassId: 1, name: 'Policy group', leaderId: 3,
      leaderName: 'Leader', status: state, memberCount: count, maxMembers: 6, version: 0, members: [{ studentId: 3, fullName: 'Last Member', rollNumber: 'SE3', memberCode: 'M3', majorCode: 'SE', majorName: 'Software', role: 'LEADER' }], ruleEvaluations: [], allRulesPassed: true, hasHardRuleViolations: false }] };
  vi.mocked(groupApi.getWorkspace).mockResolvedValue(workspace);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/lecturer/groups?classId=1&deadlineId=8']}><LecturerGroupWorkspacePage /></MemoryRouter></QueryClientProvider>);
}
beforeEach(async () => {
  vi.clearAllMocks(); auth.user = { id: 1, authorities: ['ROLE_LECTURE'] }; await i18n.changeLanguage('en');
  vi.mocked(classApi.getClasses).mockResolvedValue({ result: [], meta: { page: 1, pageSize: 10, pages: 0, total: 0 } });
  vi.mocked(classApi.getMyClasses).mockResolvedValue({ result: [], meta: { page: 1, pageSize: 10, pages: 0, total: 0 } });
  vi.mocked(deadlineApi.getDeadlines).mockResolvedValue({ result: [], meta: { page: 1, pageSize: 10, pages: 0, total: 0 } });
});
afterEach(() => { cleanup(); client?.clear(); });

describe('lecturer group policy controls', () => {
  it('drops an unassigned student into a preselected modal without writing or removing the student', async () => {
    mount('OPEN'); await screen.findByText('Unassigned Student');
    const zone = screen.getByText(i18n.t('groupWorkspace.quickDropIdle')).closest('[role="button"]')!;
    const transfer = { getData: () => JSON.stringify({ studentId: 4, fromGroupId: null }), dropEffect: '' };
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
    fireEvent.drop(pool, { dataTransfer: { getData: () => JSON.stringify({ studentId: 3, fromGroupId: 10 }) } });
    expect(confirm).toHaveBeenCalledOnce(); expect(groupApi.lecturerDisbandGroup).not.toHaveBeenCalled();
    await act(async () => { await confirm.mock.calls[0]![0].onOk?.(); });
    await waitFor(() => expect(groupApi.lecturerDisbandGroup).toHaveBeenCalledWith(8, 1, 10));
    expect(groupApi.lecturerRemoveMember).not.toHaveBeenCalled(); confirm.mockRestore();
  });

  it.each(['PENDING', 'ACCEPTED'] as const)('does not disband the last member of %s by drag', async state => {
    const confirm = vi.spyOn(Modal, 'confirm').mockReturnValue({ destroy: vi.fn(), update: vi.fn() });
    mount(state, 'EXPIRED', 1); await screen.findByText('Last Member');
    fireEvent.drop(document.querySelector('.unassigned-pool')!, { dataTransfer: { getData: () => JSON.stringify({ studentId: 3, fromGroupId: 10 }) } });
    expect(confirm).not.toHaveBeenCalled(); expect(groupApi.lecturerDisbandGroup).not.toHaveBeenCalled(); confirm.mockRestore();
  });

  it.each(['OPEN', 'PENDING', 'ACCEPTED', 'REVOKED'] as const)('only shows Approve for PENDING, not %s indiscriminately', async state => {
    mount(state); await screen.findByText('Policy group');
    expect(screen.queryByRole('button', { name: i18n.t('groupWorkspace.approve'), exact: true }) !== null).toBe(state === 'PENDING');
    expect(screen.queryByRole('button', { name: i18n.t('groupLifecycle.submit'), exact: true }) !== null).toBe(state === 'OPEN');
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
