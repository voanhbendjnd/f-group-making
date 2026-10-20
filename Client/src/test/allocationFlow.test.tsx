import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { allocationApi } from '@/features/allocation/api/allocationApi';
import { useAllocationFlow } from '@/features/allocation/hooks/useAllocationFlow';
import { LecturerAllocationPage } from '@/pages/lecturer/LecturerAllocationPage';
import { Sidebar } from '@/components/layout/Sidebar';
import { classApi } from '@/features/classes/api/classApi';
import { deadlineApi } from '@/features/deadline/api/deadlineApi';
import { allocationErrorKey, newRequestKey, validTarget } from '@/features/allocation/utils';
import { overviewFixture, setupFixture, previewFixture, applyFixture } from './allocationFixtures';
import i18n from '@/locales/i18n';

const context = vi.hoisted(() => ({ term: 8, role: 'ROLE_LECTURE', success: vi.fn(), unlock: vi.fn(), subscribe: vi.fn(() => () => {}) }));
vi.mock('@/app/providers/AuthContext', () => ({ useAuth: () => ({ user: { id: 1, name: 'Teacher', email: 'teacher@example.test', authorities: [context.role] }, isAdmin: false }) }));
vi.mock('@/app/providers/TermContext', () => ({ useTerm: () => ({ selectedTermId: context.term, lockTermSelection: () => context.unlock }) }));
vi.mock('@/app/providers/ToastContext', () => ({ useToast: () => ({ success: context.success }) }));
vi.mock('@/app/providers/realtimeContext', () => ({ useRealtime: () => ({ subscribe: context.subscribe }) }));
vi.mock('@/features/allocation/api/allocationApi', () => ({ allocationApi: { overview: vi.fn(), setup: vi.fn(), preview: vi.fn(), apply: vi.fn(), history: vi.fn(), historyDetail: vi.fn() } }));
vi.mock('@/features/classes/api/classApi', () => ({ classApi: { getMyClasses: vi.fn() } }));
vi.mock('@/features/deadline/api/deadlineApi', () => ({ deadlineApi: { getDeadlines: vi.fn() } }));
let client: QueryClient;
function wrapper({ children }: { children: React.ReactNode }) { return <QueryClientProvider client={client}>{children}</QueryClientProvider>; }
function hook() { return renderHook(() => useAllocationFlow(2, 3), { wrapper }); }
async function ready() {
  const value = hook();
  await waitFor(() => expect(value.result.current.overview.isSuccess).toBe(true));
  act(() => value.result.current.start());
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
  vi.mocked(classApi.getMyClasses).mockResolvedValue({ result: [{ id: 2, name: 'Class A', termId: 8, lecturerId: 1, studentCount: 8 }], meta: { page: 1, pageSize: 50, total: 1, pages: 1 } } as Awaited<ReturnType<typeof classApi.getMyClasses>>);
  vi.mocked(deadlineApi.getDeadlines).mockResolvedValue({ result: [{ id: 3, schoolClassIds: [2] }], meta: { page: 1, pageSize: 50, total: 1, pages: 1 } } as Awaited<ReturnType<typeof deadlineApi.getDeadlines>>);
});
afterEach(() => { cleanup(); client.clear(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('automatic allocation workflow', () => {
  it('generates a valid request key on a LAN origin without native randomUUID', () => {
    const native = vi.spyOn(crypto, 'randomUUID').mockReturnValue(undefined as unknown as ReturnType<typeof crypto.randomUUID>);
    try { expect(newRequestKey()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/); }
    finally { native.mockRestore(); }
  });
  it('does not calculate or apply on mount; debounces a verified suggestion and Auto Again', async () => {
    const value = hook(); await waitFor(() => expect(value.result.current.overview.isSuccess).toBe(true));
    expect(allocationApi.preview).not.toHaveBeenCalled(); expect(allocationApi.setup).not.toHaveBeenCalled();
    act(() => value.result.current.start());
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
    act(() => value.result.current.changeTarget('3')); await waitFor(() => expect(allocationApi.preview).toHaveBeenCalledTimes(2));
    act(() => value.result.current.changeTarget('0'));
    await act(async () => resolve(previewFixture()));
    expect(value.result.current.preview).toBeNull(); expect(value.result.current.canApply).toBe(false);
  });
  it.each(['PROVEN_INFEASIBLE', 'SEARCH_LIMIT_REACHED'] as const)('does not allow Apply for %s', async status => {
    vi.mocked(allocationApi.preview).mockImplementation(async () => ({ ...previewFixture(), result: { ...previewFixture().result, status }, previewId: null, report: null, groups: [] }));
    const value = hook(); act(() => value.result.current.start());
    await waitFor(() => expect(value.result.current.preview?.result.status).toBe(status)); expect(value.result.current.canApply).toBe(false);
  });
  it('expires a preview using the server timestamp', async () => {
    vi.mocked(allocationApi.preview).mockImplementation(async () => ({ ...previewFixture(), expiresAt: new Date(Date.now() - 1000).toISOString() }));
    const value = await ready(); expect(value.result.current.secondsLeft).toBe(0); expect(value.result.current.canApply).toBe(false);
  });
  it('updates the countdown and disables Apply when its server expiry passes', async () => {
    const value = await ready(); expect(value.result.current.secondsLeft).toBeGreaterThan(0);
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 16 * 60 * 1000);
    try { await waitFor(() => expect(value.result.current.secondsLeft).toBe(0), { timeout: 2500 }); expect(value.result.current.canApply).toBe(false); }
    finally { clock.mockRestore(); }
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
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/?termId=8&classId=5']}><LecturerAllocationPage /></MemoryRouter></QueryClientProvider>);
    await screen.findByText(i18n.t('allocation.noClasses')); expect(allocationApi.overview).not.toHaveBeenCalled(); expect(deadlineApi.getDeadlines).not.toHaveBeenCalled();
  });
  it('resets the class scope when the selected term changes', async () => {
    const tree = () => <QueryClientProvider client={client}><MemoryRouter initialEntries={['/?termId=8&classId=2']}><LecturerAllocationPage /></MemoryRouter></QueryClientProvider>;
    const value = render(tree()); await screen.findByText('Fixture group 1');
    context.term = 9; value.rerender(tree());
    await screen.findByText(i18n.t('allocation.noClasses'));
    expect(screen.queryByText('Fixture group 1')).not.toBeInTheDocument();
    expect(classApi.getMyClasses).toHaveBeenLastCalledWith(expect.objectContaining({ termId: 9 }), expect.anything());
  });
  it('links the new sidebar item with an active state', () => {
    render(<MemoryRouter initialEntries={['/lecturer/automatic-allocation']}><Sidebar area="lecturer" /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Automatic Allocation' })).toHaveAttribute('aria-current', 'page');
  });
  it('renders real DTO data, confirmation, history details and both languages', async () => {
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/?termId=8&classId=2']}><LecturerAllocationPage /></MemoryRouter></QueryClientProvider>);
    await screen.findByText('Fixture group 1'); expect(screen.getByText('Fixture group 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Auto Allocate', exact: true }));
    await screen.findByText(i18n.t('allocation.status.FEASIBLE'));
    fireEvent.click(screen.getByRole('button', { name: 'Apply & Approve', exact: true }));
    await screen.findByRole('dialog'); expect(allocationApi.apply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Apply' })); await screen.findByText(i18n.t('allocation.runSuccess', { id: 9, count: 1 }));
    fireEvent.click(screen.getByRole('tab', { name: 'Allocation History' }));
    fireEvent.click(await screen.findByRole('button', { name: 'View run #9' }));
    await screen.findByText('Allocation run #9'); expect(allocationApi.historyDetail).toHaveBeenCalledWith(3, 2, 9, expect.anything());
    await act(async () => i18n.changeLanguage('vi')); expect(await screen.findByText('Lần phân bổ #9')).toBeInTheDocument();
  }, 15000);
  it.each([400, 401, 403, 404, 409])('localizes HTTP %s without raw server text', status => {
    expect(allocationErrorKey({ status, message: 'server message' })).toBe(`http${status}`);
    expect(i18n.exists(`allocation.errors.http${status}`)).toBe(true);
  });
});
