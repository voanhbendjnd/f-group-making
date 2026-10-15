import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { StudentProfilePage } from '@/pages/student/StudentProfilePage';
import { Sidebar } from '@/components/layout/Sidebar';
import { AccountPopover } from '@/components/layout/AccountPopover';
import { profileApi, type StudentProfile } from '@/features/students/api/profileApi';
import i18n from '@/locales/i18n';

vi.mock('@/app/providers/AuthContext', () => ({ useAuth: () => ({
  user: { id: 15, name: 'Profile Student', email: 'profile@example.test', authorities: ['ROLE_STUDENT'] },
  isAdmin: false, logout: vi.fn(),
}) }));
vi.mock('@/features/students/api/profileApi', () => ({ profileApi: { getCurrentProfile: vi.fn() } }));

const profile: StudentProfile = {
  fullName: 'Profile Student', rollNumber: 'PROFILE001', email: 'profile@example.test', activated: true,
  major: { name: 'Software Engineering', state: 'AVAILABLE' },
  schoolClass: { name: 'EXE101_PROFILE', state: 'AVAILABLE' },
  term: { name: 'SP24', state: 'AVAILABLE' }, group: { name: null, state: 'UNASSIGNED' },
};
let client: QueryClient;
function renderProfile() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } });
  return render(<QueryClientProvider client={client}><StudentProfilePage /></QueryClientProvider>);
}
beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage('en');
  vi.mocked(profileApi.getCurrentProfile).mockResolvedValue(profile);
});
afterEach(() => { cleanup(); client?.clear(); vi.useRealTimers(); });

describe('Student Profile', () => {
  it('renders real response fields without an Edit action and uses the class Term', async () => {
    renderProfile();
    expect(await screen.findByText('PROFILE001')).toBeInTheDocument();
    expect(screen.getByText('Software Engineering')).toBeInTheDocument();
    expect(screen.getByText('SP24')).toBeInTheDocument();
    expect(screen.getByText('You are not in a group yet')).toBeInTheDocument();
    expect(screen.getByText('Account activated')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
    expect(profileApi.getCurrentProfile).toHaveBeenCalledWith(expect.any(AbortSignal));
  });

  it('shows missing class/term and invalid linked group without raw null or IDs', async () => {
    vi.mocked(profileApi.getCurrentProfile).mockResolvedValue({ ...profile,
      schoolClass: { name: null, state: 'UNASSIGNED' }, term: { name: null, state: 'UNASSIGNED' },
      group: { name: null, state: 'MISSING' },
    });
    renderProfile();
    expect(await screen.findByText('No class assigned')).toBeInTheDocument();
    expect(screen.getByText('Academic term unavailable')).toBeInTheDocument();
    expect(screen.getByText('Linked information is invalid')).toBeInTheDocument();
    expect(screen.queryByText(/null|undefined/)).not.toBeInTheDocument();
  });

  it('updates all labels and unassigned-group message when switching VI/EN', async () => {
    renderProfile();
    await screen.findByText('PROFILE001');
    await act(async () => { await i18n.changeLanguage('vi'); });
    expect(screen.getByRole('heading', { name: 'Hồ sơ của tôi' })).toBeInTheDocument();
    expect(screen.getByText('Hiện tại bạn chưa có nhóm')).toBeInTheDocument();
    expect(screen.getByText('Tài khoản đã kích hoạt')).toBeInTheDocument();
  });

  it('renders loading without exposing stale profile data', () => {
    vi.mocked(profileApi.getCurrentProfile).mockReturnValue(new Promise(() => {}));
    renderProfile();
    expect(screen.getByText('Loading your profile...')).toBeInTheDocument();
    expect(screen.queryByText('PROFILE001')).not.toBeInTheDocument();
  });

  it.each([
    [403, 'You do not have permission to view a student profile.'],
    [404, 'No student profile'],
    [500, 'Unable to load your profile. Please try again.'],
  ])('handles HTTP %s with localized content', async (status, message) => {
    vi.mocked(profileApi.getCurrentProfile).mockRejectedValue({ status, message: 'raw technical error' });
    renderProfile();
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByText('raw technical error')).not.toBeInTheDocument();
  });

  it('provides a profile menu active state and closes mobile navigation on footer click', () => {
    const close = vi.fn();
    render(<MemoryRouter initialEntries={['/student/profile']}><Sidebar area="student" onClose={close} /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'My Profile' })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByRole('button', { name: 'View my profile' }));
    expect(close).toHaveBeenCalled();
  });

  it('routes the Sidebar footer to My Profile', async () => {
    render(<MemoryRouter initialEntries={['/student/dashboard']}><Sidebar area="student" />
      <Routes><Route path="/student/profile" element={<p>Profile destination</p>} /></Routes>
    </MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'View my profile' }));
    expect(await screen.findByText('Profile destination')).toBeInTheDocument();
  });

  it('opens the account popover on hover/focus/touch click and closes naturally or with Escape', () => {
    vi.useFakeTimers();
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><AccountPopover /></MemoryRouter></QueryClientProvider>);
    const trigger = screen.getByRole('button', { name: 'Account information' });
    fireEvent.mouseEnter(trigger);
    expect(screen.getByRole('tooltip')).toHaveTextContent('profile@example.test');
    expect(screen.getByRole('tooltip').parentElement).toBe(document.body);
    fireEvent.mouseLeave(trigger);
    fireEvent.mouseEnter(screen.getByRole('tooltip'));
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.mouseLeave(screen.getByRole('tooltip'));
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    fireEvent.focus(trigger);
    fireEvent.click(trigger);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
