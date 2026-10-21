import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, Link, MemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { NavigationGuardProvider, useNavigationGuard, useUnsavedChanges } from '@/app/providers/NavigationGuard';
import { BatchActivationModal } from '@/features/students/components/BatchActivationModal';
import { StudentListPage } from '@/pages/admin/StudentListPage';
import { studentApi } from '@/features/students/api/studentApi';
import { getActivationRecipients } from '@/features/students/api/activationRecipients';
import { classApi } from '@/features/classes/api/classApi';
import { FileDropzone } from '@/features/import/components/FileDropzone';
import { CreateDeadlineModal } from '@/features/deadline/components/CreateDeadlineModal';
import { deadlineApi } from '@/features/deadline/api/deadlineApi';
import type { Student } from '@/features/students/types';
import i18n from '@/locales/i18n';

const release = vi.fn();
vi.mock('@/app/providers/TermContext', () => ({ useTerm: () => ({ selectedTermId: 2, selectedTerm: { id: 2, name: 'SP27' }, lockTermSelection: () => release }) }));
vi.mock('@/app/providers/ToastContext', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/features/students/api/studentApi', () => ({ studentApi: { getStudents: vi.fn(), sendBatchActivation: vi.fn(), sendActivateAllMatching: vi.fn() } }));

function student(id: number, activated = false): Student {
  return { userId: id, rollNumber: `TEST${id}`, fullName: `Fixture ${id}`, email: `fixture${id}@example.test`,
    activated, memberCode: `M${id}`, majorId: 1, majorCode: 'SE', hasActivationKey: false, isKeyExpired: false,
    activationKeyExpiresAt: null, createdDate: null, lastModifiedDate: null };
}
function page(records: Student[], current = 1, pages = 1) {
  return { result: records, meta: { page: current, pageSize: 10, pages, total: pages } };
}
let client: QueryClient;
function wrap(content: React.ReactNode) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<MemoryRouter><QueryClientProvider client={client}>{content}</QueryClientProvider></MemoryRouter>);
}
beforeEach(async () => {
  vi.clearAllMocks(); await i18n.changeLanguage('en');
  vi.mocked(studentApi.sendBatchActivation).mockResolvedValue({ totalRequested: 1, totalProcessed: 1, totalSkippedAlreadyActive: 0, sentEmails: [] });
});
afterEach(() => { cleanup(); client?.clear(); vi.restoreAllMocks(); });

describe('Admin recipient scope', () => {
  it('resolves every page with all account/link filters and sends only reviewed IDs once', async () => {
    const filters = { termId: 2, search: 'Fixture', activated: false, hasActivationKey: false, majorId: 1 };
    vi.mocked(studentApi.getStudents).mockImplementation(async params => page([student(params?.page === 2 ? 3 : 1)], params?.page, 2));
    wrap(<BatchActivationModal open onClose={vi.fn()} onSuccess={vi.fn()} userIds={[]} totalSelected={0}
      alreadyActiveCount={0} isAllMatching filters={filters} totalFilteredCount={2} />);
    const send = await screen.findByRole('button', { name: i18n.t('adminUx.sendRecipients', { count: 2 }) });
    await waitFor(() => expect(send).toBeEnabled());
    expect(screen.getByText('fixture1@example.test')).toBeInTheDocument();
    expect(screen.getByText('fixture3@example.test')).toBeInTheDocument();
    expect(studentApi.getStudents).toHaveBeenCalledWith(expect.objectContaining({ ...filters, page: 1 }), expect.any(AbortSignal));
    expect(studentApi.getStudents).toHaveBeenCalledWith(expect.objectContaining({ ...filters, page: 2 }), expect.any(AbortSignal));
    fireEvent.click(send); fireEvent.click(send);
    await waitFor(() => expect(studentApi.sendBatchActivation).toHaveBeenCalledExactlyOnceWith([1, 3], 2));
    expect(studentApi.sendActivateAllMatching).not.toHaveBeenCalled();
  });
  it('keeps eligible and skipped selections from previous pages', async () => {
    vi.mocked(studentApi.getStudents).mockImplementation(async params => page([student(params?.page === 2 ? 2 : 1, params?.page === 2)], params?.page, 2));
    wrap(<StudentListPage />);
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select student Fixture 1' }));
    fireEvent.click(screen.getByRole('button', { name: i18n.t('pagination.next') }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select student Fixture 2' }));
    expect(screen.getByText(i18n.t('bulkAction.activeSkipped', { count: 1 }))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Send activation email/ }));
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByText('fixture1@example.test')).toBeInTheDocument();
    fireEvent.click(dialog.getByRole('button', { name: i18n.t('adminUx.sendRecipients', { count: 1 }) }));
    await waitFor(() => expect(studentApi.sendBatchActivation).toHaveBeenCalledExactlyOnceWith([1], 2));
  });
  it('does not send when a later recipient page fails', async () => {
    vi.mocked(studentApi.getStudents).mockImplementation(async params => {
      if (params?.page === 2) throw new Error('Unavailable');
      return page([student(1)], 1, 2);
    });
    await expect(getActivationRecipients({ termId: 2, activated: false })).rejects.toThrow('Unavailable');
    expect(studentApi.sendBatchActivation).not.toHaveBeenCalled();
  });
  it('does not automatically retry a send whose outcome is unknown', async () => {
    vi.mocked(studentApi.sendBatchActivation).mockRejectedValue({ status: 0, message: '', outcomeUnknown: true });
    wrap(<BatchActivationModal open onClose={vi.fn()} onSuccess={vi.fn()} userIds={[1]} selectedStudents={[student(1)]}
      totalSelected={1} alreadyActiveCount={0} isAllMatching={false} filters={{ termId: 2 }} totalFilteredCount={1} />);
    fireEvent.click(screen.getByRole('button', { name: i18n.t('adminUx.sendRecipients', { count: 1 }) }));
    expect(await screen.findByRole('alert')).toHaveTextContent(i18n.t('adminUx.unknownActivation'));
    expect(studentApi.sendBatchActivation).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /Send to/ })).not.toBeInTheDocument();
  });
});

describe('Admin navigation guard', () => {
  function Draft({ busy = false }: { busy?: boolean }) {
    const [dirty, setDirty] = useState(false);
    const [term, setTerm] = useState(1);
    useUnsavedChanges(dirty, busy);
    const leave = useNavigationGuard();
    return <><input aria-label="Draft" onChange={() => setDirty(true)} /><button onClick={() => leave(() => setTerm(2))}>Switch term</button><span>Term {term}</span><Link to="/next">Next</Link></>;
  }
  it('keeps the draft on cancel and changes term only after discarding', () => {
    render(<MemoryRouter><NavigationGuardProvider><Draft /></NavigationGuardProvider></MemoryRouter>);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Unsaved' } });
    fireEvent.click(screen.getByRole('button', { name: 'Switch term' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: i18n.t('adminUx.stay'), exact: true }));
    expect(screen.getByText('Term 1')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('Unsaved');
    fireEvent.click(screen.getByRole('button', { name: 'Switch term' }));
    fireEvent.click(screen.getByRole('button', { name: i18n.t('adminUx.discard') }));
    expect(screen.getByText('Term 2')).toBeInTheDocument();
  });
  it('blocks actual router navigation until the draft is explicitly discarded', async () => {
    const router = createMemoryRouter([{ path: '/', element: <NavigationGuardProvider><Draft /></NavigationGuardProvider> }, { path: '/next', element: <p>Next page</p> }]);
    render(<RouterProvider router={router} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Unsaved' } });
    fireEvent.click(screen.getByRole('link', { name: 'Next' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
    fireEvent.click(screen.getByRole('button', { name: i18n.t('adminUx.discard') }));
    await screen.findByText('Next page'); expect(router.state.location.pathname).toBe('/next');
  });
});

describe('Admin templates and deadline safety', () => {
  it('downloads different templates for students and lecturers and supports keyboard selection', () => {
    const select = vi.fn();
    const props = { selectedFile: null, onFileSelect: select, onFileRemove: vi.fn() };
    const view = render(<FileDropzone {...props} kind="lecturers" />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/sample-lecturers.xlsx');
    expect(screen.getByRole('link')).toHaveAttribute('download', 'mau_danh_sach_giang_vien.xlsx');
    expect(screen.getByText(i18n.t('importTemplates.lecturersStart'))).toBeInTheDocument();
    view.rerender(<FileDropzone {...props} kind="students" />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/sample-students.xlsx');
    expect(screen.getByText(i18n.t('importTemplates.studentsStart'))).toBeInTheDocument();
    const click = vi.spyOn(HTMLInputElement.prototype, 'click');
    fireEvent.keyDown(screen.getByRole('button', { name: i18n.t('adminUx.chooseFile') }), { key: 'Enter' });
    expect(click).toHaveBeenCalledOnce();
    view.rerender(<FileDropzone {...props} kind="students" selectedFile={new File(['fixture'], 'students.xlsx')} />);
    expect(screen.getByRole('link')).toHaveAttribute('download', 'mau_danh_sach_sinh_vien.xlsx');
  });
  it('loads classes past the first page instead of silently truncating the selection', async () => {
    const base = { name: 'Class', termId: 2, termName: 'SP27', lecturerId: null, lecturerCode: null, lecturerName: null, lecturerEmail: null, studentCount: 0, createdDate: '' };
    vi.spyOn(classApi, 'getClasses').mockImplementation(async params => ({ result: [{ ...base, id: params?.page ?? 1 }], meta: { page: params?.page ?? 1, pageSize: 100, total: 201, pages: 3 } }));
    const classes = await classApi.getAllClasses(2);
    expect(classes.map(item => item.id)).toEqual([1, 2, 3]);
  });
  it('keeps the deadline form open for X, Escape and backdrop clicks during a write', async () => {
    let finish!: (value: never) => void;
    vi.spyOn(deadlineApi, 'createDeadline').mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const close = vi.fn();
    wrap(<CreateDeadlineModal open onClose={close} onSuccess={vi.fn()} availableClasses={[{ id: 1, name: 'CLASS_TEST' }]} />);
    fireEvent.change(screen.getByLabelText(i18n.t('deadline.modal.nameLabel'), { exact: false }), { target: { value: 'Test round' } });
    fireEvent.click(screen.getByText('CLASS_TEST'));
    fireEvent.click(screen.getByRole('button', { name: i18n.t('deadline.modal.submitCreate') }));
    await waitFor(() => expect(deadlineApi.createDeadline).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: i18n.t('common.closeModal') }));
    fireEvent.keyDown(window, { key: 'Escape' }); fireEvent.click(screen.getByRole('dialog'));
    expect(close).not.toHaveBeenCalled();
    await act(async () => finish({} as never));
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
  });
});
