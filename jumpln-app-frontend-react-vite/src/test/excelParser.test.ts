import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseExcelClientSide } from '../features/import/utils/excelParser';

describe('excelParser client validation', () => {
  it('normalizes the code after the first underscore, rejects missing codes and preserves row numbers', async () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ['Title'], ['Headers'], [],
      [1, 'SV001', 'Student One', 'BEN_ se _ET', 'MEM001', 'one@example.com'],
      [2, 'SV002', 'Student Two', 'SE', 'MEM002', 'two@example.com'],
      [3, 'SV003', 'Student Three', 'BEN__ET', 'MEM003', 'three@example.com'],
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, 'Students');
    const file = new File([XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })], 'students.xlsx');
    const result = await parseExcelClientSide(file);
    expect(result.rows[0].rowNumber).toBe(4);
    expect(result.rows[0].extractedMajorCode).toBe('SE');
    expect(result.rows[0].isValid).toBe(true);
    expect(result.rows[1].isValid).toBe(false);
    expect(result.rows[2].isValid).toBe(false);
    expect(result.invalidCount).toBe(2);
  });

  it('correctly skips first 2 header rows and validates valid student records', async () => {
    // Construct a workbook matching the backend template (row 1 & 2 headers, row 3+ data)
    const data = [
      ['BẢNG PHÂN CÔNG SINH VIÊN', '', '', '', '', ''],
      ['STT', 'Mã SV', 'Họ và tên', 'Mã ngành', 'Mã thành viên', 'Email'],
      [1, 'SE180001', 'Nguyễn Văn An', 'BEN_SE_ET_19C', 'AN_SE180001', 'an@fpt.edu.vn'],
      [2, 'SE180002', 'Trần Thị Bình', 'BEN_SE_ET_19C', 'BINH_SE180002', 'binh@fpt.edu.vn'],
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Students');
    const u8 = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });

    const file = new File([u8], 'students.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const result = await parseExcelClientSide(file);

    expect(result.totalRows).toBe(2);
    expect(result.validCount).toBe(2);
    expect(result.invalidCount).toBe(0);
    expect(result.rows[0].rollNumber).toBe('SE180001');
    expect(result.rows[0].extractedMajorCode).toBe('SE');
    expect(result.rows[0].isValid).toBe(true);
  });

  it('detects missing fields and invalid email format', async () => {
    const data = [
      ['HEADER 1', '', '', '', '', ''],
      ['HEADER 2', '', '', '', '', ''],
      [1, '', 'Lê Văn Thiếu', 'BEN_IA_ET_19C', 'THIEU_IA', 'invalid-email'],
      [2, 'IA180002', 'Hoàng Văn B', 'BEN_IA_ET_19C', '', 'hoang@fpt.edu.vn'],
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Students');
    const u8 = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });

    const file = new File([u8], 'students_invalid.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const result = await parseExcelClientSide(file);

    expect(result.totalRows).toBe(2);
    expect(result.invalidCount).toBe(2);
    expect(result.rows[0].isValid).toBe(false);
    expect(result.rows[0].validationErrors).toContain('Thiếu Mã sinh viên (Cột B)');
    expect(result.rows[1].validationErrors).toContain('Thiếu Mã thành viên (Cột E)');
  });

  it('detects duplicate roll numbers in file', async () => {
    const data = [
      ['HEADER 1', '', '', '', '', ''],
      ['HEADER 2', '', '', '', '', ''],
      [1, 'SE180099', 'Sinh Viên 1', 'BEN_SE_ET_19C', 'SV1', 'sv1@fpt.edu.vn'],
      [2, 'SE180099', 'Sinh Viên 2', 'BEN_SE_ET_19C', 'SV2', 'sv2@fpt.edu.vn'],
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Students');
    const u8 = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });

    const file = new File([u8], 'students_dup.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const result = await parseExcelClientSide(file);

    expect(result.totalRows).toBe(2);
    expect(result.rows[0].isValid).toBe(true);
    expect(result.rows[1].isValid).toBe(false);
    expect(result.rows[1].validationErrors[0]).toContain('bị trùng lặp');
  });
});
