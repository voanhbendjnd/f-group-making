import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LecturerGroupModal } from '@/features/group/components/LecturerGroupModal';
import i18n from '@/locales/i18n';

const student = { studentId: 4, fullName: 'Preselected Student', rollNumber: 'SE4', memberCode: 'M4', majorCode: 'SE', majorName: 'Software', role: 'MEMBER' as const };
beforeEach(async () => {
  await i18n.changeLanguage('en');
  vi.stubGlobal('matchMedia', () => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Lecturer draft creation modal', () => {
  it('prefills the dropped student and preserves all form data when creation fails', async () => {
    const submit = vi.fn().mockRejectedValue({ message: 'Conflict' }); const close = vi.fn();
    render(<LecturerGroupModal open initialStudentIds={[4]} unassignedStudents={[student]} maxMembers={6} onSubmit={submit} onClose={close} />);
    const name = screen.getByLabelText(i18n.t('groupWorkspace.createModal.nameLabel'), { exact: false });
    fireEvent.change(name, { target: { value: 'Draft from drop' } });
    fireEvent.click(screen.getByRole('button', { name: i18n.t('groupLifecycle.createDraft') }));
    await waitFor(() => expect(submit).toHaveBeenCalledWith(expect.objectContaining({ name: 'Draft from drop', studentIds: [4] })));
    expect(close).not.toHaveBeenCalled(); expect(name).toHaveValue('Draft from drop');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('does not close or reset until the creation request succeeds', async () => {
    let resolve!: () => void;
    const submit = vi.fn(() => new Promise<void>(done => { resolve = done; })); const close = vi.fn();
    render(<LecturerGroupModal open initialStudentIds={[4]} unassignedStudents={[student]} maxMembers={6} onSubmit={submit} onClose={close} />);
    fireEvent.change(screen.getByLabelText(i18n.t('groupWorkspace.createModal.nameLabel'), { exact: false }), { target: { value: 'Confirmed draft' } });
    const button = screen.getByRole('button', { name: i18n.t('groupLifecycle.createDraft') });
    fireEvent.click(button); await waitFor(() => expect(submit).toHaveBeenCalledOnce());
    fireEvent.click(button); expect(submit).toHaveBeenCalledOnce(); expect(close).not.toHaveBeenCalled();
    resolve(); await waitFor(() => expect(close).toHaveBeenCalledOnce());
  });
});
