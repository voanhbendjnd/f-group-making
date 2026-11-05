import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/app/providers/AuthContext';
import type { ClassViewScope } from '../types';

export function useClassScope() {
  const { user } = useAuth();
  // Teaching screens stay scoped to assigned classes. Global head access lives in its own overview tab.
  const viewAll = user?.authorities?.includes('ROLE_ADMIN') ?? false;
  const [classScope, setClassScope] = useState<ClassViewScope>(viewAll ? 'ALL' : 'MINE');
  const head = user?.authorities?.includes('ROLE_LECTURE_MASTER') ?? false;
  return { viewAll, classScope, setClassScope, scopeParams: viewAll || head ? { classScope } : {} };
}

export function ClassScopeFilter({ value, onChange, disabled }: {
  value: ClassViewScope; onChange: (scope: ClassViewScope) => void; disabled?: boolean;
}) {
  const { t } = useTranslation();
  const id = useId();
  return <div className="admin-inline-filter">
    <label htmlFor={id}>{t('classVisibility.scope')}</label>
    <select id={id} className="form-control" value={value} disabled={disabled}
      onChange={event => onChange(event.target.value as ClassViewScope)}>
      {(['ALL', 'MINE', 'OTHERS'] as const).map(scope => <option key={scope} value={scope}>{t(`classVisibility.${scope}`)}</option>)}
    </select>
  </div>;
}
