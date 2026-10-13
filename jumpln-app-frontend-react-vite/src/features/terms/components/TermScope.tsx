import React from 'react';
import { useTranslation } from 'react-i18next';
import { useTerm } from '@/app/providers/TermContext';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ErrorState } from '@/components/common/ErrorState';
import { EmptyState } from '@/components/common/EmptyState';

/** Mount scoped pages only after resolving a valid Term; reset local workflow on changes. */
export const TermScope: React.FC<{ children: React.ReactNode; global?: boolean }> = ({ children, global = false }) => {
  const { selectedTermId, isLoading, isError, refreshTerms } = useTerm();
  const { t } = useTranslation();

  if (!global) {
    if (isLoading) return <LoadingSpinner message={t('terms.loading')} />;
    if (isError) return <ErrorState message={t('terms.loadError')} onRetry={() => void refreshTerms()} />;
    if (selectedTermId === null) {
      return <EmptyState title={t('terms.empty')} description={t('terms.selectRequired')}
        actionText={t('common.retry')} onAction={() => void refreshTerms()} />;
    }
  }

  return <React.Fragment key={global ? 'global' : selectedTermId}>{children}</React.Fragment>;
};
