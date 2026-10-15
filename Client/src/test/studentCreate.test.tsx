import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateStudentModal } from '@/features/students/components/CreateStudentModal';
import { StudentListPage } from '@/pages/admin/StudentListPage';
import { studentApi } from '@/features/students/api/studentApi';
import { majorApi } from '@/features/majors/api/majorApi';
import { classApi } from '@/features/classes/api/classApi';
import i18n from '@/locales/i18n';

const state = vi.hoisted(() => ({
  current: { id: 2, name: 'FALL26', isCurrent: true } as { id: number; name: string; isCurrent: boolean } | null,
  locked: vi.fn(() => vi.fn()), success: vi.fn(),
}));
vi.mock('@/app/providers/TermContext', () => ({ useTerm: () => ({
  terms: [{ id: 1, name: 'SP26', isCurrent: false }, { id: 2, name: 'FALL26', isCurrent: true }, { id: 3, name: 'SP27', isCurrent: false }],
  currentTerm: state.current, selectedTermId: 1, isLoading: false, isError: false,
  refreshTerms: vi.fn(), lockTermSelection: state.locked,
}) }));
vi.mock('@/app/providers/ToastContext', () => ({ useToast: () => ({ success: state.success }) }));
vi.mock('@/features/students/api/studentApi', () => ({ studentApi: { createStudent: vi.fn(), getStudents: vi.fn() } }));
vi.mock('@/features/majors/api/majorApi', () => ({ majorApi: { getMajors: vi.fn() } }));
vi.mock('@/features/classes/api/classApi', () => ({ classApi: { getClasses: vi.fn() } }));

let client: QueryClient;
const success = vi.fn(), close = vi.fn();
function page<T>(result: T[]) { return { result, meta: { page: 1, pageSize: 100, pages: 1, total: result.length } }; }
function renderModal(list = false) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<MemoryRouter><QueryClientProvider client={client}>
    {list ? <StudentListPage /> : <CreateStudentModal onSuccess={success} onClose={close} />}
  </QueryClientProvider></MemoryRouter>);
}
async function fill() {
  const form = within(screen.getByRole('dialog'));
  await waitFor(() => expect(form.getByRole('combobox', { name: /^Major/ })).toBeEnabled());
  await waitFor(() => expect(form.getByRole('combobox', { name: /^Class/ })).toBeEnabled());
  fireEvent.change(screen.getByLabelText(/Full name/), { target: { value: '  Test Student  ' } });
  fireEvent.change(screen.getByLabelText(/Student ID/), { target: { value: ' TEST001 ' } });
  fireEvent.change(screen.getByLabelText(/Member code/), { target: { value: ' MEMBER001 ' } });
  fireEvent.change(form.getByLabelText(/^Email/), { target: { value: ' TEST@EXAMPLE.TEST ' } });
  fireEvent.click(form.getByRole('combobox', { name: /^Major/ }));
  fireEvent.click(screen.getByRole('option', { name: 'SE — Software Engineering' }));
  fireEvent.click(form.getByRole('combobox', { name: /^Class/ }));
  fireEvent.click(screen.getByRole('option', { name: 'CLASS2' }));
}
beforeEach(async () => {
  vi.clearAllMocks(); state.current = { id: 2, name: 'FALL26', isCurrent: true };
  await i18n.changeLanguage('en');
  vi.mocked(majorApi.getMajors).mockResolvedValue(page([{ id: 1, code: 'SE', name: 'Software Engineering' }]));
  vi.mocked(classApi.getClasses).mockImplementation(async (params) => page([{
    id: Number(params?.termId) * 10, name: `CLASS${params?.termId}`, termId: params?.termId ?? null, termName: null,
    lecturerId: 9, lecturerCode: 'GV9', lecturerName: 'Test Lecturer', lecturerEmail: null, studentCount: 0, createdDate: '',
  }]));
  vi.mocked(studentApi.getStudents).mockResolvedValue(page([]));
  vi.mocked(studentApi.createStudent).mockResolvedValue({ userId: 100 } as Awaited<ReturnType<typeof studentApi.createStudent>>);
});
afterEach(() => { cleanup(); client?.clear(); });

describe('Add Student Modal', () => {
  it('updates suggestions, preserves manual edits and resumes automatic mode with Regenerate', async () => {
    renderModal();
    const name = screen.getByLabelText(/Full name/), roll = screen.getByLabelText(/Student ID/), member = screen.getByLabelText(/Member code/);
    expect(member).toHaveValue('');
    fireEvent.change(name, { target: { value: 'Lương Huỳnh Bảo Trân' } });
    fireEvent.change(roll, { target: { value: ' cs192013 ' } });
    expect(member).toHaveValue('TranLHBCS192013');
    fireEvent.change(name, { target: { value: 'Trần Thảo Ngân' } });
    expect(member).toHaveValue('NganTTCS192013');
    fireEvent.change(member, { target: { value: 'CUSTOM' } });
    fireEvent.change(roll, { target: { value: 'CS191667' } });
    expect(member).toHaveValue('CUSTOM');
    fireEvent.change(member, { target: { value: '' } });
    fireEvent.change(name, { target: { value: 'Ngân' } });
    expect(member).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }));
    expect(member).toHaveValue('NganCS191667');
    fireEvent.change(roll, { target: { value: 'cs1' } });
    expect(member).toHaveValue('NganCS1');
    fireEvent.change(roll, { target: { value: '' } });
    expect(member).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Regenerate' })).toBeDisabled();
  });

  it('starts a fresh form after closing and reopening the Modal', async () => {
    renderModal(true);
    fireEvent.click(screen.getByRole('button', { name: 'Add Student' }));
    fireEvent.change(screen.getByLabelText(/Member code/), { target: { value: 'OLD' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add Student' }));
    expect(screen.getByLabelText(/Member code/)).toHaveValue('');
    fireEvent.change(screen.getByLabelText(/Full name/), { target: { value: 'Ngân' } });
    fireEvent.change(screen.getByLabelText(/Student ID/), { target: { value: 'cs1' } });
    expect(screen.getByLabelText(/Member code/)).toHaveValue('NganCS1');
  });

  it('supports keyboard selection, Escape, outside close and focus containment', async () => {
    renderModal();
    const term = screen.getByRole('combobox', { name: /Academic Term/ });
    await waitFor(() => expect(term).toHaveTextContent('FALL26'));
    term.focus();
    fireEvent.keyDown(term, { key: 'ArrowDown' });
    expect(term).toHaveAttribute('aria-expanded', 'true');
    const menu = screen.getByRole('listbox');
    expect(screen.getByRole('dialog')).toContainElement(menu);
    expect(menu.closest('.modal-card')).toBeNull();
    expect(screen.getByRole('option', { name: /FALL26/ })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(term, { key: 'End' });
    fireEvent.keyDown(term, { key: 'Enter' });
    expect(term).toHaveTextContent('SP27');
    expect(term).toHaveFocus();
    fireEvent.click(term);
    fireEvent.keyDown(term, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(term);
    fireEvent.pointerDown(screen.getByLabelText(/Full name/));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    const closeButton = screen.getByRole('button', { name: i18n.t('common.closeModal') });
    closeButton.focus(); fireEvent.keyDown(closeButton, { key: 'Tab', shiftKey: true });
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('keeps a duplicate Member Code error and the manually entered code visible', async () => {
    vi.mocked(studentApi.createStudent).mockRejectedValue({ status: 400, message: 'duplicate', errorKey: 'error.studentCreate.memberCode' });
    renderModal(); await fill();
    fireEvent.click(screen.getByRole('button', { name: 'Create student' }));
    await screen.findByText(i18n.t('addStudent.errors.memberCode'));
    expect(screen.getByLabelText(/Member code/)).toHaveValue(' MEMBER001 ');
    expect(screen.getByLabelText(/Member code/)).toHaveAttribute('aria-invalid', 'true');
    expect(success).not.toHaveBeenCalled();
  });

  it('defaults to Backend CURRENT rather than global Selected Term and resets Class when Term changes', async () => {
    renderModal(); await fill();
    expect(screen.getByRole('combobox', { name: /Academic Term/ })).toHaveTextContent('FALL26');
    expect(screen.getByLabelText(/Assigned lecturer/)).toHaveValue('Test Lecturer');
    fireEvent.click(screen.getByRole('combobox', { name: /Academic Term/ }));
    fireEvent.click(screen.getByRole('option', { name: 'SP27' }));
    expect(screen.getByRole('combobox', { name: /^Class/ })).not.toHaveTextContent('CLASS2');
    await waitFor(() => expect(screen.getByRole('combobox', { name: /^Class/ })).toBeEnabled());
    fireEvent.click(screen.getByRole('combobox', { name: /^Class/ }));
    await screen.findByRole('option', { name: 'CLASS3' });
    expect(classApi.getClasses).toHaveBeenLastCalledWith(expect.objectContaining({ termId: 3 }), expect.any(AbortSignal));
    expect(screen.queryByRole('option', { name: 'CLASS2' })).not.toBeInTheDocument();
  });

  it('creates with a generated code and translates the new helper content', async () => {
    renderModal(); await fill();
    fireEvent.change(screen.getByLabelText(/Full name/), { target: { value: 'Lương Huỳnh Bảo Trân' } });
    fireEvent.change(screen.getByLabelText(/Student ID/), { target: { value: 'CS192013' } });
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }));
    expect(screen.getByLabelText(/Member code/)).toHaveValue('TranLHBCS192013');
    await act(async () => { await i18n.changeLanguage('vi'); });
    expect(screen.getByText('Tự động đề xuất')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tạo lại' })).toBeInTheDocument();
    await act(async () => { await i18n.changeLanguage('en'); });
    fireEvent.click(screen.getByRole('button', { name: 'Create student' }));
    await waitFor(() => expect(success).toHaveBeenCalledOnce());
    expect(studentApi.createStudent).toHaveBeenCalledWith(expect.objectContaining({ memberCode: 'TranLHBCS192013', termId: 2, schoolClassId: 20 }), expect.anything());
  });

  it('still requires a manually cleared Member Code and validates email before creating', async () => {
    renderModal(); await fill();
    fireEvent.change(screen.getByLabelText(/Member code/), { target: { value: '' } });
    fireEvent.change(within(screen.getByRole('dialog')).getByLabelText(/^Email/), { target: { value: 'invalid' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create student' }));
    await waitFor(() => expect(screen.getByLabelText(/Member code/)).toHaveAttribute('aria-invalid', 'true'));
    expect(within(screen.getByRole('dialog')).getByLabelText(/^Email/)).toHaveAttribute('aria-invalid', 'true');
    expect(studentApi.createStudent).not.toHaveBeenCalled();
  });

  it('does not choose an arbitrary term when CURRENT cannot be determined', async () => {
    state.current = null; renderModal();
    await waitFor(() => expect(screen.getByRole('combobox', { name: /^Major/ })).toBeEnabled());
    expect(screen.getByRole('combobox', { name: /Academic Term/ })).toHaveTextContent(i18n.t('addStudent.chooseTerm'));
    expect(classApi.getClasses).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Create student' })).toBeDisabled();
  });

  it('preserves form and field errors on duplicate, supports VI/EN and does not close', async () => {
    vi.mocked(studentApi.createStudent).mockRejectedValue({ status: 400, message: 'technical', errorKey: 'error.studentCreate.email' });
    renderModal(); await fill(); fireEvent.click(screen.getByRole('button', { name: 'Create student' }));
    await screen.findByText('Email is invalid or used by another account (maximum 254 characters).');
    expect(screen.getByLabelText(/Full name/)).toHaveValue('  Test Student  ');
    expect(close).not.toHaveBeenCalled(); expect(success).not.toHaveBeenCalled();
    await act(async () => { await i18n.changeLanguage('vi'); });
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Thêm sinh viên');
    expect(screen.getByText('Email không hợp lệ hoặc đã được sử dụng bởi tài khoản khác (tối đa 254 ký tự).')).toBeInTheDocument();
  });

  it('normalizes payload, prevents double-submit and calls success only after completion', async () => {
    let resolve!: (value: Awaited<ReturnType<typeof studentApi.createStudent>>) => void;
    vi.mocked(studentApi.createStudent).mockReturnValue(new Promise(done => { resolve = done; }));
    renderModal(); await fill();
    const submit = screen.getByRole('button', { name: 'Create student' }); fireEvent.click(submit); fireEvent.click(submit);
    await waitFor(() => expect(studentApi.createStudent).toHaveBeenCalledTimes(1));
    expect(studentApi.createStudent).toHaveBeenCalledWith({ fullName: 'Test Student', rollNumber: 'TEST001', memberCode: 'MEMBER001',
      email: 'test@example.test', majorId: 1, termId: 2, schoolClassId: 20 }, expect.anything());
    expect(success).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Escape' }); expect(close).not.toHaveBeenCalled();
    await act(async () => resolve({ userId: 100 } as Awaited<ReturnType<typeof studentApi.createStudent>>));
    expect(success).toHaveBeenCalledOnce();
  });

  it('shows the selected-term empty state and does not permit saving without a class', async () => {
    vi.mocked(classApi.getClasses).mockResolvedValue(page([])); renderModal();
    await screen.findByText('The selected term has no classes. Choose another term or create a class in class management first.');
    expect(screen.getByRole('button', { name: 'Create student' })).toBeDisabled();
  });

  it('handles option loading failures with a retry action', async () => {
    vi.mocked(majorApi.getMajors).mockRejectedValue(new Error('unavailable')); renderModal();
    await screen.findByText(/Unable to load options/);
    expect(screen.getByRole('button', { name: 'Create student' })).toBeDisabled();
    expect(screen.getByRole('button', { name: i18n.t('common.retry') })).toBeInTheDocument();
  });

  it('keeps an uncertain outcome visible without automatically retrying', async () => {
    vi.mocked(studentApi.createStudent).mockRejectedValue({ status: 0, message: '', outcomeUnknown: true });
    renderModal(); await fill(); fireEvent.click(screen.getByRole('button', { name: 'Create student' }));
    await screen.findByText(/The creation result could not be confirmed/);
    expect(studentApi.createStudent).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Create student' })).toBeDisabled();
    expect(screen.getByLabelText(/Student ID/)).toHaveValue(' TEST001 ');
  });

  it('invalidates related list caches after success without changing global Term filters', async () => {
    renderModal(true);
    fireEvent.click(screen.getByRole('button', { name: 'Add Student' }));
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    await fill(); fireEvent.click(screen.getByRole('button', { name: 'Create student' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['students'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['school-class-students'] });
    expect(state.success).toHaveBeenCalled();
    expect(studentApi.getStudents).toHaveBeenLastCalledWith(expect.objectContaining({ termId: 1 }));
  });
});
