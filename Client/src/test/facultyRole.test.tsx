import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LecturerListPage } from '@/pages/admin/LecturerListPage';
import { lecturerApi } from '@/features/lecturers/api/lecturerApi';
import type { Lecturer } from '@/features/lecturers/types';
import i18n from '@/locales/i18n';

const context = vi.hoisted(() => ({ release: vi.fn(), success: vi.fn() }));
vi.mock('@/app/providers/TermContext', () => ({ useTerm: () => ({ selectedTermId: 8, selectedTerm: { id: 8, name: 'FALL26' }, lockTermSelection: () => context.release }) }));
vi.mock('@/app/providers/ToastContext', () => ({ useToast: () => ({ success: context.success }) }));
vi.mock('@/features/lecturers/api/lecturerApi', () => ({ lecturerApi: { getLecturers: vi.fn(), updateRole: vi.fn() } }));
let client: QueryClient;
let lecturer: Lecturer;
function mount() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<MemoryRouter initialEntries={['/admin/lecturers?scope=all']}><QueryClientProvider client={client}><LecturerListPage /></QueryClientProvider></MemoryRouter>);
}
beforeEach(async () => {
  vi.clearAllMocks(); sessionStorage.clear(); await i18n.changeLanguage('en');
  lecturer = { userId: 1, code: 'GV1', name: 'Lecturer One', email: 'gv1@example.test', authorities: ['ROLE_LECTURE'],
    activated: true, hasActivationKey: false, activationKeyExpiresAt: null, isKeyExpired: false, createdDate: null, lastModifiedDate: null };
  vi.mocked(lecturerApi.getLecturers).mockImplementation(async () => ({ result: [lecturer], meta: { page: 1, pageSize: 10, pages: 1, total: 1 } }));
  vi.mocked(lecturerApi.updateRole).mockImplementation(async (_id, role) => { lecturer = { ...lecturer, authorities: [role] }; return lecturer; });
});
afterEach(() => { cleanup(); client.clear(); });

describe('Admin faculty role editor', () => {
  it('promotes a lecturer once and refreshes the displayed role', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Change role: GV1' }));
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByText(i18n.t('facultyRole.sessionHint'))).toBeInTheDocument();
    fireEvent.change(dialog.getByLabelText(i18n.t('facultyRole.label')), { target: { value: 'ROLE_LECTURE_MASTER' } });
    const save = dialog.getByRole('button', { name: i18n.t('facultyRole.save') });
    fireEvent.click(save); fireEvent.click(save);
    await waitFor(() => expect(lecturerApi.updateRole).toHaveBeenCalledExactlyOnceWith(1, 'ROLE_LECTURE_MASTER', 'ROLE_LECTURE'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText(i18n.t('lecturer.masterRole'))).toBeInTheDocument();
    expect(context.success).toHaveBeenCalledWith(i18n.t('facultyRole.saved'));
    expect(context.release).toHaveBeenCalledOnce();
  });
  it('demotes a department head using the currently displayed role', async () => {
    lecturer.authorities = ['ROLE_LECTURE_MASTER']; mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Change role: GV1' }));
    fireEvent.change(screen.getByLabelText(i18n.t('facultyRole.label')), { target: { value: 'ROLE_LECTURE' } });
    fireEvent.click(screen.getByRole('button', { name: i18n.t('facultyRole.save') }));
    await waitFor(() => expect(lecturerApi.updateRole).toHaveBeenCalledWith(1, 'ROLE_LECTURE', 'ROLE_LECTURE_MASTER'));
  });
  it('keeps a stale edit from overwriting a newer admin change', async () => {
    vi.mocked(lecturerApi.updateRole).mockRejectedValue({ status: 409, message: 'Role changed' }); mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Change role: GV1' }));
    fireEvent.change(screen.getByLabelText(i18n.t('facultyRole.label')), { target: { value: 'ROLE_LECTURE_MASTER' } });
    fireEvent.click(screen.getByRole('button', { name: i18n.t('facultyRole.save') }));
    expect(await screen.findByRole('alert')).toHaveTextContent(i18n.t('facultyRole.conflict'));
    expect(screen.getByRole('button', { name: i18n.t('facultyRole.save') })).toBeDisabled();
    expect(context.success).not.toHaveBeenCalled();
  });
  it('does not expose the faculty role editor for administrator accounts', async () => {
    lecturer.authorities = ['ROLE_ADMIN', 'ROLE_LECTURE']; mount();
    await screen.findByText('GV1');
    expect(screen.queryByRole('button', { name: 'Change role: GV1' })).not.toBeInTheDocument();
  });
});
