import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ExtendDeadlineModal } from '@/features/deadline/components/ExtendDeadlineModal';
import { DeadlineTable } from '@/features/deadline/components/DeadlineTable';
import { MyGroupCard } from '@/features/group/components/MyGroupCard';
import { deadlineApi } from '@/features/deadline/api/deadlineApi';
import { groupApi } from '@/features/group/api/groupApi';
import { apiClient } from '@/services/api/client';
import { syncDeadlineQueries } from '@/features/deadline/realtime';
import { translateErrorMessage } from '@/services/api/errorTranslator';
import type { Deadline } from '@/features/deadline/types';
import type { GroupDTO } from '@/features/group/types/groupTypes';
import i18n from '@/locales/i18n';

vi.mock('@/features/deadline/api/deadlineApi', () => ({ deadlineApi: { updateDeadline: vi.fn() } }));
vi.mock('@/services/api/client', () => ({ apiClient: { post: vi.fn() } }));
vi.mock('@/app/providers/ToastContext', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));

const deadline: Deadline = { id: 8, name: 'Shared session', startTime: '2020-01-01T00:00:00Z', endTime: '2020-01-02T00:00:00Z',
  status: 'EXPIRED', canEdit: true, schoolClassIds: [1, 2], schoolClassNames: ['CLASS_A', 'CLASS_B'] };
const group: GroupDTO = { id: 1, deadlineId: 8, schoolClassId: 1, name: 'Real group', leaderId: 1, leaderName: 'Leader',
  status: 'OPEN', memberCount: 4, maxMembers: 6, version: 0, members: [], ruleEvaluations: [], allRulesPassed: true, hasHardRuleViolations: false };
beforeEach(async () => { vi.clearAllMocks(); await i18n.changeLanguage('en'); });
afterEach(cleanup);

describe('group session policy UI', () => {
  it.each([['en', 'OPEN'], ['vi', 'REVOKED']] as const)('still requires all rules for student submission in %s for %s', async (language, status) => {
    await i18n.changeLanguage(language);
    const testClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const props = { group: { ...group, status, allRulesPassed: false }, isLeader: true, isDeadlineExpired: false,
      onSubmit: vi.fn(), onCancelSubmit: vi.fn(), onLeave: vi.fn(), onDisband: vi.fn(), onOpenTransferModal: vi.fn() };
    const view = render(<QueryClientProvider client={testClient}><MyGroupCard {...props} /></QueryClientProvider>);
    const submit = screen.getByRole('button', { name: i18n.t('studentGroup.myGroup.submitButton') });
    expect(submit).toBeDisabled(); fireEvent.click(submit); expect(props.onSubmit).not.toHaveBeenCalled();
    view.rerender(<QueryClientProvider client={testClient}><MyGroupCard {...props} group={{ ...props.group, allRulesPassed: true }} /></QueryClientProvider>);
    expect(submit).toBeEnabled(); fireEvent.click(submit); expect(props.onSubmit).toHaveBeenCalledOnce();
    testClient.clear();
  });

  it('offers scheduling for an unscheduled session and submits the new window on its existing ID', async () => {
    const unscheduled: Deadline = { ...deadline, status: 'UNSCHEDULED', startTime: null, endTime: null,
      schoolClassIds: [1], schoolClassNames: ['CLASS_A'] };
    vi.mocked(deadlineApi.updateDeadline).mockResolvedValue({ ...unscheduled, status: 'UPCOMING' });
    render(<ExtendDeadlineModal open deadline={unscheduled} onClose={vi.fn()} onSuccess={vi.fn()} />);
    const start = screen.getByLabelText(i18n.t('deadline.modal.startTime'), { exact: false });
    expect(start).toBeEnabled(); expect(start).toHaveValue('');
    fireEvent.change(start, { target: { value: '2099-01-01T10:00' } });
    fireEvent.change(screen.getByLabelText(i18n.t('deadline.modal.endTimeExtend'), { exact: false }), { target: { value: '2099-01-02T10:00' } });
    fireEvent.click(screen.getByRole('button', { name: i18n.t('deadlineLifecycle.schedule') }));
    await waitFor(() => expect(deadlineApi.updateDeadline).toHaveBeenCalledWith(8, expect.objectContaining({ startTime: expect.any(String), targetClassIds: [1] })));
  });

  it('shows reopen for expired sessions and requires confirmation of every affected class', async () => {
    const closed = vi.fn(); vi.mocked(deadlineApi.updateDeadline).mockResolvedValue({ ...deadline, status: 'ACTIVE' });
    render(<ExtendDeadlineModal open deadline={deadline} onClose={closed} onSuccess={vi.fn()} />);
    expect(screen.getByText('CLASS_A')).toBeInTheDocument(); expect(screen.getByText('CLASS_B')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: i18n.t('deadlineScope.all') }));
    const submit = screen.getByRole('button', { name: i18n.t('deadlineLifecycle.reopen') });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText(i18n.t('deadline.modal.endTimeExtend'), { exact: false }), { target: { value: '2099-01-02T10:00' } });
    fireEvent.click(screen.getByRole('checkbox', { name: i18n.t('deadlineLifecycle.confirmScope') }));
    fireEvent.click(submit);
    await waitFor(() => expect(deadlineApi.updateDeadline).toHaveBeenCalledWith(8, expect.objectContaining({ confirmedClassIds: [1, 2] })));
    await waitFor(() => expect(closed).toHaveBeenCalledOnce());
  });

  it('keeps a failed reopening form and supports VI/EN', async () => {
    const closed = vi.fn(); vi.mocked(deadlineApi.updateDeadline).mockRejectedValue({ message: 'Conflict' });
    render(<ExtendDeadlineModal open deadline={deadline} onClose={closed} onSuccess={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(i18n.t('deadline.modal.endTimeExtend'), { exact: false }), { target: { value: '2099-01-02T10:00' } });
    fireEvent.click(screen.getByRole('radio', { name: i18n.t('deadlineScope.all') }));
    fireEvent.click(screen.getByRole('checkbox', { name: i18n.t('deadlineLifecycle.confirmScope') })); fireEvent.click(screen.getByRole('button', { name: i18n.t('deadlineLifecycle.reopen') }));
    await waitFor(() => expect(deadlineApi.updateDeadline).toHaveBeenCalledOnce());
    expect(closed).not.toHaveBeenCalled(); expect(screen.getByDisplayValue('2099-01-02T10:00')).toBeInTheDocument();
    await act(async () => { await i18n.changeLanguage('vi'); });
    expect(screen.getByRole('button', { name: i18n.t('deadlineLifecycle.reopen') })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: i18n.t('deadlineLifecycle.confirmScope') })).toBeChecked();
  });

  it('allows reopening legacy cancelled sessions', () => {
    render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><DeadlineTable deadlines={[{ ...deadline, status: 'CANCELLED' }]} onEdit={vi.fn()} /></MemoryRouter></QueryClientProvider>);
    expect(screen.getByRole('button', { name: i18n.t('deadlineLifecycle.reopen') })).toBeInTheDocument();
  });

  it.each(['OPEN', 'PENDING', 'ACCEPTED', 'REVOKED'] as const)('limits Student actions for %s and after expiry', state => {
    const testClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const props = { group: { ...group, status: state }, isLeader: true, isDeadlineExpired: false,
      onSubmit: vi.fn(), onCancelSubmit: vi.fn(), onLeave: vi.fn(), onDisband: vi.fn(), onOpenTransferModal: vi.fn() };
    const view = render(<QueryClientProvider client={testClient}><MyGroupCard {...props} /></QueryClientProvider>);
    expect(screen.queryByRole('button', { name: i18n.t('studentGroup.myGroup.submitButton') }) !== null).toBe(['OPEN', 'REVOKED'].includes(state));
    expect(screen.queryByRole('button', { name: i18n.t('studentGroup.myGroup.cancelSubmitButton') }) !== null).toBe(state === 'PENDING');
    view.rerender(<QueryClientProvider client={testClient}><MyGroupCard {...props} isDeadlineExpired /></QueryClientProvider>);
    expect(screen.queryByRole('button', { name: i18n.t('studentGroup.myGroup.submitButton') })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: i18n.t('studentGroup.myGroup.cancelSubmitButton') })).not.toBeInTheDocument();
  });

  it('moves members with one atomic request, not remove followed by add', async () => {
    vi.mocked(apiClient.post).mockResolvedValue(group);
    await groupApi.lecturerMoveMember(8, 1, 10, 11, 42);
    expect(apiClient.post).toHaveBeenCalledExactlyOnceWith('/api/deadlines/8/classes/1/groups/10/move-member/42/to/11');
  });

  it('resyncs cached workspaces after reopen without changing approved group status', async () => {
    const client = new QueryClient(); const key = ['group-workspace', 8, 1];
    client.setQueryData(key, { deadlineStatus: 'EXPIRED', groups: [{ ...group, status: 'ACCEPTED' }] });
    await syncDeadlineQueries(client, { eventType: 'DEADLINE_REOPENED', deadlineId: 8 });
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    expect(client.getQueryData(key)).toMatchObject({ groups: [{ status: 'ACCEPTED' }] }); client.clear();
  });

  it('translates duplicate session and approval policy errors in both languages', async () => {
    for (const language of ['en', 'vi']) {
      await i18n.changeLanguage(language);
      expect(translateErrorMessage({ response: { data: { message: 'error.sessionAlreadyExists' } } })).toBe(i18n.t('deadlineLifecycle.sessionExists'));
      expect(translateErrorMessage({ response: { data: { message: 'error.ERR_GROUP_STATE_CONFLICT' } } })).toBe(i18n.t('groupLifecycle.locked'));
    }
  });
});
