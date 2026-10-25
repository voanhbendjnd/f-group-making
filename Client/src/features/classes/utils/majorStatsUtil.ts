import type { Student } from '@/features/students/types';

export interface MajorStatItem {
  majorCode: string;
  majorName: string;
  color: string;
  count: number;
  percentage: number; // e.g. 50.0
  assignedCount: number;
  unassignedCount: number;
  assignedPercentage: number; // percentage of students in this major who are assigned
}

export interface ClassMajorDistribution {
  totalStudents: number;
  totalAssigned: number;
  totalUnassigned: number;
  majors: MajorStatItem[];
}

// Bảng màu chuẩn nhận diện các ngành/chuyên ngành phổ biến tại FPT University
export const MAJOR_COLOR_MAP: Record<string, string> = {
  SE: '#3B82F6', // Kỹ thuật phần mềm - Xanh dương
  IA: '#10B981', // An toàn thông tin - Xanh ngọc
  AI: '#F59E0B', // Trí tuệ nhân tạo - Cam sáng
  GD: '#8B5CF6', // Thiết kế mỹ thuật số - Tím
  IS: '#06B6D4', // Hệ thống thông tin - Xanh lơ
  MKT: '#EC4899', // Digital Marketing - Hồng
  IB: '#F97316', // Kinh doanh quốc tế - Cam đậm
  MC: '#6366F1', // Truyền thông đa phương tiện - Chàm
  CHN: '#EF4444', // Ngôn ngữ Trung - Đỏ
  ENG: '#14B8A6', // Ngôn ngữ Anh - Mòng két
  KT: '#84CC16', // Kế toán - Xanh chanh
  FIN: '#EAB308', // Tài chính - Vàng
  OTHER: '#64748B', // Khác / Chưa xác định - Xám
};

const FALLBACK_COLORS = [
  '#3B82F6',
  '#10B981',
  '#F59E0B',
  '#8B5CF6',
  '#06B6D4',
  '#EC4899',
  '#F97316',
  '#14B8A6',
  '#6366F1',
  '#84CC16',
  '#EF4444',
  '#64748B',
];

export function getMajorColor(code: string, index: number = 0): string {
  const normalized = (code || '').trim().toUpperCase();
  if (MAJOR_COLOR_MAP[normalized]) {
    return MAJOR_COLOR_MAP[normalized];
  }
  return FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

/**
 * Tính toán cơ cấu chuyên ngành từ danh sách sinh viên của lớp và trạng thái phân nhóm
 */
export function calculateMajorStats(
  students: Student[] = [],
  assignedStudentIds?: Set<number> | number[]
): ClassMajorDistribution {
  const totalStudents = students.length;

  if (totalStudents === 0) {
    return {
      totalStudents: 0,
      totalAssigned: 0,
      totalUnassigned: 0,
      majors: [],
    };
  }

  const assignedSet =
    assignedStudentIds instanceof Set
      ? assignedStudentIds
      : new Set(assignedStudentIds || []);

  const groupMap = new Map<
    string,
    {
      code: string;
      name: string;
      students: Student[];
      assignedCount: number;
    }
  >();

  let totalAssigned = 0;

  students.forEach((student) => {
    const rawCode = (student.majorCode || '').trim().toUpperCase();
    const code = rawCode || 'OTHER';
    const name = student.majorName || (code === 'OTHER' ? 'Khác / Chưa xác định' : code);

    const isAssigned =
      assignedSet.has(student.userId) || Boolean(student.groupName && student.groupName.trim());
    if (isAssigned) {
      totalAssigned++;
    }

    if (!groupMap.has(code)) {
      groupMap.set(code, {
        code,
        name,
        students: [],
        assignedCount: 0,
      });
    }

    const entry = groupMap.get(code)!;
    entry.students.push(student);
    if (isAssigned) {
      entry.assignedCount++;
    }
  });

  const totalUnassigned = totalStudents - totalAssigned;

  const rawMajors = Array.from(groupMap.values()).map((entry, idx) => {
    const count = entry.students.length;
    const percentage = Number(((count / totalStudents) * 100).toFixed(1));
    const unassignedCount = count - entry.assignedCount;
    const assignedPercentage =
      count > 0 ? Number(((entry.assignedCount / count) * 100).toFixed(1)) : 0;

    return {
      majorCode: entry.code,
      majorName: entry.name,
      color: getMajorColor(entry.code, idx),
      count,
      percentage,
      assignedCount: entry.assignedCount,
      unassignedCount,
      assignedPercentage,
    };
  });

  // Sắp xếp theo số lượng sinh viên giảm dần
  rawMajors.sort((a, b) => b.count - a.count);

  return {
    totalStudents,
    totalAssigned,
    totalUnassigned,
    majors: rawMajors,
  };
}
