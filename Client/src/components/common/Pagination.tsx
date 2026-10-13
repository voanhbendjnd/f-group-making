import React, { useId } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation, Trans } from 'react-i18next';
import type { PaginationMeta } from '@/features/students/types';

export interface PaginationProps {
  meta: PaginationMeta;
  currentPage?: number;
  onPageChange: (newPage: number) => void;
  onPageSizeChange?: (newSize: number) => void;
}

export const Pagination: React.FC<PaginationProps> = ({
  meta,
  currentPage,
  onPageChange,
  onPageSizeChange,
}) => {
  const { t } = useTranslation();
  const sizeId = useId();
  const pageSize = meta?.pageSize || 10;
  const total = meta?.total || 0;
  const totalPages = Math.max(1, meta?.pages || 1);

  // Prefer explicit currentPage from state, otherwise fallback to meta.page (guaranteeing >= 1)
  const activePage = Math.min(
    Math.max(1, currentPage ?? (meta?.page && meta.page > 0 ? meta.page : 1)),
    totalPages
  );

  if (total === 0) return null;

  const startRecord = (activePage - 1) * pageSize + 1;
  const endRecord = Math.min(activePage * pageSize, total);

  // Generate page numbers to show around current active page
  const pageNumbers: number[] = [];
  const maxButtons = 5;
  let startPage = Math.max(1, activePage - Math.floor(maxButtons / 2));
  let endPage = startPage + maxButtons - 1;

  if (endPage > totalPages) {
    endPage = totalPages;
    startPage = Math.max(1, endPage - maxButtons + 1);
  }

  for (let i = startPage; i <= endPage; i++) {
    pageNumbers.push(i);
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem',
        padding: '1rem 0.5rem',
        fontSize: '0.875rem',
        color: 'var(--color-text-muted)',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
        <span>
          <Trans
            i18nKey="pagination.showing"
            values={{ start: startRecord, end: endRecord, total }}
            components={{ strong: <strong /> }}
          />
        </span>

        {onPageSizeChange && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginLeft: '0.5rem' }}>
            <label htmlFor={sizeId}>{t('pagination.perPage')}</label>
            <select
              id={sizeId}
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              style={{
                padding: '0.25rem 0.5rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
                fontSize: '0.8125rem',
                cursor: 'pointer',
              }}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
        <button
          type="button"
          onClick={() => onPageChange(activePage - 1)}
          disabled={activePage <= 1}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: '36px',
            height: '36px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)',
            background: 'var(--color-surface)',
            color: activePage <= 1 ? 'var(--color-text-subtle)' : 'var(--color-text-main)',
            cursor: activePage <= 1 ? 'not-allowed' : 'pointer',
            opacity: activePage <= 1 ? 0.5 : 1,
            transition: 'all var(--transition-fast)',
          }}
          aria-label={t('pagination.prev')}
        >
          <ChevronLeft size={16} />
        </button>

        {pageNumbers.map((num) => {
          const isActive = num === activePage;
          return (
            <button
              key={num}
              type="button"
              onClick={() => onPageChange(num)}
              aria-current={isActive ? 'page' : undefined}
              style={{
                minWidth: '36px',
                height: '36px',
                padding: '0 0.5rem',
                borderRadius: 'var(--radius-md)',
                border: `1px solid ${isActive ? 'var(--color-primary)' : 'var(--color-border)'}`,
                background: isActive ? 'var(--color-primary)' : 'var(--color-surface)',
                color: isActive ? '#ffffff' : 'var(--color-text-main)',
                fontWeight: isActive ? 700 : 500,
                cursor: isActive ? 'default' : 'pointer',
                transition: 'all var(--transition-fast)',
                boxShadow: isActive ? '0 2px 4px rgba(37, 99, 235, 0.2)' : 'none',
              }}
            >
              {num}
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => onPageChange(activePage + 1)}
          disabled={activePage >= totalPages}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: '36px',
            height: '36px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)',
            background: 'var(--color-surface)',
            color: activePage >= totalPages ? 'var(--color-text-subtle)' : 'var(--color-text-main)',
            cursor: activePage >= totalPages ? 'not-allowed' : 'pointer',
            opacity: activePage >= totalPages ? 0.5 : 1,
            transition: 'all var(--transition-fast)',
          }}
          aria-label={t('pagination.next')}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
};
