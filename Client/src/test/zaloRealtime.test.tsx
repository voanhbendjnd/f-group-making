import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RealtimeProvider } from '@/app/providers/RealtimeProvider';
import { StudentZaloPanel } from '@/features/zalo/components/StudentZaloPanel';
import { zaloApi, type ZaloShare } from '@/features/zalo/api/zaloApi';
import i18n from '@/locales/i18n';

const socket = vi.hoisted(() => ({ listeners: new Map<string, (frame: { body: string }) => void>(), activations: 0, deactivations: 0 }));
vi.mock('@stomp/stompjs', () => ({ Client: class {
  connected = false;
  constructor(public config: { onConnect: () => void }) {}
  activate() { socket.activations++; this.connected = true; this.config.onConnect(); }
  deactivate() { socket.deactivations++; this.connected = false; return Promise.resolve(); }
  subscribe(topic: string, listener: (frame: { body: string }) => void) {
    socket.listeners.set(topic, listener); return { unsubscribe: () => socket.listeners.delete(topic) };
  }
} }));
vi.mock('sockjs-client', () => ({ default: vi.fn() }));
vi.mock('@/app/providers/AuthContext', () => ({ useAuth: () => ({ user: { id: 1 }, isStudent: true, isAdmin: false, isLecturer: false }) }));
vi.mock('@/features/students/hooks/useStudentProfile', () => ({ useStudentProfile: () => ({ data: { schoolClassId: 2 } }) }));
vi.mock('@/app/providers/ToastContext', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/features/zalo/api/zaloApi', async original => ({ ...await original<typeof import('@/features/zalo/api/zaloApi')>(), zaloApi: { mine: vi.fn(), qr: vi.fn() } }));
let client: QueryClient;
const share: ZaloShare = { id: 4, classId: null, scope: 'LECTURER', lecturerId: 3, lecturerName: 'Lecturer', className: null, termId: 8, termName: 'FALL26', title: 'New class Zalo', inviteUrl: 'https://zalo.me/g/abc123', description: null, hasQr: false, version: 0, updatedAt: null };
beforeEach(async () => { vi.clearAllMocks(); socket.listeners.clear(); socket.activations = 0; socket.deactivations = 0;
  await i18n.changeLanguage('en'); vi.mocked(zaloApi.mine).mockResolvedValue([]); });
afterEach(() => { cleanup(); client?.clear(); });
async function mount() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><RealtimeProvider><StudentZaloPanel /></RealtimeProvider></QueryClientProvider>);
  await screen.findByText(i18n.t('zalo.emptyClass'));
  await waitFor(() => expect(socket.listeners.has('/topic/classes/2/deadlines')).toBe(true));
  return view;
}
function emit(eventId: string, eventType = 'ZALO_SHARE_UPDATED') {
  socket.listeners.get('/topic/classes/2/deadlines')!({ body: JSON.stringify({ eventId, eventType, deadlineId: null, schoolClassId: 2 }) });
}
it('receives the first Zalo share before any deadline and deduplicates repeated events', async () => {
  await mount(); vi.mocked(zaloApi.mine).mockResolvedValue([share]);
  await act(async () => { emit('zalo-created'); });
  await screen.findByRole('heading', { name: share.title });
  const calls = vi.mocked(zaloApi.mine).mock.calls.length;
  await act(async () => { emit('zalo-created'); }); expect(zaloApi.mine).toHaveBeenCalledTimes(calls);
});
it('ignores unrelated malformed events without a deadline', async () => {
  await mount(); const calls = vi.mocked(zaloApi.mine).mock.calls.length;
  await act(async () => { emit('bad', 'UNKNOWN_EVENT'); });
  expect(zaloApi.mine).toHaveBeenCalledTimes(calls); expect(screen.getByText(i18n.t('zalo.emptyClass'))).toBeInTheDocument();
});
it('does not depend on student group membership or group status events', async () => {
  await mount(); const calls = vi.mocked(zaloApi.mine).mock.calls.length;
  await act(async () => {
    socket.listeners.get('/topic/classes/2/deadlines')!({ body: JSON.stringify({ eventId: 'group-members', eventType: 'GROUP_MEMBER_REMOVED', deadlineId: 3, schoolClassId: 2 }) });
  });
  expect(zaloApi.mine).toHaveBeenCalledTimes(calls);
});

it('revalidates a realtime update without clearing cards, changing scope, or reconnecting on renders', async () => {
  const view = await mount(); vi.mocked(zaloApi.mine).mockResolvedValue([share]);
  await act(async () => { emit('initial-share'); });
  const card = (await screen.findByRole('heading', { name: share.title })).closest('article');
  const previousCalls = vi.mocked(zaloApi.mine).mock.calls.length;
  let finish!: (data: ZaloShare[]) => void;
  vi.mocked(zaloApi.mine).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await act(async () => { emit('updated-share'); });
  await waitFor(() => expect(zaloApi.mine).toHaveBeenCalledTimes(previousCalls + 1));
  expect(client.getQueryData(['zalo-mine', 1])).toEqual([share]);
  expect(card).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: i18n.t('zalo.lecturerScope') })).toBeChecked();
  await act(async () => { emit('updated-share'); await i18n.changeLanguage('vi'); });
  expect(zaloApi.mine).toHaveBeenCalledTimes(previousCalls + 1);
  await act(async () => finish([{ ...share, version: 1, title: 'Updated Zalo' }]));
  await screen.findByRole('heading', { name: 'Updated Zalo' });
  expect(card).toBeInTheDocument(); expect(socket.activations).toBe(1); expect(socket.listeners.size).toBe(1);
  view.unmount(); expect(socket.deactivations).toBe(1);
});

it('removes private cards when a realtime-authorized response no longer includes the share', async () => {
  await mount(); vi.mocked(zaloApi.mine).mockResolvedValue([share]);
  await act(async () => { emit('initial-share'); });
  await screen.findByRole('heading', { name: share.title });
  vi.mocked(zaloApi.mine).mockResolvedValue([]);
  await act(async () => { emit('share-removed-or-assignment-changed'); });
  await waitFor(() => expect(screen.queryByText(share.title)).not.toBeInTheDocument());
  expect(client.getQueryData(['zalo-mine', 1])).toEqual([]);
});

it('hides cached private data when realtime revalidation is forbidden', async () => {
  await mount(); vi.mocked(zaloApi.mine).mockResolvedValue([share]);
  await act(async () => { emit('initial-share'); });
  await screen.findByRole('heading', { name: share.title });
  vi.mocked(zaloApi.mine).mockRejectedValue({ status: 403, message: '' });
  await act(async () => { emit('access-rejected'); });
  await screen.findByText(i18n.t('zalo.loadFailed'));
  expect(screen.queryByText(share.title)).not.toBeInTheDocument();
});
