import { StudentLayout } from '@/components/layout/StudentLayout';
import { LecturerLayout } from '@/components/layout/LecturerLayout';
import { TermFilterNotice } from '@/features/terms/components/TermFilterNotice';
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TermProvider } from '@/app/providers/TermContext';
import { TermSelect } from '@/features/terms/components/TermSelect';
import { TermScope } from '@/features/terms/components/TermScope';
import { termApi } from '@/features/terms/api/termApi';
import { StudentListPage } from '@/pages/admin/StudentListPage';
import { AdminDashboardPage } from '@/pages/admin/AdminDashboardPage';
import { ClassListPage } from '@/pages/admin/ClassListPage';
import { ClassDetailPage } from '@/pages/admin/ClassDetailPage';
import { LecturerListPage } from '@/pages/admin/LecturerListPage';
import { StudentImportPage } from '@/pages/admin/StudentImportPage';
import { LecturerImportPage } from '@/pages/admin/LecturerImportPage';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { studentApi } from '@/features/students/api/studentApi';
import { lecturerApi } from '@/features/lecturers/api/lecturerApi';
import { classApi } from '@/features/classes/api/classApi';
import { importApi } from '@/features/import/api/importApi';
import { parseExcelClientSide } from '@/features/import/utils/excelParser';
import { parseLecturerExcelClientSide } from '@/features/lecturers/utils/lecturerExcelParser';
import type { Student, PaginatedStudents } from '@/features/students/types';
import i18n from '@/locales/i18n';

vi.mock('@/app/providers/AuthContext', () => ({ useAuth: () => ({
  user: { id: 1, name: 'Test Admin' }, isAdmin: true, logout: vi.fn(),
}) }));
vi.mock('@/app/providers/ToastContext', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/features/terms/api/termApi', () => ({ termApi: { getTerms: vi.fn(), getCurrentTerm: vi.fn(), createTerm: vi.fn() } }));
vi.mock('@/features/students/api/studentApi', () => ({ studentApi: {
  getStudents: vi.fn(), sendSingleActivation: vi.fn(), sendBatchActivation: vi.fn(), sendActivateAllMatching: vi.fn(),
} }));
vi.mock('@/features/lecturers/api/lecturerApi', () => ({ lecturerApi: {
  getLecturers: vi.fn(), sendSingleActivation: vi.fn(), sendBatchActivation: vi.fn(), deleteBatchLecturers: vi.fn(),
  deleteLecturer: vi.fn(), importExcel: vi.fn(),
} }));
vi.mock('@/features/classes/api/classApi', () => ({ classApi: { getAllClasses: vi.fn(), getClasses: vi.fn(), getClassById: vi.fn(), getClassStudents: vi.fn() } }));
vi.mock('@/features/import/api/importApi', () => ({ importApi: { importExcel: vi.fn() } }));
vi.mock('@/features/import/utils/excelParser', () => ({ parseExcelClientSide: vi.fn() }));
vi.mock('@/features/lecturers/utils/lecturerExcelParser', () => ({ parseLecturerExcelClientSide: vi.fn() }));
vi.mock('canvas-confetti', () => ({ default: vi.fn() }));

const past = { id: 1, name: 'SP26', isCurrent: false };
const current = { id: 2, name: 'FALL26', isCurrent: true };
const storageKey = 'f_group_selected_term_1';
const batchResult = { totalRequested: 1, totalProcessed: 1, totalSkippedAlreadyActive: 0, sentEmails: [] };
let client: QueryClient;

function student(termId: number): Student {
  return { userId: termId * 10, fullName: `Student ${termId}`, rollNumber: `SE00${termId}`,
    email: `student${termId}@example.test`, memberCode: `MEM${termId}`, majorId: 1, majorCode: 'SE',
    activated: false, hasActivationKey: false, isKeyExpired: false, activationKeyExpiresAt: null,
    createdDate: null, lastModifiedDate: null };
}

function students(termId: number, page = 1): PaginatedStudents {
  return { result: [student(termId)], meta: { page, pageSize: 10, total: 20, pages: 2 } };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function renderPage(page: React.ReactNode, path = '/') {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30000 }, mutations: { retry: false } } });
  return render(<MemoryRouter initialEntries={[path]}><QueryClientProvider client={client}><TermProvider>
    <TermSelect compact />{page}
  </TermProvider></QueryClientProvider></MemoryRouter>);
}

async function switchTerm(id: number) {
  const select = await screen.findByRole('combobox', { name: 'Academic Term' });
  await waitFor(() => expect(select).not.toBeDisabled());
  fireEvent.click(select);
  fireEvent.click(screen.getByRole('option', { name: id === 1 ? 'SP26' : /FALL26/ }));
}

function chooseFile() {
  const file = new File(['test'], 'test.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  fireEvent.change(document.querySelector('input[type=file]')!, { target: { files: [file] } });
  return file;
}

describe('Academic Term filter', () => {
  it.each(['student', 'lecturer'])('reuses the Admin selector in the %s layout and persists choice across refresh', async area => {
    const content = area === 'student' ? <StudentLayout /> : <LecturerLayout />;
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(<MemoryRouter><QueryClientProvider client={client}>{content}</QueryClientProvider></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveTextContent('FALL26'));
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: 'SP26' }));
    await waitFor(() => expect(localStorage.getItem(storageKey)).toBe('1'));
    view.unmount();
    render(<MemoryRouter><QueryClientProvider client={client}>{content}</QueryClientProvider></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveTextContent('SP26'));
    await act(async () => { await i18n.changeLanguage('vi'); });
    expect(screen.getByRole('combobox', { name: i18n.t('terms.label') })).toHaveTextContent('SP26');
    expect(i18n.t('terms.label')).not.toBe('Academic Term');
  });

  it('explains unsupported deadline filtering without sending term parameters', () => {
    renderPage(<TermFilterNotice area="lecturer" />, '/lecturer/deadlines');
    expect(screen.getByText(i18n.t('terms.deadlineScopeNotice'))).toBeInTheDocument();
  });

  beforeEach(async () => {
    vi.resetAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    await i18n.changeLanguage('en');
    vi.mocked(termApi.getCurrentTerm).mockResolvedValue(current);
    vi.mocked(termApi.getTerms).mockResolvedValue([past, current]);
    vi.mocked(studentApi.getStudents).mockImplementation(async (params) => students(params?.termId ?? 99, params?.page));
    vi.mocked(studentApi.sendBatchActivation).mockResolvedValue(batchResult);
    vi.mocked(studentApi.sendActivateAllMatching).mockResolvedValue(batchResult);
    vi.mocked(lecturerApi.sendBatchActivation).mockResolvedValue(batchResult);
    vi.mocked(lecturerApi.getLecturers).mockImplementation(async (params) => ({
      meta: { page: 1, pageSize: 10, pages: 1, total: 1 },
      result: [{ userId: 100, code: params?.termId ? 'ASSIGNED' : 'UNASSIGNED', name: 'Test Lecturer',
        email: 'lecturer@example.test', activated: false, hasActivationKey: false, isKeyExpired: false,
        activationKeyExpiresAt: null, createdDate: null, lastModifiedDate: null }],
    }));
    vi.mocked(classApi.getClasses).mockImplementation(async (params) => ({
      meta: { page: 1, pageSize: 10, pages: 1, total: 1 },
      result: [{ id: 7, name: `Class ${params?.termId}`, termId: params?.termId ?? null, termName: 'SP26',
        lecturerId: null, lecturerCode: null, lecturerName: null, lecturerEmail: null, studentCount: 1, createdDate: '' }],
    }));
    vi.mocked(classApi.getAllClasses).mockImplementation(async termId => (await classApi.getClasses({ termId, page: 1 })).result);
  });
  afterEach(() => { cleanup(); client?.clear(); });

  it('distinguishes the Backend Current Term from the selected historical Term', async () => {
    renderPage(null);
    await switchTerm(1);
    const trigger = screen.getByRole('combobox', { name: 'Academic Term' });
    expect(trigger).toHaveTextContent('SP26');
    const badge = screen.getByTitle('Current: FALL26');
    expect(badge).toHaveTextContent('FALL26');
    expect(badge.parentElement).toHaveClass('ts-label');
    fireEvent.click(trigger);
    expect(screen.getByRole('option', { name: 'SP26' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: /FALL26/ })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('listbox').parentElement).toBe(document.body);
  });

  it('supports keyboard selection and closes on Escape, Tab and outside interaction', async () => {
    renderPage(null);
    const trigger = screen.getByRole('combobox', { name: 'Academic Term' });
    await waitFor(() => expect(trigger).not.toBeDisabled());
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(trigger, { key: 'Home' });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(trigger).toHaveTextContent('SP26');
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    for (const key of ['Escape', 'Tab']) {
      fireEvent.click(trigger);
      fireEvent.keyDown(trigger, { key });
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    }
    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    fireEvent.click(trigger);
    fireEvent(window, new Event('resize'));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('loads historical terms, defaults to Backend Current Term and persists a changed selection across refresh', async () => {
    const view = renderPage(<StudentListPage />);
    expect(await screen.findByText('Student 2')).toBeInTheDocument();
    expect(termApi.getTerms).toHaveBeenCalledWith(false);
    await switchTerm(1);
    expect(await screen.findByText('Student 1')).toBeInTheDocument();
    expect(localStorage.getItem(storageKey)).toBe('1');
    view.unmount();
    client.clear();
    vi.mocked(studentApi.getStudents).mockClear();
    renderPage(<StudentListPage />);
    expect(await screen.findByText('Student 1')).toBeInTheDocument();
    expect(studentApi.getStudents).toHaveBeenCalledWith(expect.objectContaining({ termId: 1 }));
    expect(studentApi.getStudents).not.toHaveBeenCalledWith(expect.objectContaining({ termId: 2 }));
  });

  it('keeps the Sidebar selection when navigating from Student List to Class List', async () => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<MemoryRouter initialEntries={['/admin/students']}><QueryClientProvider client={client}>
      <Routes><Route path="/admin" element={<AdminLayout />}>
        <Route path="students" element={<StudentListPage />} />
        <Route path="classes" element={<ClassListPage />} />
      </Route></Routes>
    </QueryClientProvider></MemoryRouter>);
    await screen.findByText('Student 2');
    await switchTerm(1);
    await screen.findByText('Student 1');
    fireEvent.click(screen.getByRole('link', { name: i18n.t('classes.label') }));
    await screen.findByText('Class 1');
    expect(screen.getByRole('combobox', { name: 'Academic Term' })).toHaveTextContent('SP26');
    expect(classApi.getClasses).toHaveBeenLastCalledWith(expect.objectContaining({ termId: 1 }));
  });

  it.each(['999', '', 'invalid', '-1'])('rejects unavailable saved Term %s and resolves Current Term before fetching', async (saved) => {
    localStorage.setItem(storageKey, saved);
    renderPage(<StudentListPage />);
    expect(await screen.findByText('Student 2')).toBeInTheDocument();
    expect(studentApi.getStudents).toHaveBeenCalledTimes(1);
    expect(studentApi.getStudents).toHaveBeenCalledWith(expect.objectContaining({ termId: 2 }));
  });

  it('does not fetch global student data when the Term catalog is empty', async () => {
    vi.mocked(termApi.getTerms).mockResolvedValue([]);
    renderPage(<StudentListPage />);
    expect(await screen.findByRole('heading', { name: 'No academic term available' })).toBeInTheDocument();
    expect(studentApi.getStudents).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('shows a recoverable catalog error without unfiltered calls', async () => {
    vi.mocked(termApi.getCurrentTerm).mockRejectedValue(new Error('Unavailable'));
    renderPage(<StudentListPage />);
    await screen.findAllByText('Unable to load academic terms. Please try again.');
    expect(studentApi.getStudents).not.toHaveBeenCalled();
  });

  it('resets page, selection and modal immediately; never shows prior Term rows while a new Term loads', async () => {
    const pending = deferred<PaginatedStudents>();
    vi.mocked(studentApi.getStudents).mockImplementation(async (params) => params?.termId === 1
      ? pending.promise : students(2, params?.page));
    renderPage(<StudentListPage />);
    await screen.findByText('Student 2');
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    await waitFor(() => expect(studentApi.getStudents).toHaveBeenCalledWith(expect.objectContaining({ page: 2 })));
    await screen.findByText('Student 2');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select student Student 2' }));
    fireEvent.click(screen.getByRole('button', { name: i18n.t('students.btnSend') }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await switchTerm(1);
    expect(screen.queryByText('Student 2')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(studentApi.getStudents).toHaveBeenLastCalledWith(expect.objectContaining({ termId: 1, page: 1 }));
    await act(async () => pending.resolve(students(1)));
    expect(await screen.findByText('Student 1')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Select student Student 1' })).not.toBeChecked();
  });

  it('an older in-flight response cannot overwrite the newly selected Term', async () => {
    const old = deferred<PaginatedStudents>();
    vi.mocked(studentApi.getStudents).mockImplementation(async (params) => params?.termId === 2 ? old.promise : students(1));
    renderPage(<StudentListPage />);
    await waitFor(() => expect(studentApi.getStudents).toHaveBeenCalled());
    await switchTerm(1);
    await screen.findByText('Student 1');
    await act(async () => old.resolve(students(2)));
    expect(screen.queryByText('Student 2')).not.toBeInTheDocument();
  });

  it('scopes every Dashboard statistic and recent-student request', async () => {
    renderPage(<AdminDashboardPage />);
    await waitFor(() => expect(studentApi.getStudents).toHaveBeenCalledTimes(3));
    expect(vi.mocked(studentApi.getStudents).mock.calls.every(([params]) => params?.termId === 2)).toBe(true);
    await switchTerm(1);
    await waitFor(() => expect(studentApi.getStudents).toHaveBeenCalledTimes(6));
    expect(vi.mocked(studentApi.getStudents).mock.calls.slice(3).every(([params]) => params?.termId === 1)).toBe(true);
  });

  it('shows Dashboard failures instead of presenting failed statistics as zero', async () => {
    vi.mocked(studentApi.getStudents).mockRejectedValue(new Error('Statistics unavailable'));
    renderPage(<AdminDashboardPage />);
    expect((await screen.findAllByText(i18n.t('adminUx.dataUnavailable'))).length).toBeGreaterThan(0);
    expect(screen.queryByText('Student 2')).not.toBeInTheDocument();
  });

  it('refreshes the shared catalog and selects a newly created Term in both dropdowns', async () => {
    const created = { id: 3, name: 'SP27', isCurrent: false };
    vi.mocked(termApi.createTerm).mockResolvedValue(created);
    vi.mocked(termApi.getTerms).mockResolvedValueOnce([past, current]).mockResolvedValue([past, current, created]);
    renderPage(<TermSelect />);
    await waitFor(() => expect(screen.getAllByRole('combobox')[0]).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: i18n.t('adminUx.createTerm') }));
    fireEvent.change(screen.getByLabelText(i18n.t('adminUx.termName'), { exact: false }), { target: { value: 'SP27' } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: i18n.t('adminUx.createTerm') }));
    await waitFor(() => expect(screen.getAllByRole('combobox').every((select) => select.textContent === 'SP27')).toBe(true));
    expect(termApi.createTerm).toHaveBeenCalledWith({ name: 'SP27' });
    expect(localStorage.getItem(storageKey)).toBe('3');
    expect(termApi.getTerms).toHaveBeenCalledTimes(2);
  });

  it('scopes Class List and does not offer an independent all-Term filter', async () => {
    renderPage(<ClassListPage />);
    await screen.findByText('Class 2');
    expect(screen.queryByRole('option', { name: 'Tất cả học kỳ' })).not.toBeInTheDocument();
    await switchTerm(1);
    await screen.findByText('Class 1');
    expect(classApi.getClasses).toHaveBeenLastCalledWith(expect.objectContaining({ termId: 1, page: 1 }));
  });

  it('blocks Class Detail outside the selected Term before requesting its students', async () => {
    vi.mocked(classApi.getClassById).mockResolvedValue({ id: 7, name: 'EXE101_G01', termId: 1,
      termName: 'SP26', lecturerId: null, lecturerCode: null, lecturerName: null, lecturerEmail: null, studentCount: 1, createdDate: '' });
    vi.mocked(classApi.getClassStudents).mockResolvedValue([student(1)]);
    renderPage(<Routes><Route path="/classes/:id" element={<ClassDetailPage />} /></Routes>, '/classes/7');
    expect(await screen.findByRole('alert')).toHaveTextContent('does not belong');
    expect(classApi.getClassStudents).not.toHaveBeenCalled();
    await switchTerm(1);
    expect(await screen.findByText('Student 1')).toBeInTheDocument();
    await switchTerm(2);
    expect(await screen.findByRole('alert')).toHaveTextContent('does not belong');
    expect(screen.queryByText('Student 1')).not.toBeInTheDocument();
    expect(classApi.getClassStudents).toHaveBeenCalledTimes(1);
  });

  it('provides a global lecturer catalog and clears selections when changing scope', async () => {
    renderPage(<LecturerListPage />);
    await screen.findByText('ASSIGNED');
    fireEvent.click(screen.getAllByRole('checkbox')[1]);
    fireEvent.change(screen.getByLabelText('Lecturer list scope'), { target: { value: 'all' } });
    await screen.findByText('UNASSIGNED');
    expect(lecturerApi.getLecturers).toHaveBeenLastCalledWith(expect.objectContaining({ termId: undefined }));
    expect(screen.getAllByRole('checkbox')[1]).not.toBeChecked();
    fireEvent.click(screen.getAllByRole('checkbox')[1]);
    fireEvent.click(screen.getByRole('button', { name: i18n.t('adminUx.sendLecturers', { count: 1 }) }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: i18n.t('adminUx.sendLecturers', { count: 1 }) }));
    await waitFor(() => expect(lecturerApi.sendBatchActivation).toHaveBeenCalledWith([100], undefined));
  });

  it('sends selected lecturer activation and delete batches with the selected Term', async () => {
    renderPage(<LecturerListPage />);
    await screen.findByText('ASSIGNED');
    fireEvent.click(screen.getAllByRole('checkbox')[1]);
    fireEvent.click(screen.getByRole('button', { name: i18n.t('adminUx.sendLecturers', { count: 1 }) }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: i18n.t('adminUx.sendLecturers', { count: 1 }) }));
    await waitFor(() => expect(lecturerApi.sendBatchActivation).toHaveBeenCalledWith([100], 2));
    await waitFor(() => expect(screen.getAllByRole('checkbox')[1]).not.toBeChecked());
    fireEvent.click(screen.getAllByRole('checkbox')[1]);
    fireEvent.click(screen.getByRole('button', { name: i18n.t('adminUx.deleteAccounts', { count: 1 }) }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: i18n.t('adminUx.deleteAccounts', { count: 1 }) }));
    await waitFor(() => expect(lecturerApi.deleteBatchLecturers).toHaveBeenCalledWith([100], 2));
  });

  it('sends an explicit student batch with termId and invalidates Dashboard statistics', async () => {
    renderPage(<StudentListPage />);
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    await screen.findByText('Student 2');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select student Student 2' }));
    fireEvent.click(screen.getByRole('button', { name: /Send activation email/ }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: i18n.t('adminUx.sendRecipients', { count: 1 }) }));
    await waitFor(() => expect(studentApi.sendBatchActivation).toHaveBeenCalledWith([20], 2));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['admin-dashboard'] });
  });

  it('resolves all matching students and sends explicit IDs in the selected Term', async () => {
    renderPage(<StudentListPage />);
    await screen.findByText('Student 2');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select student Student 2' }));
    fireEvent.click(screen.getByRole('button', { name: i18n.t('bulkAction.selectAllMatching', { total: 20 }) }));
    fireEvent.click(screen.getByRole('button', { name: /Send activation email/ }));
    const send = await within(screen.getByRole('dialog')).findByRole('button', { name: i18n.t('adminUx.sendRecipients', { count: 1 }) });
    await waitFor(() => expect(send).toBeEnabled()); fireEvent.click(send);
    await waitFor(() => expect(studentApi.sendBatchActivation).toHaveBeenCalledWith([20], 2));
    expect(studentApi.sendActivateAllMatching).not.toHaveBeenCalled();
    await switchTerm(1);
    await screen.findByText('Student 1');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Send activation email/ })).not.toBeInTheDocument();
  });

  it('locks Term switching while a single activation request is pending', async () => {
    const sending = deferred<void>();
    vi.mocked(studentApi.sendSingleActivation).mockReturnValue(sending.promise);
    renderPage(<StudentListPage />);
    await screen.findByText('Student 2');
    fireEvent.click(screen.getByRole('button', { name: i18n.t('students.btnSend') }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: i18n.t('modals.singleSubmit') }));
    expect(studentApi.sendSingleActivation).toHaveBeenCalledWith(20, 'student2@example.test', 2);
    expect(screen.getByRole('combobox', { name: 'Academic Term' })).toBeDisabled();
    fireEvent.click(screen.getByRole('combobox', { name: 'Academic Term' }));
    expect(localStorage.getItem(storageKey)).toBe('2');
    await act(async () => sending.resolve());
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Academic Term' })).not.toBeDisabled());
  });

  it('imports students into the shared selected Term and clears pending preview/approval when Term changes', async () => {
    localStorage.setItem(storageKey, '1');
    // One row is needed to enable import; the preview renderer only uses these fields.
    vi.mocked(parseExcelClientSide).mockResolvedValue({ rows: [{ rowNumber: 3, rollNumber: 'SE001', fullName: 'Preview',
      originalMajor: 'BEN_SE_ET', extractedMajorCode: 'SE', memberCode: 'MEM1', email: 'preview@example.test',
      isValid: true, validationErrors: [] }], totalRows: 1, validCount: 1, invalidCount: 0, hasErrors: false });
    vi.mocked(importApi.importExcel).mockResolvedValue({ success: false, totalImported: 0, errors: [],
      confirmationRequired: true, newMajorCodes: ['NEW'] });
    renderPage(<StudentImportPage />);
    await waitFor(() => expect(document.querySelector('input[type=file]')).not.toBeNull());
    const file = chooseFile();
    fireEvent.click((await screen.findAllByRole('button', { name: /Confirm Import 1/ }))[0]);
    await screen.findByRole('dialog');
    expect(importApi.importExcel).toHaveBeenCalledWith(file, 1, []);
    fireEvent.click(screen.getAllByRole('combobox', { name: 'Academic Term' })[0]);
    fireEvent.click(screen.getByRole('option', { name: /FALL26/ }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Preview')).not.toBeInTheDocument();
    expect(importApi.importExcel).toHaveBeenCalledTimes(1);
  });

  it('imports lecturers globally without passing the selected Term', async () => {
    vi.mocked(parseLecturerExcelClientSide).mockResolvedValue({ rows: [{ rowNumber: 2, code: 'GV01',
      email: 'lecturer@example.test', isValid: true, validationErrors: [] }], totalRows: 1, validCount: 1, invalidCount: 0, hasErrors: false });
    vi.mocked(lecturerApi.importExcel).mockResolvedValue({ success: true, totalImported: 1, errors: [] });
    renderPage(<LecturerImportPage />);
    expect(screen.getByText(i18n.t('adminUx.lecturerFileHelp'))).toBeInTheDocument();
    const file = chooseFile();
    fireEvent.click(await screen.findByRole('button', { name: i18n.t('import.confirmImportBtn', { count: 1 }) }));
    await waitFor(() => expect(lecturerApi.importExcel).toHaveBeenCalledWith(file));
    expect(screen.getByRole('link', { name: i18n.t('import.backToList') })).toHaveAttribute('href', '/admin/lecturers?scope=all');
  });

  it('global Lecturer List remains available even if the term catalog is empty', async () => {
    vi.mocked(termApi.getTerms).mockResolvedValue([]);
    renderPage(<LecturerListPage />, '/?scope=all');
    expect(await screen.findByText('UNASSIGNED')).toBeInTheDocument();
    expect(lecturerApi.getLecturers).toHaveBeenCalledWith(expect.objectContaining({ termId: undefined }));
  });

  it('shared pages outside TermScope remain mounted when the selected Term changes', async () => {
    const mount = vi.fn();
    const SharedPage = () => { React.useEffect(() => { mount(); }, []); return <p>Shared catalog</p>; };
    renderPage(<><SharedPage /><TermScope><p>Scoped data</p></TermScope></>);
    await screen.findByText('Scoped data');
    await switchTerm(1);
    expect(mount).toHaveBeenCalledTimes(1);
  });
});
