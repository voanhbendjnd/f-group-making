import React from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/common/PageHeader';
import { StudentZaloPanel } from '@/features/zalo/components/StudentZaloPanel';

export const StudentZaloPage: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('zalo.title')}
        description={t('zalo.studentDescription')}
      />
      <StudentZaloPanel />
    </div>
  );
};
