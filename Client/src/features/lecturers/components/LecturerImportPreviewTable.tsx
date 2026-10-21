import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ParsedLecturerRow } from '../types';

export interface LecturerImportPreviewTableProps { rows: ParsedLecturerRow[]; validCount: number; invalidCount: number }

export function LecturerImportPreviewTable({ rows, validCount, invalidCount }: LecturerImportPreviewTableProps) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<'all' | 'valid' | 'invalid'>('all');
  const [limit, setLimit] = useState(20);
  const filtered = rows.filter(row => filter === 'all' || (filter === 'valid' ? row.isValid : !row.isValid));
  return <div>
    <dl className="admin-summary-grid">
      <div><dt>{t('import.totalRows')}</dt><dd>{rows.length}</dd></div>
      <div><dt>{t('import.validRows')}</dt><dd>{validCount}</dd></div>
      <div><dt>{t('import.invalidRows')}</dt><dd>{invalidCount}</dd></div>
    </dl>
    <div className="admin-inline-actions" role="group" aria-label={t('import.step2Title')}>
      {(['all', 'valid', 'invalid'] as const).map(value => <button type="button" className="btn btn-secondary btn-sm" key={value}
        aria-pressed={filter === value} onClick={() => { setFilter(value); setLimit(20); }}>
        {t(value === 'all' ? 'import.filterAll' : value === 'valid' ? 'import.filterValid' : 'import.filterInvalid')}
        {' '}({value === 'all' ? rows.length : value === 'valid' ? validCount : invalidCount})
      </button>)}
    </div>
    <div className="table-container"><table className="table"><thead><tr>
      <th>{t('import.colExcelRow')}</th><th>{t('addLecturer.code')}</th><th>{t('addLecturer.email')}</th><th>{t('common.status')}</th><th>{t('import.colErrorDetail')}</th>
    </tr></thead><tbody>
      {filtered.slice(0, limit).map(row => <tr key={row.rowNumber}>
        <td>{row.rowNumber}</td><td>{row.code || '—'}</td><td>{row.email || '—'}</td>
        <td><span className={`badge ${row.isValid ? 'badge-success' : 'badge-error'}`}>{t(row.isValid ? 'import.filterValid' : 'import.filterInvalid')}</span></td>
        <td>{row.validationErrors.join('; ') || '—'}</td>
      </tr>)}
      {!filtered.length && <tr><td colSpan={5}>{t('dashboard.emptyRecent')}</td></tr>}
    </tbody></table></div>
    {filtered.length > limit && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setLimit(previous => previous + 50)}>
      {t('adminUx.showMore', { shown: limit, total: filtered.length })}
    </button>}
  </div>;
}
