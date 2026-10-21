import React from 'react';
import { Mail, CheckCircle2, Clock, Trash2 } from 'lucide-react';
import type { Lecturer } from '../types';
import { useTranslation } from 'react-i18next';

export interface LecturerTableProps {
  lecturers: Lecturer[];
  selectedUserIds: number[];
  onToggleSelect: (userId: number) => void;
  onToggleSelectAll: () => void;
  onSendActivation: (lecturer: Lecturer) => void;
  onDelete: (lecturer: Lecturer) => void;
  isSendingActivation?: boolean;
  getCooldown?: (userId: number) => number;
}

export const LecturerTable: React.FC<LecturerTableProps> = ({
  lecturers,
  selectedUserIds,
  onToggleSelect,
  onToggleSelectAll,
  onSendActivation,
  onDelete,
  isSendingActivation,
  getCooldown,
}) => {
  const { t } = useTranslation();
  const allSelected = lecturers.length > 0 && lecturers.every((l) => selectedUserIds.includes(l.userId));
  const someSelected = lecturers.some((l) => selectedUserIds.includes(l.userId)) && !allSelected;

  return (
    <div className="table-container" style={{ overflowX: 'auto' }}>
      <table className="table" style={{ width: '100%' }}>
        <thead>
          <tr>
            <th style={{ width: '40px', textAlign: 'center' }}>
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected;
                }}
                onChange={onToggleSelectAll}
                  aria-label={t('students.selectAllPageAria')}
              />
            </th>
            <th style={{ width: '60px' }}>#</th>
            <th>{t('addLecturer.code')}</th>
            <th>{t('addLecturer.email')}</th>
            <th>{t('students.colFullName')}</th>
            <th>{t('students.colAccountStatus')}</th>
            <th style={{ textAlign: 'right' }}>{t('students.colActions')}</th>
          </tr>
        </thead>
        <tbody>
          {lecturers.length === 0 ? (
            <tr>
              <td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--color-text-muted)' }}>
                {t('adminUx.noLecturers')}
              </td>
            </tr>
          ) : (
            lecturers.map((lecturer, index) => {
              const isSelected = selectedUserIds.includes(lecturer.userId);
              return (
                <tr key={lecturer.userId} className={isSelected ? 'table-row-selected' : ''}>
                  <td style={{ textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelect(lecturer.userId)}
                      aria-label={t('adminUx.selectLecturer', { code: lecturer.code })}
                    />
                  </td>
                  <td>{index + 1}</td>
                  <td style={{ fontWeight: 600, color: 'var(--color-text-main)' }}>{lecturer.code}</td>
                  <td>{lecturer.email}</td>
                  <td>{lecturer.name || '-'}</td>
                  <td>
                    {lecturer.activated ? (
                      <span
                        className="badge badge-success"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                      >
                        <CheckCircle2 size={13} />
                        {t('students.activated')}
                      </span>
                    ) : (
                      <span
                        className="badge badge-warning"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                      >
                        <Clock size={13} />
                        {t('students.unactivated')}
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                      {!lecturer.activated && (() => {
                        const cooldown = getCooldown ? getCooldown(lecturer.userId) : 0;
                        if (cooldown > 0) {
                          return (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                opacity: 0.65,
                                cursor: 'not-allowed',
                              }}
                              disabled
                              title={t('adminUx.cooldown', { seconds: cooldown })}
                            >
                              <Clock size={13} />
                              {t('adminUx.cooldown', { seconds: cooldown })}
                            </button>
                          );
                        }
                        return (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            disabled={isSendingActivation}
                            onClick={() => onSendActivation(lecturer)}
                          >
                            <Mail size={13} />
                            {t('students.btnSend')}
                          </button>
                        );
                      })()}
                      <button
                        type="button"
                        className="btn btn-sm"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          color: 'var(--color-error)',
                          borderColor: 'var(--color-border)',
                          backgroundColor: 'transparent',
                          padding: '0.25rem 0.5rem',
                        }}
                        title={t('adminUx.deleteAccount')}
                        aria-label={`${t('adminUx.deleteAccount')}: ${lecturer.code}`}
                        disabled={isSendingActivation}
                        onClick={() => onDelete(lecturer)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
};
