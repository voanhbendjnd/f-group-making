import * as XLSX from 'xlsx';
import i18n from '@/locales/i18n';
import type { ParsedStudentRow } from '../types';

const EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export interface ParseExcelResult {
  rows: ParsedStudentRow[];
  totalRows: number;
  validCount: number;
  invalidCount: number;
  hasErrors: boolean;
}

export async function parseExcelClientSide(file: File): Promise<ParseExcelResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error(i18n.t('import.clientErrors.noSheet'));
  }

  const worksheet = workbook.Sheets[firstSheetName];
  // Parse sheet into 2D array of rows
  const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    blankrows: true,
  });

  const parsedRows: ParsedStudentRow[] = [];
  const seenRollNumbers = new Set<string>();

  // Backend skips row index 0 and 1, starting from Excel row 3 (0-indexed rawRows[2])
  for (let i = 2; i < rawRows.length; i++) {
    const rawRow = rawRows[i];
    const excelRowNumber = i + 1; // 1-indexed Excel row

    // Extract columns B to F (indices 1 to 5)
    const rollNumber = String(rawRow[1] ?? '').trim();
    const fullName = String(rawRow[2] ?? '').trim();
    const originalMajor = String(rawRow[3] ?? '').trim();
    const memberCode = String(rawRow[4] ?? '').trim();
    const email = String(rawRow[5] ?? '').trim().toLowerCase();

    // Check if entire row is empty
    if (!rollNumber && !fullName && !originalMajor && !memberCode && !email) {
      continue;
    }

    const errors: string[] = [];

    if (!rollNumber) {
      errors.push(i18n.t('import.clientErrors.missingRollNumber'));
    } else if (seenRollNumbers.has(rollNumber.toLowerCase())) {
      errors.push(i18n.t('import.clientErrors.duplicateRollNumber', { rollNumber }));
    } else {
      seenRollNumbers.add(rollNumber.toLowerCase());
    }

    if (!fullName) {
      errors.push(i18n.t('import.clientErrors.missingFullName'));
    } else if (fullName.length > 50) {
      errors.push(i18n.t('import.clientErrors.fullNameTooLong'));
    }

    let extractedMajorCode = '';
    if (!originalMajor) {
      errors.push(i18n.t('import.clientErrors.missingMajor'));
    } else {
      const parts = originalMajor.split('_', 3);
      extractedMajorCode = (parts[1] || '').trim().toUpperCase();
      if (parts.length < 2 || !/^[A-Z0-9][A-Z0-9-]{0,19}$/.test(extractedMajorCode)) {
        errors.push(i18n.t('import.clientErrors.invalidMajorFormat'));
      }
    }

    if (!memberCode) {
      errors.push(i18n.t('import.clientErrors.missingMemberCode'));
    }

    if (!email) {
      errors.push(i18n.t('import.clientErrors.missingEmail'));
    } else if (!EMAIL_REGEX.test(email)) {
      errors.push(i18n.t('import.clientErrors.invalidEmail', { email }));
    }

    parsedRows.push({
      rowNumber: excelRowNumber,
      rollNumber,
      fullName,
      originalMajor,
      extractedMajorCode,
      memberCode,
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
