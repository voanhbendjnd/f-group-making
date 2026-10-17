import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { LecturerGroupReviewPage } from '@/pages/lecturer/LecturerGroupReviewPage';
import { groupApi } from '@/features/group/api/groupApi';
import { classApi } from '@/features/classes/api/classApi';
import type { GroupReviewRow, GroupStatus } from '@/features/group/types/groupTypes';
import { syncDeadlineQueries } from '@/features/deadline/realtime';
import i18n from '@/locales/i18n';

const context = vi.hoisted(() => ({ term: 8, subscribe: vi.fn(() => () => {}), unlock: vi.fn(), success: vi.fn() }));
vi.mock('@/app/providers/TermContext', () => ({ useTerm: () => ({ selectedTermId: context.term, lockTermSelection: () => context.unlock }) }));
vi.mock('@/app/providers/AuthContext', () => ({ useAuth: () => ({ user: { id: 1, authorities: ['ROLE_LECTURE'] } }) }));
vi.mock('@/app/providers/realtimeContext', () => ({ useRealtime: () => ({ subscribe: context.subscribe }) }));
vi.mock('@/app/providers/ToastContext', () => ({ useToast: () => ({ success: context.success }) }));
vi.mock('@/features/group/api/groupApi', () => ({ groupApi: { getReviews: vi.fn(), acceptGroup: vi.fn(), rejectGroup: vi.fn(), revokeGroup: vi.fn() } }));
vi.mock('@/features/classes/api/classApi', () => ({ classApi: { getMyClasses: vi.fn() } }));
let client: QueryClient;
function row(status: GroupStatus = 'PENDING'): GroupReviewRow {
  return { className: 'Class A', submittedAt: '2026-10-01T00:00:00Z', deadlineStatus: 'EXPIRED', eligible: true,
    canReview: status === 'PENDING', canReopen: status === 'ACCEPTED',
    group: { id: 1, schoolClassId: 2, deadlineId: 3, name: 'Review fixture', leaderId: 4, leaderName: 'Leader', status,
      memberCount: 4, maxMembers: 6, version: 0, members: [], ruleEvaluations: [], allRulesPassed: true, hasHardRuleViolations: false } };
}
function Destination() { const location = useLocation(); return <output data-testid="board-url">{location.pathname}{location.search}</output>; }
function TestRoutes() { return <Routes><Route path="/lecturer/group-review/advanced" element={<Destination />} /><Route path="*" element={<LecturerGroupReviewPage />} /></Routes>; }
function mount(value = row(), entry = '/') {
  vi.mocked(groupApi.getReviews).mockResolvedValue({ result: [value], meta: { total: 1, page: 1, pageSize: 10, pages: 1 } });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[entry]}><TestRoutes /></MemoryRouter></QueryClientProvider>);
}
beforeEach(async () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: false, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })));
  vi.clearAllMocks(); context.term = 8; await i18n.changeLanguage('en');
  vi.mocked(classApi.getMyClasses).mockResolvedValue({ result: [{ id: 2, name: 'Class A', termId: 8, lecturerId: 1, studentCount: 4 }], meta: { total: 1, page: 1, pageSize: 50, pages: 1 } });
});
afterEach(() => { cleanup(); client?.clear(); vi.unstubAllGlobals(); });

describe('group review', () => {
  it('opens the selected class and retains review context, even if the status filter has no other groups', async () => {
    mount(row(), '/lecturer/group-review?termId=8&classId=2&status=PENDING&search=Leader');
    await screen.findByText('Review fixture');
    expect(screen.getByLabelText('Search group or leader')).toHaveValue('Leader');
    fireEvent.click(screen.getByRole('button', { name: i18n.t('groupBoard.open') }));
    const output = await screen.findByTestId('board-url');
    const url = new URL(output.textContent!, 'http://localhost');
    expect(url.pathname).toBe('/lecturer/group-review/advanced');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ classId: '2', deadlineId: '3', termId: '8', status: 'PENDING', search: 'Leader' });
  });

  it('requires a class choice when several classes are available', async () => {
    vi.mocked(classApi.getMyClasses).mockResolvedValue({ result: [2, 5].map(id => ({ id, name: `Class ${id}`, termId: 8, lecturerId: 1, studentCount: 4 })), meta: { total: 2, pages: 1, page: 1, pageSize: 50 } });
    mount(); await screen.findByText('Review fixture');
    expect(screen.getByRole('button', { name: i18n.t('groupBoard.open') })).toBeDisabled();
    expect(screen.getByText(i18n.t('groupBoard.chooseClass'))).toBeInTheDocument();
  });

  it('discards class and search filters from another term', async () => {
    mount(row(), '/lecturer/group-review?termId=7&classId=99&search=Previous&page=4');
    await screen.findByText('Review fixture');
    expect(groupApi.getReviews).toHaveBeenLastCalledWith(expect.objectContaining({ termId: 8, classId: undefined, search: '', page: 1 }), expect.anything());
  });
  it('sends term and search filters and subscribes to assigned class events', async () => {
    mount(); await screen.findByText('Review fixture');
    fireEvent.change(screen.getByLabelText('Search group or leader'), { target: { value: 'Leader' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search', exact: true }));
    await waitFor(() => expect(groupApi.getReviews).toHaveBeenLastCalledWith(expect.objectContaining({ termId: 8, search: 'Leader', page: 1 }), expect.anything()));
    expect(context.subscribe).toHaveBeenCalledWith('/topic/classes/2/deadlines');
  });

  it.each(['OPEN', 'REVOKED'] as const)('does not approve %s directly even when rules pass', async status => {
    mount(row(status)); await screen.findByText('Review fixture');
    expect(screen.queryByRole('button', { name: 'Approve', exact: true })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View', exact: true }));
    if (status === 'OPEN') expect(await screen.findByText(i18n.t('groupReview.awaitSubmit'))).toBeInTheDocument();
  });

  it('requires confirmation before approving an expired pending group', async () => {
    vi.mocked(groupApi.acceptGroup).mockResolvedValue(row('ACCEPTED').group);
    mount(); await screen.findByText('Review fixture');
    fireEvent.click(screen.getByRole('button', { name: 'Approve', exact: true }));
    expect(groupApi.acceptGroup).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(dialog.querySelector('.ant-btn-primary')!);
    await waitFor(() => expect(groupApi.acceptGroup).toHaveBeenCalledExactlyOnceWith(3, 2, 1));
    await waitFor(() => expect(context.unlock).toHaveBeenCalled());
  });

  it('requires a reason and preserves it when rejection fails', async () => {
    vi.mocked(groupApi.rejectGroup).mockRejectedValue({ status: 409, message: 'Review conflict' });
    mount(); await screen.findByText('Review fixture'); fireEvent.click(screen.getByRole('button', { name: 'Reject', exact: true }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(dialog.querySelector('.ant-btn-primary')!);
    expect(await screen.findByRole('alert')).toHaveTextContent(i18n.t('groupReview.reasonRequired'));
    expect(groupApi.rejectGroup).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Rejection reason'), { target: { value: 'Please revise' } });
    fireEvent.click(dialog.querySelector('.ant-btn-primary')!);
    await waitFor(() => expect(groupApi.rejectGroup).toHaveBeenCalledWith(3, 2, 1, { reason: 'Please revise' }));
    expect(screen.getByLabelText('Rejection reason')).toHaveValue('Please revise');
  });

  it('invalidates review, workspace and profile caches together', async () => {
    client = new QueryClient();
    for (const key of ['group-reviews', 'group-workspace', 'student-profile']) client.setQueryData([key, 1], {});
    await syncDeadlineQueries(client, { eventType: 'GROUP_ACCEPTED', deadlineId: 3, schoolClassId: 2 });
    for (const key of ['group-reviews', 'group-workspace', 'student-profile']) expect(client.getQueryState([key, 1])?.isInvalidated).toBe(true);
  });

  it('uses the new term without retaining the previous term list and translates VI', async () => {
    const mounted = mount(); await screen.findByText('Review fixture');
    vi.mocked(groupApi.getReviews).mockResolvedValue({ result: [], meta: { total: 0, pages: 0, page: 1, pageSize: 10 } });
    context.term = 9;
    mounted.rerender(<QueryClientProvider client={client}><MemoryRouter><TestRoutes /></MemoryRouter></QueryClientProvider>);
    await waitFor(() => expect(groupApi.getReviews).toHaveBeenLastCalledWith(expect.objectContaining({ termId: 9, page: 1 }), expect.anything()));
    expect(screen.queryByText('Review fixture')).not.toBeInTheDocument();
    await act(async () => { await i18n.changeLanguage('vi'); });
    expect(screen.getByRole('heading', { name: i18n.t('groupReview.title') })).toBeInTheDocument();
    expect(i18n.t('groupReview.title')).not.toContain('?');
  });

  it('keeps staff review available when a deadline is closed', async () => {
    client = new QueryClient();
    client.setQueryData(['group-reviews', 1], { result: [row()] });
    await syncDeadlineQueries(client, { eventType: 'DEADLINE_CLOSED', deadlineId: 3 });
    expect(client.getQueryData(['group-reviews', 1])).toEqual({ result: [expect.objectContaining({ canReview: true, canReopen: false, deadlineStatus: 'EXPIRED' })] });
  });

  it('renders assigned classes grid, selects a class on click, and displays the workspace banner to launch advanced grouping', async () => {
    vi.mocked(classApi.getMyClasses).mockResolvedValue({
      result: [
        { id: 2, name: 'Class 2', termId: 8, lecturerId: 1, studentCount: 15 },
        { id: 5, name: 'Class 5', termId: 8, lecturerId: 1, studentCount: 20 },
      ],
      meta: { total: 2, pages: 1, page: 1, pageSize: 50 },
    });
    mount();
    await screen.findByText('Review fixture');
    expect(screen.getByText('Class 2')).toBeInTheDocument();
    expect(screen.getByText('Class 5')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Class 2/i }));
    await screen.findByRole('region', { name: i18n.t('groupReview.selectedClassHeading') });
    expect(screen.getByRole('heading', { name: 'Class 2' })).toBeInTheDocument();

    // Click "View All Classes" to clear class filter
    fireEvent.click(screen.getByRole('button', { name: i18n.t('groupReview.viewAllClasses') }));
    expect(screen.queryByRole('region', { name: i18n.t('groupReview.selectedClassHeading') })).not.toBeInTheDocument();

    // Select Class 2 again and navigate to advanced grouping board
    fireEvent.click(screen.getByRole('button', { name: /Class 2/i }));
    await screen.findByRole('region', { name: i18n.t('groupReview.selectedClassHeading') });
    fireEvent.click(screen.getByRole('button', { name: i18n.t('groupReview.openAdvancedAction') }));
    const output = await screen.findByTestId('board-url');
    const url = new URL(output.textContent!, 'http://localhost');
    expect(url.pathname).toBe('/lecturer/group-review/advanced');
    expect(url.searchParams.get('classId')).toBe('2');
  });
});
