import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CreateAdminPage } from '@/pages/admin/CreateAdminPage';
import { Sidebar } from '@/components/layout/Sidebar';
import { adminApi } from '@/features/admin/api/adminApi';
import { ToastProvider } from '@/app/providers/ToastContext';
import i18n from '@/locales/i18n';

vi.mock('@/features/admin/api/adminApi', () => ({
  adminApi: {
    createAdmin: vi.fn(),
  },
}));

vi.mock('@/app/providers/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, name: 'Root Admin', authorities: ['ROLE_ADMIN'] },
    isAdmin: true,
    isLecturer: false,
    isStudent: false,
    logout: vi.fn(),
  }),
}));

vi.mock('@/app/providers/NavigationGuard', () => ({
  useNavigationGuard: () => (fn: () => void) => fn(),
}));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe('Admin Create Admin Account feature', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('vi');
  });

  it('renders "Tạo tài khoản Admin" nav item in Sidebar for Admin area', () => {
    render(
      <MemoryRouter>
        <Sidebar area="admin" />
      </MemoryRouter>
    );

    const createAdminLink = screen.getByRole('link', { name: new RegExp(i18n.t('nav.createAdmin'), 'i') });
    expect(createAdminLink).toBeInTheDocument();
    expect(createAdminLink).toHaveAttribute('href', '/admin/create-admin');
  });

  it('renders CreateAdminPage form elements properly with activation notice', () => {
    render(
      <MemoryRouter>
        <ToastProvider>
          <CreateAdminPage />
        </ToastProvider>
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { level: 1, name: i18n.t('createAdmin.pageTitle') })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(i18n.t('createAdmin.fullNamePlaceholder'))).toBeInTheDocument();
    expect(screen.getByPlaceholderText(i18n.t('createAdmin.emailPlaceholder'))).toBeInTheDocument();
    expect(screen.getByText(i18n.t('createAdmin.notice'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: i18n.t('createAdmin.submitBtn') })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: i18n.t('createAdmin.resetBtn') })).toBeInTheDocument();
  });

  it('validates required fields on empty submit', async () => {
    render(
      <MemoryRouter>
        <ToastProvider>
          <CreateAdminPage />
        </ToastProvider>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: i18n.t('createAdmin.submitBtn') }));

    await waitFor(() => {
      expect(screen.getByText(i18n.t('createAdmin.fullNameRequired'))).toBeInTheDocument();
      expect(screen.getByText(i18n.t('createAdmin.emailRequired'))).toBeInTheDocument();
    });
    expect(adminApi.createAdmin).not.toHaveBeenCalled();
  });

  it('submits valid form and displays success view with created admin info', async () => {
    vi.mocked(adminApi.createAdmin).mockResolvedValueOnce({
      id: 99,
      name: 'Nguyen Van Admin',
      email: 'nguyen.admin@fpt.edu.vn',
      activated: false,
      activationKey: 'sample-activation-key',
      authorities: ['ROLE_ADMIN'],
    });

    render(
      <MemoryRouter>
        <ToastProvider>
          <CreateAdminPage />
        </ToastProvider>
      </MemoryRouter>
    );

    fireEvent.change(screen.getByPlaceholderText(i18n.t('createAdmin.fullNamePlaceholder')), {
      target: { value: 'Nguyen Van Admin' },
    });
    fireEvent.change(screen.getByPlaceholderText(i18n.t('createAdmin.emailPlaceholder')), {
      target: { value: 'nguyen.admin@fpt.edu.vn' },
    });

    fireEvent.click(screen.getByRole('button', { name: i18n.t('createAdmin.submitBtn') }));

    await waitFor(() => {
      expect(adminApi.createAdmin).toHaveBeenCalledWith({
        name: 'Nguyen Van Admin',
        email: 'nguyen.admin@fpt.edu.vn',
      });
    });

    // Check that success card is rendered with pending activation status
    await waitFor(() => {
      expect(screen.getByText(i18n.t('createAdmin.successCardTitle'))).toBeInTheDocument();
      expect(screen.getByText('nguyen.admin@fpt.edu.vn')).toBeInTheDocument();
      expect(screen.getByText('Nguyen Van Admin')).toBeInTheDocument();
      expect(screen.getByText(/ROLE_ADMIN/)).toBeInTheDocument();
      expect(screen.getByText(i18n.t('createAdmin.statusPendingActivation'))).toBeInTheDocument();
    });
  });

  it('handles duplicate email server error properly', async () => {
    vi.mocked(adminApi.createAdmin).mockRejectedValueOnce({
      response: {
        data: {
          errorKey: 'emailexists',
          message: 'Email already in use',
        },
      },
    });

    render(
      <MemoryRouter>
        <ToastProvider>
          <CreateAdminPage />
        </ToastProvider>
      </MemoryRouter>
    );

    fireEvent.change(screen.getByPlaceholderText(i18n.t('createAdmin.fullNamePlaceholder')), {
      target: { value: 'Existing Admin' },
    });
    fireEvent.change(screen.getByPlaceholderText(i18n.t('createAdmin.emailPlaceholder')), {
      target: { value: 'existing@fpt.edu.vn' },
    });

    fireEvent.click(screen.getByRole('button', { name: i18n.t('createAdmin.submitBtn') }));

    await waitFor(() => {
      expect(screen.getByText(i18n.t('createAdmin.errorDuplicateEmail'))).toBeInTheDocument();
    });
  });
});
