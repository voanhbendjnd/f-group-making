import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import * as XLSX from 'xlsx';
import {
  buildGroupResultWorkbook,
  extractSubjectCode,
  fetchClassAllocationData,
  exportGroupResultExcel,
  type StudentGroupExportRow,
  type GroupExportMeta,
} from '../features/group/utils/exportGroupResultExcel';
import { GroupPreviewExportModal } from '../features/group/components/GroupPreviewExportModal';
import { groupApi } from '../features/group/api/groupApi';
import { classApi } from '../features/classes/api/classApi';
import { deadlineApi } from '../features/deadline/api/deadlineApi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import i18n from '@/locales/i18n';

vi.mock('xlsx', async importOriginal => ({
  ...await importOriginal<typeof import('xlsx')>(),
  writeFile: vi.fn(),
}));

vi.mock('../features/group/api/groupApi', () => ({
  groupApi: {
    getWorkspace: vi.fn(),
  },
}));

vi.mock('../features/classes/api/classApi', () => ({
  classApi: {
    getClassStudents: vi.fn(),
    getClassById: vi.fn(),
  },
}));

vi.mock('../features/deadline/api/deadlineApi', () => ({
  deadlineApi: {
    getDeadlines: vi.fn(),
  },
}));

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock('@/app/providers/ToastContext', () => ({
  useToast: () => ({
    success: mockToastSuccess,
    error: mockToastError,
  }),
}));

describe('Group Allocation Excel Export Utility', () => {
  beforeEach(() => {
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
  });

  it('extractSubjectCode correctly parses subject code from class name', () => {
    expect(extractSubjectCode('EXE101_G01')).toBe('EXE101');
    expect(extractSubjectCode('EXE201_G02')).toBe('EXE201');
    expect(extractSubjectCode('PRJ301')).toBe('PRJ301');
    expect(extractSubjectCode('')).toBe('EXE101');
  });

  it('buildGroupResultWorkbook creates a valid workbook matching server/result.xlsx format', () => {
    const meta: GroupExportMeta = {
      className: 'EXE101_G01',
      subjectCode: 'EXE101',
      termName: 'FA26',
      lecturerCode: 'DuyVL',
    };

    const rows: StudentGroupExportRow[] = [
      {
        studentId: 1,
        rollNumber: 'CA182354',
        fullName: 'Nguyễn Thị Hà Mi',
        khoa: 'BEN_ENG_ET_19C',
        memberCode: 'MiNTHCA182354',
        email: 'MiNTHCA182354@fpt.edu.vn',
        slotType: 'A24/EXE   ',
        subjectCode: 'EXE101',
        groupName: 'EXE101_G01',
        gv: 'DuyVL',
        groupMentor: 'EXE101_G01.01', // Đã có nhóm
        groupCode: 'G01',
        groupStatus: 'ACCEPTED',
      },
      {
        studentId: 2,
        rollNumber: 'SE190001',
        fullName: 'Trần Văn Nam',
        khoa: 'BIT_SE_19C',
        memberCode: 'NamTVSE190001',
        email: 'namtv@fpt.edu.vn',
        slotType: 'A24/EXE   ',
        subjectCode: 'EXE101',
        groupName: 'EXE101_G01',
        gv: 'DuyVL',
        groupMentor: '', // Chưa có nhóm
        groupStatus: null,
      },
    ];

    const wb = buildGroupResultWorkbook(rows, meta);

    expect(wb.SheetNames).toContain('EXE101');
    const sheet = wb.Sheets['EXE101'];

    // Kiểm tra merges
    expect(sheet['!merges']).toEqual([{ s: { c: 1, r: 0 }, e: { c: 3, r: 0 } }]);

    const json = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });

    // Dòng 0: Header text
    expect(json[0][1]).toContain('DSSV_EXE101_FA26');
    expect(json[0][10]).toContain('EXE101_LỚP.NHÓM');

    // Dòng 1: Cột tiêu đề
    expect(json[1]).toEqual([
      'STT',
      'RollNumber',
      'FullName',
      'Khoá',
      'MemberCode',
      'Email',
      'SlotType',
      'SubjectCode',
      'GroupName',
      'GV',
      'Group Mentor',
      'Group Code',
    ]);

    // Dòng 2: Sinh viên có nhóm
    expect(json[2][0]).toBe(1);
    expect(json[2][1]).toBe('CA182354');
    expect(json[2][2]).toBe('Nguyễn Thị Hà Mi');
    expect(json[2][3]).toBe('BEN_ENG_ET_19C');
    expect(json[2][4]).toBe('MiNTHCA182354');
    expect(json[2][5]).toBe('MiNTHCA182354@fpt.edu.vn');
    expect(json[2][6]).toBe('A24/EXE   ');
    expect(json[2][7]).toBe('EXE101');
    expect(json[2][8]).toBe('EXE101_G01');
    expect(json[2][9]).toBe('DuyVL');
    expect(json[2][10]).toBe('EXE101_G01.01'); // Cột Group Mentor
    expect(json[2][11]).toBe('G01');

    // Dòng 3: Sinh viên chưa có nhóm
    expect(json[3][0]).toBe(2);
    expect(json[3][1]).toBe('SE190001');
    expect(json[3][2]).toBe('Trần Văn Nam');
    expect(json[3][10]).toBe(''); // Cột Group Mentor để trống
    expect(json[3][11]).toBe('');
  });

  it('fetchClassAllocationData retrieves all assigned and unassigned students from workspace', async () => {
    vi.mocked(groupApi.getWorkspace).mockResolvedValue({
      deadlineId: 10,
      deadlineName: 'Group Phase 1',
      deadlineStatus: 'ACTIVE',
      deadlineStartTime: '2026-10-01',
      deadlineEndTime: '2026-10-30',
      deadlineExpired: false,
      canManageGroups: true,
      schoolClassId: 104,
      schoolClassName: 'EXE101_G01',
      rulesVersion: 1,
      isLeader: false,
      rules: [],
      groups: [
        {
          id: 1,
          sequenceNo: 2,
          groupCode: 'G02',
          deadlineId: 10,
          schoolClassId: 104,
          name: 'EXE101_G01.01',
          leaderId: 101,
          leaderName: 'Nguyen Van A',
          status: 'ACCEPTED',
          memberCount: 1,
          maxMembers: 5,
          version: 1,
          members: [
            {
              studentId: 101,
              rollNumber: 'SE180001',
              fullName: 'Nguyen Van A',
              memberCode: 'ANV180001',
              email: 'anv@fpt.edu.vn',
              majorCode: 'SE',
              majorName: 'Software Engineering',
              role: 'LEADER',
            },
          ],
          ruleEvaluations: [],
          allRulesPassed: true,
          hasHardRuleViolations: false,
        },
      ],
      unassignedStudents: [
        {
          studentId: 102,
          rollNumber: 'SE180002',
          fullName: 'Tran Thi B',
          memberCode: 'BTT180002',
          email: 'btt@fpt.edu.vn',
          majorCode: 'SE',
          majorName: 'Software Engineering',
          role: 'MEMBER',
        },
      ],
    });

    const result = await fetchClassAllocationData(104, {
      deadlineId: 10,
      className: 'EXE101_G01',
      termName: 'FA26',
      lecturerCode: 'DuyVL',
    });

    expect(result.rows).toHaveLength(2);
    // Đã sắp xếp theo rollNumber
    expect(result.rows[0].rollNumber).toBe('SE180001');
    expect(result.rows[0].groupMentor).toBe('EXE101_G01.01');
    expect(result.rows[0].groupCode).toBe('G02');
    expect(result.rows[1].rollNumber).toBe('SE180002');
    expect(result.rows[1].groupMentor).toBe('');
    expect(result.meta.className).toBe('EXE101_G01');
    expect(result.meta.subjectCode).toBe('EXE101');
  });

  it('uses the assigned class lecturer when export metadata is incomplete', async () => {
    vi.mocked(classApi.getClassById).mockResolvedValue({ id: 104, name: 'EXE101_G01', termId: 2, termName: 'FA26',
      lecturerId: 7, lecturerCode: 'AssignedTeacher', lecturerName: 'Teacher', lecturerEmail: null, studentCount: 0, createdDate: '' });
    vi.mocked(deadlineApi.getDeadlines).mockResolvedValue({ result: [], meta: { page: 1, pageSize: 50, pages: 0, total: 0 } });
    vi.mocked(classApi.getClassStudents).mockResolvedValue([]);
    const result = await fetchClassAllocationData(104, { termId: 2, lecturerCode: 'LoggedInAdmin' });
    expect(result.meta.lecturerCode).toBe('AssignedTeacher');
    expect(result.meta.termName).toBe('FA26');
  });

  it('does not turn a workspace read error into an export with empty groups', async () => {
    vi.mocked(groupApi.getWorkspace).mockRejectedValueOnce(new Error('Workspace unavailable'));
    await expect(fetchClassAllocationData(104, { deadlineId: 10, className: 'EXE101_G01', termName: 'FA26', lecturerCode: 'DuyVL' }))
      .rejects.toThrow('Workspace unavailable');
    expect(classApi.getClassStudents).not.toHaveBeenCalled();
  });

  it('checks later deadline pages and requires a specific session when several apply', async () => {
    vi.mocked(deadlineApi.getDeadlines).mockImplementation(async params => ({
      result: [{ id: params?.page === 2 ? 11 : 10, schoolClassIds: [104] }] as never[],
      meta: { page: params?.page ?? 1, pageSize: 50, pages: 2, total: 2 },
    }));
    await expect(fetchClassAllocationData(104, { termId: 2, className: 'EXE101_G01', termName: 'FA26', lecturerCode: 'DuyVL' }))
      .rejects.toThrow();
    expect(deadlineApi.getDeadlines).toHaveBeenCalledWith({ termId: 2, page: 2, size: 50 });
    expect(groupApi.getWorkspace).not.toHaveBeenCalled();
    expect(classApi.getClassStudents).not.toHaveBeenCalled();
  });
});

describe('GroupPreviewExportModal Component', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
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
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  const renderModal = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <GroupPreviewExportModal
          open={true}
          onClose={vi.fn()}
          classId={104}
          className="EXE101_G01"
          deadlineId={10}
          termName="FA26"
          lecturerCode="DuyVL"
        />
      </QueryClientProvider>
    );

  it('renders stats, table with students, and allows searching/filtering', async () => {
    vi.mocked(groupApi.getWorkspace).mockResolvedValue({
      deadlineId: 10,
      deadlineName: 'Group Phase 1',
      deadlineStatus: 'ACTIVE',
      deadlineStartTime: '2026-10-01',
      deadlineEndTime: '2026-10-30',
      deadlineExpired: false,
      canManageGroups: true,
      schoolClassId: 104,
      schoolClassName: 'EXE101_G01',
      rulesVersion: 1,
      isLeader: false,
      rules: [],
      groups: [
        {
          id: 1,
          deadlineId: 10,
          schoolClassId: 104,
          name: 'EXE101_G01.01',
          leaderId: 101,
          leaderName: 'Nguyen Van A',
          status: 'ACCEPTED',
          memberCount: 1,
          maxMembers: 5,
          version: 1,
          members: [
            {
              studentId: 101,
              rollNumber: 'SE180001',
              fullName: 'Nguyen Van A',
              memberCode: 'ANV180001',
              email: 'anv@fpt.edu.vn',
              majorCode: 'SE',
              majorName: 'Software Engineering',
              role: 'LEADER',
            },
          ],
          ruleEvaluations: [],
          allRulesPassed: true,
          hasHardRuleViolations: false,
        },
      ],
      unassignedStudents: [
        {
          studentId: 102,
          rollNumber: 'SE180002',
          fullName: 'Tran Thi B',
          memberCode: 'BTT180002',
          email: 'btt@fpt.edu.vn',
          majorCode: 'SE',
          majorName: 'Software Engineering',
          role: 'MEMBER',
        },
      ],
    });

    renderModal();

    // Chờ tải dữ liệu
    await waitFor(() => {
      expect(screen.getByText('Nguyen Van A')).toBeInTheDocument();
      expect(screen.getByText('Tran Thi B')).toBeInTheDocument();
    });

    // Kiểm tra huy hiệu nhóm
    expect(screen.getByText('EXE101_G01.01')).toBeInTheDocument();
    expect(screen.getAllByText('Chưa có nhóm').length).toBeGreaterThanOrEqual(1);

    // Kiểm tra nút xuất file
    const exportBtn = screen.getByRole('button', { name: /Xuất toàn bộ lớp/i });
    expect(exportBtn).toBeInTheDocument();
    expect(exportBtn).not.toBeDisabled();

    // Bấm nút xuất file Excel
    fireEvent.click(exportBtn);
    expect(mockToastSuccess).toHaveBeenCalled();
    const fullWorkbook = vi.mocked(XLSX.writeFile).mock.calls.at(-1)![0];
    expect(XLSX.utils.sheet_to_json(fullWorkbook.Sheets[fullWorkbook.SheetNames[0]], { header: 1 })).toHaveLength(4);

    fireEvent.change(screen.getByPlaceholderText(i18n.t('groupExport.searchPlaceholder')), { target: { value: 'SE180002' } });
    fireEvent.change(screen.getByLabelText(i18n.t('adminUx.exportScope')), { target: { value: 'filtered' } });
    fireEvent.click(screen.getByRole('button', { name: i18n.t('adminUx.exportFiltered', { count: 1 }) }));
    const filteredWorkbook = vi.mocked(XLSX.writeFile).mock.calls.at(-1)![0];
    const exported = XLSX.utils.sheet_to_json<string[]>(filteredWorkbook.Sheets[filteredWorkbook.SheetNames[0]], { header: 1 });
    expect(exported).toHaveLength(3);
    expect(exported[2][1]).toBe('SE180002');
  });
});
