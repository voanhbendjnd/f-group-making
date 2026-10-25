import { cleanup, render, screen, fireEvent, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { Modal } from 'antd';
import { LecturerGroupWorkspacePage } from '@/pages/lecturer/LecturerGroupWorkspacePage';
import { groupApi } from '@/features/group/api/groupApi';
import { classApi } from '@/features/classes/api/classApi';
import { deadlineApi } from '@/features/deadline/api/deadlineApi';
import type { WorkspaceDTO } from '@/features/group/types/groupTypes';
import i18n from '@/locales/i18n';

const auth = vi.hoisted(() => ({ user: { id: 1, authorities: ['ROLE_LECTURE'] } }));
vi.mock('@/app/providers/ToastContext', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }) }));
vi.mock('@/app/providers/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/app/providers/TermContext', () => ({ useTerm: () => ({ lockTermSelection: () => () => {} }) }));
vi.mock('@/features/group/api/groupApi', () => ({
  groupApi: {
    getWorkspace: vi.fn(),
    lecturerDisbandGroup: vi.fn(),
    revokeGroup: vi.fn(),
    rejectGroup: vi.fn(),
    lecturerCreateGroup: vi.fn(),
  },
}));
vi.mock('@/features/classes/api/classApi', () => ({
  classApi: {
    getClasses: vi.fn(),
    getMyClasses: vi.fn(),
    ensureGroupingSession: vi.fn(),
  },
}));
vi.mock('@/features/deadline/api/deadlineApi', () => ({
  deadlineApi: {
    getDeadlines: vi.fn(),
  },
}));
vi.mock('@/features/group/hooks/useGroupWebSocket', () => ({
  useGroupWebSocket: () => ({ status: 'connected' }),
}));
vi.mock('@/features/group/components/LecturerGroupModal', () => ({
  LecturerGroupModal: () => null,
}));
vi.mock('@/features/group/components/RejectGroupModal', () => ({
  RejectGroupModal: () => null,
}));

let client: QueryClient;

function createWorkspaceFixture(): WorkspaceDTO {
  return {
    deadlineId: 1,
    deadlineName: 'Test Deadline',
    deadlineStatus: 'ACTIVE',
    deadlineStartTime: '2026-01-01T00:00:00Z',
    deadlineEndTime: '2026-12-31T00:00:00Z',
    deadlineExpired: false,
    canManageGroups: true,
    schoolClassId: 102,
    schoolClassName: 'SE102',
    lecturerId: 1,
    rulesVersion: 1,
    isLeader: false,
    isLecturer: true,
    canCreateGroup: false,
    canJoinGroup: false,
    rules: [],
    unassignedStudents: [
      {
        studentId: 101,
        fullName: 'Student Unassigned',
        rollNumber: 'SE101',
        memberCode: 'M101',
        majorCode: 'SE',
        majorName: 'Software Engineering',
        role: 'MEMBER',
      },
    ],
    groups: [
      {
        id: 11,
        deadlineId: 1,
        schoolClassId: 102,
        name: 'Group 1',
        leaderId: 1,
        leaderName: 'Leader 1',
        status: 'OPEN',
        memberCount: 2,
        maxMembers: 5,
        version: 0,
        members: [
          { studentId: 1, fullName: 'Leader 1', rollNumber: 'SE01', memberCode: 'M01', majorCode: 'SE', majorName: 'Software', role: 'LEADER' },
          { studentId: 2, fullName: 'Member 1', rollNumber: 'SE02', memberCode: 'M02', majorCode: 'SE', majorName: 'Software', role: 'MEMBER' },
        ],
        ruleEvaluations: [],
        allRulesPassed: true,
        hasHardRuleViolations: false,
      },
      {
        id: 12,
        deadlineId: 1,
        schoolClassId: 102,
        name: 'Group 2',
        leaderId: 3,
        leaderName: 'Leader 2',
        status: 'OPEN',
        memberCount: 2,
        maxMembers: 5,
        version: 0,
        members: [
          { studentId: 3, fullName: 'Leader 2', rollNumber: 'SE03', memberCode: 'M03', majorCode: 'SE', majorName: 'Software', role: 'LEADER' },
          { studentId: 4, fullName: 'Member 2', rollNumber: 'SE04', memberCode: 'M04', majorCode: 'SE', majorName: 'Software', role: 'MEMBER' },
        ],
        ruleEvaluations: [],
        allRulesPassed: true,
        hasHardRuleViolations: false,
      },
      {
        id: 13,
        deadlineId: 1,
        schoolClassId: 102,
        name: 'Group 3',
        leaderId: 5,
        leaderName: 'Leader 3',
        status: 'ACCEPTED',
        memberCount: 2,
        maxMembers: 5,
        version: 0,
        members: [
          { studentId: 5, fullName: 'Leader 3', rollNumber: 'SE05', memberCode: 'M05', majorCode: 'SE', majorName: 'Software', role: 'LEADER' },
          { studentId: 6, fullName: 'Member 3', rollNumber: 'SE06', memberCode: 'M06', majorCode: 'SE', majorName: 'Software', role: 'MEMBER' },
        ],
        ruleEvaluations: [],
        allRulesPassed: true,
        hasHardRuleViolations: false,
      },
    ],
  };
}

beforeEach(async () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })));
  vi.clearAllMocks();
  auth.user = { id: 1, authorities: ['ROLE_LECTURE'] };
  await i18n.changeLanguage('vi');
  vi.mocked(classApi.getClasses).mockResolvedValue({ result: [], meta: { page: 1, pageSize: 10, pages: 0, total: 0 } });
  vi.mocked(classApi.getMyClasses).mockResolvedValue({ result: [], meta: { page: 1, pageSize: 10, pages: 0, total: 0 } });
  vi.mocked(deadlineApi.getDeadlines).mockResolvedValue({ result: [], meta: { page: 1, pageSize: 10, pages: 0, total: 0 } });
  vi.mocked(groupApi.lecturerDisbandGroup).mockResolvedValue(undefined);
  vi.mocked(groupApi.revokeGroup).mockResolvedValue({} as any);
  vi.mocked(groupApi.rejectGroup).mockResolvedValue({} as any);
});

afterEach(() => {
  cleanup();
  client?.clear();
  vi.unstubAllGlobals();
});

describe('Lecturer Group Bulk Disband & Disband All feature', () => {
  it('renders bulk disband buttons and checkboxes for groups', async () => {
    vi.mocked(groupApi.getWorkspace).mockResolvedValue(createWorkspaceFixture());
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/lecturer/group-review/advanced?termId=1&classId=102&page=1&deadlineId=1']}>
          <LecturerGroupWorkspacePage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await screen.findByText('Group 1');
    expect(screen.getByText('Group 2')).toBeInTheDocument();
    expect(screen.getByText('Group 3')).toBeInTheDocument();

    // Nút "Rã tất cả nhóm" luôn hiển thị khi có nhóm
    expect(screen.getByText('Rã tất cả nhóm')).toBeInTheDocument();

    // Checkbox "Chọn tất cả"
    expect(screen.getByText('Chọn tất cả')).toBeInTheDocument();

    // Checkbox trên từng cột nhóm
    const group1Checkbox = screen.getByLabelText('Chọn Group 1');
    const group2Checkbox = screen.getByLabelText('Chọn Group 2');
    expect(group1Checkbox).toBeInTheDocument();
    expect(group2Checkbox).toBeInTheDocument();
  });

  it('selects multiple groups and disbands them with confirmation', async () => {
    const confirm = vi.spyOn(Modal, 'confirm').mockReturnValue({ destroy: vi.fn(), update: vi.fn() });
    vi.mocked(groupApi.getWorkspace).mockResolvedValue(createWorkspaceFixture());
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/lecturer/group-review/advanced?termId=1&classId=102&page=1&deadlineId=1']}>
          <LecturerGroupWorkspacePage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await screen.findByText('Group 1');

    // Chọn Group 1 và Group 2
    const group1Checkbox = screen.getByLabelText('Chọn Group 1');
    const group2Checkbox = screen.getByLabelText('Chọn Group 2');

    fireEvent.click(group1Checkbox);
    fireEvent.click(group2Checkbox);

    // Nút "Rã nhóm đã chọn (2)" xuất hiện
    const disbandSelectedBtn = await screen.findByText('Rã nhóm đã chọn (2)');
    expect(disbandSelectedBtn).toBeInTheDocument();

    // Bấm nút rã nhóm đã chọn
    fireEvent.click(disbandSelectedBtn);

    // Modal.confirm được gọi với tiêu đề đúng
    expect(confirm).toHaveBeenCalledOnce();
    expect(confirm.mock.calls[0]![0].title).toBe('Giải tán 2 nhóm đã chọn?');

    // Kích hoạt onOk
    await act(async () => {
      await confirm.mock.calls[0]![0].onOk?.();
    });

    // lecturerDisbandGroup được gọi cho 2 nhóm đã chọn (11 và 12)
    expect(groupApi.lecturerDisbandGroup).toHaveBeenCalledWith(1, 102, 11);
    expect(groupApi.lecturerDisbandGroup).toHaveBeenCalledWith(1, 102, 12);
    confirm.mockRestore();
  });

  it('select all selects all groups, and deselect unchecks all', async () => {
    vi.mocked(groupApi.getWorkspace).mockResolvedValue(createWorkspaceFixture());
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/lecturer/group-review/advanced?termId=1&classId=102&page=1&deadlineId=1']}>
          <LecturerGroupWorkspacePage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await screen.findByText('Group 1');

    const selectAllCheckbox = screen.getByText('Chọn tất cả').previousElementSibling as HTMLInputElement;
    expect(selectAllCheckbox).toBeInTheDocument();

    // Click "Chọn tất cả"
    fireEvent.click(selectAllCheckbox);

    // Nút rã nhóm đã chọn (3) xuất hiện
    expect(await screen.findByText('Rã nhóm đã chọn (3)')).toBeInTheDocument();

    // Click lại để bỏ chọn tất cả
    fireEvent.click(selectAllCheckbox);

    // Nút rã nhóm đã chọn biến mất
    expect(screen.queryByText(/Rã nhóm đã chọn/)).not.toBeInTheDocument();
  });

  it('disbands all groups with confirmation modal including auto-revoke of accepted groups', async () => {
    const confirm = vi.spyOn(Modal, 'confirm').mockReturnValue({ destroy: vi.fn(), update: vi.fn() });
    vi.mocked(groupApi.getWorkspace).mockResolvedValue(createWorkspaceFixture());
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/lecturer/group-review/advanced?termId=1&classId=102&page=1&deadlineId=1']}>
          <LecturerGroupWorkspacePage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await screen.findByText('Group 1');

    // Click nút "Rã tất cả nhóm"
    const disbandAllBtn = screen.getByText('Rã tất cả nhóm');
    fireEvent.click(disbandAllBtn);

    // Modal.confirm được gọi
    expect(confirm).toHaveBeenCalledOnce();
    expect(confirm.mock.calls[0]![0].title).toBe('Giải tán TẤT CẢ nhóm trong lớp?');

    // Kích hoạt onOk
    await act(async () => {
      await confirm.mock.calls[0]![0].onOk?.();
    });

    // Verify:
    // Group 11 (OPEN): gọi lecturerDisbandGroup
    // Group 12 (OPEN): gọi lecturerDisbandGroup
    // Group 13 (ACCEPTED): gọi revokeGroup trước rồi gọi lecturerDisbandGroup
    expect(groupApi.lecturerDisbandGroup).toHaveBeenCalledWith(1, 102, 11);
    expect(groupApi.lecturerDisbandGroup).toHaveBeenCalledWith(1, 102, 12);
    expect(groupApi.revokeGroup).toHaveBeenCalledWith(1, 102, 13);
    expect(groupApi.lecturerDisbandGroup).toHaveBeenCalledWith(1, 102, 13);
    confirm.mockRestore();
  });
});
