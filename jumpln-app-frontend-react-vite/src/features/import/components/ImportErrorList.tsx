import React from 'react';
import { AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ImportRowError } from '../types';

export interface ImportErrorListProps {
  errors: ImportRowError[];
}

export const ImportErrorList: React.FC<ImportErrorListProps> = ({ errors }) => {
  const { t } = useTranslation();
  if (errors.length === 0) return null;

  const getFieldLabel = (field: string): string => {
    const key = `import.fields.${field}`;
    const translated = t(key);
    return translated !== key ? translated : field;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="alert alert-error" style={{ marginBottom: 0 }}>
        <AlertCircle size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
        <div className="alert-content">
          <div className="alert-title">
            {t('import.serverErrorAlert', { count: errors.length })}
          </div>
          <div>
            {t('import.serverErrorDesc')}
          </div>
        </div>
      </div>

      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: '100px' }}>{t('import.colExcelRow')}</th>
              <th style={{ width: '140px' }}>{t('import.colRollNumberIfAny')}</th>
              <th style={{ width: '150px' }}>{t('import.colDataField')}</th>
              <th>{t('import.colErrorDetail')}</th>
            </tr>
          </thead>
          <tbody>
            {errors.map((err, idx) => (
              <tr key={idx} style={{ backgroundColor: '#fffbfa' }}>
                <td style={{ fontWeight: 700, color: 'var(--color-error)' }}>
                  {t('import.rowLabel', { row: err.row })}
                </td>
                <td style={{ fontWeight: 600, color: 'var(--color-text-main)' }}>
                  {err.rollNumber || '—'}
                </td>
                <td>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'var(--color-error-bg)',
                      color: 'var(--color-error)',
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                    }}
                  >
                    {getFieldLabel(err.field)}
                  </span>
                </td>
                <td style={{ color: 'var(--color-text-main)' }}>
                  {err.message}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
