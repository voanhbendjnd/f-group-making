import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountPopover } from '@/components/layout/AccountPopover';
import { profileApi, type StudentProfile } from '@/features/students/api/profileApi';
import i18n from '@/locales/i18n';

const auth = vi.hoisted(() => ({ user: {
  id: 42, name: 'Preview Student', email: 'preview@example.test', authorities: ['ROLE_STUDENT'],
} }));
vi.mock('@/app/providers/AuthContext', () => ({ useAuth: () => ({ user: auth.user }) }));
vi.mock('@/features/students/api/profileApi', () => ({ profileApi: { getCurrentProfile: vi.fn() } }));

const profile: StudentProfile = {
  fullName: 'Preview Student', email: 'preview@example.test', rollNumber: 'PREVIEW001', activated: true,
  major: { name: 'Software Engineering', state: 'AVAILABLE' },
  schoolClass: { name: 'EXE101_PREVIEW', state: 'AVAILABLE' },
  term: { name: 'SP24', state: 'AVAILABLE' }, group: { name: null, state: 'UNASSIGNED' },
};
let client: QueryClient;
function renderCard() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0, staleTime: 30000 } } });
  render(<QueryClientProvider client={client}><AccountPopover /></QueryClientProvider>);
  return screen.getByRole('button', { name: i18n.t('studentProfile.accountDetails') });
}
beforeEach(async () => {
  vi.clearAllMocks();
  auth.user.authorities = ['ROLE_STUDENT'];
  await i18n.changeLanguage('en');
  vi.mocked(profileApi.getCurrentProfile).mockResolvedValue(profile);
});
afterEach(() => { cleanup(); client?.clear(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('Account Preview Card', () => {
  it('loads once on first hover, then reuses the shared profile cache', async () => {
    const trigger = renderCard();
    expect(profileApi.getCurrentProfile).not.toHaveBeenCalled();
    fireEvent.mouseEnter(trigger);
    expect(screen.getByRole('tooltip')).toHaveTextContent('preview@example.test');
    await screen.findByText('PREVIEW001');
    expect(screen.getByText('EXE101_PREVIEW')).toBeInTheDocument();
    expect(screen.getByText('SP24')).toBeInTheDocument();
    expect(screen.getByText('Account activated')).toBeInTheDocument();
    expect(screen.getByText('You are not in a group yet')).toBeInTheDocument();
    fireEvent.keyDown(trigger, { key: 'Escape' });
    fireEvent.mouseEnter(trigger);
    expect(screen.getByText('PREVIEW001')).toBeInTheDocument();
    expect(profileApi.getCurrentProfile).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(['student-profile', 42])).toEqual(profile);
  });

  it('uses cached data from Profile immediately without another request', () => {
    client = new QueryClient({ defaultOptions: { queries: { staleTime: 30000 } } });
    client.setQueryData(['student-profile', 42], profile);
    render(<QueryClientProvider client={client}><AccountPopover /></QueryClientProvider>);
    fireEvent.mouseEnter(screen.getByRole('button'));
    expect(screen.getByText('PREVIEW001')).toBeInTheDocument();
    expect(profileApi.getCurrentProfile).not.toHaveBeenCalled();
  });

  it.each(['ROLE_ADMIN', 'ROLE_LECTURE', 'ROLE_LECTURE_MASTER'])('does not call Student API for %s', (role) => {
    auth.user.authorities = [role, 'ROLE_STUDENT'];
    fireEvent.mouseEnter(renderCard());
    expect(screen.getByRole('tooltip')).toHaveTextContent('preview@example.test');
    expect(profileApi.getCurrentProfile).not.toHaveBeenCalled();
    expect(screen.queryByText('Account activated')).not.toBeInTheDocument();
    expect(screen.queryByText('Student ID')).not.toBeInTheDocument();
  });

  it('keeps basic account information available while academic data is loading', () => {
    vi.mocked(profileApi.getCurrentProfile).mockReturnValue(new Promise(() => {}));
    fireEvent.mouseEnter(renderCard());
    expect(screen.getByRole('tooltip')).toHaveTextContent('Preview Student');
    expect(screen.getByText('Loading academic information...')).toBeInTheDocument();
    expect(screen.queryByText('You are not in a group yet')).not.toBeInTheDocument();
  });

  it('handles unavailable profile without claiming there is no group', async () => {
    vi.mocked(profileApi.getCurrentProfile).mockRejectedValue({ status: 404, message: 'technical error' });
    fireEvent.mouseEnter(renderCard());
    expect(await screen.findByText('No student profile is linked to this account.')).toBeInTheDocument();
    expect(screen.getByText('preview@example.test')).toBeInTheDocument();
    expect(screen.queryByText('You are not in a group yet')).not.toBeInTheDocument();
  });

  it('translates pending status and invalid/unassigned links when switching VI/EN', async () => {
    vi.mocked(profileApi.getCurrentProfile).mockResolvedValue({ ...profile, activated: false,
      schoolClass: { name: null, state: 'UNASSIGNED' }, term: { name: null, state: 'UNASSIGNED' },
      group: { name: null, state: 'MISSING' },
    });
    fireEvent.mouseEnter(renderCard());
    await screen.findByText('Account not activated');
    await act(async () => { await i18n.changeLanguage('vi'); });
    expect(screen.getByText('Tài khoản chưa kích hoạt')).toBeInTheDocument();
    expect(screen.getByText('Chưa được phân lớp')).toBeInTheDocument();
    expect(screen.getByText('Thông tin liên kết chưa hợp lệ')).toBeInTheDocument();
    expect(screen.getByText('Học kỳ')).toBeInTheDocument();
    expect(screen.queryByText(/null|undefined/)).not.toBeInTheDocument();
  });

  it('fits a small viewport and stays open while scrolling within the card', async () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(320);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(240);
    const trigger = renderCard();
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({ left: 270, right: 310, bottom: 68, top: 28, width: 40, height: 40, x: 270, y: 28, toJSON: () => ({}) });
    fireEvent.focus(trigger);
    fireEvent.click(trigger);
    const card = screen.getByRole('tooltip');
    expect(parseFloat(card.style.left) + parseFloat(card.style.width)).toBeLessThanOrEqual(312);
    expect(parseFloat(card.style.top) + parseFloat(card.style.maxHeight)).toBeLessThanOrEqual(232);
    fireEvent.scroll(card);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('PREVIEW001')).toBeInTheDocument());
    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
