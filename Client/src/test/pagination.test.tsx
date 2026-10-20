import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Pagination } from '../components/common/Pagination';

describe('Pagination Component', () => {
  const defaultMeta = {
    page: 5,
    pageSize: 10,
    pages: 10,
    total: 100,
  };

  it('renders page 5 and highlights it as active when currentPage is 5', () => {
    const handlePageChange = vi.fn();
    render(
      <Pagination
        meta={defaultMeta}
        currentPage={5}
        onPageChange={handlePageChange}
      />
    );

    const btn5 = screen.getByRole('button', { name: '5' });
    expect(btn5).toBeInTheDocument();
    // Verify it is active (bold / white text / primary background)
    expect(btn5).toHaveStyle({ color: '#ffffff' });
  });

  it('calls onPageChange with 4 when previous button is clicked on page 5', () => {
    const handlePageChange = vi.fn();
    render(
      <Pagination
        meta={defaultMeta}
        currentPage={5}
        onPageChange={handlePageChange}
      />
    );

    const prevBtn = screen.getByLabelText('Trang trước');
    fireEvent.click(prevBtn);
    expect(handlePageChange).toHaveBeenCalledWith(4);
  });

  it('calls onPageChange with 6 when next button is clicked on page 5', () => {
    const handlePageChange = vi.fn();
    render(
      <Pagination
        meta={defaultMeta}
        currentPage={5}
        onPageChange={handlePageChange}
      />
    );

    const nextBtn = screen.getByLabelText('Trang sau');
    fireEvent.click(nextBtn);
    expect(handlePageChange).toHaveBeenCalledWith(6);
  });

  it('disables previous button on first page (page 1)', () => {
    const handlePageChange = vi.fn();
    render(
      <Pagination
        meta={{ ...defaultMeta, page: 1 }}
        currentPage={1}
        onPageChange={handlePageChange}
      />
    );

    const prevBtn = screen.getByLabelText('Trang trước');
    expect(prevBtn).toBeDisabled();
  });

  it('disables next button on last page (page 10)', () => {
    const handlePageChange = vi.fn();
    render(
      <Pagination
        meta={{ ...defaultMeta, page: 10 }}
        currentPage={10}
        onPageChange={handlePageChange}
      />
    );

    const nextBtn = screen.getByLabelText('Trang sau');
    expect(nextBtn).toBeDisabled();
  });

  it('navigates directly to page 4 when button 4 is clicked', () => {
    const handlePageChange = vi.fn();
    render(
      <Pagination
        meta={defaultMeta}
        currentPage={5}
        onPageChange={handlePageChange}
      />
    );

    const btn4 = screen.getByRole('button', { name: '4' });
    fireEvent.click(btn4);
    expect(handlePageChange).toHaveBeenCalledWith(4);
  });
});
