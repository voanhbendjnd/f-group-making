import { useTranslation } from 'react-i18next';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ErrorState } from '@/components/common/ErrorState';
import { getApiError } from '@/services/api/types';
import { useClassRules } from '../hooks/useClassRules';
import { ClassRulesForm } from './ClassRulesForm';

export function ClassRulesPanel({ classId, readOnly = false }: { classId: number; readOnly?: boolean }) {
  const { t } = useTranslation();
  const { query, mutation } = useClassRules(classId);
  if (query.isPending) return <div className="card lecturer-card"><LoadingSpinner message={t('rules.loading')} /></div>;
  if (!query.data) {
    const error = getApiError(query.error);
    return <div className="card lecturer-card"><ErrorState
      message={error.message || t('rules.loadFailed')}
      onRetry={[401, 403, 404].includes(error.status) ? undefined : () => { void query.refetch(); }}
    /></div>;
  }
  return <ClassRulesForm
    initial={query.data}
    readOnly={readOnly}
    onSave={request => mutation.mutateAsync(request)}
    onReload={async () => {
      const result = await query.refetch();
      if (result.error || !result.data) throw result.error;
      return result.data;
    }}
  />;
}
