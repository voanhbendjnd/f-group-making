import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/common/Button';
import { ErrorState } from '@/components/common/ErrorState';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { Modal } from '@/components/common/Modal';
import { majorApi } from '../api/majorApi';
import { getMajorErrorKey } from '../utils/majorErrors';
import type { Major } from '../types';
import { GraduationCap, Pencil } from 'lucide-react';

interface MajorDetailsModalProps {
  id: number;
  onClose: () => void;
  onEdit: (major: Major) => void;
}

export function MajorDetailsModal({ id, onClose, onEdit }: MajorDetailsModalProps) {
  const { t } = useTranslation();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['majors', 'detail', id],
    queryFn: () => majorApi.getMajorById(id),
  });

  return (
    <Modal open onClose={onClose} title={t('majors.detailTitle')}
      headerIcon={<span className="major-modal-icon"><GraduationCap size={22} aria-hidden="true" /></span>}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('common.close')}</Button>
          {data && !isError && <Button icon={<Pencil size={16} aria-hidden="true" />} onClick={() => onEdit(data)}>{t('majors.edit')}</Button>}
        </>
      }>
      {isLoading ? <LoadingSpinner message={t('majors.loadingDetails')} /> : isError ? (
        <ErrorState message={t(getMajorErrorKey(error))} onRetry={() => refetch()} />
      ) : data ? (
        <dl className="major-detail-fields">
          <div><dt className="form-label">{t('majors.code')}</dt><dd><span className="major-code">{data.code}</span></dd></div>
          <div><dt className="form-label">{t('majors.name')}</dt><dd>{data.name}</dd></div>
        </dl>
      ) : null}
    </Modal>
  );
}
