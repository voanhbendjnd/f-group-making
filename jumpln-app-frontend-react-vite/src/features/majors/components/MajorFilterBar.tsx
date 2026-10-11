import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/common/Button';
import type { MajorFilters } from '../types';

interface MajorFilterBarProps {
  filters: MajorFilters;
  onApply: (filters: MajorFilters) => void;
}

export function MajorFilterBar({ filters, onApply }: MajorFilterBarProps) {
  const { t } = useTranslation();
  const externalSearch = filters.search || '';
  const [search, setSearch] = useState(externalSearch);
  const [lastExternalSearch, setLastExternalSearch] = useState(externalSearch);
  const nameStatus = filters.temporaryName === undefined ? 'all' : filters.temporaryName ? 'temporary' : 'named';

  if (externalSearch !== lastExternalSearch) {
    setLastExternalSearch(externalSearch);
    setSearch(externalSearch);
  }

  useEffect(() => {
    if (search.trim() === (filters.search || '')) return;
    const timer = setTimeout(() => {
      onApply({ ...filters, search: search.trim() || undefined });
    }, 350);
    return () => clearTimeout(timer);
  }, [search, filters, onApply]);

  function reset() {
    setSearch('');
    onApply({});
  }

  return (
    <div className="card"
      style={{ padding: '1.25rem', marginBottom: '1.25rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' }}>
      <div style={{ flex: '2 1 240px' }}>
        <label className="form-label" htmlFor="major-list-search">{t('majors.searchLabel')}</label>
        <input id="major-list-search" className="form-control" value={search}
          placeholder={t('majors.searchPlaceholder')} onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onApply({ ...filters, search: search.trim() || undefined });
            }
          }} />
      </div>
      <div style={{ flex: '1 1 200px' }}>
        <label className="form-label" htmlFor="major-name-status">{t('majors.nameStatus')}</label>
        <select id="major-name-status" className="form-control" value={nameStatus}
          onChange={(event) => {
            const nextFilters = { ...filters };
            if (event.target.value === 'all') delete nextFilters.temporaryName;
            else nextFilters.temporaryName = event.target.value === 'temporary';
            onApply(nextFilters);
          }}>
          <option value="all">{t('majors.allNames')}</option>
          <option value="temporary">{t('majors.temporaryNames')}</option>
          <option value="named">{t('majors.assignedNames')}</option>
        </select>
      </div>
      <Button type="button" variant="secondary" icon={<X size={16} />} onClick={reset}>{t('majors.clearFilters')}</Button>
    </div>
  );
}
