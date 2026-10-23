import XLSX from 'xlsx-js-style';
import { classApi } from '@/features/classes/api/classApi';
import { deadlineApi } from '@/features/deadline/api/deadlineApi';
import { groupApi } from '../api/groupApi';
import type { GroupStatus } from '../types/groupTypes';
import { groupCode } from './groupSequence';
import i18n from '@/locales/i18n';

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
  groupMentor: string; // Tên lớp + số nhóm (e.g. EXE101_G01.01), hoặc '' nếu chưa có nhóm
  groupStatus?: GroupStatus | null;
  groupCode?: string;
  groupSequenceNo?: number;
}

function sequenceFromCode(code?: string | null): number | undefined {
  const match = /^G(\d+)$/i.exec(code ?? '');
  const value = match ? Number(match[1]) : undefined;
  return value != null && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function rowSequence(row: StudentGroupExportRow): number {
  return row.groupSequenceNo ?? sequenceFromCode(row.groupCode)
    ?? (row.groupMentor ? Number(row.groupMentor.match(/\.(\d+)$/)?.[1]) || Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER);
}

export function sortGroupExportRows(rows: StudentGroupExportRow[]): StudentGroupExportRow[] {
  return [...rows].sort((a, b) => rowSequence(a) - rowSequence(b)
    || a.rollNumber.localeCompare(b.rollNumber) || a.studentId - b.studentId);
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
  ]);

  // Dòng 2+: Dữ liệu từng sinh viên trong lớp
  sortGroupExportRows(rows).forEach((row, index) => {
    wsData.push([
      index + 1,
      row.rollNumber || '',
      row.fullName || '',
      row.khoa || '',
      row.memberCode || '',
      row.email || '',
      row.slotType || '',
      row.subjectCode || meta.subjectCode,
      row.groupName || meta.className,
      row.gv || meta.lecturerCode || '',
      row.groupMentor || '', // Nếu không có nhóm thì để trống ''
    ]);
  });

  const worksheet = XLSX.utils.aoa_to_sheet(wsData);

  // Merge ô B1:D1 giống mẫu gốc
  worksheet['!merges'] = [{ s: { c: 1, r: 0 }, e: { c: 3, r: 0 } }];

  // Độ rộng các cột để hiển thị tối ưu trong Microsoft Excel
  worksheet['!cols'] = [
    { wch: 6 },  // STT
    { wch: 14 }, // RollNumber
    { wch: 28 }, // FullName
    { wch: 23 }, // Khoá
    { wch: 24 }, // MemberCode
    { wch: 42 }, // Email
    { wch: 14 }, // SlotType
    { wch: 14 }, // SubjectCode
    { wch: 16 }, // GroupName
    { wch: 12 }, // GV
    { wch: 25 }, // Group Mentor
  ];

  worksheet['!rows'] = [{ hpt: 120 }, { hpt: 22 }, ...rows.map(() => ({ hpt: 21 }))];
  worksheet['!autofilter'] = { ref: `A2:K${rows.length + 2}` };
  worksheet.B1.s = {
    font: { name: 'Calibri', sz: 22, bold: true },
    alignment: { vertical: 'center', wrapText: true },
  };
  worksheet.K1.s = {
    font: { name: 'Calibri', sz: 11 },
    alignment: { vertical: 'center', wrapText: true },
  };
  const edge = { style: 'thin', color: { rgb: 'D9D9D9' } };
  for (let r = 1; r < wsData.length; r++) {
    for (let c = 0; c < 11; c++) {
      const cell = worksheet[XLSX.utils.encode_cell({ r, c })];
      cell.s = {
        font: { name: 'Calibri', sz: 11, bold: r === 1 },
        alignment: { vertical: 'center', horizontal: c === 0 || (r === 1 && c === 10) ? 'center' : 'left' },
        border: { top: edge, bottom: edge, left: edge, right: edge },
        ...(r === 1 ? { fill: { patternType: 'solid', fgColor: { rgb: c === 10 ? 'FFFF00' : 'FFC000' } } } : {}),
      };
      if (r > 1 && c > 0) cell.z = '@';
    }
  }

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
  const classInfo = !options.lecturerCode || !options.className || !options.termName
    ? await classApi.getClassById(classId) : undefined;
  if (classInfo && (classInfo.id !== classId || (options.termId && classInfo.termId !== options.termId))) {
    throw new Error(i18n.t('terms.classOutsideTerm'));
  }
  const termName = classInfo?.termName || options.termName || '';
  let className = classInfo?.name || options.className || '';
  const lecturerCode = classInfo ? classInfo.lecturerCode ?? '' : options.lecturerCode || '';
  let resolvedDeadlineId = options.deadlineId;

  // Nếu chưa có deadlineId, tìm đợt deadline liên kết với lớp
  if (!resolvedDeadlineId) {
    const deadlines = await deadlineApi.getDeadlines({
      termId: options.termId ?? classInfo?.termId ?? undefined,
      page: 1,
      size: 50,
    });
    const all = [...deadlines.result];
    for (let page = 2; page <= deadlines.meta.pages; page++) {
      all.push(...(await deadlineApi.getDeadlines({ termId: options.termId ?? classInfo?.termId ?? undefined, page, size: 50 })).result);
    }
    const matches = all.filter(item => item.schoolClassIds?.includes(classId));
    if (matches.length > 1) throw new Error(i18n.t('groupBoard.multipleSessions'));
    resolvedDeadlineId = matches[0]?.id;
  }

  // Thử lấy dữ liệu từ workspace nếu có deadlineId
  if (resolvedDeadlineId) {
    const ws = await groupApi.getWorkspace(resolvedDeadlineId, classId);
    className = className || ws.schoolClassName || `Class_${classId}`;
    const subjectCode = extractSubjectCode(className);

    const rows: StudentGroupExportRow[] = [];

    // 1. Sinh viên đã ở trong nhóm
    (ws.groups || []).forEach((g) => {
      if (g.status === 'DISBANDED') return;
      const sequence = g.sequenceNo ?? sequenceFromCode(g.groupCode);
      if (g.members?.length && (sequence == null || !Number.isSafeInteger(sequence) || sequence < 1)) {
        throw new Error(i18n.t('groupExport.missingGroupSequence'));
      }
      (g.members || []).forEach((m) => {
        rows.push({
          studentId: m.studentId,
          rollNumber: m.rollNumber || '',
          fullName: m.fullName || '',
          khoa: m.cohort || '',
          memberCode: m.memberCode || '',
          email: m.email || '',
          slotType: m.slotType || '',
          subjectCode,
          groupName: className,
          gv: lecturerCode,
          groupMentor: `${className}.${String(sequence).padStart(2, '0')}`,
          groupSequenceNo: sequence,
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
        khoa: m.cohort || '',
        memberCode: m.memberCode || '',
        email: m.email || '',
        slotType: m.slotType || '',
        subjectCode,
        groupName: className,
        gv: lecturerCode,
        groupMentor: '', // Chưa có nhóm thì không điền gì
        groupStatus: null,
      });
    });

    return {
      rows: sortGroupExportRows(rows),
      meta: {
        className,
        subjectCode,
        termName,
        lecturerCode,
      },
    };
  }

  // A roster without groups is valid only after confirming there is no grouping session.
  const students = await classApi.getClassStudents(classId);
  className = className || `Class_${classId}`;
  const subjectCode = extractSubjectCode(className);

  const rows: StudentGroupExportRow[] = students.map((s) => ({
    studentId: s.userId,
    rollNumber: s.rollNumber || '',
    fullName: s.fullName || '',
    khoa: s.cohort || '',
    memberCode: s.memberCode || '',
    email: s.email || '',
    slotType: s.slotType || '',
    subjectCode,
    groupName: className,
    gv: lecturerCode,
    groupMentor: '',
    groupStatus: null,
  }));

  return {
    rows: sortGroupExportRows(rows),
    meta: {
      className,
      subjectCode,
      termName,
      lecturerCode,
    },
  };
}
