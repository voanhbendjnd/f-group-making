import React, { useState, useMemo } from 'react';
import { useLocation, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Users,
  Calendar,
  Search,
  X,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ErrorState } from '@/components/common/ErrorState';
import { classApi } from '@/features/classes/api/classApi';
import { ClassManagementControls } from '@/features/classes/components/ClassManagementControls';
import { ClassGroupingSessions } from '@/features/classes/components/ClassGroupingSessions';
import { useTranslation } from 'react-i18next';
import { useTerm } from '@/app/providers/TermContext';
import { TermScope } from '@/features/terms/components/TermScope';
import { ZaloManagementPanel } from '@/features/zalo/components/ZaloManagementPanel';


export const ClassDetailPage: React.FC = () => <TermScope><ClassDetailContent /></TermScope>;

const ClassDetailContent: React.FC = () => {
  const { selectedTermId } = useTerm();
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const previousList = typeof location.state?.from === 'string' && /^\/admin\/classes(?:\?|$)/.test(location.state.from) ? location.state.from : '/admin/classes';
  const classId = Number(id);
  const [params, setParams] = useSearchParams();
  const tab = ['groups', 'deadlines', 'settings', 'zalo'].includes(params.get('tab') ?? '') ? params.get('tab')! : 'students';

  const [searchStudent, setSearchStudent] = useState<string>('');

  // 1. Fetch Class Detail
  const {
    data: classDetail,
    isLoading: isClassLoading,
    isError: isClassError,
    error: classError,
    refetch: refetchClass,
  } = useQuery({
    queryKey: ['school-class', selectedTermId, classId],
    queryFn: () => classApi.getClassById(classId),
    enabled: Boolean(classId && !isNaN(classId)),
  });

  // 2. Fetch Class Students
  const {
    data: students = [],
    isLoading: isStudentsLoading,
    isError: isStudentsError,
    error: studentsError,
    refetch: refetchStudents,
  } = useQuery({
    queryKey: ['school-class-students', selectedTermId, classId],
    queryFn: () => classApi.getClassStudents(classId),
    enabled: Boolean(classDetail && classDetail.termId === selectedTermId),
  });

  // Filter students by local search
  const filteredStudents = useMemo(() => {
    if (!searchStudent.trim()) return students;
    const q = searchStudent.trim().toLowerCase();
    return students.filter(
      (s) =>
        s.rollNumber?.toLowerCase().includes(q) ||
        s.fullName?.toLowerCase().includes(q) ||
        s.email?.toLowerCase().includes(q) ||
        s.memberCode?.toLowerCase().includes(q) ||
        s.majorCode?.toLowerCase().includes(q)
    );
  }, [students, searchStudent]);

  if (classDetail && classDetail.termId !== selectedTermId) {
    return <div className="card" style={{ padding: '2rem' }}>
      <p role="alert" style={{ marginBottom: '1rem' }}>{t('terms.classOutsideTerm')}</p>
      <Button variant="secondary" onClick={() => navigate('/admin/classes')}>{t('terms.backToClasses')}</Button>
    </div>;
  }

  if (isClassLoading) {
    return (
      <div className="card" style={{ padding: '4rem' }}>
        <LoadingSpinner message={t('classes.loadingDetail')} />
      </div>
    );
  }

  if (isClassError || !classDetail) {
    return (
      <div className="card" style={{ padding: '2rem' }}>
        <ErrorState
          message={(classError as any)?.message || t('lecturer.classNotFound')}
          onRetry={() => refetchClass()}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('classes.detailTitle', { name: classDetail.name })}
        description={t('classes.detailDescription')}
        breadcrumbs={[
          { label: t('breadcrumbs.admin'), href: '/admin/dashboard' },
          { label: t('classes.label'), href: '/admin/classes' },
          { label: classDetail.name },
        ]}
        action={
          <Button
            variant="secondary"
            size="sm"
            icon={<ArrowLeft size={16} />}
            onClick={() => navigate(previousList)}
          >
            {t('classes.back')}
          </Button>
        }
      />

      {/* Class Overview Card */}
      <div
        className="card"
        style={{
          padding: '1.5rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1.25rem',
          background: 'linear-gradient(to right, #ffffff, #fbfcfe)',
        }}
      >
        {/* Tên lớp */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-subtle)', fontWeight: 600 }}>
            {t('classes.className')}
          </span>
          <span
            style={{
              fontSize: '1.5rem',
              fontWeight: 800,
              color: 'var(--color-primary, #4f6bed)',
              letterSpacing: '-0.02em',
            }}
          >
            {classDetail.name}
          </span>
        </div>

        {/* Học kỳ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-subtle)', fontWeight: 600 }}>
            {t('lecturer.term')}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
            <Calendar size={18} style={{ color: '#64748b' }} />
            <span style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-text-main)' }}>
              {classDetail.termName || t('lecturer.noTerm')}
            </span>
          </div>
        </div>

        {/* Giảng viên phụ trách */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-subtle)', fontWeight: 600 }}>
            {t('classAssignment.title')}
          </span>
          {classDetail.lecturerId !== null ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span
                  style={{
                    backgroundColor: '#eff6ff',
                    color: '#1d4ed8',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                  }}
                >
                  {classDetail.lecturerCode || t('classAssignment.assigned')}
                </span>
                {classDetail.lecturerName && (
                  <span style={{ fontWeight: 700, color: 'var(--color-text-main)' }}>
                    {classDetail.lecturerName}
                  </span>
                )}
              </div>
              {classDetail.lecturerEmail && (
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                  {classDetail.lecturerEmail}
                </div>
              )}
            </div>
          ) : (
            <span style={{ fontStyle: 'italic', color: '#94a3b8' }}>{t('classes.unassigned')}</span>
          )}
        </div>

        {/* Tổng sinh viên */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-subtle)', fontWeight: 600 }}>
            {t('classes.studentCount')}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
            <Users size={18} style={{ color: '#059669' }} />
            <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#059669' }}>
              {students.length}
            </span>
            <span style={{ fontSize: '0.875rem', color: '#64748b', fontWeight: 500 }}>{t('classes.studentUnit', { count: students.length })}</span>
          </div>
        </div>
      </div>

      <nav className="admin-tabs" aria-label={t('adminUx.classDetail')}>
        {(['students', 'groups', 'deadlines', 'settings', 'zalo'] as const).map(value =>
          <button type="button" key={value} aria-current={tab === value ? 'page' : undefined}
            onClick={() => { const next = new URLSearchParams(params); next.set('tab', value); setParams(next); }}>
            {value === 'zalo' ? t('zalo.title') : t(`adminUx.${value}`)}{value === 'students' ? ` (${students.length})` : ''}
          </button>)}
      </nav>
      {tab === 'zalo' && <div style={{ paddingTop: 16 }}><ZaloManagementPanel key={classId} target={{ scope: 'CLASS', classId, termId: selectedTermId! }} /></div>}
      {tab === 'settings' && <div className="admin-class-settings">
        <ClassManagementControls key={classId} schoolClass={classDetail} />
      </div>}
      {(tab === 'groups' || tab === 'deadlines') && <ClassGroupingSessions classId={classId} mode={tab} />}
      {tab === 'students' && isStudentsLoading && <LoadingSpinner message={t('students.loadingList')} />}
      {tab === 'students' && isStudentsError && <ErrorState message={(studentsError as any)?.message || t('errors.generalFailure')} onRetry={() => void refetchStudents()} />}

      {/* Student List in Class */}
      {tab === 'students' && !isStudentsLoading && !isStudentsError && <div className="card">
        {/* Table header with search */}
        <div
          style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Users size={18} style={{ color: 'var(--color-primary, #4f6bed)' }} />
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-main)' }}>
              {t('classes.studentsTitle', { count: filteredStudents.length, total: students.length })}
            </h3>
          </div>

          {/* Quick search input */}
          <div style={{ position: 'relative', width: '280px' }}>
            <Search
              size={15}
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#9ca3af',
              }}
            />
            <input
              type="text"
              placeholder={t('students.searchPlaceholder')}
              aria-label={t('students.searchLabel')}
              value={searchStudent}
              onChange={(e) => setSearchStudent(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 32px 8px 34px',
                fontSize: '0.875rem',
                borderRadius: '10px',
                border: '1px solid #e5e7eb',
                backgroundColor: '#f9fafb',
                outline: 'none',
              }}
            />
            {searchStudent && (
              <button
                type="button"
                aria-label={t('students.clearSearchAria')}
                onClick={() => setSearchStudent('')}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#9ca3af',
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="table-container" style={{ overflowX: 'auto' }}>
          <table className="table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ width: '60px' }}>{t('classStudents.index')}</th>
                <th>{t('students.colRollNumber')}</th>
                <th>{t('students.colFullName')}</th>
                <th>{t('students.colEmail')}</th>
                <th>{t('students.colMemberCode')}</th>
                <th>{t('students.colMajor')}</th>
                <th>{t('students.colAccountStatus')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
                    {searchStudent
                      ? t('classes.noStudentMatches')
                      : t('classes.noStudents')}
                  </td>
                </tr>
              ) : (
                filteredStudents.map((student, idx) => (
                  <tr key={student.userId}>
                    <td style={{ color: 'var(--color-text-subtle)', fontWeight: 500 }}>
                      #{idx + 1}
                    </td>

                    {/* MSSV */}
                    <td>
                      <span
                        style={{
                          fontWeight: 700,
                          color: 'var(--color-primary, #4f6bed)',
                        }}
                      >
                        {student.rollNumber}
                      </span>
                    </td>

                    {/* Họ tên */}
                    <td style={{ fontWeight: 600, color: 'var(--color-text-main)' }}>
                      {student.fullName}
                    </td>

                    {/* Email */}
                    <td style={{ color: 'var(--color-text-subtle)' }}>
                      {student.email}
                    </td>

                    {/* Member code */}
                    <td style={{ color: 'var(--color-text-subtle)' }}>
                      {student.memberCode || '—'}
                    </td>

                    {/* Ngành học */}
                    <td>
                      {student.majorCode ? (
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: '6px',
                            backgroundColor: '#f1f5f9',
                            color: '#334155',
                            fontSize: '0.8125rem',
                            fontWeight: 600,
                          }}
                        >
                          {student.majorCode}
                        </span>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>—</span>
                      )}
                    </td>

                    {/* Trạng thái tài khoản */}
                    <td>
                      {student.activated ? (
                        <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <CheckCircle2 size={13} />
                          {t('students.activated')}
                        </span>
                      ) : (
                        <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <Clock size={13} />
                          {t('students.unactivated')}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>}
    </div>
  );
};
