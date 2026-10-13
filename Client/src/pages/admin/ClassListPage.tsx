import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTerm } from '@/app/providers/TermContext';
import { TermScope } from '@/features/terms/components/TermScope';
import { Layers, Upload } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ErrorState } from '@/components/common/ErrorState';
import { Pagination } from '@/components/common/Pagination';
import { ClassFilterBar } from '@/features/classes/components/ClassFilterBar';
import { ClassTable } from '@/features/classes/components/ClassTable';
import { classApi } from '@/features/classes/api/classApi';
import type { SchoolClass, SchoolClassFilterParams } from '@/features/classes/types';

export const ClassListPage: React.FC = () => <TermScope><ClassListContent /></TermScope>;

const ClassListContent: React.FC = () => {
  const { t } = useTranslation();
  const { selectedTermId } = useTerm();
  const navigate = useNavigate();

  const [filters, setFilters] = useState<SchoolClassFilterParams>({
    page: 1,
    size: 10,
    search: '',
  });

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['school-classes', selectedTermId, filters],
    queryFn: () => classApi.getClasses({ ...filters, termId: selectedTermId! }),
  });

  const classes = data?.result || [];
  const meta = data?.meta || { page: filters.page || 1, pageSize: filters.size || 10, pages: 1, total: 0 };

  const handleFilterChange = (newFilters: Partial<SchoolClassFilterParams>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  };

  const handleResetFilters = () => {
    setFilters({
      page: 1,
      size: 10,
      search: '',
      termId: undefined,
    });
  };

  const handleSelectClass = (cls: SchoolClass) => {
    navigate(`/admin/classes/${cls.id}`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('classes.title')}
        description={t('classes.description')}
        breadcrumbs={[
          { label: t('breadcrumbs.admin'), href: '/admin/dashboard' },
          { label: t('classes.label') },
        ]}
        action={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button
              variant="primary"
              size="sm"
              icon={<Upload size={16} />}
              onClick={() => navigate('/admin/students/import')}
            >
              {t('classes.import')}
            </Button>
          </div>
        }
      />

      {/* Filter toolbar */}
      <ClassFilterBar
        filters={filters}
        onChange={handleFilterChange}
        onReset={handleResetFilters}
      />

      {/* Main Content Area */}
      {isLoading ? (
        <div className="card" style={{ padding: '3rem' }}>
          <LoadingSpinner message={t('classes.loadingList')} />
        </div>
      ) : isError ? (
        <div className="card" style={{ padding: '2rem' }}>
          <ErrorState
            message={(error as any)?.message || t('classes.loadFailed')}
            onRetry={() => refetch()}
          />
        </div>
      ) : (
        <div className="card">
          <div
            style={{
              padding: '1rem 1.25rem',
              borderBottom: '1px solid var(--color-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.75rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Layers size={18} style={{ color: 'var(--color-primary, #4f6bed)' }} />
              <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--color-text-main)' }}>
                {t('classes.total')}
              </span>
              <span
                style={{
                  backgroundColor: '#eef1fe',
                  color: '#4f6bed',
                  fontWeight: 700,
                  fontSize: '0.8125rem',
                  padding: '2px 8px',
                  borderRadius: '12px',
                }}
              >
                {meta.total}
              </span>
            </div>
          </div>

          <ClassTable
            classes={classes}
            onSelectClass={handleSelectClass}
            page={meta.page}
            pageSize={meta.pageSize}
          />

          {meta.pages > 1 && (
            <div
              style={{
                padding: '1rem',
                borderTop: '1px solid var(--color-border)',
                display: 'flex',
                justifyContent: 'flex-end',
              }}
            >
              <Pagination
                meta={meta}
                onPageChange={(p) => handleFilterChange({ page: p })}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
