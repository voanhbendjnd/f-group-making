import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  calculateMajorStats,
  getMajorColor,
  MAJOR_COLOR_MAP,
} from '../features/classes/utils/majorStatsUtil';
import { ClassMajorDistributionCard } from '../features/classes/components/ClassMajorDistributionCard';
import { classApi } from '../features/classes/api/classApi';
import type { Student } from '../features/students/types';
import i18n from '@/locales/i18n';

// Mock react-chartjs-2 để chạy an toàn và ổn định trong môi trường JSDOM
vi.mock('react-chartjs-2', () => ({
  Doughnut: ({ data }: any) => (
    <div data-testid="mock-doughnut-chart">
      {data.labels?.map((label: string, idx: number) => (
        <span key={label} data-testid={`donut-slice-${label}`}>
          {label}: {data.datasets?.[0]?.data?.[idx]}
        </span>
      ))}
    </div>
  ),
  Bar: ({ data }: any) => (
    <div data-testid="mock-bar-chart">
      {data.datasets?.map((ds: any) => (
        <div key={ds.label} data-testid={`bar-dataset-${ds.label}`}>
          {ds.label}: {ds.data.join(',')}
        </div>
      ))}
    </div>
  ),
}));

vi.mock('../features/classes/api/classApi', () => ({
  classApi: {
    getClassStudents: vi.fn(),
  },
}));

function createMockStudent(
  id: number,
  majorCode: string,
  majorName: string,
  groupName: string | null = null
): Student {
  return {
    userId: id,
    rollNumber: `HE18${id.toString().padStart(4, '0')}`,
    fullName: `Sinh viên ${id}`,
    email: `sv${id}@fpt.edu.vn`,
    memberCode: `HE18${id}`,
    majorId: 1,
    majorCode,
    majorName,
    schoolClassId: 102,
    groupName,
    lecturerCode: 'GV01',
    activated: true,
    hasActivationKey: false,
    activationKeyExpiresAt: null,
    isKeyExpired: false,
    createdDate: null,
    lastModifiedDate: null,
  };
}

describe('calculateMajorStats & Major Color Utility', () => {
  it('returns empty distribution when students list is empty', () => {
    const stats = calculateMajorStats([]);
    expect(stats.totalStudents).toBe(0);
    expect(stats.totalAssigned).toBe(0);
    expect(stats.totalUnassigned).toBe(0);
    expect(stats.majors).toEqual([]);
  });

  it('correctly calculates percentages and counts (Prompt Example: 30 students with 15 SE = 50%)', () => {
    // 15 SE, 10 IA, 5 GD => Total 30
    const students: Student[] = [
      ...Array.from({ length: 15 }, (_, i) =>
        createMockStudent(i + 1, 'SE', 'Kỹ thuật phần mềm')
      ),
      ...Array.from({ length: 10 }, (_, i) =>
        createMockStudent(i + 16, 'IA', 'An toàn thông tin')
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        createMockStudent(i + 26, 'GD', 'Thiết kế đồ họa')
      ),
    ];

    const stats = calculateMajorStats(students);

    expect(stats.totalStudents).toBe(30);
    expect(stats.majors).toHaveLength(3);

    // Ngành đông nhất xếp đầu
    const seMajor = stats.majors[0];
    expect(seMajor.majorCode).toBe('SE');
    expect(seMajor.count).toBe(15);
    expect(seMajor.percentage).toBe(50.0);

    const iaMajor = stats.majors[1];
    expect(iaMajor.majorCode).toBe('IA');
    expect(iaMajor.count).toBe(10);
    expect(iaMajor.percentage).toBe(33.3);

    const gdMajor = stats.majors[2];
    expect(gdMajor.majorCode).toBe('GD');
    expect(gdMajor.count).toBe(5);
    expect(gdMajor.percentage).toBe(16.7);
  });

  it('correctly tracks assigned vs unassigned students per major', () => {
    const students: Student[] = [
      createMockStudent(1, 'SE', 'Kỹ thuật phần mềm'),
      createMockStudent(2, 'SE', 'Kỹ thuật phần mềm'),
      createMockStudent(3, 'SE', 'Kỹ thuật phần mềm'),
      createMockStudent(4, 'IA', 'An toàn thông tin'),
    ];

    // Sinh viên 1 và 2 đã có nhóm
    const assignedIds = new Set([1, 2]);
    const stats = calculateMajorStats(students, assignedIds);

    expect(stats.totalStudents).toBe(4);
    expect(stats.totalAssigned).toBe(2);
    expect(stats.totalUnassigned).toBe(2);

    const seMajor = stats.majors.find((m) => m.majorCode === 'SE')!;
    expect(seMajor.count).toBe(3);
    expect(seMajor.assignedCount).toBe(2);
    expect(seMajor.unassignedCount).toBe(1);
    expect(seMajor.assignedPercentage).toBe(66.7);

    const iaMajor = stats.majors.find((m) => m.majorCode === 'IA')!;
    expect(iaMajor.count).toBe(1);
    expect(iaMajor.assignedCount).toBe(0);
    expect(iaMajor.unassignedCount).toBe(1);
    expect(iaMajor.assignedPercentage).toBe(0);
  });

  it('returns valid colors for known and unknown major codes', () => {
    expect(getMajorColor('SE')).toBe(MAJOR_COLOR_MAP['SE']);
    expect(getMajorColor('IA')).toBe(MAJOR_COLOR_MAP['IA']);
    expect(getMajorColor('UNKNOWN_XYZ')).toBeDefined();
  });
});

describe('ClassMajorDistributionCard Component', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });
    vi.clearAllMocks();
    void i18n.changeLanguage('vi');
  });

  function renderComponent(props: {
    classId: number;
    className?: string;
    assignedStudentIds?: Set<number>;
    initialStudents?: Student[];
  }) {
    return render(
      <QueryClientProvider client={queryClient}>
        <ClassMajorDistributionCard {...props} />
      </QueryClientProvider>
    );
  }

  it('renders empty state when class has no students', async () => {
    vi.mocked(classApi.getClassStudents).mockResolvedValueOnce([]);

    renderComponent({ classId: 102, className: 'SE102' });

    expect(await screen.findByText('Lớp học chưa có dữ liệu sinh viên.')).toBeInTheDocument();
  });

  it('renders donut chart and major breakdown items with counts and percentages', async () => {
    const mockStudents: Student[] = [
      ...Array.from({ length: 15 }, (_, i) =>
        createMockStudent(i + 1, 'SE', 'Kỹ thuật phần mềm')
      ),
      ...Array.from({ length: 15 }, (_, i) =>
        createMockStudent(i + 16, 'IA', 'An toàn thông tin')
      ),
    ];
    vi.mocked(classApi.getClassStudents).mockResolvedValueOnce(mockStudents);

    renderComponent({
      classId: 102,
      className: 'SE102',
      assignedStudentIds: new Set([1, 2, 3]),
    });

    // Tiêu đề & lớp
    expect(await screen.findByText(/Cơ cấu chuyên ngành của lớp/)).toBeInTheDocument();
    expect(screen.getByText(/SE102/)).toBeInTheDocument();

    // Chart container & Donut mock
    expect(screen.getByTestId('mock-doughnut-chart')).toBeInTheDocument();
    expect(screen.getByTestId('donut-slice-SE')).toHaveTextContent('SE: 15');
    expect(screen.getByTestId('donut-slice-IA')).toHaveTextContent('IA: 15');

    // Số tổng ở tâm biểu đồ
    expect(screen.getByText('30')).toBeInTheDocument();

    // Danh sách chi tiết các ngành
    const seItem = screen.getByTestId('major-item-SE');
    expect(seItem).toHaveTextContent('15 sinh viên');
    expect(seItem).toHaveTextContent('50%');

    const iaItem = screen.getByTestId('major-item-IA');
    expect(iaItem).toHaveTextContent('15 sinh viên');
    expect(iaItem).toHaveTextContent('50%');
  });

  it('toggles view mode between Donut and Stacked Bar', async () => {
    const mockStudents: Student[] = [
      createMockStudent(1, 'SE', 'Kỹ thuật phần mềm'),
      createMockStudent(2, 'SE', 'Kỹ thuật phần mềm'),
    ];
    vi.mocked(classApi.getClassStudents).mockResolvedValueOnce(mockStudents);

    renderComponent({ classId: 102, className: 'SE102' });

    // Mặc định là Donut
    expect(await screen.findByTestId('mock-doughnut-chart')).toBeInTheDocument();

    // Click nút chuyển sang Biểu đồ cột
    const barToggleBtn = screen.getByTestId('toggle-bar-view');
    fireEvent.click(barToggleBtn);

    // Biểu đồ cột được hiển thị
    expect(screen.getByTestId('mock-bar-chart')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-doughnut-chart')).not.toBeInTheDocument();

    // Click lại nút Donut
    const donutToggleBtn = screen.getByTestId('toggle-donut-view');
    fireEvent.click(donutToggleBtn);
    expect(screen.getByTestId('mock-doughnut-chart')).toBeInTheDocument();
  });
});
