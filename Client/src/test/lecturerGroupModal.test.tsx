import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LecturerGroupModal } from '@/features/group/components/LecturerGroupModal';
import i18n from '@/locales/i18n';

const student = { studentId: 4, fullName: 'Preselected Student', rollNumber: 'SE4', memberCode: 'M4', majorCode: 'SE', majorName: 'Software', role: 'MEMBER' as const };
const nextStudent = { ...student, studentId: 25, fullName: 'Next Dropped Student', rollNumber: 'SE25', memberCode: 'M25' };
beforeEach(async () => {
  await i18n.changeLanguage('en');
  vi.stubGlobal('matchMedia', () => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Lecturer draft creation modal', () => {
  it('selects the newly dropped student after creating a group with the previous student', async () => {
    const submit = vi.fn().mockResolvedValue(undefined); const close = vi.fn();
    const props = { maxMembers: 6, onSubmit: submit, onClose: close };
    const view = render(<LecturerGroupModal {...props} open initialStudentIds={[4]} unassignedStudents={[student, nextStudent]} />);
    fireEvent.change(screen.getByLabelText(i18n.t('groupWorkspace.createModal.nameLabel'), { exact: false }), { target: { value: 'First draft' } });
    fireEvent.click(screen.getByRole('button', { name: i18n.t('groupLifecycle.createDraft') }));
    await waitFor(() => expect(close).toHaveBeenCalledOnce());

    // The workspace refresh removes the first student before the next drag.
    view.rerender(<LecturerGroupModal {...props} open={false} initialStudentIds={[]} unassignedStudents={[nextStudent]} />);
    view.rerender(<LecturerGroupModal {...props} open initialStudentIds={[25]} unassignedStudents={[nextStudent]} />);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Next Dropped Student (SE25) - SE')).toBeInTheDocument();
    await waitFor(() => expect(within(dialog).getByLabelText(i18n.t('groupWorkspace.createModal.studentsLabel', { count: 1, max: 6 }), { exact: false })).toBeInTheDocument());
    const name = within(dialog).getByLabelText(i18n.t('groupWorkspace.createModal.nameLabel'), { exact: false });
    expect(name).toHaveValue('');
    fireEvent.change(name, { target: { value: 'Second draft' } });
    fireEvent.click(within(dialog).getByRole('button', { name: i18n.t('groupLifecycle.createDraft') }));
    await waitFor(() => expect(submit).toHaveBeenNthCalledWith(2, expect.objectContaining({ name: 'Second draft', studentIds: [25] })));
  });

  it('replaces a cancelled selection on the next drag and clears it for manual creation', () => {
    const props = { maxMembers: 6, onSubmit: vi.fn(), onClose: vi.fn(), unassignedStudents: [student, nextStudent] };
    const view = render(<LecturerGroupModal {...props} open initialStudentIds={[4]} />);
    fireEvent.change(screen.getByLabelText(i18n.t('groupWorkspace.createModal.nameLabel'), { exact: false }), { target: { value: 'Cancelled draft' } });
    fireEvent.click(screen.getByRole('button', { name: i18n.t('groupWorkspace.createModal.cancel'), exact: true }));
    view.rerender(<LecturerGroupModal {...props} open={false} initialStudentIds={[]} />);
    view.rerender(<LecturerGroupModal {...props} open initialStudentIds={[25]} />);
    expect(screen.getByText('Next Dropped Student (SE25) - SE')).toBeInTheDocument();
    expect(screen.queryByText('Preselected Student (SE4) - SE')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: i18n.t('groupWorkspace.createModal.cancel'), exact: true }));
    view.rerender(<LecturerGroupModal {...props} open={false} initialStudentIds={[]} />);
    view.rerender(<LecturerGroupModal {...props} open initialStudentIds={[]} />);
    expect(screen.queryByText('Next Dropped Student (SE25) - SE')).not.toBeInTheDocument();
    expect(screen.getByLabelText(i18n.t('groupWorkspace.createModal.studentsLabel', { count: 0, max: 6 }), { exact: false })).toBeInTheDocument();
    expect(screen.getByLabelText(i18n.t('groupWorkspace.createModal.nameLabel'), { exact: false })).toHaveValue('');
  });

  it('preserves edits when the workspace refreshes while the modal is open', () => {
    const props = { maxMembers: 6, onSubmit: vi.fn(), onClose: vi.fn() };
    const view = render(<LecturerGroupModal {...props} open initialStudentIds={[4]} unassignedStudents={[student, nextStudent]} />);
    const name = screen.getByLabelText(i18n.t('groupWorkspace.createModal.nameLabel'), { exact: false });
    fireEvent.change(name, { target: { value: 'Draft being edited' } });
    fireEvent.click(document.querySelector('.ant-select-selection-item-remove')!);
    view.rerender(<LecturerGroupModal {...props} open initialStudentIds={[4]} unassignedStudents={[{ ...student }, { ...nextStudent }]} />);
    expect(name).toHaveValue('Draft being edited');
    expect(screen.getByLabelText(i18n.t('groupWorkspace.createModal.studentsLabel', { count: 0, max: 6 }), { exact: false })).toBeInTheDocument();
    expect(screen.queryByText('Preselected Student (SE4) - SE')).not.toBeInTheDocument();
  });

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
