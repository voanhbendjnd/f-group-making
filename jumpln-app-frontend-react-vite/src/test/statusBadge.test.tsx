import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from '../components/common/StatusBadge';

describe('StatusBadge', () => {
  it('renders "Đã kích hoạt" when activated is true', () => {
    render(<StatusBadge activated={true} />);
    expect(screen.getByText('Đã kích hoạt')).toBeInTheDocument();
  });

  it('renders "Đã gửi email" when hasActivationKey is true and not expired', () => {
    render(<StatusBadge activated={false} hasActivationKey={true} isKeyExpired={false} />);
    expect(screen.getByText('Đã gửi email')).toBeInTheDocument();
  });

  it('renders "Email hết hạn" when key is expired', () => {
    render(<StatusBadge activated={false} hasActivationKey={true} isKeyExpired={true} />);
    expect(screen.getByText('Email hết hạn')).toBeInTheDocument();
  });

  it('renders "Chưa gửi email" when account is unactivated and no key', () => {
    render(<StatusBadge activated={false} hasActivationKey={false} />);
    expect(screen.getByText('Chưa gửi email')).toBeInTheDocument();
  });
});
