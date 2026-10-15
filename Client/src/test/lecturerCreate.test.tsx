import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateLecturerModal } from '@/features/lecturers/components/CreateLecturerModal';
import { LecturerListPage } from '@/pages/admin/LecturerListPage';
import { lecturerApi } from '@/features/lecturers/api/lecturerApi';
import i18n from '@/locales/i18n';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('@/app/providers/ToastContext', () => ({ useToast: () => toast }));
vi.mock('@/app/providers/TermContext', () => ({ useTerm: () => ({
  selectedTermId: 2, selectedTerm: { id: 2, name: 'FALL26' }, isLoading: false, isError: false,
  isLocked: false, lockTermSelection: vi.fn(() => vi.fn()),
}) }));
vi.mock('@/features/lecturers/api/lecturerApi', () => ({ lecturerApi: { createLecturer: vi.fn(), getLecturers: vi.fn() } }));

let client: QueryClient;
const close = vi.fn(), success = vi.fn();
function mount(list = false) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<MemoryRouter><QueryClientProvider client={client}>
    {list ? <LecturerListPage /> : <CreateLecturerModal onClose={close} onSuccess={success} />}
  </QueryClientProvider></MemoryRouter>);
}
function fill() {
  const form = within(screen.getByRole('dialog'));
  fireEvent.change(form.getByLabelText(/Lecturer Code/), { target: { value: ' GV_TEST ' } });
  fireEvent.change(form.getByLabelText(/^Email/), { target: { value: ' TEST@EXAMPLE.TEST ' } });
}
beforeEach(async () => {
  vi.clearAllMocks(); await i18n.changeLanguage('en');
  vi.mocked(lecturerApi.createLecturer).mockResolvedValue({ userId: 50, code: 'GV_TEST', name: 'GV_TEST', email: 'test@example.test', activated: false } as Awaited<ReturnType<typeof lecturerApi.createLecturer>>);
  vi.mocked(lecturerApi.getLecturers).mockResolvedValue({ result: [], meta: { page: 1, pageSize: 10, total: 0, pages: 0 } });
});
afterEach(() => { cleanup(); client?.clear(); });

describe('Add Lecturer', () => {
  it('creates with only normalized Code and Email', async () => {
    mount(); fill(); fireEvent.click(screen.getByRole('button', { name: 'Create lecturer' }));
    await waitFor(() => expect(success).toHaveBeenCalledOnce());
    expect(lecturerApi.createLecturer).toHaveBeenCalledWith({ code: 'GV_TEST', email: 'test@example.test' }, expect.anything());
  });

  it.each([['code'], ['email'], ['code', 'email']])('maps duplicate fields %j without losing input or reporting success', async (...fields) => {
    vi.mocked(lecturerApi.createLecturer).mockRejectedValue({ status: 409, message: 'conflict', violations: fields.map(field => ({
      field, message: field === 'code' ? 'lecturerCreate.duplicateCode' : 'lecturerCreate.duplicateEmail',
    })) });
    mount(); fill(); fireEvent.click(screen.getByRole('button', { name: 'Create lecturer' }));
    for (const field of fields) await screen.findByText(i18n.t(field === 'code' ? 'addLecturer.duplicateCode' : 'addLecturer.duplicateEmail'));
    expect(screen.getByLabelText(/Lecturer Code/)).toHaveValue(' GV_TEST ');
    expect(screen.getByLabelText(/^Email/)).toHaveValue('TEST@EXAMPLE.TEST');
    expect(close).not.toHaveBeenCalled(); expect(success).not.toHaveBeenCalled();
    await act(async () => { await i18n.changeLanguage('vi'); });
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Thêm giảng viên');
    for (const field of fields) expect(screen.getByText(i18n.t(field === 'code' ? 'addLecturer.duplicateCode' : 'addLecturer.duplicateEmail'))).toBeInTheDocument();
  });

  it.each([
    ['', '', 'addLecturer.required'], ['A', 'invalid', 'addLecturer.invalid.code'],
    ['X'.repeat(51), 'a'.repeat(245) + '@example.test', 'addLecturer.invalid.email'],
  ])('validates input lengths and formats before sending', async (code, email, errorKey) => {
    mount(); fireEvent.change(screen.getByLabelText(/Lecturer Code/), { target: { value: code } });
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: email } });
    fireEvent.click(screen.getByRole('button', { name: 'Create lecturer' }));
    await waitFor(() => expect(screen.getAllByText(i18n.t(errorKey)).length).toBeGreaterThan(0));
    expect(lecturerApi.createLecturer).not.toHaveBeenCalled(); expect(success).not.toHaveBeenCalled();
  });

  it('blocks double-submit and closing while pending', async () => {
    let resolve!: (value: Awaited<ReturnType<typeof lecturerApi.createLecturer>>) => void;
    vi.mocked(lecturerApi.createLecturer).mockReturnValue(new Promise(done => { resolve = done; }));
    mount(); fill(); const submit = screen.getByRole('button', { name: 'Create lecturer' });
    fireEvent.click(submit); fireEvent.click(submit);
    await waitFor(() => expect(lecturerApi.createLecturer).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Creating lecturer...' })).toBeDisabled();
    fireEvent.keyDown(window, { key: 'Escape' }); expect(close).not.toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
    await act(async () => resolve({ userId: 50 } as Awaited<ReturnType<typeof lecturerApi.createLecturer>>));
    expect(success).toHaveBeenCalledOnce();
  });

  it('keeps an uncertain result without retrying', async () => {
    vi.mocked(lecturerApi.createLecturer).mockRejectedValue({ status: 0, message: '', outcomeUnknown: true });
    mount(); fill(); fireEvent.click(screen.getByRole('button', { name: 'Create lecturer' }));
    await screen.findByText(i18n.t('addLecturer.unknown'));
    expect(screen.getByRole('button', { name: 'Create lecturer' })).toBeDisabled();
    expect(lecturerApi.createLecturer).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText(/Lecturer Code/)).toHaveValue(' GV_TEST ');
  });

  it('traps keyboard focus and resets the form on reopening from the list', async () => {
    mount(true); screen.getByRole('button', { name: 'Add Lecturer' }).focus();
    fireEvent.click(screen.getByRole('button', { name: 'Add Lecturer' })); fill();
    const first = screen.getByRole('button', { name: i18n.t('common.closeModal') }); first.focus();
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(screen.getByRole('button', { name: 'Create lecturer' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Lecturer' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Add Lecturer' }));
    expect(screen.getByLabelText(/Lecturer Code/)).toHaveValue('');
  });

  it('invalidates lecturer/statistic caches after success and keeps selected Term scope', async () => {
    mount(true); const invalidate = vi.spyOn(client, 'invalidateQueries');
    fireEvent.click(screen.getByRole('button', { name: 'Add Lecturer' })); fill();
    fireEvent.click(screen.getByRole('button', { name: 'Create lecturer' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['lecturers'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['admin-dashboard'] });
    expect(lecturerApi.getLecturers).toHaveBeenLastCalledWith(expect.objectContaining({ termId: 2 }));
    expect(toast.success).toHaveBeenCalledWith(i18n.t('addLecturer.success'));
  });
});
