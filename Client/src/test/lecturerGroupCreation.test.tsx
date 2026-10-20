import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LecturerGroupWorkspacePage } from '@/pages/lecturer/LecturerGroupWorkspacePage';
import { groupApi } from '@/features/group/api/groupApi';
import type { GroupDTO, GroupMemberDTO, WorkspaceDTO } from '@/features/group/types/groupTypes';
import i18n from '@/locales/i18n';

vi.mock('@/app/providers/AuthContext', () => ({ useAuth: () => ({ user: { id: 1, authorities: ['ROLE_LECTURE'] } }) }));
vi.mock('@/app/providers/ToastContext', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/app/providers/TermContext', () => ({ useTerm: () => ({ lockTermSelection: () => () => {} }) }));
vi.mock('@/features/group/hooks/useGroupWebSocket', () => ({ useGroupWebSocket: () => ({ status: 'connected' }) }));
vi.mock('@/features/group/api/groupApi', () => ({ groupApi: { getWorkspace: vi.fn(), lecturerCreateGroup: vi.fn() } }));

const student = (id: number, name: string): GroupMemberDTO => ({ studentId: id, fullName: name, rollNumber: `SE${id}`,
  memberCode: `M${id}`, majorCode: 'SE', majorName: 'Software', role: 'MEMBER' });
let client: QueryClient;

beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage('en');
  vi.stubGlobal('matchMedia', () => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() }));
});
afterEach(() => { cleanup(); client?.clear(); vi.unstubAllGlobals(); });

describe('advanced lecturer board draft creation', () => {
  it('creates consecutive groups with exactly the student dragged each time', async () => {
    let workspace: WorkspaceDTO = {
      deadlineId: 1, deadlineName: 'Grouping session', deadlineStatus: 'ACTIVE',
      deadlineStartTime: '2020-01-01T00:00:00Z', deadlineEndTime: '2099-01-01T00:00:00Z', deadlineExpired: false,
      canManageGroups: true, schoolClassId: 2, schoolClassName: 'DEMO_10SV', lecturerId: 1,
      rulesVersion: 0, isLeader: false, isLecturer: true, canCreateGroup: false, canJoinGroup: false,
      rules: [{ code: 'MAX_MEMBERS_PER_GROUP', value: 6, status: true }], groups: [],
      unassignedStudents: [student(24, 'First Dropped Student'), student(25, 'Second Dropped Student')],
    };
    vi.mocked(groupApi.getWorkspace).mockImplementation(async () => workspace);
    vi.mocked(groupApi.lecturerCreateGroup).mockImplementation(async (deadlineId, classId, request) => {
      const members = workspace.unassignedStudents.filter(s => request.studentIds.includes(s.studentId));
      if (members.length !== request.studentIds.length) throw new Error('Student already belongs to another group');
      const group: GroupDTO = {
        id: workspace.groups.length + 1, deadlineId, schoolClassId: classId, name: request.name,
        leaderId: members[0].studentId, leaderName: members[0].fullName, status: 'OPEN',
        memberCount: members.length, maxMembers: 6, version: 0,
        members: members.map((s, index) => ({ ...s, role: index === 0 ? 'LEADER' : 'MEMBER' })),
        ruleEvaluations: [], allRulesPassed: false, hasHardRuleViolations: false,
      };
      workspace = { ...workspace, groups: [...workspace.groups, group],
        unassignedStudents: workspace.unassignedStudents.filter(s => !request.studentIds.includes(s.studentId)) };
      return group;
    });
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<ConfigProvider theme={{ token: { motion: false } }}><QueryClientProvider client={client}><MemoryRouter initialEntries={['/lecturer/group-review/advanced?termId=1&classId=2&page=1&deadlineId=1']}>
      <LecturerGroupWorkspacePage />
    </MemoryRouter></QueryClientProvider></ConfigProvider>);
    await screen.findByText('First Dropped Student');

    for (const [index, id, name] of [[1, 24, 'First Dropped Student'], [2, 25, 'Second Dropped Student']] as const) {
      const card = document.querySelector(`.unassigned-pool [data-student-id="${id}"]`)!;
      const values = new Map<string, string>();
      const transfer = { setData: (type: string, value: string) => values.set(type, value), getData: (type: string) => values.get(type) ?? '', effectAllowed: '', dropEffect: '' };
      const zone = screen.getByText(i18n.t('groupWorkspace.quickDropIdle')).closest('[role="button"]')!;
      fireEvent.dragStart(card, { dataTransfer: transfer });
      fireEvent.dragOver(zone, { dataTransfer: transfer });
      fireEvent.drop(zone, { dataTransfer: transfer });
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText(`${name} (SE${id}) - SE`)).toBeInTheDocument();
      expect(within(dialog).getByLabelText(i18n.t('groupWorkspace.createModal.studentsLabel', { count: 1, max: 6 }), { exact: false })).toBeInTheDocument();
      fireEvent.change(within(dialog).getByLabelText(i18n.t('groupWorkspace.createModal.nameLabel'), { exact: false }), { target: { value: `Draft ${index}` } });
      fireEvent.click(within(dialog).getByRole('button', { name: i18n.t('groupLifecycle.createDraft') }));
      await waitFor(() => expect(groupApi.lecturerCreateGroup).toHaveBeenNthCalledWith(index, 1, 2, expect.objectContaining({ name: `Draft ${index}`, studentIds: [id] })));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(document.querySelector(`.unassigned-pool [data-student-id="${id}"]`)).not.toBeInTheDocument();
    }
    expect(workspace.groups.map(group => group.members.map(member => member.studentId))).toEqual([[24], [25]]);
  });
});
