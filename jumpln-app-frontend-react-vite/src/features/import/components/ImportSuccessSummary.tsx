import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, RotateCcw, Users, Mail } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/common/Button';

export interface ImportSuccessSummaryProps {
  totalImported: number;
  createdMajorCodes?: string[];
  onReset: () => void;
}

export const ImportSuccessSummary: React.FC<ImportSuccessSummaryProps> = ({
  totalImported,
  createdMajorCodes = [],
  onReset,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div
      className="card"
      style={{
        padding: '3rem 2rem',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        maxWidth: '640px',
        margin: '0 auto',
      }}
    >
      <div
        style={{
          width: '72px',
          height: '72px',
          borderRadius: 'var(--radius-full)',
          backgroundColor: '#f0fdf4',
          color: 'var(--color-success)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '1.25rem',
          boxShadow: '0 4px 12px rgba(21, 128, 61, 0.2)',
        }}
      >
        <CheckCircle2 size={40} />
      </div>

      <h2 style={{ fontSize: '1.625rem', fontWeight: 800, color: 'var(--color-text-main)', marginBottom: '0.5rem' }}>
        {t('import.successTitle', { total: totalImported })}
      </h2>

      <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9375rem', lineHeight: 1.6, marginBottom: '1.75rem' }}>
        {t('import.successDesc')}
      </p>

      {createdMajorCodes.length > 0 && <p role="status" style={{ marginBottom: '1rem' }}>
        {t('import.createdMajors', { codes: createdMajorCodes.join(', ') })}
      </p>}
      {/* Workflow next step guide */}
      <div
        style={{
          width: '100%',
          backgroundColor: '#eff6ff',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid #bfdbfe',
          padding: '1.25rem',
          textAlign: 'left',
          marginBottom: '2rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, color: '#1e40af', marginBottom: '0.375rem' }}>
          <Mail size={18} />
          <span>{t('import.nextStepTitle')}</span>
        </div>
        <div style={{ fontSize: '0.875rem', color: '#1e3a8a', lineHeight: 1.5 }}>
          {t('import.nextStepDesc')}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center', width: '100%' }}>
        <Button
          variant="secondary"
          icon={<RotateCcw size={16} />}
          onClick={onReset}
        >
          {t('import.importAnother')}
        </Button>

        <Button
          variant="primary"
          icon={<Users size={16} />}
          onClick={() => navigate('/admin/students')}
        >
          {t('import.goToStudents')}
        </Button>
      </div>
    </div>
  );
};
