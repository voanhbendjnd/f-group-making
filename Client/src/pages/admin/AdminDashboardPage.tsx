import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Users,
  CheckCircle2,
  Clock,
  Mail,
  Upload,
  ArrowRight,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { studentApi } from '@/features/students/api/studentApi';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/common/Button';
import { StatusBadge } from '@/components/common/StatusBadge';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ErrorState } from '@/components/common/ErrorState';
import { useTerm } from '@/app/providers/TermContext';
import { TermScope } from '@/features/terms/components/TermScope';

export const AdminDashboardPage: React.FC = () => <TermScope><AdminDashboardContent /></TermScope>;

const AdminDashboardContent: React.FC = () => {
  const { selectedTermId } = useTerm();
  const { t } = useTranslation();
  const navigate = useNavigate();

  // Query 1: Total students
  const totalQuery = useQuery({
    queryKey: ['admin-dashboard', selectedTermId, 'students-count-total'],
    queryFn: () => studentApi.getStudents({ page: 1, size: 1, termId: selectedTermId! }),
  });

  // Query 2: Activated students
  const activatedQuery = useQuery({
    queryKey: ['admin-dashboard', selectedTermId, 'students-count-activated'],
    queryFn: () => studentApi.getStudents({ page: 1, size: 1, activated: true, termId: selectedTermId! }),
  });

  // Query 3: Waiting for activation
  const waitingQuery = useQuery({
    queryKey: ['admin-dashboard', selectedTermId, 'students-count-waiting'],
    queryFn: () => studentApi.getStudents({ page: 1, size: 1, activated: false, termId: selectedTermId! }),
  });

  // Query 4: Email sent waiting for student to activate
  const emailSentQuery = useQuery({
    queryKey: ['admin-dashboard', selectedTermId, 'students-count-sent'],
    queryFn: () =>
      studentApi.getStudents({ page: 1, size: 1, activated: false, hasActivationKey: true, termId: selectedTermId! }),
  });

  // Query 5: Recent students preview
  const recentQuery = useQuery({
    queryKey: ['admin-dashboard', selectedTermId, 'students-recent'],
    queryFn: () => studentApi.getStudents({ page: 1, size: 5, sort: 'userId,desc', termId: selectedTermId! }),
  });

  const totalStudents = totalQuery.data?.meta?.total ?? 0;
  const activatedStudents = activatedQuery.data?.meta?.total ?? 0;
  const waitingStudents = waitingQuery.data?.meta?.total ?? 0;
  const emailSentStudents = emailSentQuery.data?.meta?.total ?? 0;
  const notSentStudents = Math.max(0, waitingStudents - emailSentStudents);

  const recentStudents = recentQuery.data?.result || [];
  const queries = [totalQuery, activatedQuery, waitingQuery, emailSentQuery, recentQuery];
  const isLoading = queries.some((query) => query.isPending);
  const failedQuery = queries.find((query) => query.isError);

  if (failedQuery) return <ErrorState message={failedQuery.error?.message || t('errors.generalFailure')}
    onRetry={() => queries.forEach((query) => void query.refetch())} />;
  if (isLoading) return <LoadingSpinner message={t('students.loadingList')} />;

  return (
    <div>
      <PageHeader
        title={t('dashboard.title')}
        description={t('dashboard.description')}
        action={
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <Button
              variant="secondary"
              icon={<Users size={16} />}
              onClick={() => navigate('/admin/students')}
            >
              {t('dashboard.studentListBtn')}
            </Button>
            <Button
              variant="primary"
              icon={<Upload size={16} />}
              onClick={() => navigate('/admin/students/import')}
            >
              {t('dashboard.importExcelBtn')}
            </Button>
          </div>
        }
      />

      {/* KPI Stats Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '1.25rem',
          marginBottom: '2rem',
        }}
      >
        {/* Total students */}
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div
            style={{
              width: '54px',
              height: '54px',
              borderRadius: 'var(--radius-lg)',
              backgroundColor: '#eff6ff',
              color: 'var(--color-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Users size={28} />
          </div>
          <div>
            <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>
              {t('dashboard.statTotalStudents')}
            </div>
            <div style={{ fontSize: '1.875rem', fontWeight: 800, color: 'var(--color-text-main)', marginTop: '2px' }}>
              {isLoading ? '...' : totalStudents.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Activated */}
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div
            style={{
              width: '54px',
              height: '54px',
              borderRadius: 'var(--radius-lg)',
              backgroundColor: '#f0fdf4',
              color: 'var(--color-success)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <CheckCircle2 size={28} />
          </div>
          <div>
            <div style={{ fontSize: '0.875rem', color: '#166534', fontWeight: 500 }}>
              {t('dashboard.statActivated')}
            </div>
            <div style={{ fontSize: '1.875rem', fontWeight: 800, color: 'var(--color-success)', marginTop: '2px' }}>
              {isLoading ? '...' : activatedStudents.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Email sent waiting for activation */}
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div
            style={{
              width: '54px',
              height: '54px',
              borderRadius: 'var(--radius-lg)',
              backgroundColor: '#f0f9ff',
              color: 'var(--color-info)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Mail size={28} />
          </div>
          <div>
            <div style={{ fontSize: '0.875rem', color: '#0369a1', fontWeight: 500 }}>
              {t('dashboard.statEmailSent')}
            </div>
            <div style={{ fontSize: '1.875rem', fontWeight: 800, color: 'var(--color-info)', marginTop: '2px' }}>
              {isLoading ? '...' : emailSentStudents.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Not sent invitation yet */}
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div
            style={{
              width: '54px',
              height: '54px',
              borderRadius: 'var(--radius-lg)',
              backgroundColor: '#fffbeb',
              color: 'var(--color-warning)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Clock size={28} />
          </div>
          <div>
            <div style={{ fontSize: '0.875rem', color: '#b45309', fontWeight: 500 }}>
              {t('dashboard.statNotSent')}
            </div>
            <div style={{ fontSize: '1.875rem', fontWeight: 800, color: 'var(--color-warning)', marginTop: '2px' }}>
              {isLoading ? '...' : notSentStudents.toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Action Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '1.25rem',
          marginBottom: '2rem',
        }}
      >
        <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.75rem' }}>
              <div style={{ padding: '8px', borderRadius: 'var(--radius-md)', backgroundColor: '#eff6ff', color: 'var(--color-primary)' }}>
                <Upload size={20} />
              </div>
              <h3 style={{ fontSize: '1.125rem' }}>{t('dashboard.cardImportTitle')}</h3>
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
              {t('dashboard.cardImportDesc')}
            </p>
          </div>

          <div style={{ marginTop: '1.25rem' }}>
            <Button
              variant="outline"
              size="sm"
              icon={<ArrowRight size={16} />}
              onClick={() => navigate('/admin/students/import')}
            >
              {t('dashboard.cardImportAction')}
            </Button>
          </div>
        </div>

        <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.75rem' }}>
              <div style={{ padding: '8px', borderRadius: 'var(--radius-md)', backgroundColor: '#f0fdf4', color: 'var(--color-success)' }}>
                <Mail size={20} />
              </div>
              <h3 style={{ fontSize: '1.125rem' }}>{t('dashboard.cardActivateTitle')}</h3>
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
              {t('dashboard.cardActivateDesc')}
            </p>
          </div>

          <div style={{ marginTop: '1.25rem' }}>
            <Button
              variant="outline"
              size="sm"
              icon={<ArrowRight size={16} />}
              onClick={() => navigate('/admin/students')}
            >
              {t('dashboard.cardActivateAction')}
            </Button>
          </div>
        </div>
      </div>

      {/* Recent Students Card */}
      <div className="card">
        <div className="card-header">
          <div>
            <h3 className="card-title">{t('dashboard.recentTitle')}</h3>
            <p className="card-subtitle">{t('dashboard.recentDesc')}</p>
          </div>

          <Button
            variant="ghost"
            size="sm"
            icon={<ArrowRight size={16} />}
            onClick={() => navigate('/admin/students')}
          >
            {t('dashboard.viewAll')}
          </Button>
        </div>

        {isLoading ? (
          <LoadingSpinner message={t('common.loading')} />
        ) : recentStudents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>
            {t('dashboard.emptyRecent')}
          </div>
        ) : (
          <div className="table-container" style={{ border: 'none', boxShadow: 'none' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>{t('students.colRollNumber')}</th>
                  <th>{t('students.colFullName')}</th>
                  <th>{t('students.colEmail')}</th>
                  <th>{t('students.colMajor')}</th>
                  <th>{t('students.colAccountStatus')}</th>
                </tr>
              </thead>
              <tbody>
                {recentStudents.map((s) => (
                  <tr key={s.userId}>
                    <td style={{ fontWeight: 600, color: 'var(--color-primary)' }}>{s.rollNumber}</td>
                    <td style={{ fontWeight: 500 }}>{s.fullName}</td>
                    <td style={{ color: 'var(--color-text-muted)' }}>{s.email}</td>
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
                        {s.majorCode || 'N/A'}
                      </span>
                    </td>
                    <td>
                      <StatusBadge
                        activated={s.activated}
                        hasActivationKey={s.hasActivationKey}
                        isKeyExpired={s.isKeyExpired}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
