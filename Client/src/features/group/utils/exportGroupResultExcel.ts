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
  return [...rows].sort((a, b) =>
    (a.groupName || '').localeCompare(b.groupName || '')
    || rowSequence(a) - rowSequence(b)
    || a.rollNumber.localeCompare(b.rollNumber)
    || a.studentId - b.studentId
  );
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
 * Làm sạch và chuẩn hóa tên Sheet Excel (tối đa 31 ký tự, không chứa ký tự cấm: \ / ? * : [ ])
 */
export function sanitizeSheetName(rawName: string, existingNames: Set<string> = new Set()): string {
  let cleaned = (rawName || 'Sheet')
    .replace(/[\\/?*:[\]]/g, '_')
    .trim();
  if (!cleaned) cleaned = 'Sheet';
  let candidate = cleaned.substring(0, 31);
  if (!existingNames.has(candidate)) {
    existingNames.add(candidate);
    return candidate;
  }
  let index = 2;
  while (true) {
    const suffix = `_${index}`;
    const truncated = candidate.substring(0, 31 - suffix.length);
    const withSuffix = `${truncated}${suffix}`;
    if (!existingNames.has(withSuffix)) {
      existingNames.add(withSuffix);
      return withSuffix;
    }
    index++;
  }
}

/**
 * Tạo một Worksheet theo đúng mẫu cấu trúc và style của server/result.xlsx
 */
export function buildGroupResultWorksheet(
  rows: StudentGroupExportRow[],
  meta: GroupExportMeta
): XLSX.WorkSheet {
  const wsData: (string | number | null | undefined)[][] = [];

  // Dòng 0: Tiêu đề danh sách và hướng dẫn điền nhóm
  const exampleClass = meta.className === 'ALL_CLASSES' ? `${meta.subjectCode}_G01` : meta.className;
  const row0: (string | null | undefined)[] = [];
  row0[1] = `DSSV_${meta.subjectCode}_${meta.termName || 'TERM'}\r\n*Xếp nhóm `;
  row0[10] = `\r\nThầy Cô điền NHÓM\r\ntheo cú pháp :\r\n${meta.subjectCode}_LỚP.NHÓM\r\nVD:\r\n${exampleClass}.01`;
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
  if (worksheet.B1) {
    worksheet.B1.s = {
      font: { name: 'Calibri', sz: 22, bold: true },
      alignment: { vertical: 'center', wrapText: true },
    };
  }
  if (worksheet.K1) {
    worksheet.K1.s = {
      font: { name: 'Calibri', sz: 11 },
      alignment: { vertical: 'center', wrapText: true },
    };
  }
  const edge = { style: 'thin', color: { rgb: 'D9D9D9' } };
  for (let r = 1; r < wsData.length; r++) {
    for (let c = 0; c < 11; c++) {
      const cell = worksheet[XLSX.utils.encode_cell({ r, c })];
      if (cell) {
        cell.s = {
          font: { name: 'Calibri', sz: 11, bold: r === 1 },
          alignment: { vertical: 'center', horizontal: c === 0 || (r === 1 && c === 10) ? 'center' : 'left' },
          border: { top: edge, bottom: edge, left: edge, right: edge },
          ...(r === 1 ? { fill: { patternType: 'solid', fgColor: { rgb: c === 10 ? 'FFFF00' : 'FFC000' } } } : {}),
        };
        if (r > 1 && c > 0) cell.z = '@';
      }
    }
  }

  return worksheet;
}

/**
 * Tạo đối tượng Workbook của XLSX theo đúng mẫu cấu trúc server/result.xlsx
 */
export function buildGroupResultWorkbook(
  rows: StudentGroupExportRow[],
  meta: GroupExportMeta
): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  const worksheet = buildGroupResultWorksheet(rows, meta);
  const sheetName = sanitizeSheetName(meta.subjectCode || meta.className || 'Result', new Set());
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  return workbook;
}

export interface ClassExportBundle {
  classId: number;
  className: string;
  rows: StudentGroupExportRow[];
  meta: GroupExportMeta;
}

/**
 * Tạo Workbook cho nhiều lớp học:
 * - Sheet đầu tiên ("TongHop"): Tổng hợp tất cả sinh viên từ các lớp được chọn, phân loại rõ ràng theo từng lớp.
 * - Các Sheet tiếp theo: Mỗi lớp một Sheet riêng biệt với đầy đủ định dạng chuẩn.
 */
export function buildMultiClassResultWorkbook(
  bundles: ClassExportBundle[],
  options?: {
    termName?: string;
    summarySheetTitle?: string;
  }
): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  const existingSheetNames = new Set<string>();

  if (!bundles || bundles.length === 0) {
    const emptyWs = XLSX.utils.aoa_to_sheet([['Không có dữ liệu lớp học']]);
    XLSX.utils.book_append_sheet(workbook, emptyWs, 'Empty');
    return workbook;
  }

  const termName = options?.termName || bundles[0]?.meta.termName || '';
  const commonSubjectCode = bundles[0]?.meta.subjectCode || 'EXE101';
  const commonLecturerCode = bundles[0]?.meta.lecturerCode || '';

  // 1. Sheet Tổng hợp (TongHop)
  const allRows: StudentGroupExportRow[] = [];
  bundles.forEach((b) => {
    allRows.push(...b.rows);
  });

  const summaryMeta: GroupExportMeta = {
    className: bundles.length === 1 ? bundles[0].className : 'ALL_CLASSES',
    subjectCode: commonSubjectCode,
    termName,
    lecturerCode: commonLecturerCode,
  };

  const summaryWs = buildGroupResultWorksheet(allRows, summaryMeta);
  const summarySheetName = sanitizeSheetName(options?.summarySheetTitle || 'TongHop', existingSheetNames);
  XLSX.utils.book_append_sheet(workbook, summaryWs, summarySheetName);

  // 2. Sheet riêng cho từng lớp
  bundles.forEach((bundle) => {
    const ws = buildGroupResultWorksheet(bundle.rows, bundle.meta);
    const sheetName = sanitizeSheetName(bundle.className || `Class_${bundle.classId}`, existingSheetNames);
    XLSX.utils.book_append_sheet(workbook, ws, sheetName);
  });

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
 * Xuất file Excel tổng hợp cho nhiều lớp học (bao gồm Sheet TongHop và các Sheet riêng từng lớp)
 */
export function exportMultiClassResultExcel(
  bundles: ClassExportBundle[],
  options?: {
    filenamePrefix?: string;
    termName?: string;
    customFilename?: string;
  }
): void {
  const workbook = buildMultiClassResultWorkbook(bundles, {
    termName: options?.termName,
  });

  if (options?.customFilename) {
    downloadExcelWorkbook(workbook, options.customFilename);
    return;
  }

  const cleanTerm = (options?.termName || bundles[0]?.meta.termName || '').replace(/[^a-zA-Z0-9_-]/g, '_');
  const prefix = options?.filenamePrefix || 'DSSV_AllClasses';
  const cleanPrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `${cleanPrefix}${cleanTerm ? `_${cleanTerm}` : ''}.xlsx`;
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

/**
 * Lấy dữ liệu phân nhóm của nhiều lớp học (phục vụ xuất toàn bộ lớp hoặc các lớp được chọn)
 */
export async function fetchMultipleClassesAllocationData(
  classesList: Array<{
    id: number;
    name: string;
    lecturerCode?: string | null;
    termId?: number | null;
    termName?: string | null;
  }>,
  options: {
    termId?: number | null;
    termName?: string | null;
    onProgress?: (completed: number, total: number, currentClassName: string) => void;
  } = {}
): Promise<ClassExportBundle[]> {
  if (!classesList || classesList.length === 0) return [];

  // Map lưu classId -> deadlineId sau khi quét deadline của học kỳ
  const deadlineMap = new Map<number, number>();
  const termId = (options.termId ?? classesList[0]?.termId) ?? undefined;

  try {
    const deadlines = await deadlineApi.getDeadlines({
      termId: termId ?? undefined,
      page: 1,
      size: 50,
    });
    const allDeadlines = [...deadlines.result];
    for (let page = 2; page <= deadlines.meta.pages; page++) {
      allDeadlines.push(
        ...(await deadlineApi.getDeadlines({ termId: termId ?? undefined, page, size: 50 })).result
      );
    }
    allDeadlines.forEach((dl) => {
      dl.schoolClassIds?.forEach((cid) => {
        deadlineMap.set(cid, dl.id);
      });
    });
  } catch (err) {
    // Nếu có lỗi lấy danh sách deadline thì để từng lớp fallback
    console.warn('Could not pre-fetch deadlines for multi-class export:', err);
  }

  const bundles: ClassExportBundle[] = [];
  let completed = 0;

  for (const cls of classesList) {
    options.onProgress?.(completed, classesList.length, cls.name);
    const deadlineId = deadlineMap.get(cls.id);
    const { rows, meta } = await fetchClassAllocationData(cls.id, {
      termId: (options.termId ?? cls.termId) ?? undefined,
      termName: (options.termName ?? cls.termName) ?? undefined,
      lecturerCode: cls.lecturerCode ?? undefined,
      className: cls.name,
      deadlineId,
    });

    bundles.push({
      classId: cls.id,
      className: cls.name,
      rows,
      meta,
    });

    completed++;
    options.onProgress?.(completed, classesList.length, cls.name);
  }

  return bundles;
}
