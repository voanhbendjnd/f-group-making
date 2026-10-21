import React from 'react';
import { useTranslation } from 'react-i18next';
import { Users, Calendar, ArrowRight } from 'lucide-react';
import type { SchoolClass } from '../types';

export interface ClassTableProps {
  classes: SchoolClass[];
  onSelectClass: (schoolClass: SchoolClass) => void;
  page: number;
  pageSize: number;
  onAssignLecturer?: (schoolClass: SchoolClass) => void;
}

export const ClassTable: React.FC<ClassTableProps> = ({
  classes,
  onSelectClass,
  page,
  pageSize,
  onAssignLecturer,
}) => {
  const { t } = useTranslation();
  return (
    <div className="table-container" style={{ overflowX: 'auto' }}>
      <table className="table" style={{ width: '100%' }}>
        <thead>
          <tr>
            <th style={{ width: '60px' }}>{t('classStudents.index')}</th>
            <th>{t('classes.className')}</th>
            <th>{t('lecturer.term')}</th>
            <th>{t('classAssignment.title')}</th>
            <th>{t('classes.studentCount')}</th>
            <th style={{ textAlign: 'right' }}>{t('lecturer.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {classes.length === 0 ? (
            <tr>
              <td colSpan={6} style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
                {t('classes.empty')}
              </td>
            </tr>
          ) : (
            classes.map((cls, index) => {
              const stt = (page - 1) * pageSize + index + 1;
              return (
                <tr
                  key={cls.id}
                  onClick={() => onSelectClass(cls)}
                  style={{ cursor: 'pointer', transition: 'background-color 0.15s ease' }}
                  className="hover:bg-gray-50"
                >
                  <td style={{ color: 'var(--color-text-subtle)', fontWeight: 500 }}>
                    #{stt}
                  </td>

                  {/* Tên lớp */}
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: '0.9375rem',
                          color: 'var(--color-primary, #4f6bed)',
                        }}
                      >
                        {cls.name}
                      </span>
                    </div>
                  </td>

                  {/* Học kỳ */}
                  <td>
                    {cls.termName ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '3px 10px',
                          borderRadius: '8px',
                          backgroundColor: '#f1f5f9',
                          color: '#334155',
                          fontSize: '0.8125rem',
                          fontWeight: 600,
                        }}
                      >
                        <Calendar size={12} />
                        {cls.termName}
                      </span>
                    ) : (
                      <span style={{ color: '#94a3b8' }}>—</span>
                    )}
                  </td>

                  {/* Giảng viên */}
                  <td>
                    {cls.lecturerId !== null ? (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: '6px',
                              backgroundColor: '#eff6ff',
                              color: '#1d4ed8',
                              fontSize: '0.8125rem',
                              fontWeight: 700,
                            }}
                          >
                            {cls.lecturerCode || t('classAssignment.assigned')}
                          </span>
                          {cls.lecturerName && (
                            <span style={{ fontWeight: 600, color: 'var(--color-text-main)' }}>
                              {cls.lecturerName}
                            </span>
                          )}
                        </div>
                        {cls.lecturerEmail && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                            {cls.lecturerEmail}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '0.8125rem' }}>
                        {t('classes.unassigned')}
                      </span>
                    )}
                  </td>

                  {/* Sĩ số sinh viên */}
                  <td>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 12px',
                        borderRadius: '20px',
                        backgroundColor: cls.studentCount > 0 ? '#ecfdf5' : '#f8fafc',
                        color: cls.studentCount > 0 ? '#047857' : '#64748b',
                        fontSize: '0.8125rem',
                        fontWeight: 700,
                        border: cls.studentCount > 0 ? '1px solid #a7f3d0' : '1px solid #e2e8f0',
                      }}
                    >
                      <Users size={13} />
                      {t('lecturer.students', { count: cls.studentCount })}
                    </span>
                  </td>

                  {/* Nút hành động */}
                  <td style={{ textAlign: 'right' }}>
                    {cls.lecturerId === null && onAssignLecturer && <button type="button" className="btn btn-primary btn-sm"
                      onClick={event => { event.stopPropagation(); onAssignLecturer(cls); }}>{t('classAssignment.choose')}</button>}
                    <button
                      type="button"
                      aria-label={t('classes.openClass', { name: cls.name })}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectClass(cls);
                      }}
                      className="btn btn-sm btn-secondary"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontWeight: 600,
                      }}
                    >
                      <span>{t('adminUx.classDetail')}</span>
                      <ArrowRight size={14} />
                    </button>
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
