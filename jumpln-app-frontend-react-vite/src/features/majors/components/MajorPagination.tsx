import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/common/Button';
import type { PaginatedMajors } from '../types';

interface MajorPaginationProps {
  meta: PaginatedMajors['meta'];
  currentPage: number;
  isLoading: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export function MajorPagination({ meta, currentPage, isLoading, onPageChange, onPageSizeChange }: MajorPaginationProps) {
  const { t } = useTranslation();
  const totalPages = Math.max(1, meta.pages);
  const startRecord = (currentPage - 1) * meta.pageSize + 1;
  const endRecord = Math.min(currentPage * meta.pageSize, meta.total);
  const pageNumbers: number[] = [];
  const startPage = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
  const endPage = Math.min(totalPages, startPage + 4);
  for (let page = startPage; page <= endPage; page++) {
    pageNumbers.push(page);
  }

  if (meta.total === 0) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap',
      gap: '1rem', padding: '1rem 0.5rem', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <span>{t('majors.showing', { start: startRecord, end: endRecord, total: meta.total })}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <label htmlFor="major-page-size">{t('pagination.perPage')}</label>
          <select id="major-page-size" value={meta.pageSize} disabled={isLoading}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="form-control" style={{ width: 'auto', padding: '0.25rem 2.25rem 0.25rem 0.5rem', fontSize: '0.8125rem' }}>
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
      </div>
      <nav aria-label={t('majors.paginationLabel')} style={{ display: 'flex', gap: '0.375rem' }}>
        <Button variant="secondary" size="sm" icon={<ChevronLeft size={16} />}
          aria-label={t('pagination.prev')} disabled={isLoading || currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)} />
        {pageNumbers.map((page) => (
          <Button key={page} variant={page === currentPage ? 'primary' : 'secondary'} size="sm"
            aria-label={t('majors.pageAria', { page })} aria-current={page === currentPage ? 'page' : undefined}
            disabled={isLoading} onClick={() => onPageChange(page)}>
            {page}
          </Button>
        ))}
        <Button variant="secondary" size="sm" icon={<ChevronRight size={16} />}
          aria-label={t('pagination.next')} disabled={isLoading || currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)} />
      </nav>
    </div>
  );
}
