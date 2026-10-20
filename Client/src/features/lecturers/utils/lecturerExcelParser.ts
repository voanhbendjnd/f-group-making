import * as XLSX from 'xlsx';
import type { ParsedLecturerRow, ParseLecturerExcelResult } from '../types';

const EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export async function parseLecturerExcelClientSide(file: File): Promise<ParseLecturerExcelResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });

  // Priority 1: Sheet containing "mentor" or "giảng viên" or "lecturer"
  let targetSheetName = workbook.SheetNames.find((name) => {
    const lower = name.toLowerCase();
    return lower.includes('mentor') || lower.includes('giang vien') || lower.includes('giảng viên') || lower.includes('lecturer');
  });

  // Priority 2: Second sheet if available and first doesn't match
  if (!targetSheetName && workbook.SheetNames.length >= 2) {
    targetSheetName = workbook.SheetNames[1];
  }

  // Priority 3: Fallback first sheet
  if (!targetSheetName) {
    targetSheetName = workbook.SheetNames[0];
  }

  if (!targetSheetName) {
    throw new Error('File Excel không có bất kỳ trang tính (sheet) nào.');
  }

  const worksheet = workbook.Sheets[targetSheetName];
  const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    blankrows: true,
  });

  if (rawRows.length === 0) {
    throw new Error(`Trang tính "${targetSheetName}" không có dữ liệu.`);
  }

  // Detect header row and column indices
  let colCode = -1;
  let colEmail = -1;
  const headerRow = rawRows[0] || [];

  for (let c = 0; c < headerRow.length; c++) {
    const val = String(headerRow[c] ?? '').trim().toLowerCase();
    if (val.includes('mentor') || val.includes('gv') || val.includes('lecturer') || val.includes('code') || val.includes('mã')) {
      if (!val.includes('group')) {
        colCode = c;
      }
    } else if (val.includes('email') || val.includes('mail')) {
      colEmail = c;
    }
  }

  // Fallback defaults for DS_Mentor_email.xlsx: Col 1 = Mentor, Col 2 = Email
  if (colCode === -1 && headerRow.length >= 2) {
    colCode = 1;
  }
  if (colEmail === -1 && headerRow.length >= 3) {
    colEmail = 2;
  }

  if (colCode === -1 || colEmail === -1) {
    throw new Error(`Không thể nhận diện cột Mã/Tên Mentor và Email trong sheet "${targetSheetName}".`);
  }

  const parsedRows: ParsedLecturerRow[] = [];
  const seenCodes = new Set<string>();
  const seenEmails = new Set<string>();

  // Start from row index 1 (Excel row 2)
  for (let i = 1; i < rawRows.length; i++) {
    const rawRow = rawRows[i];
    const excelRowNumber = i + 1;

    const code = String(rawRow[colCode] ?? '').trim();
    const email = String(rawRow[colEmail] ?? '').trim().toLowerCase();

    // Skip empty row
    if (!code && !email) {
      continue;
    }

    const errors: string[] = [];

    // Validate Code
    if (!code) {
      errors.push('Mã giảng viên / mentor không được để trống.');
    } else if (code.length < 2 || code.length > 50) {
      errors.push('Mã giảng viên / mentor phải có độ dài từ 2 đến 50 ký tự.');
    } else if (seenCodes.has(code.toLowerCase())) {
      errors.push(`Mã giảng viên "${code}" bị trùng lặp trong file.`);
    } else {
      seenCodes.add(code.toLowerCase());
    }

    // Validate Email
    if (!email) {
      errors.push('Email không được để trống.');
    } else if (email.length > 254 || !EMAIL_REGEX.test(email)) {
      errors.push(`Email "${email}" không đúng định dạng.`);
    } else if (seenEmails.has(email)) {
      errors.push(`Email "${email}" bị trùng lặp trong file.`);
    } else {
      seenEmails.add(email);
    }

    parsedRows.push({
      rowNumber: excelRowNumber,
      code,
      email,
      isValid: errors.length === 0,
      validationErrors: errors,
    });
  }

  const validCount = parsedRows.filter((r) => r.isValid).length;
  const invalidCount = parsedRows.length - validCount;

  return {
    rows: parsedRows,
    totalRows: parsedRows.length,
    validCount,
    invalidCount,
    hasErrors: invalidCount > 0,
  };
}
