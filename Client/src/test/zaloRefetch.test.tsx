import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { StudentZaloPanel } from '@/features/zalo/components/StudentZaloPanel';
import { ZaloManagementPanel } from '@/features/zalo/components/ZaloManagementPanel';
import { zaloApi, type ZaloShare } from '@/features/zalo/api/zaloApi';
import i18n from '@/locales/i18n';

const context = vi.hoisted(() => ({ userId: 1 }));
vi.mock('@/app/providers/AuthContext', () => ({ useAuth: () => ({ user: { id: context.userId } }) }));
vi.mock('@/app/providers/ToastContext', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/app/providers/TermContext', () => ({ useTerm: () => ({ lockTermSelection: () => () => {} }) }));
vi.mock('@/features/zalo/api/zaloApi', async original => ({ ...await original<typeof import('@/features/zalo/api/zaloApi')>(),
  zaloApi: { mine: vi.fn(), management: vi.fn(), qr: vi.fn(), save: vi.fn(), remove: vi.fn() } }));

const classShare: ZaloShare = { id: 2, scope: 'CLASS', classId: 2, className: 'EXE101_G201', lecturerId: 3,
  lecturerName: 'Lecturer', termId: 8, termName: 'FALL26', title: 'Class community', inviteUrl: 'https://zalo.me/g/class123',
  description: null, hasQr: true, version: 0, updatedAt: null };
const lecturerShare: ZaloShare = { ...classShare, id: 3, scope: 'LECTURER', classId: null, className: null,
  title: 'Lecturer community', inviteUrl: 'https://zalo.me/g/teacher123' };
const shares = [classShare, lecturerShare];
let client: QueryClient;
const target = { scope: 'CLASS' as const, classId: 2, termId: 8 };
const wrap = (element: React.ReactNode) => <QueryClientProvider client={client}>{element}</QueryClientProvider>;
async function loaded() {
  const view = render(wrap(<StudentZaloPanel />));
  await screen.findByAltText(i18n.t('zalo.qrAlt', { title: classShare.title }));
  await waitFor(() => expect(zaloApi.qr).toHaveBeenCalledTimes(2));
  return view;
}
beforeEach(async () => {
  vi.resetAllMocks(); context.userId = 1; await i18n.changeLanguage('en');
  vi.stubGlobal('matchMedia', vi.fn(query => ({ matches: false, media: query, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })));
  client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  vi.mocked(zaloApi.mine).mockImplementation(async () => structuredClone(shares));
  vi.mocked(zaloApi.management).mockResolvedValue(classShare);
  vi.mocked(zaloApi.qr).mockResolvedValue(new Blob(['fixture'], { type: 'image/png' }));
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:fixture-qr') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  focusManager.setFocused(true);
});
afterEach(() => { cleanup(); client.clear(); focusManager.setFocused(undefined); vi.useRealTimers(); vi.unstubAllGlobals(); });

it('keeps the same Student card and QR while manually refetching unchanged metadata', async () => {
  await loaded();
  const heading = screen.getByRole('heading', { name: classShare.title });
  const card = heading.closest('article');
  const qr = screen.getByAltText(i18n.t('zalo.qrAlt', { title: classShare.title }));
  let finish!: (data: ZaloShare[]) => void;
  vi.mocked(zaloApi.mine).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  fireEvent.click(screen.getByRole('button', { name: i18n.t('zalo.refresh') }));
  await waitFor(() => expect(zaloApi.mine).toHaveBeenCalledTimes(2));
  expect(card).toBeInTheDocument(); expect(qr).toBeInTheDocument();
  await act(async () => finish(structuredClone(shares)));
  await waitFor(() => expect(client.isFetching()).toBe(0));
  expect(screen.getByRole('heading', { name: classShare.title }).closest('article')).toBe(card);
  expect(zaloApi.qr).toHaveBeenCalledTimes(2); expect(URL.revokeObjectURL).not.toHaveBeenCalled();
});

it('does not request Zalo again when switching scope, language, or focusing while fresh', async () => {
  await loaded();
  fireEvent.click(screen.getByRole('radio', { name: i18n.t('zalo.lecturerScope') }));
  expect(screen.getByRole('heading', { name: lecturerShare.title })).toBeInTheDocument();
  await act(async () => { await i18n.changeLanguage('vi'); focusManager.setFocused(false); focusManager.setFocused(true); });
  expect(screen.getByRole('heading', { name: lecturerShare.title })).toBeInTheDocument();
  expect(zaloApi.mine).toHaveBeenCalledTimes(1); expect(zaloApi.qr).toHaveBeenCalledTimes(2);
});

it('uses cached metadata on a quick return and still fetches authenticated QR for the new mount', async () => {
  const first = await loaded(); first.unmount();
  render(wrap(<StudentZaloPanel />));
  await screen.findByAltText(i18n.t('zalo.qrAlt', { title: classShare.title }));
  expect(zaloApi.mine).toHaveBeenCalledTimes(1);
  expect(zaloApi.qr).toHaveBeenCalledTimes(4);
});

it('keeps the 30-second fallback polling without remounting QR', async () => {
  vi.useFakeTimers();
  render(wrap(<StudentZaloPanel />));
  await act(async () => { await vi.advanceTimersByTimeAsync(10); });
  const card = screen.getByRole('heading', { name: classShare.title }).closest('article');
  expect(zaloApi.mine).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
  expect(zaloApi.mine).toHaveBeenCalledTimes(2); expect(zaloApi.qr).toHaveBeenCalledTimes(2);
  expect(card).toBeInTheDocument();
});

it('keeps a card mounted across a version update and only reloads its changed QR', async () => {
  await loaded(); const card = screen.getByRole('heading', { name: classShare.title }).closest('article');
  await act(async () => { client.setQueryData(['zalo-mine', 1], [{ ...classShare, version: 1 }, lecturerShare]); });
  await waitFor(() => expect(zaloApi.qr).toHaveBeenCalledTimes(3));
  expect(card).toBeInTheDocument(); expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
});

it.each([401, 403, 404])('hides cached Student data when revalidation returns HTTP %s', async status => {
  await loaded(); vi.mocked(zaloApi.mine).mockRejectedValue({ status, message: '' });
  fireEvent.click(screen.getByRole('button', { name: i18n.t('zalo.refresh') }));
  await screen.findByText(i18n.t('zalo.loadFailed'));
  expect(screen.queryByText(classShare.title)).not.toBeInTheDocument();
  expect(screen.queryByText(lecturerShare.title)).not.toBeInTheDocument();
});

it('keeps authorized cards with an error notice when a background request has a temporary failure', async () => {
  await loaded(); const card = screen.getByRole('heading', { name: classShare.title }).closest('article');
  vi.mocked(zaloApi.mine).mockRejectedValue({ status: 503, message: '' });
  fireEvent.click(screen.getByRole('button', { name: i18n.t('zalo.refresh') }));
  await screen.findByText(i18n.t('zalo.loadFailed')); expect(card).toBeInTheDocument();
  expect(zaloApi.qr).toHaveBeenCalledTimes(2);
});

it('does not show cached Zalo from another account while loading its authorized data', async () => {
  const view = await loaded(); context.userId = 2;
  vi.mocked(zaloApi.mine).mockImplementationOnce(() => new Promise(() => {}));
  view.rerender(wrap(<StudentZaloPanel />));
  expect(screen.queryByText(classShare.title)).not.toBeInTheDocument();
  expect(screen.queryByText(lecturerShare.title)).not.toBeInTheDocument();
});

it('does not remount or refetch Lecturer management for equivalent target objects or language changes', async () => {
  const view = render(wrap(<ZaloManagementPanel target={target} />));
  await screen.findByAltText(i18n.t('zalo.qrAlt', { title: classShare.title }));
  const card = screen.getByRole('heading', { name: classShare.title }).closest('article');
  view.rerender(wrap(<ZaloManagementPanel target={{ ...target }} />));
  await act(async () => { await i18n.changeLanguage('vi'); });
  expect(card).toBeInTheDocument(); expect(zaloApi.management).toHaveBeenCalledTimes(1); expect(zaloApi.qr).toHaveBeenCalledTimes(1);
});

it('reuses Lecturer metadata on a quick scope return but fetches QR for the new mount', async () => {
  const first = render(wrap(<ZaloManagementPanel target={target} />));
  await screen.findByAltText(i18n.t('zalo.qrAlt', { title: classShare.title })); first.unmount();
  render(wrap(<ZaloManagementPanel target={{ ...target }} />));
  await screen.findByAltText(i18n.t('zalo.qrAlt', { title: classShare.title }));
  expect(zaloApi.management).toHaveBeenCalledTimes(1); expect(zaloApi.qr).toHaveBeenCalledTimes(2);
});

it('preserves the Lecturer editor after a temporary refetch error for an empty configuration', async () => {
  vi.mocked(zaloApi.management).mockResolvedValue(null);
  render(wrap(<ZaloManagementPanel target={target} />));
  fireEvent.click(await screen.findByRole('button', { name: i18n.t('zalo.create') }));
  fireEvent.change(screen.getByLabelText(i18n.t('zalo.name')), { target: { value: 'Unsaved name' } });
  vi.mocked(zaloApi.management).mockRejectedValue({ status: 503, message: '' });
  await act(async () => { await client.invalidateQueries({ queryKey: ['zalo-management'] }); });
  await screen.findByText(i18n.t('zalo.failed'));
  expect(screen.getByLabelText(i18n.t('zalo.name'))).toHaveValue('Unsaved name');
  expect(zaloApi.save).not.toHaveBeenCalled();
});

it.each([403, 404])('hides the Lecturer editor when scope revalidation returns HTTP %s', async status => {
  render(wrap(<ZaloManagementPanel target={target} />));
  fireEvent.click(await screen.findByRole('button', { name: i18n.t('zalo.edit') }));
  vi.mocked(zaloApi.management).mockRejectedValue({ status, message: '' });
  await act(async () => { await client.invalidateQueries({ queryKey: ['zalo-management'] }); });
  await screen.findByText(i18n.t(status === 403 ? 'zalo.errors.zaloForbidden' : 'zalo.errors.zaloNotFound'));
  expect(screen.queryByLabelText(i18n.t('zalo.name'))).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: classShare.title })).not.toBeInTheDocument();
  expect(zaloApi.save).not.toHaveBeenCalled();
});
