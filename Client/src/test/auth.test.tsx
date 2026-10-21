import React from 'react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { BrowserRouter, MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '../app/providers/ToastContext';
import { AuthProvider } from '../app/providers/AuthContext';
import { LoginForm } from '../features/auth/components/LoginForm';
import { LoginPage } from '../pages/auth/LoginPage';
import { AuthLayout } from '../components/layout/AuthLayout';
import { ForgotPasswordPage } from '../pages/auth/ForgotPasswordPage';
import { ActivateAccountPage } from '../pages/activation/ActivateAccountPage';
import { authApi } from '../features/auth/api/authApi';
import { activationApi } from '../features/activation/api/activationApi';
import i18n from '../locales/i18n';

beforeEach(async () => { localStorage.clear(); sessionStorage.clear(); await i18n.changeLanguage('vi'); });
afterEach(() => { cleanup(); localStorage.clear(); sessionStorage.clear(); vi.restoreAllMocks(); });

function loginPage(initial = '/login') {
  return render(<ToastProvider><AuthProvider><MemoryRouter initialEntries={[initial]}><Routes>
    <Route element={<AuthLayout />}>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/activate" element={<ActivateAccountPage />} />
    </Route>
    <Route path="/admin/dashboard" element={<h1>Admin destination</h1>} />
    <Route path="/lecturer/classes" element={<h1>Lecturer destination</h1>} />
    <Route path="/student/dashboard" element={<h1>Student destination</h1>} />
    <Route path="/student/profile" element={<h1>Student profile destination</h1>} />
  </Routes></MemoryRouter></AuthProvider></ToastProvider>);
}

async function enterCredentials(email = 'student@example.test', password = 'test-password') {
  await act(async () => {
    fireEvent.change(screen.getByLabelText(i18n.t('common.email'), { exact: false, selector: 'input' }), { target: { value: email } });
    fireEvent.change(screen.getByLabelText(i18n.t('common.password'), { exact: false, selector: 'input' }), { target: { value: password } });
  });
}

describe('LoginForm & Public Register Rule', () => {
  it('renders login form with email and password inputs', () => {
    render(
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <LoginForm />
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    );

    expect(screen.getByPlaceholderText(/an@fpt.edu.vn/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Đăng nhập/i })).toBeInTheDocument();
  });

  it('strictly contains NO public registration button or signup links', () => {
    render(
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <LoginForm />
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    );

    // Verify there is NO register / create account button or link
    expect(screen.queryByRole('button', { name: /đăng ký/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /đăng ký/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /tạo tài khoản/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /tạo tài khoản/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sign up/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /sign up/i })).not.toBeInTheDocument();

    // Verify notice explains provisioning by administrator
    expect(
      screen.getByText(/Tài khoản sinh viên do Quản trị viên cấp qua thư kích hoạt/i)
    ).toBeInTheDocument();
  });
});

describe('redesigned login integration', () => {
  it('renders the official image and three badges without duplicating image text or adding remember me', async () => {
    loginPage();
    expect(screen.getByRole('img', { name: i18n.t('auth.campusIllustration') })).toHaveAttribute('src', expect.stringContaining('login_image.png'));
    expect(document.querySelectorAll('.login-feature-badges li')).toHaveLength(3);
    expect(document.querySelector('.login-paper-plane')).toHaveAttribute('aria-hidden', 'true');
    expect(document.querySelectorAll('.login-corner-accent i')).toHaveLength(3);
    expect(document.querySelector('.login-signature')).not.toBeInTheDocument();
    expect(screen.getByText(i18n.t('auth.visualDescription'))).toHaveClass('login-visual-description');
    expect(screen.queryByText(/Good Teams|Brighter Journeys/)).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    await act(async () => i18n.changeLanguage('en'));
    expect(screen.getByRole('heading', { name: 'Welcome back!' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Account not activated yet?' })).toBeInTheDocument();
    expect(screen.getByText('Flexible Rules & Constraints')).toBeInTheDocument();
    expect(screen.getByText('A smart and collaborative way to form student groups, manage rules and create better learning experiences at FPT University.')).toBeInTheDocument();
  });
  it('keeps required, email-format and four-character password validation before calling login', async () => {
    const login = vi.spyOn(authApi, 'login'); loginPage();
    fireEvent.click(screen.getByRole('button', { name: i18n.t('auth.loginButton') }));
    expect(await screen.findByText(i18n.t('auth.emailRequired'))).toBeInTheDocument();
    expect(screen.getByText(i18n.t('auth.passwordRequired'))).toBeInTheDocument();
    await enterCredentials('invalid-email', 'abc');
    fireEvent.click(screen.getByRole('button', { name: i18n.t('auth.loginButton') }));
    expect(await screen.findByText(i18n.t('auth.emailInvalid'))).toBeInTheDocument();
    expect(screen.getByText(i18n.t('auth.passwordMinLength'))).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
    expect(document.querySelectorAll('.login-field-feedback')).toHaveLength(2);
  });
  it('toggles password visibility without submitting and retains input after a server error', async () => {
    const login = vi.spyOn(authApi, 'login').mockRejectedValue({ message: 'Test server error' }); loginPage();
    await enterCredentials();
    const password = screen.getByLabelText(i18n.t('common.password'), { exact: false, selector: 'input' });
    fireEvent.click(screen.getByRole('button', { name: i18n.t('common.showPassword') }));
    expect(password).toHaveAttribute('type', 'text'); expect(login).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: i18n.t('common.hidePassword') }));
    expect(password).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: i18n.t('auth.loginButton') }));
    await waitFor(() => expect(document.querySelector('.login-form-error')).toHaveTextContent('Test server error'));
    expect(password).toHaveValue('test-password');
    expect(screen.getByLabelText(i18n.t('common.email'), { exact: false })).toHaveValue('student@example.test');
  });
  it.each([
    ['ROLE_ADMIN', 'Admin destination'], ['ROLE_LECTURE', 'Lecturer destination'],
    ['ROLE_LECTURE_MASTER', 'Lecturer destination'], ['ROLE_STUDENT', 'Student destination'],
  ])('preserves the %s home redirect and token handling', async (role, destination) => {
    vi.spyOn(authApi, 'login').mockResolvedValue({ accessToken: 'test-only-token', user: { id: 1, name: 'Test User', email: 'student@example.test', authorities: [role] } });
    loginPage(); await enterCredentials();
    fireEvent.click(screen.getByRole('button', { name: i18n.t('auth.loginButton') }));
    expect(await screen.findByRole('heading', { name: destination })).toBeInTheDocument();
    expect(localStorage.getItem('f_group_auth_token')).toBe('test-only-token');
  });
  it('keeps submit disabled while waiting and preserves a permitted deep-link redirect', async () => {
    let resolve!: (value: Awaited<ReturnType<typeof authApi.login>>) => void;
    const login = vi.spyOn(authApi, 'login').mockImplementation(() => new Promise(done => { resolve = done; }));
    loginPage('/login?redirect=%2Fstudent%2Fprofile'); await enterCredentials();
    fireEvent.click(screen.getByRole('button', { name: i18n.t('auth.loginButton') }));
    const loading = await screen.findByRole('button', { name: i18n.t('common.processing') });
    expect(loading).toBeDisabled(); fireEvent.click(loading); expect(login).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ accessToken: 'test-token', user: { id: 1, name: 'Student', email: 'student@example.test', authorities: ['ROLE_STUDENT'] } }));
    expect(await screen.findByRole('heading', { name: 'Student profile destination' })).toBeInTheDocument();
  });
  it('keeps the activation request modal localized and calls only the existing activation API', async () => {
    const request = vi.spyOn(activationApi, 'requestActivation').mockResolvedValue(); loginPage();
    await act(async () => i18n.changeLanguage('en'));
    fireEvent.click(screen.getByRole('button', { name: 'Account not activated yet?' }));
    const dialog = screen.getByRole('dialog', { name: 'Request account activation' });
    fireEvent.change(within(dialog).getByLabelText('Email Address', { exact: false }), { target: { value: 'student@example.test' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send activation email' }));
    expect(await within(dialog).findByText('Request received')).toBeInTheDocument();
    expect(request).toHaveBeenCalledExactlyOnceWith('student@example.test');
  });
  it('keeps forgot password and activation on their original layout', async () => {
    loginPage();
    fireEvent.click(screen.getByRole('link', { name: i18n.t('auth.forgotPasswordLink') }));
    expect(await screen.findByRole('heading', { name: i18n.t('forgotPassword.title') })).toBeInTheDocument();
    expect(document.querySelector('.login-page')).toBeNull();
    cleanup(); loginPage('/activate');
    expect(await screen.findByText(i18n.t('activation.missingKeyError'))).toBeInTheDocument();
    expect(document.querySelector('.login-page')).toBeNull();
  });
});
