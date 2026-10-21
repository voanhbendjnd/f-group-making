import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { allocationApi } from '@/features/allocation/api/allocationApi';
import { useAllocationFlow } from '@/features/allocation/hooks/useAllocationFlow';
import { LecturerAllocationPage } from '@/pages/lecturer/LecturerAllocationPage';
import { Sidebar } from '@/components/layout/Sidebar';
import { classApi } from '@/features/classes/api/classApi';
import { deadlineApi } from '@/features/deadline/api/deadlineApi';
import { allocationErrorKey, isAllocationComplete, newRequestKey, validTarget } from '@/features/allocation/utils';
import { overviewFixture, setupFixture, previewFixture, applyFixture, planFixture } from './allocationFixtures';
import i18n from '@/locales/i18n';

const context = vi.hoisted(() => ({ term: 8, role: 'ROLE_LECTURE', success: vi.fn(), unlock: vi.fn(), subscribe: vi.fn(() => () => {}) }));
vi.mock('@/app/providers/AuthContext', () => ({ useAuth: () => ({ user: { id: 1, name: 'Teacher', email: 'teacher@example.test', authorities: [context.role] }, isAdmin: false }) }));
vi.mock('@/app/providers/TermContext', () => ({ useTerm: () => ({ selectedTermId: context.term, lockTermSelection: () => context.unlock }) }));
vi.mock('@/app/providers/ToastContext', () => ({ useToast: () => ({ success: context.success }) }));
vi.mock('@/app/providers/realtimeContext', () => ({ useRealtime: () => ({ subscribe: context.subscribe }) }));
vi.mock('@/features/allocation/api/allocationApi', () => ({ allocationApi: { overview: vi.fn(), setup: vi.fn(), preview: vi.fn(), apply: vi.fn(), history: vi.fn(), historyDetail: vi.fn(), plans: vi.fn(), plan: vi.fn() } }));
vi.mock('@/features/classes/api/classApi', () => ({ classApi: { getMyClasses: vi.fn() } }));
vi.mock('@/features/deadline/api/deadlineApi', () => ({ deadlineApi: { getDeadlines: vi.fn() } }));
let client: QueryClient;
function wrapper({ children }: { children: React.ReactNode }) { return <QueryClientProvider client={client}>{children}</QueryClientProvider>; }
function hook() { return renderHook(() => useAllocationFlow(2, 3), { wrapper }); }
function pageTree(initial = '/lecturer/automatic-allocation/2') {
  return <QueryClientProvider client={client}><MemoryRouter initialEntries={[initial]}><Routes>
    <Route path="/lecturer/automatic-allocation" element={<LecturerAllocationPage />} />
    <Route path="/lecturer/automatic-allocation/:classId" element={<LecturerAllocationPage />} />
  </Routes></MemoryRouter></QueryClientProvider>;
}
async function ready() {
  const value = hook();
  await waitFor(() => expect(value.result.current.overview.isSuccess).toBe(true));
  act(() => value.result.current.start());
  await waitFor(() => expect(value.result.current.setup.isSuccess).toBe(true));
  await act(async () => value.result.current.confirmTarget());
  await waitFor(() => expect(value.result.current.preview?.previewId).toBeTruthy());
  return value;
}
beforeEach(async () => {
  vi.clearAllMocks(); sessionStorage.clear(); context.term = 8; context.role = 'ROLE_LECTURE'; await i18n.changeLanguage('en');
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })));
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  vi.mocked(allocationApi.overview).mockResolvedValue(structuredClone(overviewFixture));
  vi.mocked(allocationApi.setup).mockResolvedValue(structuredClone(setupFixture));
  vi.mocked(allocationApi.preview).mockImplementation(async () => previewFixture());
  vi.mocked(allocationApi.apply).mockResolvedValue(applyFixture());
  vi.mocked(allocationApi.history).mockResolvedValue({ meta: { page: 1, pageSize: 10, total: 1, pages: 1 }, result: [{ runId: 9, previewId: previewFixture().previewId!, actorId: 1, targetGroupCount: 2, seed: 17, appliedAt: '2026-10-20T00:00:00Z' }] });
  vi.mocked(allocationApi.historyDetail).mockResolvedValue(applyFixture());
  vi.mocked(allocationApi.plans).mockResolvedValue({ meta: { page: 1, pageSize: 10, total: 1, pages: 1 }, result: [planFixture().summary] });
  vi.mocked(allocationApi.plan).mockResolvedValue(planFixture());
  vi.mocked(classApi.getMyClasses).mockResolvedValue({ result: [{ id: 2, name: 'Class A', termId: 8, lecturerId: 1, studentCount: 8 }], meta: { page: 1, pageSize: 50, total: 1, pages: 1 } } as Awaited<ReturnType<typeof classApi.getMyClasses>>);
  vi.mocked(deadlineApi.getDeadlines).mockResolvedValue({ result: [{ id: 3, schoolClassIds: [2] }], meta: { page: 1, pageSize: 50, total: 1, pages: 1 } } as Awaited<ReturnType<typeof deadlineApi.getDeadlines>>);
});
afterEach(() => { cleanup(); client.clear(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('automatic allocation workflow', () => {
  it('only treats nonempty accepted groups with no unassigned students as complete', () => {
    const complete = { ...overviewFixture, groups: overviewFixture.groups.map(group => ({ ...group, status: 'ACCEPTED' as const })) };
    expect(isAllocationComplete(complete)).toBe(true);
    expect(isAllocationComplete({ ...complete, groups: [] })).toBe(false);
    expect(isAllocationComplete({ ...complete, summary: { ...complete.summary, unassignedStudents: 1 } })).toBe(false);
    expect(isAllocationComplete({ ...complete, groups: complete.groups.map(group => ({ ...group, status: 'PENDING' as const })) })).toBe(false);
  });
  it('disables allocation for a completed class but keeps history details available in VI/EN', async () => {
    vi.mocked(allocationApi.overview).mockResolvedValue({ ...overviewFixture, groups: overviewFixture.groups.map(group => ({ ...group, status: 'ACCEPTED' as const })) });
    render(pageTree());
    await screen.findByText(i18n.t('allocation.completed'));
    expect(screen.getByRole('button', { name: i18n.t('allocation.autoAllocate'), exact: true })).toBeDisabled();
    expect(allocationApi.preview).not.toHaveBeenCalled(); expect(allocationApi.setup).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('tab', { name: i18n.t('allocation.randomHistory') }));
    fireEvent.click(await screen.findByRole('button', { name: i18n.t('allocation.viewPlan') }));
    await screen.findByText(i18n.t('allocation.savedPlan'));
    await act(async () => i18n.changeLanguage('vi'));
    expect(await screen.findByText(i18n.t('allocation.completed'))).toBeInTheDocument();
    expect(allocationApi.preview).not.toHaveBeenCalled();
  }, 15000);
  it('warns instead of marking the class complete if accepted groups leave students unassigned', async () => {
    vi.mocked(allocationApi.overview).mockResolvedValue({ ...overviewFixture, groups: overviewFixture.groups.map(group => ({ ...group, status: 'ACCEPTED' as const })), summary: { ...overviewFixture.summary, unassignedStudents: 1 } });
    const value = hook(); await waitFor(() => expect(value.result.current.overview.isSuccess).toBe(true));
    expect(value.result.current.complete).toBe(false); expect(value.result.current.acceptedWithUnassigned).toBe(true);
    act(() => value.result.current.start());
    await waitFor(() => expect(value.result.current.setup.isSuccess).toBe(true));
  });
  it('generates a valid request key on a LAN origin without native randomUUID', () => {
    const native = vi.spyOn(crypto, 'randomUUID').mockReturnValue(undefined as unknown as ReturnType<typeof crypto.randomUUID>);
    try { expect(newRequestKey()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/); }
    finally { native.mockRestore(); }
  });
  it('only randomizes after target confirmation, and saves a new Random Again request', async () => {
    const value = hook(); await waitFor(() => expect(value.result.current.overview.isSuccess).toBe(true));
    expect(allocationApi.preview).not.toHaveBeenCalled(); expect(allocationApi.setup).not.toHaveBeenCalled();
    act(() => value.result.current.start());
    await waitFor(() => expect(value.result.current.setup.isSuccess).toBe(true));
    expect(allocationApi.preview).not.toHaveBeenCalled();
    await act(async () => value.result.current.confirmTarget());
    await waitFor(() => expect(value.result.current.preview?.previewId).toBeTruthy());
    expect(allocationApi.preview).toHaveBeenCalledTimes(1); expect(allocationApi.apply).not.toHaveBeenCalled();
    const oldSeed = vi.mocked(allocationApi.preview).mock.calls[0][2].seed;
    act(() => value.result.current.autoAgain());
    await waitFor(() => expect(allocationApi.preview).toHaveBeenCalledTimes(2));
    const request = vi.mocked(allocationApi.preview).mock.calls[1][2];
    expect(request.targetGroupCount).toBe(2); expect(request.seed).not.toBe(oldSeed); expect(request.previousPlanFingerprint).toBe('b'.repeat(64));
  });
  it('rejects decimal/out-of-range targets and ignores a late cancelled response', async () => {
    const value = await ready();
    act(() => value.result.current.changeTarget('2.5')); expect(value.result.current.target).toBe('2');
    act(() => value.result.current.changeTarget('99')); expect(value.result.current.canApply).toBe(false);
    expect(validTarget('99', setupFixture.range)).toBeNull(); expect(validTarget('2.5', setupFixture.range)).toBeNull();
    let resolve!: (value: ReturnType<typeof previewFixture>) => void;
    vi.mocked(allocationApi.preview).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    act(() => value.result.current.changeTarget('3')); expect(allocationApi.preview).toHaveBeenCalledTimes(1);
    act(() => { void value.result.current.confirmTarget(); }); await waitFor(() => expect(allocationApi.preview).toHaveBeenCalledTimes(2));
    act(() => value.result.current.changeTarget('0'));
    await act(async () => resolve(previewFixture()));
    expect(value.result.current.preview).toBeNull(); expect(value.result.current.canApply).toBe(false);
  });
  it.each(['PROVEN_INFEASIBLE', 'SEARCH_LIMIT_REACHED'] as const)('does not allow Apply for %s', async status => {
    vi.mocked(allocationApi.preview).mockImplementation(async () => ({ ...previewFixture(), result: { ...previewFixture().result, status }, previewId: null, report: null, groups: [] }));
    const value = hook(); act(() => value.result.current.start());
    await waitFor(() => expect(value.result.current.setup.isSuccess).toBe(true));
    await act(async () => value.result.current.confirmTarget());
    await waitFor(() => expect(value.result.current.preview?.result.status).toBe(status)); expect(value.result.current.canApply).toBe(false);
  });
  it('does not expire a saved plan based on the legacy expiry timestamp', async () => {
    vi.mocked(allocationApi.preview).mockImplementation(async () => ({ ...previewFixture(), expiresAt: new Date(Date.now() - 1000).toISOString() }));
    const value = await ready(); expect(value.result.current.canApply).toBe(true);
  });
  it('restores exact saved groups without randomizing and requires confirmation after target changes', async () => {
    const value = hook(); await waitFor(() => expect(value.result.current.overview.isSuccess).toBe(true));
    act(() => value.result.current.restorePlan(planFixture()));
    await waitFor(() => expect(value.result.current.canApply).toBe(true));
    expect(value.result.current.preview?.groups).toEqual(planFixture().preview.groups);
    expect(allocationApi.preview).not.toHaveBeenCalled();
    act(() => value.result.current.changeTarget('3'));
    expect(value.result.current.preview).toBeNull(); expect(value.result.current.canApply).toBe(false);
    expect(allocationApi.preview).not.toHaveBeenCalled();
  });
  it('does not choose an unverified suggestion', async () => {
    vi.mocked(allocationApi.setup).mockResolvedValue({ ...setupFixture, suggestion: { ...setupFixture.suggestion, status: 'SEARCH_LIMIT_REACHED', suggestedCount: null } });
    const value = hook(); act(() => value.result.current.start());
    await waitFor(() => expect(value.result.current.setup.isSuccess).toBe(true));
    expect(value.result.current.target).toBe(''); expect(allocationApi.preview).not.toHaveBeenCalled();
  });
  it('invalidates current data on realtime and rejects a stale preview in the UI', async () => {
    const value = await ready(); expect(value.result.current.canApply).toBe(true);
    vi.mocked(allocationApi.overview).mockResolvedValue({ ...overviewFixture, snapshotFingerprint: 'c'.repeat(64) });
    const listener = context.subscribe.mock.calls.find(call => call[0] === '/topic/classes/2/deadlines/3/groups')?.[1] as unknown as (value: unknown) => void;
    act(() => listener({ eventType: 'GROUP_UPDATED', deadlineId: 3, schoolClassId: 2 }));
    await waitFor(() => expect(value.result.current.stale).toBe(true)); expect(value.result.current.canApply).toBe(false);
  });
  it('preserves the original request key on a busy conflict', async () => {
    const value = await ready(); vi.mocked(allocationApi.apply).mockRejectedValue({ status: 409, message: '', errorKey: 'error.allocationBusy' });
    await act(async () => value.result.current.confirmApply());
    const key = value.result.current.attempt?.key; expect(key).toBeTruthy();
    await act(async () => value.result.current.confirmApply());
    expect(allocationApi.apply).toHaveBeenLastCalledWith(3, 2, previewFixture().previewId, key); expect(context.success).not.toHaveBeenCalled();
  });
  it('keeps the same key after an unknown outcome, blocks double-click, and recovers after remount', async () => {
    const value = await ready(); vi.mocked(allocationApi.apply).mockRejectedValueOnce({ status: 500, message: '', outcomeUnknown: true });
    await act(async () => { await Promise.all([value.result.current.confirmApply(), value.result.current.confirmApply()]); });
    expect(allocationApi.apply).toHaveBeenCalledTimes(1); expect(context.success).not.toHaveBeenCalled();
    const request = vi.mocked(allocationApi.apply).mock.calls[0]; expect(request).toHaveLength(4);
    value.unmount(); const recovered = hook();
    expect(recovered.result.current.attempt?.key).toBe(request[3]);
    await act(async () => recovered.result.current.confirmApply());
    expect(allocationApi.apply).toHaveBeenLastCalledWith(...request); expect(context.success).toHaveBeenCalledOnce(); expect(recovered.result.current.applied?.runId).toBe(9);
    expect(sessionStorage.getItem('allocation-apply:1:2:3')).toBeNull(); expect(context.unlock).toHaveBeenCalledTimes(2);
  });
  it('requires a fresh preview on a stale 409 and does not report success', async () => {
    const value = await ready(); vi.mocked(allocationApi.apply).mockRejectedValue({ status: 409, message: '', errorKey: 'error.allocationPreviewStale' });
    await act(async () => value.result.current.confirmApply());
    expect(value.result.current.preview).toBeNull(); expect(value.result.current.canApply).toBe(false); expect(context.success).not.toHaveBeenCalled();
  });
  it('only shows assigned classes to a Master and does not load another class from the URL', async () => {
    context.role = 'ROLE_LECTURE_MASTER';
    vi.mocked(classApi.getMyClasses).mockResolvedValue({ result: [{ id: 5, name: 'Other class', termId: 8, lecturerId: 99, studentCount: 8 }], meta: { total: 1, page: 1, pages: 1, pageSize: 50 } } as Awaited<ReturnType<typeof classApi.getMyClasses>>);
    render(pageTree('/lecturer/automatic-allocation/5'));
    await screen.findByText(i18n.t('allocation.classUnavailable')); expect(allocationApi.overview).not.toHaveBeenCalled(); expect(deadlineApi.getDeadlines).not.toHaveBeenCalled();
  });
  it('resets the class scope when the selected term changes', async () => {
    const tree = () => pageTree();
    const value = render(tree()); await screen.findByText('Fixture group 1');
    context.term = 9; value.rerender(tree());
    await screen.findByText(i18n.t('allocation.classUnavailable'));
    expect(screen.queryByText('Fixture group 1')).not.toBeInTheDocument();
    expect(classApi.getMyClasses).toHaveBeenLastCalledWith(expect.objectContaining({ termId: 9 }), expect.anything());
  });
  it('opens a class from the term-scoped list and returns without randomizing', async () => {
    render(pageTree('/lecturer/automatic-allocation'));
    await screen.findByText('Class A');
    expect(allocationApi.overview).not.toHaveBeenCalled(); expect(allocationApi.preview).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: i18n.t('allocation.openClass') }));
    await screen.findByText('Fixture group 1');
    expect(allocationApi.preview).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: i18n.t('allocation.backToClasses') }));
    await screen.findByRole('button', { name: i18n.t('allocation.openClass') });
    expect(screen.queryByText('Fixture group 1')).not.toBeInTheDocument();
  });
  it('shows neutral numbered process steps on the class list, not in class details', async () => {
    render(pageTree('/lecturer/automatic-allocation'));
    const process = screen.getByRole('region', { name: i18n.t('allocation.howItWorks') });
    expect(within(process).getAllByRole('listitem')).toHaveLength(4);
    for (let i = 0; i < 4; i++) {
      expect(within(process).getByText(String(i + 1))).toBeInTheDocument();
      expect(within(process).getByText(i18n.t(`allocation.steps.${i}.title`))).toBeInTheDocument();
    }
    expect(process.querySelector('[aria-current]')).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: i18n.t('allocation.openClass') }));
    await screen.findByText('Fixture group 1');
    expect(screen.queryByRole('region', { name: i18n.t('allocation.howItWorks') })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Class A' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: i18n.t('allocation.randomHistory') })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: i18n.t('allocation.applyAudit') }));
    expect(await screen.findByRole('button', { name: 'View run #9' })).toBeInTheDocument();
  });
  it('uses the same card style for all statuses while retaining protected badges and member details', async () => {
    const groups = overviewFixture.groups.map((group, index) => ({ ...group,
      status: (['ACCEPTED', 'PENDING', 'REVOKED'] as const)[index], protectedGroup: index < 2 }));
    vi.mocked(allocationApi.overview).mockResolvedValue({ ...overviewFixture, groups });
    render(pageTree());
    await screen.findByRole('heading', { name: 'Class A', level: 1 });
    const accepted = screen.getByRole('heading', { name: groups[0].name }).closest('article')!;
    expect(accepted).toHaveClass('allocation-group', 'is-protected');
    expect(accepted).toHaveClass('allocation-group--enhanced');
    expect(within(accepted).getByText(i18n.t('groupReview.statuses.ACCEPTED'))).toBeInTheDocument();
    expect(within(accepted).getByText(i18n.t('allocation.protected'))).toBeInTheDocument();
    fireEvent.click(within(accepted).getByText(i18n.t('allocation.members', { count: groups[0].members.length })));
    expect(await within(accepted).findByText('S10 · SE')).toBeInTheDocument();
    for (const group of groups.slice(1)) expect(screen.getByRole('heading', { name: group.name }).closest('article')).toHaveClass('allocation-group--enhanced');
    expect(allocationApi.preview).not.toHaveBeenCalled();
    expect(allocationApi.apply).not.toHaveBeenCalled();
  });
  it('does not apply saved plans marked stale or already applied by the backend', async () => {
    const value = hook(); await waitFor(() => expect(value.result.current.overview.isSuccess).toBe(true));
    for (const status of ['INVALID', 'APPLIED'] as const) {
      act(() => value.result.current.restorePlan({ ...planFixture(), summary: { ...planFixture().summary, status, canApply: false } }));
      await waitFor(() => expect(value.result.current.setup.isSuccess).toBe(true));
      expect(value.result.current.preview?.groups).toEqual(planFixture().preview.groups);
      await act(async () => value.result.current.confirmApply());
      expect(allocationApi.apply).not.toHaveBeenCalled(); expect(allocationApi.preview).not.toHaveBeenCalled();
    }
  });
  it('applies a saved history entry without running Random again', async () => {
    render(pageTree()); await screen.findByText('Fixture group 1');
    fireEvent.click(screen.getByRole('tab', { name: i18n.t('allocation.randomHistory') }));
    fireEvent.click(await screen.findByRole('button', { name: i18n.t('allocation.applyPlan') }));
    const confirm = await screen.findByRole('button', { name: i18n.t('allocation.confirmApply') });
    await waitFor(() => expect(confirm).not.toBeDisabled());
    expect(allocationApi.preview).not.toHaveBeenCalled(); expect(allocationApi.apply).not.toHaveBeenCalled();
    fireEvent.click(confirm);
    await waitFor(() => expect(allocationApi.apply).toHaveBeenCalledWith(3, 2, planFixture().summary.planId, expect.any(String)));
    expect(allocationApi.preview).not.toHaveBeenCalled();
  }, 15000);
  it('links the new sidebar item with an active state', () => {
    render(<MemoryRouter initialEntries={['/lecturer/automatic-allocation']}><Sidebar area="lecturer" /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Automatic Allocation' })).toHaveAttribute('aria-current', 'page');
  });
  it('renders real DTO data, confirmation, history details and both languages', async () => {
    render(pageTree());
    await screen.findByText('Fixture group 1'); expect(screen.getByText('Fixture group 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Auto Allocate', exact: true }));
    fireEvent.click(await screen.findByRole('button', { name: i18n.t('allocation.confirmTarget') }));
    await screen.findByText(i18n.t('allocation.status.FEASIBLE'));
    fireEvent.click(screen.getByRole('button', { name: 'Apply & Approve', exact: true }));
    await screen.findByRole('dialog'); expect(allocationApi.apply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Apply' })); await screen.findByText(i18n.t('allocation.runSuccess', { id: 9, count: 1 }));
    fireEvent.click(screen.getByRole('tab', { name: i18n.t('allocation.randomHistory') }));
    fireEvent.click(await screen.findByRole('button', { name: i18n.t('allocation.viewPlan') }));
    await screen.findByText(i18n.t('allocation.savedPlan'));
    expect(allocationApi.plan).toHaveBeenCalledWith(3, 2, planFixture().summary.planId, expect.anything());
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('tab', { name: i18n.t('allocation.applyAudit') }));
    fireEvent.click(await screen.findByRole('button', { name: 'View run #9' }));
    await screen.findByText('Allocation run #9'); expect(allocationApi.historyDetail).toHaveBeenCalledWith(3, 2, 9, expect.anything());
    await act(async () => i18n.changeLanguage('vi')); expect(await screen.findByText('Lần phân bổ #9')).toBeInTheDocument();
  }, 15000);
  it.each([400, 401, 403, 404, 409])('localizes HTTP %s without raw server text', status => {
    expect(allocationErrorKey({ status, message: 'server message' })).toBe(`http${status}`);
    expect(i18n.exists(`allocation.errors.http${status}`)).toBe(true);
  });
});
