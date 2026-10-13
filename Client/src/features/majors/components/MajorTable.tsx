import { Eye, Pencil, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/common/Button';
import type { Major } from '../types';

interface MajorTableProps {
  majors: Major[];
  isLoading: boolean;
  onView: (major: Major) => void;
  onEdit: (major: Major) => void;
  onDelete: (major: Major) => void;
}

export function MajorTable({ majors, isLoading, onView, onEdit, onDelete }: MajorTableProps) {
  const { t } = useTranslation();

  return (
    <div className="table-container" aria-busy={isLoading}>
      <table className="table" aria-label={t('majors.title')}>
        <thead>
          <tr>
            <th>{t('majors.code')}</th>
            <th>{t('majors.name')}</th>
            <th style={{ textAlign: 'right' }}>{t('majors.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {majors.map((major) => (
            <tr key={major.id}>
              <td style={{ fontWeight: 600, color: 'var(--color-primary)' }}>{major.code}</td>
              <td style={{ overflowWrap: 'anywhere' }}>{major.name}</td>
              <td>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <Button variant="ghost" size="sm" icon={<Eye size={16} />} disabled={isLoading}
                    aria-label={t('majors.viewAria', { code: major.code })} onClick={() => onView(major)}>
                    {t('majors.view')}
                  </Button>
                  <Button variant="secondary" size="sm" icon={<Pencil size={16} />} disabled={isLoading}
                    aria-label={t('majors.editAria', { code: major.code })} onClick={() => onEdit(major)}>
                    {t('majors.edit')}
                  </Button>
                  <Button variant="danger" size="sm" icon={<Trash2 size={16} />} disabled={isLoading}
                    aria-label={t('majors.deleteAria', { code: major.code })} onClick={() => onDelete(major)}>
                    {t('majors.delete')}
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
