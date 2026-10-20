import * as XLSX from 'xlsx';
import { classApi } from '@/features/classes/api/classApi';
import { deadlineApi } from '@/features/deadline/api/deadlineApi';
import { groupApi } from '../api/groupApi';
import type { GroupStatus } from '../types/groupTypes';
import { groupCode } from './groupSequence';

export interface StudentGroupExportRow {
  studentId: number;
  rollNumber: string;
  fullName: string;
  khoa: string;
  memberCode: string;
  email: string;
  slotType: string;
  subjectCode: string;
  groupName: string; // Tên lớp (SchoolClass name e.g. EXE101_G01)
  gv: string; // Tên/mã giảng viên phụ trách
  groupMentor: string; // Tên nhóm sinh viên thuộc về (e.g. EXE101_G01.01) hoặc '' nếu chưa có nhóm
  groupStatus?: GroupStatus | null;
  groupCode?: string;
}

export interface GroupExportMeta {
  className: string;
  subjectCode: string;
  termName: string;
  lecturerCode: string;
}

/**
 * Phân tích mã môn học từ tên lớp (VD: EXE101_G01 -> EXE101)
 */
export function extractSubjectCode(className: string): string {
  if (!className) return 'EXE101';
  const parts = className.split('_');
  return parts[0]?.trim() || className;
}

/**
 * Tạo đối tượng Workbook của XLSX theo đúng mẫu cấu trúc server/result.xlsx
 */
export function buildGroupResultWorkbook(
  rows: StudentGroupExportRow[],
  meta: GroupExportMeta
): XLSX.WorkBook {
  const wsData: (string | number | null | undefined)[][] = [];

  // Dòng 0: Tiêu đề danh sách và hướng dẫn điền nhóm
  const row0: (string | null | undefined)[] = [];
  row0[1] = `DSSV_${meta.subjectCode}_${meta.termName || 'TERM'}\r\n*Xếp nhóm `;
  row0[10] = `\r\nThầy Cô điền NHÓM\r\ntheo cú pháp :\r\n${meta.subjectCode}_LỚP.NHÓM\r\nVD:\r\n${meta.className}.01`;
  wsData.push(row0);

  // Dòng 1: Tiêu đề các cột dữ liệu
  wsData.push([
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

  // Dòng 2+: Dữ liệu từng sinh viên trong lớp
  rows.forEach((row, index) => {
    wsData.push([
      index + 1,
      row.rollNumber || '',
      row.fullName || '',
      row.khoa || '',
      row.memberCode || '',
      row.email || '',
      row.slotType || 'A24/EXE   ',
      row.subjectCode || meta.subjectCode,
      row.groupName || meta.className,
      row.gv || meta.lecturerCode || '',
      row.groupMentor || '', // Nếu không có nhóm thì để trống ''
      row.groupCode || '',
    ]);
  });

  const worksheet = XLSX.utils.aoa_to_sheet(wsData);

  // Merge ô B1:D1 giống mẫu gốc
  worksheet['!merges'] = [{ s: { c: 1, r: 0 }, e: { c: 3, r: 0 } }];

  // Độ rộng các cột để hiển thị tối ưu trong Microsoft Excel
  worksheet['!cols'] = [
    { wch: 6 },  // STT
    { wch: 14 }, // RollNumber
    { wch: 25 }, // FullName
    { wch: 18 }, // Khoá
    { wch: 18 }, // MemberCode
    { wch: 30 }, // Email
    { wch: 14 }, // SlotType
    { wch: 14 }, // SubjectCode
    { wch: 16 }, // GroupName
    { wch: 12 }, // GV
    { wch: 18 }, // Group Mentor
    { wch: 12 }, // Group Code
  ];

  const workbook = XLSX.utils.book_new();
  const sheetName = (meta.subjectCode || meta.className || 'Result').substring(0, 31);
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  return workbook;
}

/**
 * Tải file Excel về máy người dùng
 */
export function downloadExcelWorkbook(workbook: XLSX.WorkBook, filename: string): void {
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    try {
      const data = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.URL.revokeObjectURL(url);
    } catch {
      XLSX.writeFile(workbook, filename);
    }
  } else {
    XLSX.writeFile(workbook, filename);
  }
}

/**
 * Xuất file Excel kết quả phân nhóm hoàn chỉnh
 */
export function exportGroupResultExcel(
  rows: StudentGroupExportRow[],
  meta: GroupExportMeta
): void {
  const workbook = buildGroupResultWorkbook(rows, meta);
  const cleanClassName = meta.className.replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanTerm = (meta.termName || '').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `DSSV_${cleanClassName}${cleanTerm ? `_${cleanTerm}` : ''}.xlsx`;
  downloadExcelWorkbook(workbook, filename);
}

/**
 * Lấy toàn bộ dữ liệu sinh viên và nhóm của lớp học để phục vụ xem trước và xuất file
 */
export async function fetchClassAllocationData(
  classId: number,
  options: {
    termId?: number;
    termName?: string;
    deadlineId?: number;
    lecturerCode?: string;
    className?: string;
  } = {}
): Promise<{ rows: StudentGroupExportRow[]; meta: GroupExportMeta }> {
  let resolvedDeadlineId = options.deadlineId;

  // Nếu chưa có deadlineId, tìm đợt deadline liên kết với lớp
  if (!resolvedDeadlineId) {
    try {
      const deadlines = await deadlineApi.getDeadlines({
        termId: options.termId,
        page: 1,
        size: 50,
      });
      const match = deadlines.result.find((d) => d.schoolClassIds?.includes(classId));
      if (match) {
        resolvedDeadlineId = match.id;
      }
    } catch {
      // Tiếp tục nếu không lấy được deadline
    }
  }

  let className = options.className || '';
  let lecturerCode = options.lecturerCode || '';

  // Thử lấy dữ liệu từ workspace nếu có deadlineId
  if (resolvedDeadlineId) {
    try {
      const ws = await groupApi.getWorkspace(resolvedDeadlineId, classId);
      className = className || ws.schoolClassName || `Class_${classId}`;
      const subjectCode = extractSubjectCode(className);

      const rows: StudentGroupExportRow[] = [];

      // 1. Sinh viên đã ở trong nhóm
      (ws.groups || []).forEach((g) => {
        (g.members || []).forEach((m) => {
          rows.push({
            studentId: m.studentId,
            rollNumber: m.rollNumber || '',
            fullName: m.fullName || '',
            khoa: m.majorName || m.majorCode || '',
            memberCode: m.memberCode || '',
            email: m.email || '',
            slotType: 'A24/EXE   ',
            subjectCode,
            groupName: className,
            gv: lecturerCode,
            groupMentor: g.name, // Lưu tên nhóm vào cột Group Mentor
            groupStatus: g.status,
            groupCode: groupCode(g),
          });
        });
      });

      // 2. Sinh viên chưa có nhóm
      (ws.unassignedStudents || []).forEach((m) => {
        rows.push({
          studentId: m.studentId,
          rollNumber: m.rollNumber || '',
          fullName: m.fullName || '',
          khoa: m.majorName || m.majorCode || '',
          memberCode: m.memberCode || '',
          email: m.email || '',
          slotType: 'A24/EXE   ',
          subjectCode,
          groupName: className,
          gv: lecturerCode,
          groupMentor: '', // Chưa có nhóm thì không điền gì
          groupStatus: null,
        });
      });

      // Sắp xếp theo mã sinh viên
      rows.sort((a, b) => a.rollNumber.localeCompare(b.rollNumber));

      return {
        rows,
        meta: {
          className,
          subjectCode,
          termName: options.termName || '',
          lecturerCode,
        },
      };
    } catch {
      // Fallback xuống getClassStudents nếu workspace gặp lỗi
    }
  }

  // Fallback: Lấy danh sách sinh viên trực tiếp từ lớp học
  try {
    const students = await classApi.getClassStudents(classId);
    className = className || `Class_${classId}`;
    const subjectCode = extractSubjectCode(className);

    const rows: StudentGroupExportRow[] = students.map((s) => ({
      studentId: s.userId,
      rollNumber: s.rollNumber || '',
      fullName: s.fullName || '',
      khoa: s.majorName || s.majorCode || '',
      memberCode: s.memberCode || '',
      email: s.email || '',
      slotType: 'A24/EXE   ',
      subjectCode,
      groupName: className,
      gv: lecturerCode,
      groupMentor: '',
      groupStatus: null,
    }));

    rows.sort((a, b) => a.rollNumber.localeCompare(b.rollNumber));

    return {
      rows,
      meta: {
        className,
        subjectCode,
        termName: options.termName || '',
        lecturerCode,
      },
    };
  } catch (error) {
    throw error;
  }
}
