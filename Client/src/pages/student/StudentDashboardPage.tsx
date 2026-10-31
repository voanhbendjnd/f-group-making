import React from 'react';
import { CheckCircle2, Users, Calendar } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/app/providers/AuthContext';
import { PageHeader } from '@/components/common/PageHeader';
import { StudentGroupWidget } from './components/StudentGroupWidget';
import './StudentDashboardPage.css';

export const StudentDashboardPage: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();

  return (
    <div className="student-dashboard-container">
      <PageHeader
        title={t('studentDashboard.greeting', { name: user?.name || user?.email || 'Student' })}
        description={t('studentDashboard.welcome')}
      />

      {/* Realtime Group Formation Widget */}
      <StudentGroupWidget />

      {/* Account Status Card */}
      <div className="card student-account-card">
        <div className="student-account-icon-wrap">
          <CheckCircle2 size={28} />
        </div>

        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="student-account-title">
            {t('studentDashboard.accountActive')}
          </div>
          <div className="student-account-desc">
            {t('studentDashboard.emailRegistered', { email: user?.email })}
          </div>
        </div>
      </div>

      {/* F-Group Making Information Cards */}
      <div className="student-info-grid">
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <div
              style={{
                padding: '8px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: '#eff6ff',
                color: 'var(--color-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Users size={20} />
            </div>
            <h3 style={{ fontSize: '1.125rem', margin: 0 }}>{t('studentDashboard.featureTitle')}</h3>
          </div>

          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', lineHeight: 1.6, margin: 0 }}>
            {t('studentDashboard.featureDesc')}
          </p>
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <div
              style={{
                padding: '8px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: '#fef3c7',
                color: '#b45309',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Calendar size={20} />
            </div>
            <h3 style={{ fontSize: '1.125rem', margin: 0 }}>{t('studentDashboard.timelineTitle')}</h3>
          </div>

          <ul
            style={{
              paddingLeft: '1.25rem',
              fontSize: '0.875rem',
              color: 'var(--color-text-muted)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              margin: 0,
            }}
          >
            <li>{t('studentDashboard.week12')}</li>
            <li>{t('studentDashboard.week3')}</li>
            <li>{t('studentDashboard.week4')}</li>
          </ul>
        </div>
      </div>
    </div>
  );
};
