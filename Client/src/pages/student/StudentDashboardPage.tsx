import React from 'react';
import { CheckCircle2, Users, Calendar } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/app/providers/AuthContext';
import { PageHeader } from '@/components/common/PageHeader';

export const StudentDashboardPage: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();

  return (
    <div>
      <PageHeader
        title={t('studentDashboard.greeting', { name: user?.name || user?.email || 'Student' })}
        description={t('studentDashboard.welcome')}
      />

      {/* Account Status Card */}
      <div
        className="card"
        style={{
          padding: '1.5rem',
          backgroundColor: '#f0fdf4',
          borderColor: '#bbf7d0',
          display: 'flex',
          alignItems: 'center',
          gap: '1.25rem',
          marginBottom: '2rem',
        }}
      >
        <div
          style={{
            width: '54px',
            height: '54px',
            borderRadius: 'var(--radius-full)',
            backgroundColor: '#dcfce7',
            color: 'var(--color-success)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <CheckCircle2 size={30} />
        </div>

        <div>
          <div style={{ fontWeight: 700, fontSize: '1.125rem', color: '#166534' }}>
            {t('studentDashboard.accountActive')}
          </div>
          <div style={{ fontSize: '0.875rem', color: '#15803d', marginTop: '2px' }}>
            {t('studentDashboard.emailRegistered', { email: user?.email })}
          </div>
        </div>
      </div>

      {/* F-Group Making Information Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '1.5rem',
        }}
      >
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <div
              style={{
                padding: '8px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: '#eff6ff',
                color: 'var(--color-primary)',
              }}
            >
              <Users size={20} />
            </div>
            <h3 style={{ fontSize: '1.125rem' }}>{t('studentDashboard.featureTitle')}</h3>
          </div>

          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
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
              }}
            >
              <Calendar size={20} />
            </div>
            <h3 style={{ fontSize: '1.125rem' }}>{t('studentDashboard.timelineTitle')}</h3>
          </div>

          <ul
            style={{
              paddingLeft: '1.25rem',
              fontSize: '0.875rem',
              color: 'var(--color-text-muted)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
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
