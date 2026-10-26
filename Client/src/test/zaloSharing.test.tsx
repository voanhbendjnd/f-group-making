import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ZaloManagementPanel } from '@/features/zalo/components/ZaloManagementPanel';
import { StudentZaloPanel } from '@/features/zalo/components/StudentZaloPanel';
import { ZaloShareCard } from '@/features/zalo/components/ZaloShareCard';
import { zaloApi, isZaloInvite, type ZaloShare } from '@/features/zalo/api/zaloApi';
import i18n from '@/locales/i18n';
import { MemoryRouter } from 'react-router-dom';
import { LecturerZaloPage } from '@/pages/lecturer/LecturerZaloPage';
import { classApi } from '@/features/classes/api/classApi';
import { lecturerApi } from '@/features/lecturers/api/lecturerApi';

const mocks = vi.hoisted(() => ({ admin: false, termId: 8, success: vi.fn(), error: vi.fn(), unlock: vi.fn() }));
vi.mock('@/features/zalo/api/zaloApi', async original => ({ ...await original<typeof import('@/features/zalo/api/zaloApi')>(),
  zaloApi: { management: vi.fn(), mine: vi.fn(), qr: vi.fn(), save: vi.fn(), remove: vi.fn() } }));
vi.mock('@/app/providers/AuthContext', () => ({ useAuth: () => ({ user: { id: 1 }, isAdmin: mocks.admin }) }));
vi.mock('@/app/providers/ToastContext', () => ({ useToast: () => ({ success: mocks.success, error: mocks.error }) }));
vi.mock('@/app/providers/TermContext', () => ({ useTerm: () => ({ selectedTermId: mocks.termId, isLoading: false, isError: false, isLocked: false, lockTermSelection: () => mocks.unlock }) }));

const classTarget = { scope: 'CLASS' as const, classId: 2, termId: 8 };
vi.mock('@/features/classes/api/classApi', () => ({ classApi: { getMyClasses: vi.fn(), getClasses: vi.fn(), getClassById: vi.fn() } }));
vi.mock('@/features/lecturers/api/lecturerApi', () => ({ lecturerApi: { getLecturers: vi.fn() } }));
const base: ZaloShare = { id: 1, classId: 2, className: 'EXE101_G201', lecturerId: 1, lecturerName: 'Lecturer', termId: 8, termName: 'FALL26', scope: 'CLASS', title: 'EXE101 G201', inviteUrl: 'https://zalo.me/g/abc123',
  description: 'Joining instructions', hasQr: false, version: 0, updatedAt: null };
const clients: QueryClient[] = [];
function mount(element: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); clients.push(client);
  return render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}
beforeEach(async () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.clearAllMocks(); mocks.admin = false; mocks.termId = 8; await i18n.changeLanguage('vi');
  vi.mocked(zaloApi.management).mockResolvedValue(null);
  vi.mocked(zaloApi.mine).mockResolvedValue([]); vi.mocked(zaloApi.save).mockResolvedValue(base);
  vi.mocked(zaloApi.qr).mockResolvedValue(new Blob(['image'], { type: 'image/png' }));
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:test-qr') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn().mockImplementation(query => ({ matches: false, media: query, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })) });
});
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); vi.unstubAllGlobals(); });

describe('Zalo sharing workflow', () => {
  it('accepts only canonical safe Zalo group URLs', () => {
    expect(isZaloInvite(' https://zalo.me/g/abc123 ')).toBe(true);
    for (const value of ['javascript:alert(1)', 'https://zalo.me.evil.test/g/abc', 'http://zalo.me/g/abc', 'https://zalo.me/g/abc?x=y']) expect(isZaloInvite(value)).toBe(false);
  });
  it('keeps user input and displays the translated conflict when saving fails', async () => {
    vi.mocked(zaloApi.save).mockRejectedValue({ status: 409, message: '', errorKey: 'error.zaloConflict' });
    mount(<ZaloManagementPanel target={classTarget} />);
    fireEvent.click(await screen.findByRole('button', { name: i18n.t('zalo.create') }));
    fireEvent.change(screen.getByLabelText(i18n.t('zalo.name')), { target: { value: 'My class' } });
    fireEvent.change(screen.getByLabelText(i18n.t('zalo.link')), { target: { value: 'https://zalo.me/g/abc123' } });
    fireEvent.click(screen.getByRole('button', { name: i18n.t('zalo.save') }));
    await screen.findByText(i18n.t('zalo.errors.zaloConflict'));
    expect(screen.getByLabelText(i18n.t('zalo.name'))).toHaveValue('My class');
    expect(mocks.success).not.toHaveBeenCalled(); expect(zaloApi.save).toHaveBeenCalledTimes(1);
  });
  it('validates required fields without sending a request', async () => {
    mount(<ZaloManagementPanel target={classTarget} />);
    fireEvent.click(await screen.findByRole('button', { name: i18n.t('zalo.create') }));
    fireEvent.click(screen.getByRole('button', { name: i18n.t('zalo.save') }));
    await screen.findAllByText(i18n.t('zalo.required')); expect(zaloApi.save).not.toHaveBeenCalled();
  });
  it('keeps the original edit version when a background read refreshes the sharing record', async () => {
    vi.mocked(zaloApi.management).mockResolvedValue(base);
    vi.mocked(zaloApi.save).mockRejectedValue({ status: 409, message: '', errorKey: 'zaloConflict' });
    mount(<ZaloManagementPanel target={classTarget} />);
    fireEvent.click(await screen.findByRole('button', { name: i18n.t('zalo.edit') }));
    await act(async () => { clients.at(-1)!.setQueryData(['zalo-management', 1, classTarget], { ...base, version: 9, title: 'Other editor' }); });
    expect(screen.getByLabelText(i18n.t('zalo.name'))).toHaveValue(base.title);
    fireEvent.click(screen.getByRole('button', { name: i18n.t('zalo.save') }));
    await screen.findByText(i18n.t('zalo.errors.zaloConflict'));
    expect(zaloApi.save).toHaveBeenCalledWith(classTarget, expect.objectContaining({ version: 0, title: base.title }), null);
  });
  it('saves once on repeated clicks and shows only the confirmed server result', async () => {
    let finish!: (value: ZaloShare) => void;
    vi.mocked(zaloApi.save).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    mount(<ZaloManagementPanel target={classTarget} />);
    fireEvent.click(await screen.findByRole('button', { name: i18n.t('zalo.create') }));
    fireEvent.change(screen.getByLabelText(i18n.t('zalo.name')), { target: { value: '  My class  ' } });
    fireEvent.change(screen.getByLabelText(i18n.t('zalo.link')), { target: { value: 'https://zalo.me/g/abc123' } });
    const save = screen.getByRole('button', { name: i18n.t('zalo.save') }); fireEvent.click(save); fireEvent.click(save);
    await waitFor(() => expect(zaloApi.save).toHaveBeenCalledTimes(1));
    expect(mocks.success).not.toHaveBeenCalled();
    vi.mocked(zaloApi.management).mockResolvedValue(base);
    await act(async () => { finish(base); });
    await screen.findByRole('heading', { name: base.title });
    expect(zaloApi.save).toHaveBeenCalledWith(classTarget, expect.objectContaining({ title: 'My class', scope: 'CLASS', version: null }), null);
    expect(mocks.success).toHaveBeenCalledWith(i18n.t('zalo.saved'));
  });
  it('manages lecturer-wide Zalo without a class, and offers only assigned classes for private sharing', async () => {
    vi.mocked(classApi.getMyClasses).mockResolvedValue({ result: [{ id: 2, name: 'EXE101_G201', termId: 8, termName: 'FALL26', lecturerId: 1 }], meta: { page: 1, pageSize: 50, pages: 1, total: 1 } } as never);
    vi.mocked(classApi.getClassById).mockResolvedValue({ id: 2, name: 'EXE101_G201', lecturerId: 1, termId: 8, termName: 'FALL26' } as never);
    mount(<MemoryRouter><LecturerZaloPage /></MemoryRouter>);
    await screen.findByRole('button', { name: i18n.t('zalo.create') });
    expect(zaloApi.management).toHaveBeenCalledWith({ scope: 'LECTURER', lecturerId: 1, termId: 8 }, expect.anything());
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText(i18n.t('zalo.classScope')));
    fireEvent.mouseDown(await screen.findByRole('combobox'));
    fireEvent.click(await screen.findByText(/EXE101_G201 \u00b7 FALL26/));
    await waitFor(() => expect(zaloApi.management).toHaveBeenCalledWith(classTarget, expect.anything()));
    expect(screen.queryByText('Group A')).not.toBeInTheDocument();
    expect(zaloApi.save).not.toHaveBeenCalled();
  });
  it('loads a separate lecturer configuration and resets the editor when the selected term changes', async () => {
    const element = <MemoryRouter><LecturerZaloPage /></MemoryRouter>;
    const view = mount(element);
    fireEvent.click(await screen.findByRole('button', { name: i18n.t('zalo.create') }));
    fireEvent.change(screen.getByLabelText(i18n.t('zalo.name')), { target: { value: 'Unsaved old term' } });
    mocks.termId = 9;
    view.rerender(<QueryClientProvider client={clients.at(-1)!}><MemoryRouter><LecturerZaloPage /></MemoryRouter></QueryClientProvider>);
    await waitFor(() => expect(zaloApi.management).toHaveBeenCalledWith({ scope: 'LECTURER', lecturerId: 1, termId: 9 }, expect.anything()));
    expect(screen.queryByDisplayValue('Unsaved old term')).not.toBeInTheDocument();
    expect(zaloApi.save).not.toHaveBeenCalled();
  });
  it('does not load private Zalo for an unassigned class or a class in another selected term', async () => {
    vi.mocked(classApi.getMyClasses).mockResolvedValue({ result: [], meta: { page: 1, pageSize: 50, pages: 0, total: 0 } });
    vi.mocked(classApi.getClassById).mockResolvedValue({ id: 2, lecturerId: 3, termId: 8 } as never);
    mount(<MemoryRouter initialEntries={['/lecturer/zalo-groups?scope=CLASS&classId=2']}><LecturerZaloPage /></MemoryRouter>);
    await screen.findByText(i18n.t('zalo.errors.zaloInvalidScope'));
    expect(zaloApi.management).not.toHaveBeenCalled();
    await act(async () => { clients.at(-1)!.setQueryData(['school-class', 8, 2], { id: 2, lecturerId: 1, termId: 7 }); });
    expect(screen.getByText(i18n.t('zalo.errors.zaloInvalidScope'))).toBeInTheDocument();
    expect(zaloApi.management).not.toHaveBeenCalled();
  });
  it('previews an uploaded file locally and does not upload before Save', async () => {
    const { container } = mount(<ZaloManagementPanel target={classTarget} />);
    fireEvent.click(await screen.findByRole('button', { name: i18n.t('zalo.create') }));
    const file = new File(['fixture-image'], 'qr.png', { type: 'image/png' });
    fireEvent.change(container.querySelector('input[type=file]')!, { target: { files: [file] } });
    await screen.findByText('qr.png'); fireEvent.click(screen.getByRole('button', { name: i18n.t('zalo.preview') }));
    await waitFor(() => expect(screen.getByAltText(i18n.t('zalo.localQrAlt'))).toHaveAttribute('src', expect.stringContaining('data:image/png;base64,')));
    expect(zaloApi.save).not.toHaveBeenCalled();
  });
  it('requires Admin to select an actual lecturer before managing that lecturers shared Zalo', async () => {
    mocks.admin = true;
    vi.mocked(lecturerApi.getLecturers).mockResolvedValue({ result: [{ userId: 3, name: 'Nguyễn Minh Quân', code: 'GV03' }], meta: { page: 1, pageSize: 50, total: 1, pages: 1 } } as never);
    mount(<MemoryRouter><LecturerZaloPage /></MemoryRouter>);
    expect(screen.getByText(i18n.t('zalo.chooseLecturerFirst'))).toBeInTheDocument();
    expect(zaloApi.management).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByRole('combobox'));
    fireEvent.click(await screen.findByText(/Nguyễn Minh Quân/));
    await waitFor(() => expect(zaloApi.management).toHaveBeenCalledWith({ scope: 'LECTURER', lecturerId: 3, termId: 8 }, expect.anything()));
  });
  it('shows only server-authorized student cards and updates VI/EN without mutations', async () => {
    vi.mocked(zaloApi.mine).mockResolvedValue([base]); mount(<StudentZaloPanel />);
    await screen.findByRole('heading', { name: base.title });
    expect(screen.getByRole('link', { name: i18n.t('zalo.join') })).toHaveAttribute('href', base.inviteUrl);
    expect(screen.getByText(i18n.t('zalo.emptyLecturer'))).toBeInTheDocument();
    await act(async () => { await i18n.changeLanguage('en'); });
    expect(screen.getByRole('link', { name: 'Join on Zalo' })).toBeInTheDocument(); expect(zaloApi.save).not.toHaveBeenCalled();
  });
  it('shows load errors instead of pretending Zalo details are empty', async () => {
    vi.mocked(zaloApi.mine).mockRejectedValue({ status: 403, message: '' }); mount(<StudentZaloPanel />);
    await screen.findByText(i18n.t('zalo.loadFailed')); expect(screen.queryByText(i18n.t('zalo.emptyClass'))).not.toBeInTheDocument();
  });
  it('uses authenticated QR fetching and revokes the object URL on unmount', async () => {
    const view = mount(<ZaloShareCard share={{ ...base, hasQr: true }} />);
    await screen.findByAltText(i18n.t('zalo.qrAlt', { title: base.title }));
    expect(zaloApi.qr).toHaveBeenCalledWith(1, expect.anything()); view.unmount();
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-qr'));
  });
});
