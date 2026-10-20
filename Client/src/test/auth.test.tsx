import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ToastProvider } from '../app/providers/ToastContext';
import { AuthProvider } from '../app/providers/AuthContext';
import { LoginForm } from '../features/auth/components/LoginForm';

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
