import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parseExcelClientSide } from '@/features/import/utils/excelParser';
import { parseLecturerExcelClientSide } from '@/features/lecturers/utils/lecturerExcelParser';

function template(kind: 'students' | 'lecturers') {
  const bytes = readFileSync(resolve(process.cwd(), 'public', `sample-${kind}.xlsx`));
  return XLSX.read(bytes, { type: 'buffer' });
}
function file(workbook: XLSX.WorkBook): File {
  const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
  return { arrayBuffer: async () => buffer } as File;
}

describe('downloadable Excel templates', () => {
  it('keeps the student import sheet first, its two header rows and all original column positions', () => {
    const wb = template('students');
    expect(wb.SheetNames).toEqual(['Students']);
    const sheet = wb.Sheets.Students;
    expect(['B2', 'C2', 'D2', 'E2', 'F2', 'I2', 'J2'].map(address => sheet[address]?.v))
      .toEqual(['RollNumber', 'FullName', 'Khoá', 'MemberCode', 'Email', 'GroupName', 'GV']);
  });

  it('keeps the student input area empty so the template cannot create example accounts', async () => {
    const result = await parseExcelClientSide(file(template('students')));
    expect(result.totalRows).toBe(0);
  });

  it('accepts a student row filled into the downloaded template with the real client parser', async () => {
    const wb = template('students');
    const row = [1, 'TEST0001', 'Sinh viên minh họa', 'BEN_SE_ET_26', 'MEM_TEST0001', 'student.demo@example.test', 'A24/EXE', 'EXE101', 'EXE101_DEMO', 'GV_MAU', ''];
    XLSX.utils.sheet_add_aoa(wb.Sheets.Students, [row], { origin: 'A3' });
    const result = await parseExcelClientSide(file(wb));
    expect(result.totalRows).toBe(1);
    expect(result.validCount).toBe(1);
    expect(result.rows[0]).toMatchObject({ rowNumber: 3, rollNumber: 'TEST0001', extractedMajorCode: 'SE', lecturerCode: 'GV_MAU' });
  });

  it('keeps the basic lecturer template to one sheet with two headers and no example records', async () => {
    const wb = template('lecturers');
    expect(wb.SheetNames).toEqual(['Mentors']);
    expect(wb.Sheets.Mentors.A1.v).toBe('Mentor');
    expect(wb.Sheets.Mentors.B1.v).toBe('Email');
    expect((await parseLecturerExcelClientSide(file(wb))).totalRows).toBe(0);
  });

  it('accepts a lecturer row filled into the downloaded template with the real client parser', async () => {
    const wb = template('lecturers');
    XLSX.utils.sheet_add_aoa(wb.Sheets.Mentors, [['GV_MAU', 'lecturer.demo@example.test']], { origin: 'A2' });
    const result = await parseLecturerExcelClientSide(file(wb));
    expect(result.validCount).toBe(1);
    expect(result.rows[0]).toMatchObject({ rowNumber: 2, code: 'GV_MAU', email: 'lecturer.demo@example.test' });
  });
});
