import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClassDetailPage } from '@/pages/admin/ClassDetailPage';
import { ClassListPage } from '@/pages/admin/ClassListPage';
import { LanguageSwitcher } from '@/components/common/LanguageSwitcher';
import { TermProvider } from '@/app/providers/TermContext';
import { TermSelect } from '@/features/terms/components/TermSelect';
import { termApi } from '@/features/terms/api/termApi';
import { classApi } from '@/features/classes/api/classApi';
import { lecturerApi } from '@/features/lecturers/api/lecturerApi';
import { ruleApi } from '@/features/rules/api/ruleApi';
import { RULE_CODES } from '@/features/rules/types';
import type { SchoolClass } from '@/features/classes/types';
import i18n from '@/locales/i18n';

vi.mock('@/app/providers/AuthContext', () => ({ useAuth: () => ({ user: { id: 1 }, isAdmin: true }) }));
vi.mock('@/app/providers/ToastContext', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/features/terms/api/termApi', () => ({ termApi: { getCurrentTerm: vi.fn(), getTerms: vi.fn() } }));
vi.mock('@/features/classes/api/classApi', () => ({ classApi: {
  getClasses: vi.fn(), getClassById: vi.fn(), getClassStudents: vi.fn(), assignLecturer: vi.fn(),
} }));
vi.mock('@/features/lecturers/api/lecturerApi', () => ({ lecturerApi: { getLecturers: vi.fn() } }));
vi.mock('@/features/rules/api/ruleApi', () => ({ ruleApi: { getRules: vi.fn(), saveRules: vi.fn() } }));
const term = { id: 2, name: 'FALL26', isCurrent: true };
const unassigned: SchoolClass = { id: 7, name: 'Assignment class', termId: 2, termName: 'FALL26',
  lecturerId: null, lecturerCode: null, lecturerName: null, lecturerEmail: null, studentCount: 0,
  createdDate: '2026-10-13T00:00:00Z' };
const assigned = { ...unassigned, lecturerId: 100, lecturerCode: 'GV100', lecturerName: 'Test Lecturer', lecturerEmail: 'lecturer@example.test' };
let client: QueryClient;
function renderPage(list = false) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[list ? '/classes' : '/classes/7']}>
    <TermProvider><LanguageSwitcher /><TermSelect compact /><Routes>
      <Route path="/classes" element={<ClassListPage />} />
      <Route path="/classes/:id" element={<ClassDetailPage />} />
    </Routes></TermProvider>
  </MemoryRouter></QueryClientProvider>);
}
async function open() {
  fireEvent.click(await screen.findByRole('button', { name: /^(Chọn|Đổi) giảng viên$/ }));
}
async function choose(id = '100') {
  const select = await screen.findByRole('combobox', { name: 'Chọn giảng viên phụ trách' });
  await screen.findByRole('option', { name: /GV100/ });
  fireEvent.change(select, { target: { value: id } });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
beforeEach(async () => {
  vi.resetAllMocks(); localStorage.clear(); await i18n.changeLanguage('vi');
  vi.mocked(termApi.getCurrentTerm).mockResolvedValue(term);
  vi.mocked(termApi.getTerms).mockResolvedValue([term]);
  vi.mocked(classApi.getClassById).mockResolvedValue(unassigned);
  vi.mocked(classApi.getClasses).mockResolvedValue({ result: [unassigned],
    meta: { page: 1, pageSize: 10, pages: 1, total: 1 } });
  vi.mocked(classApi.getClassStudents).mockResolvedValue([]);
  vi.mocked(classApi.assignLecturer).mockResolvedValue(assigned);
  vi.mocked(lecturerApi.getLecturers).mockResolvedValue({
    meta: { page: 1, pageSize: 10, pages: 2, total: 11 },
    result: [{ userId: 100, code: 'GV100', name: 'Test Lecturer', email: 'lecturer@example.test', activated: false,
      hasActivationKey: false, activationKeyExpiresAt: null, isKeyExpired: false, createdDate: null, lastModifiedDate: null },
      { userId: 200, code: 'GV200', name: 'Replacement Lecturer', email: 'replacement@example.test', activated: false,
        hasActivationKey: false, activationKeyExpiresAt: null, isKeyExpired: false, createdDate: null, lastModifiedDate: null }],
  });
  vi.mocked(ruleApi.getRules).mockResolvedValue({ schoolClassId: 7, version: 0, configured: false, warnings: [],
    rules: RULE_CODES.map((code, index) => ({ code, status: true, value: [4, 6, 1, 50, 1, 6, 1][index]! })) });
});
afterEach(() => { cleanup(); client?.clear(); });

describe('Admin lecturer assignment beside grouping rules', () => {
  it('opens the two panels independently and preserves both drafts when collapsed', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Quy định nhóm' }));
    const minimum = (await screen.findAllByRole('spinbutton'))[0]!;
    fireEvent.change(minimum, { target: { value: '5' } });
    expect(lecturerApi.getLecturers).not.toHaveBeenCalled();
    await open(); await choose('200');
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Quy định nhóm' }));
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Chọn giảng viên phụ trách' })).not.toBeInTheDocument();
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Quy định nhóm' }));
    expect(screen.getAllByRole('spinbutton')[0]).toHaveValue(5);
    expect(screen.getByRole('combobox', { name: 'Chọn giảng viên phụ trách' })).toHaveValue('200');
    expect(ruleApi.getRules).toHaveBeenCalledTimes(1);
    expect(lecturerApi.getLecturers).toHaveBeenCalledTimes(1);
    expect(classApi.assignLecturer).not.toHaveBeenCalled();
  });
  it('loads the global lecturer catalog only after opening and never assigns on mount', async () => {
    renderPage(); await screen.findByRole('button', { name: 'Quy định nhóm' });
    expect(lecturerApi.getLecturers).not.toHaveBeenCalled();
    await open(); await choose();
    expect(ruleApi.getRules).not.toHaveBeenCalled();
    expect(lecturerApi.getLecturers).toHaveBeenCalledWith({ search: '', page: 1, size: 10 });
    expect(classApi.assignLecturer).not.toHaveBeenCalled();
  });
  it('displays the current lecturer and allows choosing a different lecturer', async () => {
    vi.mocked(classApi.getClassById).mockResolvedValue(assigned);
    renderPage(); await open();
    await choose();
    expect(screen.getByRole('button', { name: 'Lưu giảng viên' })).toBeDisabled();
    await choose('200');
    expect(screen.getByRole('button', { name: 'Lưu giảng viên' })).not.toBeDisabled();
    vi.mocked(classApi.assignLecturer).mockResolvedValue({ ...assigned, lecturerId: 200, lecturerCode: 'GV200' });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu giảng viên' }));
    await screen.findByText('Đã cập nhật giảng viên phụ trách cho lớp.');
    expect(classApi.assignLecturer).toHaveBeenCalledWith(7, 200, 100);
    expect(screen.getByText('GV200')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Chọn giảng viên phụ trách' })).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Lưu giảng viên' })).toBeDisabled();
  });
  it('requires an explicit selection, searches globally and clears selection across pages', async () => {
    renderPage(); await open(); await screen.findByRole('option', { name: /GV100/ });
    expect(screen.getByRole('button', { name: 'Lưu giảng viên' })).toBeDisabled();
    await choose();
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    await waitFor(() => expect(lecturerApi.getLecturers).toHaveBeenLastCalledWith({ search: '', page: 2, size: 10 }));
    expect(await screen.findByRole('combobox', { name: 'Chọn giảng viên phụ trách' })).toHaveValue('');
    fireEvent.change(screen.getByLabelText('Tìm giảng viên'), { target: { value: '  GV100  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tìm kiếm' }));
    await waitFor(() => expect(lecturerApi.getLecturers).toHaveBeenLastCalledWith({ search: 'GV100', page: 1, size: 10 }));
  });
  it('blocks duplicate submits and term switching, then updates the overview and permits future changes', async () => {
    const pending = deferred<SchoolClass>(); vi.mocked(classApi.assignLecturer).mockReturnValue(pending.promise);
    renderPage(); await open(); await choose();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const button = screen.getByRole('button', { name: 'Lưu giảng viên' });
    fireEvent.click(button); fireEvent.click(button);
    await waitFor(() => expect(classApi.assignLecturer).toHaveBeenCalledTimes(1));
    expect(classApi.assignLecturer).toHaveBeenCalledWith(7, 100, null);
    expect(screen.getByRole('combobox', { name: i18n.t('terms.label') })).toBeDisabled();
    await act(async () => pending.resolve(assigned));
    expect(await screen.findByText('Đã cập nhật giảng viên phụ trách cho lớp.')).toBeInTheDocument();
    expect(screen.getByText('GV100')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lưu giảng viên' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: i18n.t('terms.label') })).not.toBeDisabled();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['school-classes'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['my-school-classes'] });
    expect(ruleApi.saveRules).not.toHaveBeenCalled();
  });
  it('keeps the choice after a recoverable validation error', async () => {
    vi.mocked(classApi.assignLecturer).mockRejectedValue({ status: 400, message: 'Chọn lại giảng viên.' });
    renderPage(); await open(); await choose();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu giảng viên' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Chọn lại giảng viên.');
    expect(screen.getByRole('combobox', { name: 'Chọn giảng viên phụ trách' })).toHaveValue('100');
    expect(screen.getByRole('button', { name: 'Lưu giảng viên' })).not.toBeDisabled();
    expect(classApi.assignLecturer).toHaveBeenCalledTimes(1);
  });
  it('requires a read after conflict and displays the winning lecturer', async () => {
    vi.mocked(classApi.assignLecturer).mockRejectedValue({ status: 409, message: 'Conflict' });
    renderPage(); await open(); await choose();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu giảng viên' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Giảng viên phụ trách đã thay đổi');
    expect(screen.getByRole('button', { name: 'Lưu giảng viên' })).toBeDisabled();
    vi.mocked(classApi.getClassById).mockResolvedValue({ ...assigned, lecturerId: 200, lecturerCode: 'GV200' });
    fireEvent.click(screen.getByRole('button', { name: 'Đọc lại thông tin lớp' }));
    await screen.findByText('GV200');
    expect(screen.getByRole('button', { name: 'Lưu giảng viên' })).toBeDisabled();
    await choose();
    vi.mocked(classApi.assignLecturer).mockResolvedValue(assigned);
    fireEvent.click(screen.getByRole('button', { name: 'Lưu giảng viên' }));
    await screen.findByText('Đã cập nhật giảng viên phụ trách cho lớp.');
    expect(classApi.assignLecturer).toHaveBeenLastCalledWith(7, 100, 200);
    expect(classApi.assignLecturer).toHaveBeenCalledTimes(2);
  });
  it('does not retry an uncertain write and permits explicit retry only after confirming an empty assignment', async () => {
    vi.mocked(classApi.assignLecturer).mockRejectedValue({ status: 0, message: '', outcomeUnknown: true });
    renderPage(); await open(); await choose();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu giảng viên' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Chưa xác nhận');
    expect(classApi.assignLecturer).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Đọc lại thông tin lớp' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Lưu giảng viên' })).not.toBeDisabled());
    expect(classApi.assignLecturer).toHaveBeenCalledTimes(1);
    vi.mocked(classApi.assignLecturer).mockResolvedValue(assigned);
    fireEvent.click(screen.getByRole('button', { name: 'Lưu giảng viên' }));
    await screen.findByText('Đã cập nhật giảng viên phụ trách cho lớp.');
    expect(classApi.assignLecturer).toHaveBeenCalledTimes(2);
  });
  it('keeps writes blocked if reading the assignment fails', async () => {
    vi.mocked(classApi.assignLecturer).mockRejectedValue({ status: 503, message: '' });
    renderPage(); await open(); await choose();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu giảng viên' }));
    await screen.findByRole('alert');
    vi.mocked(classApi.getClassById).mockRejectedValue(new Error('Network'));
    fireEvent.click(screen.getByRole('button', { name: 'Đọc lại thông tin lớp' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Chưa đọc lại được'));
    expect(screen.getByRole('button', { name: 'Lưu giảng viên' })).toBeDisabled();
    expect(classApi.assignLecturer).toHaveBeenCalledTimes(1);
  });
  it('reads a completed change after an uncertain response without sending it again', async () => {
    vi.mocked(classApi.getClassById).mockResolvedValue(assigned);
    vi.mocked(classApi.assignLecturer).mockRejectedValue({ status: 0, message: '', outcomeUnknown: true });
    renderPage(); await open(); await choose('200');
    fireEvent.click(screen.getByRole('button', { name: 'Lưu giảng viên' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Chưa xác nhận');
    expect(screen.getByRole('button', { name: 'Lưu giảng viên' })).toBeDisabled();
    vi.mocked(classApi.getClassById).mockResolvedValue({ ...assigned, lecturerId: 200, lecturerCode: 'GV200' });
    fireEvent.click(screen.getByRole('button', { name: 'Đọc lại thông tin lớp' }));
    await screen.findByText('GV200');
    expect(screen.getByRole('combobox', { name: 'Chọn giảng viên phụ trách' })).toHaveValue('');
    expect(classApi.assignLecturer).toHaveBeenCalledTimes(1);
  });
  it.each(['vi', 'en'])('localizes class lists and switches language without reloading data (%s)', async language => {
    await i18n.changeLanguage(language); renderPage(true);
    await screen.findByRole('heading', { name: i18n.t('classes.title') });
    expect(await screen.findByRole('columnheader', { name: i18n.t('classes.className') })).toBeInTheDocument();
    expect(screen.getByText(i18n.t('classes.unassigned'))).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: i18n.t('classes.searchLabel') }), { target: { value: 'EXE' } });
    await waitFor(() => expect(classApi.getClasses).toHaveBeenCalledWith(expect.objectContaining({ search: 'EXE' })));
    const requests = vi.mocked(classApi.getClasses).mock.calls.length;
    fireEvent.click(screen.getByRole('radio', { name: language === 'vi' ? 'EN' : 'VI' }));
    await screen.findByRole('heading', { name: i18n.t('classes.title') });
    expect(screen.getByRole('textbox', { name: i18n.t('classes.searchLabel') })).toHaveValue('EXE');
    expect(screen.getByRole('button', { name: i18n.t('students.clearFilters') })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: i18n.t('classAssignment.title') })).toBeInTheDocument();
    expect(classApi.getClasses).toHaveBeenCalledTimes(requests);
  });
  it.each(['vi', 'en'])('localizes class details, student statuses and both controls (%s)', async language => {
    await i18n.changeLanguage(language);
    vi.mocked(classApi.getClassStudents).mockResolvedValue([{ userId: 500, rollNumber: 'SE500', fullName: 'Fixture Student',
      email: 'student@example.test', memberCode: 'M500', majorId: 1, majorCode: 'SE', activated: false,
      hasActivationKey: false, activationKeyExpiresAt: null, isKeyExpired: false, createdDate: null, lastModifiedDate: null }]);
    renderPage(); await screen.findByText('Fixture Student');
    expect(screen.getByRole('heading', { name: i18n.t('classes.detailTitle', { name: unassigned.name }) })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: i18n.t('students.colFullName') })).toBeInTheDocument();
    expect(screen.getByText(i18n.t('students.unactivated'))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: i18n.t('classAssignment.choose') }));
    const select = await screen.findByRole('combobox', { name: i18n.t('classAssignment.select') });
    fireEvent.change(select, { target: { value: '200' } });
    fireEvent.click(screen.getByRole('radio', { name: language === 'vi' ? 'EN' : 'VI' }));
    expect(screen.getByRole('button', { name: i18n.t('rules.configureButton') })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: i18n.t('classAssignment.choose') })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: i18n.t('classAssignment.select') })).toHaveValue('200');
    expect(screen.getByRole('button', { name: i18n.t('classAssignment.save') })).toBeEnabled();
    expect(classApi.getClassById).toHaveBeenCalledTimes(1);
    expect(classApi.getClassStudents).toHaveBeenCalledTimes(1);
    expect(ruleApi.getRules).not.toHaveBeenCalled();
  });
  it('updates an uncertain-result message when the language changes and keeps its draft', async () => {
    vi.mocked(classApi.assignLecturer).mockRejectedValue({ status: 0, message: '', outcomeUnknown: true });
    renderPage(); await open(); await choose();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu giảng viên' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('radio', { name: 'EN' }));
    expect(screen.getByRole('alert')).toHaveTextContent(i18n.t('classAssignment.unknown'));
    expect(screen.getByRole('combobox', { name: i18n.t('classAssignment.select') })).toHaveValue('100');
    expect(classApi.assignLecturer).toHaveBeenCalledTimes(1);
  });
});
