import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LecturerProfilePage } from '@/pages/lecturer/LecturerProfilePage';
import { AccountPopover } from '@/components/layout/AccountPopover';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopNavbar } from '@/components/layout/TopNavbar';
import { lecturerProfileApi } from '@/features/lecturers/api/lecturerProfileApi';
import { classApi } from '@/features/classes/api/classApi';
import i18n from '@/locales/i18n';

const auth = vi.hoisted(() => ({ roles: ['ROLE_LECTURE'], logout: vi.fn() }));
vi.mock('@/app/providers/AuthContext', () => ({ useAuth: () => ({ user: {
  id: 42, name: 'Lecturer Example', email: 'lecturer@example.test', authorities: auth.roles,
}, isAdmin: auth.roles.includes('ROLE_ADMIN'), logout: auth.logout }) }));
vi.mock('@/features/lecturers/api/lecturerProfileApi', () => ({ lecturerProfileApi: { getCurrentProfile: vi.fn() } }));
vi.mock('@/features/classes/api/classApi', () => ({ classApi: { getMyClasses: vi.fn(), getClasses: vi.fn() } }));
const data = { name: 'Lecturer Example', code: 'GV42', email: 'lecturer@example.test', activated: true, profileComplete: true };
let client: QueryClient;
function mount(content = <LecturerProfilePage />, entry = '/lecturer/profile') {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60000 } } });
  return render(<MemoryRouter initialEntries={[entry]}><QueryClientProvider client={client}>{content}</QueryClientProvider></MemoryRouter>);
}
beforeEach(async () => {
  vi.clearAllMocks(); auth.roles = ['ROLE_LECTURE']; await i18n.changeLanguage('en');
  vi.mocked(lecturerProfileApi.getCurrentProfile).mockResolvedValue(data);
});
afterEach(() => { cleanup(); client?.clear(); });

describe('Lecturer Profile', () => {
  it.each(['ROLE_LECTURE', 'ROLE_LECTURE_MASTER'])('shows only personal profile information for %s', async role => {
    auth.roles = [role]; mount();
    await screen.findByText('GV42');
    expect(screen.getByText(data.email)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: data.name })).toBeInTheDocument();
    expect(screen.getByText(i18n.t(role === 'ROLE_LECTURE_MASTER' ? 'lecturer.masterRole' : 'lecturer.role'))).toBeInTheDocument();
    expect(screen.queryByText(i18n.t('lecturerProfile.classes'))).not.toBeInTheDocument();
    expect(classApi.getMyClasses).not.toHaveBeenCalled();
    expect(classApi.getClasses).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
  });

  it('keeps real User information when the Lecturer record is missing', async () => {
    vi.mocked(lecturerProfileApi.getCurrentProfile).mockResolvedValue({ ...data, code: null, profileComplete: false });
    mount(); await screen.findByText(i18n.t('lecturerProfile.incomplete'));
    expect(screen.getByText(data.email)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: data.name })).toBeInTheDocument();
    expect(screen.queryByText('null')).not.toBeInTheDocument();
  });

 it('handles profile loading and errors without showing a fake profile', async () => {
    vi.mocked(lecturerProfileApi.getCurrentProfile).mockImplementation(() => new Promise(() => {}));
    const view = mount(); expect(screen.getByText(i18n.t('lecturerProfile.loading'))).toBeInTheDocument();
    view.unmount(); client.clear();
    vi.mocked(lecturerProfileApi.getCurrentProfile).mockRejectedValue({ status: 403, message: 'forbidden' });
    mount(); await screen.findByText(i18n.t('lecturerProfile.forbidden'));
    expect(screen.queryByText('GV42')).not.toBeInTheDocument();
  });

 it('translates Profile, Sidebar and incomplete state when language changes', async () => {
    vi.mocked(lecturerProfileApi.getCurrentProfile).mockResolvedValue({ ...data, code: null, profileComplete: false });
    mount(<><Sidebar area="lecturer" /><LecturerProfilePage /></>);
    await screen.findByText(i18n.t('lecturerProfile.incomplete'));
    await act(async () => { await i18n.changeLanguage('vi'); });
    expect(screen.getByRole('heading', { level: 1, name: 'Hồ sơ của tôi' })).toBeInTheDocument();
    expect(screen.queryByText(i18n.t('lecturerProfile.classes'))).not.toBeInTheDocument();
    expect(screen.getByText(i18n.t('lecturerProfile.incomplete'))).toBeInTheDocument();
  });

  it('prioritizes group review, puts classes last and hides the lecturer profile menu', async () => {
    const closed = vi.fn();
    mount(<><Sidebar area="lecturer" onClose={closed} /><Routes><Route path="/lecturer/profile" element={<LecturerProfilePage />} /></Routes></>);
    expect(screen.getAllByRole('link').map(link => link.textContent)).toEqual([
      i18n.t('groupReview.title'), i18n.t('nav.lecturerDeadlines'), i18n.t('allocation.title'), i18n.t('lecturer.classesAndRules'),
    ]);
    expect(screen.queryByRole('link', { name: i18n.t('studentProfile.title') })).not.toBeInTheDocument();
    const footer = screen.getByRole('button', { name: i18n.t('studentProfile.open') }); footer.focus(); expect(footer).toHaveFocus();
    fireEvent.click(footer); expect(closed).toHaveBeenCalledOnce(); await screen.findByText('GV42');
  });

  it.each(['ROLE_LECTURE', 'ROLE_LECTURE_MASTER'])('opens the profile when %s clicks their name in the top bar', async role => {
    auth.roles = [role];
    mount(<><TopNavbar area="lecturer" /><Routes>
      <Route path="/lecturer/profile" element={<LecturerProfilePage />} />
      <Route path="/lecturer/group-review" element={<p>Review page</p>} />
    </Routes></>, '/lecturer/group-review');
    expect(screen.getByText('Review page')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: i18n.t('studentProfile.open') }));
    await screen.findByRole('heading', { level: 1, name: i18n.t('studentProfile.title') });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('shares profile cache with hover preview and preserves hover/focus/touch behavior', async () => {
    mount(<><LecturerProfilePage /><AccountPopover /></>);
    await screen.findByText('GV42');
    const trigger = screen.getByRole('button', { name: i18n.t('studentProfile.accountDetails') });
    fireEvent.mouseEnter(trigger); expect(screen.getByRole('tooltip')).toHaveTextContent('GV42');
    expect(lecturerProfileApi.getCurrentProfile).toHaveBeenCalledTimes(1);
    fireEvent.mouseLeave(trigger); fireEvent.mouseEnter(screen.getByRole('tooltip'));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 220)); });
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.keyDown(trigger, { key: 'Escape' }); expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    fireEvent.focus(trigger); expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.pointerDown(document.body); expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    fireEvent.click(trigger); expect(screen.getByRole('tooltip')).toBeInTheDocument();
    expect(lecturerProfileApi.getCurrentProfile).toHaveBeenCalledTimes(1);
  });

  it('does not add Admin profile or fetch lecturer data for Admin', () => {
    auth.roles = ['ROLE_ADMIN']; mount(<><Sidebar area="admin" /><AccountPopover /></>);
    fireEvent.mouseEnter(screen.getByRole('button', { name: i18n.t('studentProfile.accountDetails') }));
    expect(screen.getByRole('tooltip')).toHaveTextContent(data.email);
    expect(screen.queryByRole('link', { name: i18n.t('studentProfile.title') })).not.toBeInTheDocument();
    expect(lecturerProfileApi.getCurrentProfile).not.toHaveBeenCalled();
  });

  it('does not fetch a Lecturer profile page for Admin-only accounts', () => {
    auth.roles = ['ROLE_ADMIN']; mount();
    expect(screen.getByText(i18n.t('lecturerProfile.forbidden'))).toBeInTheDocument();
    expect(lecturerProfileApi.getCurrentProfile).not.toHaveBeenCalled(); expect(classApi.getMyClasses).not.toHaveBeenCalled();
  });
});
