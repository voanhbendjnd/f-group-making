import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StudentImportPage } from '@/pages/admin/StudentImportPage';
import { importApi } from '@/features/import/api/importApi';
import { parseExcelClientSide } from '@/features/import/utils/excelParser';
import i18n from '@/locales/i18n';

vi.mock('@/features/import/api/importApi', () => ({ importApi: { importExcel: vi.fn() } }));
vi.mock('@/features/import/utils/excelParser', () => ({ parseExcelClientSide: vi.fn() }));
vi.mock('canvas-confetti', () => ({ default: vi.fn() }));

const pending = { success: false, totalImported: 0, errors: [], confirmationRequired: true, newMajorCodes: ['ABC', 'XYZ'] };
const success = { success: true, totalImported: 1, errors: [], createdMajorCodes: ['ABC', 'XYZ'] };
let client: QueryClient;

function chooseFile(name = 'students.xlsx') {
  const file = new File(['xlsx'], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  fireEvent.change(document.querySelector('input[type=file]')!, { target: { files: [file] } });
  return file;
}

async function startImport() {
  render(<MemoryRouter><QueryClientProvider client={client}><StudentImportPage /></QueryClientProvider></MemoryRouter>);
  const file = chooseFile();
  await waitFor(() => expect(parseExcelClientSide).toHaveBeenCalledWith(file));
  fireEvent.click((await screen.findAllByRole('button', { name: /Confirm Import 1/ }))[0]);
  return file;
}

describe('Student import major confirmation', () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    await i18n.changeLanguage('en');
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.mocked(parseExcelClientSide).mockResolvedValue({ rows: [{ rowNumber: 3, rollNumber: 'SE001', fullName: 'Student',
      originalMajor: 'BEN_ABC_ET', extractedMajorCode: 'ABC', memberCode: 'MEM001', email: 'student@example.com',
      isValid: true, validationErrors: [] }], totalRows: 1, validCount: 1, invalidCount: 0, hasErrors: false });
    vi.mocked(importApi.importExcel).mockResolvedValueOnce(pending).mockResolvedValueOnce(success);
  });
  afterEach(() => { cleanup(); client.clear(); });

  it('shows codes before sending approval and refreshes both catalogs after success', async () => {
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const file = await startImport();
    expect(await screen.findByRole('dialog')).toHaveTextContent('ABC');
    expect(screen.getByRole('dialog')).toHaveTextContent('XYZ');
    expect(importApi.importExcel).toHaveBeenCalledWith(file, []);
    expect(importApi.importExcel).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Create majors and import' }));
    await waitFor(() => expect(importApi.importExcel).toHaveBeenLastCalledWith(file, ['ABC', 'XYZ']));
    expect(await screen.findByText(/Created majors: ABC, XYZ/)).toBeInTheDocument();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['majors'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['students'] });
  });

  it('canceling does not resubmit or create majors', async () => {
    await startImport();
    await screen.findByRole('dialog');
    const cancel = screen.getByRole('dialog').querySelector('button.btn-secondary')!;
    fireEvent.click(cancel);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(importApi.importExcel).toHaveBeenCalledTimes(1);
  });

  it('a changed file starts without the previous approval', async () => {
    await startImport();
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('dialog').querySelector('button.btn-secondary')!);
    const nextFile = chooseFile('different.xlsx');
    await waitFor(() => expect(parseExcelClientSide).toHaveBeenLastCalledWith(nextFile));
    fireEvent.click((await screen.findAllByRole('button', { name: /Confirm Import 1/ }))[0]);
    await waitFor(() => expect(importApi.importExcel).toHaveBeenLastCalledWith(nextFile, []));
  });

  it('asks again when the server finds additional unapproved codes', async () => {
    vi.mocked(importApi.importExcel).mockReset().mockResolvedValueOnce(pending)
      .mockResolvedValueOnce({ ...pending, newMajorCodes: ['ABC', 'XYZ', 'NEW'] }).mockResolvedValueOnce(success);
    const file = await startImport();
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Create majors and import' }));
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('NEW'));
    expect(importApi.importExcel).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: 'Create majors and import' }));
    await waitFor(() => expect(importApi.importExcel).toHaveBeenLastCalledWith(file, ['ABC', 'XYZ', 'NEW']));
  });
});
