import React from 'react';
import { Mail, CheckSquare, X, AlertCircle } from 'lucide-react';
import { useTranslation, Trans } from 'react-i18next';
import { Button } from '@/components/common/Button';

export interface BulkActionToolbarProps {
  selectedCount: number;
  totalFilteredCount: number;
  isAllMatchingSelected: boolean;
  eligibleCount: number; // Count of selected students that are NOT activated
  onSelectAllMatching: () => void;
  onClearSelection: () => void;
  onOpenBatchModal: () => void;
}

export const BulkActionToolbar: React.FC<BulkActionToolbarProps> = ({
  selectedCount,
  totalFilteredCount,
  isAllMatchingSelected,
  eligibleCount,
  onSelectAllMatching,
  onClearSelection,
  onOpenBatchModal,
}) => {
  const { t } = useTranslation();

  if (selectedCount === 0 && !isAllMatchingSelected) {
    return null;
  }

  const sendTargetLabel = isAllMatchingSelected
    ? `(${totalFilteredCount})`
    : `(${eligibleCount})`;

  return (
    <div
      style={{
        backgroundColor: '#eff6ff',
        border: '1px solid #bfdbfe',
        borderRadius: 'var(--radius-lg)',
        padding: '0.875rem 1.25rem',
        marginBottom: '1.25rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.75rem',
        animation: 'fadeIn var(--transition-fast)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, color: '#1e40af' }}>
          <CheckSquare size={18} />
          {isAllMatchingSelected ? (
            <span>
              <Trans
                i18nKey="bulkAction.allMatchingSelected"
                values={{ total: totalFilteredCount }}
                components={{ strong: <strong /> }}
              />
            </span>
          ) : (
            <span>
              <Trans
                i18nKey="bulkAction.pageSelected"
                values={{ count: selectedCount }}
                components={{ strong: <strong /> }}
              />
            </span>
          )}
        </div>

        {!isAllMatchingSelected && totalFilteredCount > selectedCount && (
          <button
            type="button"
            onClick={onSelectAllMatching}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-primary)',
              textDecoration: 'underline',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
              padding: '0 4px',
            }}
          >
            {t('bulkAction.selectAllMatching', { total: totalFilteredCount })}
          </button>
        )}

        {eligibleCount < selectedCount && !isAllMatchingSelected && (
          <span
            style={{
              fontSize: '0.8125rem',
              color: '#b45309',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <AlertCircle size={14} />
            {t('bulkAction.activeSkipped', { count: selectedCount - eligibleCount })}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Button
          variant="primary"
          size="sm"
          icon={<Mail size={16} />}
          onClick={onOpenBatchModal}
          disabled={!isAllMatchingSelected && eligibleCount === 0}
        >
          {t('bulkAction.sendButton', { target: sendTargetLabel })}
        </Button>

        <Button variant="ghost" size="sm" icon={<X size={14} />} onClick={onClearSelection}>
          {t('bulkAction.clearSelection')}
        </Button>
      </div>
    </div>
  );
};
