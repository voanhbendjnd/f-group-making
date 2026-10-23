import React, { useState } from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ParsedStudentRow } from '../types';

export interface ImportPreviewTableProps {
  rows: ParsedStudentRow[];
  validCount: number;
  invalidCount: number;
}

export const ImportPreviewTable: React.FC<ImportPreviewTableProps> = ({
  rows,
  validCount,
  invalidCount,
}) => {
  const { t } = useTranslation();
  const [filterType, setFilterType] = useState<'all' | 'valid' | 'invalid'>('all');
  const [previewLimit, setPreviewLimit] = useState<number>(10);

  const filteredRows = rows.filter((row) => {
    if (filterType === 'valid') return row.isValid;
    if (filterType === 'invalid') return !row.isValid;
    return true;
  });

  const displayedRows = filteredRows.slice(0, previewLimit);
  const hasMore = filteredRows.length > previewLimit;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Metrics overview */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '1rem',
        }}
      >
        <div className="card" style={{ padding: '1rem 1.25rem' }}>
          <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-subtle)' }}>{t('import.totalRows')}</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-text-main)' }}>
            {rows.length}
          </div>
        </div>

        <div
          className="card"
          style={{
            padding: '1rem 1.25rem',
            backgroundColor: '#f0fdf4',
            borderColor: '#bbf7d0',
          }}
        >
          <div style={{ fontSize: '0.8125rem', color: '#166534' }}>{t('import.validRows')}</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-success)' }}>
            {validCount}
          </div>
        </div>

        <div
          className="card"
          style={{
            padding: '1rem 1.25rem',
            backgroundColor: invalidCount > 0 ? '#fef2f2' : 'var(--color-surface)',
            borderColor: invalidCount > 0 ? '#fecaca' : 'var(--color-border)',
          }}
        >
          <div style={{ fontSize: '0.8125rem', color: invalidCount > 0 ? 'var(--color-error)' : 'var(--color-text-subtle)' }}>
            {t('import.invalidRows')}
          </div>
          <div
            style={{
              fontSize: '1.75rem',
              fontWeight: 800,
              color: invalidCount > 0 ? 'var(--color-error)' : 'var(--color-text-muted)',
            }}
          >
            {invalidCount}
          </div>
        </div>
      </div>

      {/* Filter toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
          <span style={{ fontWeight: 600, color: 'var(--color-text-main)' }}>{t('import.step2Title')}:</span>
          <div style={{ display: 'flex', gap: '0.25rem' }}>
            <button
              type="button"
              onClick={() => setFilterType('all')}
              className={`btn btn-sm ${filterType === 'all' ? 'btn-secondary' : 'btn-ghost'}`}
              style={{ fontWeight: filterType === 'all' ? 700 : 500 }}
            >
              {t('import.filterAll')} ({rows.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('valid')}
              className={`btn btn-sm ${filterType === 'valid' ? 'btn-secondary' : 'btn-ghost'}`}
              style={{ fontWeight: filterType === 'valid' ? 700 : 500 }}
            >
              {t('import.filterValid')} ({validCount})
            </button>
            {invalidCount > 0 && (
              <button
                type="button"
                onClick={() => setFilterType('invalid')}
                className={`btn btn-sm ${filterType === 'invalid' ? 'btn-danger' : 'btn-ghost'}`}
                style={{ fontWeight: filterType === 'invalid' ? 700 : 500 }}
              >
                {t('import.filterInvalid')} ({invalidCount})
              </button>
            )}
          </div>
        </div>

        <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
          {displayedRows.length} / {filteredRows.length}
        </div>
      </div>

      {/* Table */}
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: '70px' }}>#</th>
              <th>{t('students.colRollNumber')}</th>
              <th>{t('students.colFullName')}</th>
              <th>{t('groupExport.colKhoa')}</th>
              <th>{t('students.colMajor')}</th>
              <th>{t('students.colMemberCode')}</th>
              <th>{t('students.colEmail')}</th>
              <th>SlotType</th>
              <th>Lớp</th>
              <th>GV</th>
              <th>{t('common.status')}</th>
            </tr>
          </thead>
          <tbody>
            {displayedRows.map((row) => (
              <tr key={row.rowNumber} style={!row.isValid ? { backgroundColor: '#fffbfa' } : undefined}>
                <td style={{ fontWeight: 600, color: 'var(--color-text-subtle)' }}>
                  #{row.rowNumber}
                </td>
                <td style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
                  {row.rollNumber || '—'}
                </td>
                <td>{row.fullName || '—'}</td>
                <td>{row.originalMajor || '—'}</td>
                <td>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'var(--color-surface-muted)',
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                    }}
                  >
                    {row.extractedMajorCode || row.originalMajor || '—'}
                  </span>
                </td>
                <td style={{ color: 'var(--color-text-subtle)', fontSize: '0.8125rem' }}>
                  {row.memberCode || '—'}
                </td>
                <td>{row.email || '—'}</td>
                <td>{row.slotType || '—'}</td>
                <td>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: '#f1f5f9',
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      color: '#334155',
                    }}
                  >
                    {row.groupName || '—'}
                  </span>
                </td>
                <td>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: '#eff6ff',
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      color: '#1d4ed8',
                    }}
                  >
                    {row.lecturerCode || '—'}
                  </span>
                </td>
                <td>
                  {row.isValid ? (
                    <span className="badge badge-success">
                      <CheckCircle2 size={12} /> {t('import.filterValid')}
                    </span>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span className="badge badge-error">
                        <AlertTriangle size={12} /> {t('import.filterInvalid')}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-error)' }}>
                        {row.validationErrors.join('; ')}
                      </span>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Show more/less controls */}
      {filteredRows.length > 10 && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.5rem' }}>
          {hasMore ? (
            <button
              type="button"
              onClick={() => setPreviewLimit((prev) => prev + 25)}
              className="btn btn-outline btn-sm"
            >
              {t('import.showMore', { count: filteredRows.length - previewLimit })}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setPreviewLimit(10)}
              className="btn btn-ghost btn-sm"
              style={{ color: 'var(--color-text-muted)' }}
            >
              {t('import.collapse')}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
