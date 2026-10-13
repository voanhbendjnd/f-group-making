import React from 'react';
import { Mail, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/common/Button';
import type { Student } from '../types';

export interface StudentTableProps {
  students: Student[];
  selectedUserIds: number[];
  onToggleSelect: (userId: number) => void;
  onToggleSelectAllPage: () => void;
  onSendSingle: (student: Student) => void;
  isLoading?: boolean;
}

export const StudentTable: React.FC<StudentTableProps> = ({
  students,
  selectedUserIds,
  onToggleSelect,
  onToggleSelectAllPage,
  onSendSingle,
  isLoading,
}) => {
  const { t } = useTranslation();
  const isAllPageSelected =
    students.length > 0 && students.every((s) => selectedUserIds.includes(s.userId));
  const isSomePageSelected =
    students.some((s) => selectedUserIds.includes(s.userId)) && !isAllPageSelected;

  return (
    <div className="table-container">
      <table className="table" aria-label={t('students.title')}>
        <thead>
          <tr>
            <th style={{ width: '48px', textAlign: 'center' }}>
              <label className="custom-checkbox">
                <input
                  type="checkbox"
                  checked={isAllPageSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = isSomePageSelected;
                  }}
                  onChange={onToggleSelectAllPage}
                  disabled={isLoading || students.length === 0}
                  aria-label={t('students.selectAllPageAria')}
                />
              </label>
            </th>
            <th>{t('students.colRollNumber')}</th>
            <th>{t('students.colFullName')}</th>
            <th>{t('students.colEmail')}</th>
            <th>{t('students.colMajor')}</th>
            <th>{t('students.colMemberCode')}</th>
            <th>{t('students.colAccountStatus')}</th>
            <th style={{ textAlign: 'right', paddingRight: '1.25rem' }}>{t('students.colActions')}</th>
          </tr>
        </thead>
        <tbody>
          {students.map((student) => {
            const isSelected = selectedUserIds.includes(student.userId);

            return (
              <tr key={student.userId} className={isSelected ? 'is-selected' : ''}>
                <td style={{ textAlign: 'center' }}>
                  <label className="custom-checkbox">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelect(student.userId)}
                      aria-label={t('students.selectStudentAria', { name: student.fullName })}
                    />
                  </label>
                </td>

                <td style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
                  {student.rollNumber}
                </td>

                <td style={{ fontWeight: 500 }}>{student.fullName}</td>

                <td style={{ color: 'var(--color-text-muted)' }}>{student.email}</td>

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
                    {student.majorCode || 'N/A'}{student.majorName && student.majorName !== student.majorCode && ` — ${student.majorName}`}
                  </span>
                </td>

                <td style={{ color: 'var(--color-text-subtle)', fontSize: '0.8125rem' }}>
                  {student.memberCode}
                </td>

                <td>
                  <StatusBadge
                    activated={student.activated}
                    hasActivationKey={student.hasActivationKey}
                    isKeyExpired={student.isKeyExpired}
                  />
                </td>

                <td style={{ textAlign: 'right', paddingRight: '1rem' }}>
                  {student.activated ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        fontSize: '0.8125rem',
                        color: 'var(--color-success)',
                        fontWeight: 500,
                        padding: '0.375rem 0.5rem',
                      }}
                    >
                      <CheckCircle2 size={15} />
                      <span>{t('students.statusActive')}</span>
                    </span>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      icon={<Mail size={14} />}
                      onClick={() => onSendSingle(student)}
                    >
                      {student.hasActivationKey ? t('students.btnResend') : t('students.btnSend')}
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
