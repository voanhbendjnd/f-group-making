import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DeadlineTable } from '@/features/deadline/components/DeadlineTable';
import { deadlineApi } from '@/features/deadline/api/deadlineApi';
import { syncDeadlineQueries } from '@/features/deadline/realtime';
import type { Deadline } from '@/features/deadline/types';
import i18n from '@/locales/i18n';
import { LecturerDeadlinePage } from '@/pages/lecturer/LecturerDeadlinePage';
import { classApi } from '@/features/classes/api/classApi';

vi.mock('@/features/deadline/api/deadlineApi', () => ({ deadlineApi: {
  getDeadlineById: vi.fn(), getDeadlines: vi.fn(), updateDeadline: vi.fn(),
} }));
vi.mock('@/features/classes/api/classApi', () => ({ classApi: { getMyClasses: vi.fn() } }));
vi.mock('@/app/providers/ToastContext', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
const deadline: Deadline = {
  id: 8, version: 2, name: 'EXE101 deadline', description: 'Instructions shown in details only.',
  status: 'EXPIRED', startTime: '2020-01-01T00:00:00Z', endTime: '2020-02-01T00:00:00Z',
  schoolClassIds: [1, 2], schoolClassNames: ['CLASS_A', 'CLASS_B'], canEdit: true, canClose: false,
  classWindows: [1, 2].map(id => ({ schoolClassId: id, schoolClassName: id === 1 ? 'CLASS_A' : 'CLASS_B',
    startTime: '2020-01-01T00:00:00Z', endTime: id === 1 ? '2020-02-01T00:00:00Z' : '2020-02-02T00:00:00Z',
    status: 'EXPIRED', canEdit: true })),
};
let client: QueryClient;
function mount(onEdit = vi.fn(), canManage = true) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter>
    <DeadlineTable deadlines={[deadline]} onEdit={onEdit} canManage={canManage} />
  </MemoryRouter></QueryClientProvider>);
  return onEdit;
}
function openDetails() {
  fireEvent.click(screen.getByRole('button', { name: i18n.t('deadlineDetail.openNamed', { name: deadline.name }) }));
  return screen.getByRole('dialog');
}
beforeEach(async () => {
  vi.clearAllMocks(); await i18n.changeLanguage('en');
  vi.mocked(deadlineApi.getDeadlineById).mockResolvedValue(deadline);
  vi.mocked(deadlineApi.getDeadlines).mockResolvedValue({ result: [deadline], meta: { page: 1, pageSize: 10, pages: 1, total: 1 } });
  vi.mocked(classApi.getMyClasses).mockResolvedValue({ result: [], meta: { page: 1, pageSize: 10, pages: 0, total: 0 } });
});
afterEach(() => { cleanup(); client?.clear(); });

describe('compact deadline list and detail view', () => {
  it('keeps the fresh detail version when the real page still has an older list response', async () => {
    const fresh = { ...deadline, version: 5 };
    vi.mocked(deadlineApi.getDeadlineById).mockResolvedValue(fresh);
    vi.mocked(deadlineApi.updateDeadline).mockResolvedValue(fresh);
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><LecturerDeadlinePage /></MemoryRouter></QueryClientProvider>);
    await screen.findByText(deadline.name);
    const dialog = openDetails();
    const reopen = within(dialog).getByRole('button', { name: i18n.t('deadlineLifecycle.reopen') });
    await waitFor(() => expect(reopen).toBeEnabled()); fireEvent.click(reopen);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    const editor = within(screen.getByRole('dialog'));
    fireEvent.click(editor.getByRole('checkbox', { name: 'CLASS_A' }));
    fireEvent.change(editor.getByLabelText(i18n.t('deadline.modal.endTimeExtend'), { exact: false }), { target: { value: '2099-01-01T20:00' } });
    fireEvent.click(editor.getByRole('checkbox', { name: i18n.t('deadlineLifecycle.confirmScope') }));
    fireEvent.click(editor.getByRole('button', { name: i18n.t('deadlineLifecycle.reopen') }));
    await waitFor(() => expect(deadlineApi.updateDeadline).toHaveBeenCalledWith(8, expect.objectContaining({ expectedVersion: 5, targetClassIds: [1] })));
  });
  it('keeps class names, instructions and start times out of the list', () => {
    mount();
    expect(screen.getAllByRole('columnheader')).toHaveLength(5);
    expect(screen.getByRole('columnheader', { name: i18n.t('deadline.table.classes') })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: i18n.t('adminUx.applyToClasses', { count: 2 }) })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: i18n.t('deadline.table.startTime') })).not.toBeInTheDocument();
    expect(screen.queryByText('CLASS_A')).not.toBeInTheDocument();
    expect(screen.queryByText(deadline.description!)).not.toBeInTheDocument();
    expect(screen.getByText(i18n.t('deadline.status.expired'))).toBeInTheDocument();
    expect(within(screen.getAllByRole('cell')[1]).queryByText(i18n.t('deadlineScope.mixed'))).not.toBeInTheDocument();
    expect(screen.getByText(i18n.t('deadlineDetail.perClass'))).toBeInTheDocument();
  });

  it.each(['vi', 'en'])('shows per-class details and a reopen action in %s', async language => {
    await i18n.changeLanguage(language); mount();
    const dialog = openDetails();
    expect(within(dialog).getByText('CLASS_A')).toBeInTheDocument();
    expect(within(dialog).getByText('CLASS_B')).toBeInTheDocument();
    expect(within(dialog).getByText(deadline.description!)).toBeInTheDocument();
    await waitFor(() => expect(within(dialog).getByRole('button', { name: i18n.t('deadlineLifecycle.reopen') })).toBeEnabled());
    expect(deadlineApi.getDeadlineById).toHaveBeenCalledWith(8, expect.any(AbortSignal));
    expect(within(dialog).getAllByRole('link')[1]).toHaveAttribute('href', '/lecturer/group-review/advanced?classId=2&deadlineId=8');
  });

  it('hands the latest fetched version to the extension modal and closes the detail modal', async () => {
    const fresh = { ...deadline, version: 5 };
    vi.mocked(deadlineApi.getDeadlineById).mockResolvedValue(fresh);
    const onEdit = mount(); const dialog = openDetails();
    const edit = within(dialog).getByRole('button', { name: i18n.t('deadlineLifecycle.reopen') });
    await waitFor(() => expect(edit).toBeEnabled()); fireEvent.click(edit);
    expect(onEdit).toHaveBeenCalledExactlyOnceWith(fresh);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('refetches an open detail view on realtime changes and uses the updated class deadlines', async () => {
    mount(); const dialog = openDetails();
    await waitFor(() => expect(within(dialog).queryByRole('status')).not.toBeInTheDocument());
    const updated: Deadline = { ...deadline, version: 6, canClose: true,
      classWindows: deadline.classWindows!.map(w => w.schoolClassId === 1
        ? { ...w, status: 'ACTIVE', endTime: '2099-01-01T00:00:00Z' } : w) };
    vi.mocked(deadlineApi.getDeadlineById).mockResolvedValue(updated);
    await act(async () => { await syncDeadlineQueries(client, {
      eventType: 'DEADLINE_REOPENED', deadlineId: 8, affectedClassIds: [1], version: 6, classWindows: updated.classWindows,
    }); });
    expect(await within(dialog).findByText(i18n.t('deadline.status.active'))).toBeInTheDocument();
    expect(within(dialog).getByText(i18n.t('deadlineScope.mixed'))).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: i18n.t('deadlineScope.changeTime') })).toBeEnabled();
    expect(deadlineApi.getDeadlineById).toHaveBeenCalledTimes(2);
  });

  it('disables changes after a detail fetch fails and rechecks permission when retried', async () => {
    vi.mocked(deadlineApi.getDeadlineById).mockRejectedValue(new Error('Offline'));
    mount(); const dialog = openDetails();
    await waitFor(() => expect(within(dialog).getByRole('alert')).toBeInTheDocument());
    expect(within(dialog).getByRole('button', { name: i18n.t('deadlineLifecycle.reopen') })).toBeDisabled();
    vi.mocked(deadlineApi.getDeadlineById).mockResolvedValue({ ...deadline, canEdit: false,
      classWindows: deadline.classWindows!.map(w => ({ ...w, canEdit: false })) });
    fireEvent.click(within(dialog).getByRole('button', { name: i18n.t('deadlineDetail.retry') }));
    await waitFor(() => expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument());
    expect(within(dialog).queryByRole('button', { name: i18n.t('deadlineLifecycle.reopen') })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('link')).not.toBeInTheDocument();
  });

  it('keeps detail viewing available without management actions', async () => {
    mount(vi.fn(), false); const dialog = openDetails();
    await waitFor(() => expect(within(dialog).queryByRole('status')).not.toBeInTheDocument());
    expect(within(dialog).queryByRole('button', { name: i18n.t('deadlineLifecycle.reopen') })).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: i18n.t('deadlineDetail.close') }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
