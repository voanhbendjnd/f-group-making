import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from '../components/common/StatusBadge';

describe('StatusBadge', () => {
  it('renders "Đã kích hoạt" when activated is true', () => {
    render(<StatusBadge activated={true} />);
    expect(screen.getByText('Đã kích hoạt')).toBeInTheDocument();
  });

  it('shows an available link without claiming email delivery', () => {
    render(<StatusBadge activated={false} hasActivationKey={true} isKeyExpired={false} />);
    expect(screen.getByText('Có liên kết kích hoạt')).toBeInTheDocument();
  });

  it('shows an expired activation link', () => {
    render(<StatusBadge activated={false} hasActivationKey={true} isKeyExpired={true} />);
    expect(screen.getByText('Liên kết đã hết hạn')).toBeInTheDocument();
  });

  it('shows no valid link instead of inferring mail history', () => {
    render(<StatusBadge activated={false} hasActivationKey={false} />);
    expect(screen.getByText('Chưa có liên kết còn hạn')).toBeInTheDocument();
  });
  it('preserves expiry when the server also reports no valid key', () => {
    render(<StatusBadge activated={false} hasActivationKey={false} isKeyExpired />);
    expect(screen.getByText('Liên kết đã hết hạn')).toBeInTheDocument();
  });
});
